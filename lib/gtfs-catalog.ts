import "server-only";

import catalog from "@/lib/gtfs-catalog.json";
import names from "@/lib/route-catalog.json";
import { haversineM } from "@/lib/geo";
import { systemFor } from "@/lib/system-of";
import type { RouteLine, RouteRef, Station, StopRef } from "@/lib/types";

/**
 * Stops and route shapes from the static GTFS, so the app works with no key.
 * Built from server/data/route-stops.json, which `npm run sync:stops` writes.
 */
const STOPS = catalog.stops as unknown as Record<string, [string, number, number]>;
const ROUTES = catalog.routes as unknown as Record<string, { code: string; stops: string[] }>;
const NAMES = names as unknown as Record<string, [string, string]>;

let stations: Station[] | null = null;
let refs: Map<string, StopRef> | null = null;
let byCode: Map<string, string> | null = null;
let byStop: Map<string, RouteRef[]> | null = null;
let normalized: Map<string, string> | null = null;

function routeName(id: string): string | null {
  const entry = NAMES[id]?.[1];
  return entry ? entry.split("||")[0].trim() : null;
}

/** A route in the shape the screens use, or null when the catalog does not know it. */
export function routeRef(id: string): RouteRef | null {
  const route = ROUTES[id];
  const code = route?.code ?? NAMES[id]?.[0] ?? null;
  if (!code) return null;
  return { id, code, name: routeName(id), system: systemFor(code) };
}

/** Every stop that at least one route serves, with the codes that reach it. */
export function stationsFromCatalog(): Station[] {
  if (stations) return stations;

  const servedBy = new Map<string, string[]>();
  for (const route of Object.values(ROUTES)) {
    for (const stopId of route.stops) {
      const codes = servedBy.get(stopId);
      if (!codes) servedBy.set(stopId, [route.code]);
      else if (!codes.includes(route.code)) codes.push(route.code);
    }
  }

  stations = Object.entries(STOPS)
    .map(([id, [name, lat, lon]]) => ({ id, name, lat, lon, routes: servedBy.get(id) ?? [] }))
    .filter((station) => station.routes.length > 0)
    .sort((a, b) => b.routes.length - a.routes.length);
  return stations;
}

function stopRefs(): Map<string, StopRef> {
  if (refs) return refs;

  // Code -> route id first: the stops need it to name the routes that reach them.
  byCode = new Map();
  for (const [id, route] of Object.entries(ROUTES)) if (!byCode.has(route.code)) byCode.set(route.code, id);
  byStop = new Map();
  normalized = new Map();
  refs = new Map();
  for (const station of stationsFromCatalog()) {
    const routes: RouteRef[] = [];
    for (const code of station.routes) {
      const id = byCode.get(code);
      const route = id ? routeRef(id) : null;
      if (route) routes.push(route);
    }
    refs.set(station.id, { id: station.id, name: station.name, lat: station.lat, lon: station.lon, routes });
    byStop.set(station.id, routes);
    normalized.set(station.id, fold(station.name));
  }
  return refs;
}

/** Lowercase without accents, so "Bogotá" finds "bogota" from a phone keyboard. */
function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function stopById(stopId: string): StopRef | null {
  return stopRefs().get(stopId) ?? null;
}

/** The stop a rider tapped, kept for callers that still speak in Stations. */
export function stationFromCatalog(stopId: string): Station | null {
  const stop = stopById(stopId);
  if (!stop) return null;
  return { id: stop.id, name: stop.name, lat: stop.lat, lon: stop.lon, routes: stop.routes.map((r) => r.code) };
}

/** The stops closest to a point, with walking distance, for the home screen. */
export function nearbyStops(lat: number, lon: number, limit = 8): StopRef[] {
  const all = stopRefs();
  const scored: { stop: StopRef; distance: number }[] = [];
  for (const stop of all.values()) {
    scored.push({ stop, distance: haversineM(lat, lon, stop.lat, stop.lon) });
  }
  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, limit).map(({ stop, distance }) => ({ ...stop, distanceM: Math.round(distance) }));
}

/** Routes whose code or name matches, then stops whose name does. */
export function searchCatalog(query: string, limit = 8): { routes: RouteRef[]; stops: StopRef[] } {
  stopRefs();
  const q = fold(query.trim());
  if (q.length < 2) return { routes: [], stops: [] };

  const score = (code: string) => {
    const folded = fold(code);
    return folded === q ? 0 : folded.startsWith(q) ? 1 : folded.includes(q) ? 2 : 3;
  };

  const routes: RouteRef[] = [];
  const seen = new Set<string>();
  for (const [id, route] of Object.entries(ROUTES)) {
    const ref = routeRef(id);
    if (!ref || seen.has(ref.code)) continue;
    const rank = score(ref.code);
    // "B10" must find B10 and not CB100: a code hit is a prefix, and a name
    // hit is a whole word unless the rider typed enough to mean a phrase.
    const name = fold(ref.name ?? "");
    const nameHit = q.length >= 4 ? name.includes(q) : name.split(/[^a-z0-9]+/).includes(q);
    if (rank <= 1 || nameHit) {
      seen.add(ref.code);
      routes.push(ref);
    }
  }
  routes.sort((a, b) => score(a.code) - score(b.code) || a.code.length - b.code.length || a.code.localeCompare(b.code));

  const stops: StopRef[] = [];
  for (const [id, stop] of stopRefs()) {
    if (normalized?.get(id)?.includes(q)) stops.push(stop);
    if (stops.length >= limit * 4) break;
  }

  return { routes: routes.slice(0, limit), stops: stops.slice(0, limit) };
}

/**
 * A route drawn by joining its stops in order: not the official shape, but the
 * sequence follows the corridor, which is what the map needs.
 */
export function routeFromCatalog(routeId: string): RouteLine | null {
  const route = ROUTES[routeId];
  if (!route) return null;

  const stops = route.stops.flatMap((id) => {
    const stop = STOPS[id];
    return stop ? [{ id, name: stop[0], lat: stop[1], lon: stop[2] }] : [];
  });
  const entry = NAMES[routeId];
  const code = route.code ?? entry?.[0] ?? null;

  return {
    routeId,
    code,
    name: routeName(routeId),
    system: systemFor(code),
    lengthM: polylineLength(stops),
    coordinates: stops.map((stop) => [stop.lon, stop.lat]),
    stops,
  };
}

function polylineLength(stops: { lat: number; lon: number }[]): number | null {
  if (stops.length < 2) return null;
  let total = 0;
  for (let i = 1; i < stops.length; i++) total += haversineM(stops[i - 1].lat, stops[i - 1].lon, stops[i].lat, stops[i].lon);
  return Math.round(total);
}
