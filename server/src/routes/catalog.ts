import { readFile } from "node:fs/promises";
import path from "node:path";

import { config } from "../config.js";
import { log } from "../lib/logger.js";

export interface RouteMeta {
  routeId: string;
  shortName: string;
  longName: string;
  color: string | null;
  system: RouteSystem;
}

export type RouteSystem = "troncal" | "zonal" | "other";

interface RoutesFile {
  generatedAt: string;
  source: string;
  routes: { routeId: string; shortName: string; longName: string; color: string; textColor: string; type: string; agencyId?: string }[];
}

/** "  f23 " -> "F23"; "Éxito" -> "EXITO". Riders are not careful typists. */
export function normalizeCode(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
}

/** Troncal codes are one letter plus a number (F23, B12, K43, L18, H710). */
function systemFor(shortName: string): RouteSystem {
  if (/^[A-Z]{1,2}\d{1,3}[A-Z]?$/.test(shortName)) return "troncal";
  return "zonal";
}

/**
 * Join between what riders type and what the realtime feed carries.
 *
 * The protobuf only has numeric route ids, so without routes.txt there is no way
 * to answer "where is F23?". Everything here is in memory and read-only.
 */
export class RouteCatalog {
  readonly generatedAt: string | null;
  readonly size: number;

  private readonly byRouteId = new Map<string, RouteMeta>();
  private readonly byCode = new Map<string, RouteMeta[]>();

  constructor(file: RoutesFile | null) {
    this.generatedAt = file?.generatedAt ?? null;

    for (const route of file?.routes ?? []) {
      const meta: RouteMeta = {
        routeId: route.routeId,
        shortName: normalizeCode(route.shortName || route.routeId),
        longName: route.longName.trim(),
        color: route.color ? `#${route.color.replace(/^#/, "")}` : null,
        system: systemFor(normalizeCode(route.shortName || route.routeId)),
      };
      this.byRouteId.set(meta.routeId, meta);

      const current = this.byCode.get(meta.shortName);
      if (current) current.push(meta);
      else this.byCode.set(meta.shortName, [meta]);
    }

    this.size = this.byRouteId.size;
  }

  static async load(): Promise<RouteCatalog> {
    const file = path.resolve(config.routesFile);
    try {
      const raw = await readFile(file, "utf8");
      const parsed = JSON.parse(raw) as RoutesFile;
      const catalog = new RouteCatalog(parsed);
      log.info("route catalog loaded", { file, routes: catalog.size, generatedAt: catalog.generatedAt });
      return catalog;
    } catch {
      log.warn("route catalog missing, run `npm run sync:routes` to map F23 -> route_id", { file });
      return new RouteCatalog(null);
    }
  }

  metaFor(code: string): RouteMeta | null {
    return this.byCode.get(normalizeCode(code))?.[0] ?? null;
  }

  codeFor(routeId: string): string {
    return this.byRouteId.get(routeId)?.shortName ?? routeId;
  }

  nameFor(routeId: string): string | null {
    const meta = this.byRouteId.get(routeId);
    return meta && meta.longName ? meta.longName : null;
  }

  colorFor(routeId: string): string | null {
    return this.byRouteId.get(routeId)?.color ?? null;
  }

  /** Every route id that answers to this code (SITP reuses codes across systems). */
  routeIdsFor(code: string): string[] {
    const normalized = normalizeCode(code);
    const matches = this.byCode.get(normalized);
    if (matches?.length) return matches.map((meta) => meta.routeId);
    // A rider pasting a raw numeric route id still gets an answer.
    return this.byRouteId.has(normalized) ? [normalized] : [];
  }

  exists(code: string): boolean {
    const normalized = normalizeCode(code);
    return this.byCode.has(normalized) || this.byRouteId.has(normalized);
  }

  search(query: string, limit: number): RouteMeta[] {
    const needle = normalizeCode(query);
    if (!needle) return [];

    const scored: { meta: RouteMeta; score: number }[] = [];
    for (const meta of this.byRouteId.values()) {
      const code = meta.shortName;
      let score = -1;
      if (code === needle) score = 0;
      else if (code.startsWith(needle)) score = 1;
      else if (meta.routeId === needle) score = 2;
      else if (meta.longName.toUpperCase().includes(needle)) score = 3;
      else if (code.includes(needle)) score = 4;
      if (score >= 0) scored.push({ meta, score });
    }

    scored.sort((a, b) => a.score - b.score || a.meta.shortName.localeCompare(b.meta.shortName));
    return scored.slice(0, limit).map((entry) => entry.meta);
  }
}
