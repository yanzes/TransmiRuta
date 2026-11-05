import cors from "cors";
import express, { type Request, type Response } from "express";
import { z } from "zod";

import { config } from "./config.js";
import type { RealtimeHub } from "./realtime/hub.js";
import type { SnapshotStore } from "./realtime/store.js";
import { RouteCatalog, normalizeCode } from "./routes/catalog.js";
import type { StopIndex } from "./routes/planner.js";

const codeParam = z
  .string()
  .trim()
  .min(1)
  .max(12)
  .regex(/^[A-Za-z0-9 _-]+$/, "invalid_route_code");

const searchQuery = z.object({
  q: z.string().trim().max(64).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const stopsQuery = z.object({
  q: z.string().trim().min(1).max(64),
  limit: z.coerce.number().int().min(1).max(20).default(8),
});

const coord = z.string().regex(/^-?\d{1,3}(\.\d+)?,-?\d{1,3}(\.\d+)?$/, "invalid_coordinates");

const planQuery = z.object({
  from: coord,
  to: coord,
  radius: z.coerce.number().int().min(150).max(3_000).default(900),
});

function pair(value: string): { lat: number; lon: number } {
  const [lat, lon] = value.split(",").map(Number);
  return { lat: lat!, lon: lon! };
}

interface Deps {
  store: SnapshotStore;
  catalog: RouteCatalog;
  hub: RealtimeHub;
  stops: StopIndex;
}

export function createApp({ store, catalog, hub, stops }: Deps): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(cors({ origin: config.allowedOrigins, methods: ["GET"] }));
  app.use(express.json({ limit: "16kb" }));

  // Live data: never let a CDN or the browser replay positions.
  app.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });

  app.get("/health", (_req: Request, res: Response) => {
    const health = store.health();
    res.status(200).json({ ok: true, uptimeSeconds: Math.round(process.uptime()), feed: health });
  });

  app.get("/api/status", (_req: Request, res: Response) => {
    res.json({
      feed: store.health(),
      routesActive: store.activeCodes().size,
      watchers: hub.watchers(),
      catalog: { loaded: catalog.size > 0, routes: catalog.size, generatedAt: catalog.generatedAt },
      stops: { loaded: stops.available, stops: stops.stopCount, routes: stops.routeCount },
    });
  });

  /**
   * Route picker. With ?q= it searches the static catalog (codes and names);
   * without it, it lists what is actually moving right now.
   */
  app.get("/api/routes", (req: Request, res: Response) => {
    const parsed = searchQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_query", issues: parsed.error.issues });
      return;
    }
    const { q, limit } = parsed.data;

    if (!q) {
      const active = store.listActive(limit).map(({ code, buses }) => {
        const meta = catalog.metaFor(code);
        return {
          code,
          name: meta?.longName ?? null,
          routeId: meta?.routeId ?? null,
          system: meta?.system ?? "other",
          buses,
        };
      });
      res.json({ routes: active });
      return;
    }

    const counts = store.activeCodes();
    // A code can own several route ids (F23 -> 10082 "Banderas" + 11163 "P. Américas");
    // riders think in codes, so the picker shows one row per code.
    const seen = new Set<string>();
    const routes = [];
    for (const meta of catalog.search(q, limit * 3)) {
      if (seen.has(meta.shortName)) continue;
      seen.add(meta.shortName);
      routes.push({
        code: meta.shortName,
        name: meta.longName || null,
        routeId: meta.routeId,
        system: meta.system,
        buses: counts.get(meta.shortName) ?? 0,
      });
      if (routes.length >= limit) break;
    }
    res.json({ routes });
  });

  /** Resolve a code and return the current positions, one shot (no socket). */
  app.get("/api/routes/:code/vehicles", (req: Request, res: Response) => {
    const parsed = codeParam.safeParse(req.params.code);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_route_code" });
      return;
    }

    const code = normalizeCode(parsed.data);
    const routeIds = catalog.routeIdsFor(code);
    if (!store.has(code) && routeIds.length === 0) {
      res.status(404).json({ error: "unknown_route", routeCode: code });
      return;
    }

    res.json({ ...store.get(code), routeIds });
  });

  /** Autocompletado de estaciones (solo las que tocan rutas troncales). */
  app.get("/api/stops", (req: Request, res: Response) => {
    const parsed = stopsQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_query", issues: parsed.error.issues });
      return;
    }
    res.json({ stops: stops.search(parsed.data.q, parsed.data.limit), indexed: stops.available });
  });

  /**
   * "¿Qué ruta me sirve para ir de A a B?" Acepta coordenadas de origen y
   * destino (GPS o una estación elegida) y devuelve las rutas con parada cerca
   * de ambos puntos, ordenadas por caminata total y luego por buses en vía.
   */
  app.get("/api/plan", (req: Request, res: Response) => {
    const parsed = planQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_query", issues: parsed.error.issues });
      return;
    }
    if (!stops.available) {
      res.status(503).json({ error: "stop_index_missing", hint: "npm run sync:stops" });
      return;
    }

    const from = pair(parsed.data.from);
    const to = pair(parsed.data.to);
    const candidates = stops.plan(from, to, parsed.data.radius, store.activeCodes());
    res.json({ from, to, radiusM: parsed.data.radius, candidates });
  });

  app.get("/api/routes/:code", (req: Request, res: Response) => {
    const parsed = codeParam.safeParse(req.params.code);
    if (!parsed.success) {
      res.status(400).json({ error: "invalid_route_code" });
      return;
    }
    const code = normalizeCode(parsed.data);
    const meta = catalog.metaFor(code);
    const routeIds = catalog.routeIdsFor(code);
    if (!meta && routeIds.length === 0) {
      res.status(404).json({ error: "unknown_route", routeCode: code });
      return;
    }

    res.json({
      code,
      name: meta?.longName ?? null,
      routeIds,
      buses: store.get(code).buses.length,
      feed: store.health(),
    });
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "not_found" });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: express.NextFunction) => {
    console.error(error);
    res.status(500).json({ error: "internal_error" });
  });

  return app;
}
