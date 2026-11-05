import "server-only";

import catalog from "@/lib/gtfs-catalog.json";
import names from "@/lib/route-catalog.json";
import { systemFor } from "@/lib/system-of";
import type { RouteLine, Station } from "@/lib/types";

/**
 * Stations and route shapes from the static GTFS, so the keyless deployment
 * still has something to draw. Built from server/data/route-stops.json, which
 * `npm run sync:stops` writes in the gateway.
 */
const STOPS = catalog.stops as unknown as Record<string, [string, number, number]>;
const ROUTES = catalog.routes as unknown as Record<string, { code: string; stops: string[] }>;
const NAMES = names as unknown as Record<string, [string, string]>;

let stations: Station[] | null = null;

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

  return {
    routeId,
    code: route.code ?? entry?.[0] ?? null,
    name: entry?.[1] ?? null,
    system: systemFor(route.code ?? entry?.[0] ?? null),
    lengthM: null,
    coordinates: stops.map((stop) => [stop.lon, stop.lat]),
    stops,
  };
}

/** The stop a rider tapped, or null when no route in the catalog reaches it. */
export function stationFromCatalog(stopId: string): Station | null {
  return stationsFromCatalog().find((station) => station.id === stopId) ?? null;
}
