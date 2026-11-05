import { readFile } from "node:fs/promises";
import path from "node:path";

import { config } from "../config.js";
import { log } from "../lib/logger.js";
import { normalizeCode } from "./catalog.js";

interface StopsFile {
  generatedAt: string;
  routes: Record<string, { code: string; stops: string[] }>;
  stops: Record<string, [string, number, number]>;
}

export interface StopRef {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface PlanCandidate {
  code: string;
  routeId: string;
  board: { id: string; name: string; distanceM: number };
  alight: { id: string; name: string; distanceM: number };
  totalWalkM: number;
  /** Buses of this route moving right now, so a dead code does not win. */
  buses: number;
}

const EARTH_RADIUS_M = 6_371_000;

export function distanceM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function normalizeName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Qué rutas troncales sirven un viaje.
 *
 * El cálculo es honesto y barato: para cada ruta se busca la parada más cercana
 * al origen y la más cercana al destino, y solo cuenta si ambas están dentro del
 * radio de caminata y son distintas. No hay transbordos ni horarios: es la
 * respuesta a "¿qué ruta me sirve para ir de aquí a allá?".
 */
export class StopIndex {
  readonly generatedAt: string | null = null;
  readonly stopCount: number = 0;
  readonly routeCount: number = 0;

  private readonly stops = new Map<string, StopRef>();
  private readonly byCode = new Map<string, { routeId: string; stops: string[] }>();

  constructor(file: StopsFile | null) {
    if (!file) return;

    for (const [id, [name, lat, lon]] of Object.entries(file.stops)) {
      this.stops.set(id, { id, name, lat, lon });
    }

    // Un código puede tener varios route_id (ramas de la misma ruta): se unen
    // sus paradas para no perder cobertura al recomendar.
    for (const [routeId, route] of Object.entries(file.routes)) {
      const code = normalizeCode(route.code);
      const existing = this.byCode.get(code);
      if (existing) {
        for (const stopId of route.stops) if (!existing.stops.includes(stopId)) existing.stops.push(stopId);
      } else {
        this.byCode.set(code, { routeId, stops: [...route.stops] });
      }
    }

    this.generatedAt = file.generatedAt;
    this.stopCount = this.stops.size;
    this.routeCount = this.byCode.size;
  }

  static async load(): Promise<StopIndex> {
    const file = path.resolve(config.stopsFile);
    try {
      const parsed = JSON.parse(await readFile(file, "utf8")) as StopsFile;
      const index = new StopIndex(parsed);
      log.info("stop index loaded", {
        file,
        stops: index.stopCount,
        routes: index.routeCount,
        generatedAt: index.generatedAt,
      });
      return index;
    } catch {
      log.warn("stop index missing, run `npm run sync:stops` to enable trip recommendations", { file });
      return new StopIndex(null);
    }
  }

  get available(): boolean {
    return this.byCode.size > 0;
  }

  search(query: string, limit: number): StopRef[] {
    const needle = normalizeName(query);
    if (!needle) return [];

    const scored: { stop: StopRef; score: number }[] = [];
    for (const stop of this.stops.values()) {
      const name = normalizeName(stop.name);
      let score = -1;
      if (name === needle) score = 0;
      else if (name.startsWith(needle)) score = 1;
      else if (name.includes(needle)) score = 2;
      if (score >= 0) scored.push({ stop, score });
    }

    scored.sort((a, b) => a.score - b.score || a.stop.name.localeCompare(b.stop.name));
    return scored.slice(0, limit).map((entry) => entry.stop);
  }

  plan(
    from: { lat: number; lon: number },
    to: { lat: number; lon: number },
    radiusM: number,
    liveBuses: Map<string, number>,
  ): PlanCandidate[] {
    if (!this.available) return [];

    const fromNear = this.nearby(from.lat, from.lon, radiusM);
    const toNear = this.nearby(to.lat, to.lon, radiusM);

    const candidates: PlanCandidate[] = [];
    for (const [code, route] of this.byCode) {
      let board: { stop: StopRef; distanceM: number } | null = null;
      let alight: { stop: StopRef; distanceM: number } | null = null;

      for (const stopId of route.stops) {
        const dFrom = fromNear.get(stopId);
        if (dFrom !== undefined && (!board || dFrom < board.distanceM)) {
          const stop = this.stops.get(stopId);
          if (stop) board = { stop, distanceM: dFrom };
        }
        const dTo = toNear.get(stopId);
        if (dTo !== undefined && (!alight || dTo < alight.distanceM)) {
          const stop = this.stops.get(stopId);
          if (stop) alight = { stop, distanceM: dTo };
        }
      }

      if (!board || !alight || board.stop.id === alight.stop.id) continue;

      candidates.push({
        code,
        routeId: route.routeId,
        board: { id: board.stop.id, name: board.stop.name, distanceM: Math.round(board.distanceM) },
        alight: { id: alight.stop.id, name: alight.stop.name, distanceM: Math.round(alight.distanceM) },
        totalWalkM: Math.round(board.distanceM + alight.distanceM),
        buses: liveBuses.get(code) ?? 0,
      });
    }

    return candidates
      .sort((a, b) => a.totalWalkM - b.totalWalkM || b.buses - a.buses || a.code.localeCompare(b.code))
      .slice(0, 8);
  }

  private nearby(lat: number, lon: number, radiusM: number): Map<string, number> {
    const result = new Map<string, number>();
    for (const stop of this.stops.values()) {
      const distance = distanceM(lat, lon, stop.lat, stop.lon);
      if (distance <= radiusM) result.set(stop.id, distance);
    }
    return result;
  }
}
