import "server-only";

import { asShared, croma, shared } from "@/lib/croma";
import { getFleetFromFeed } from "@/lib/feed-live";
import { routeFromCatalog, stationsFromCatalog } from "@/lib/gtfs-catalog";
import { estimatesAtStop } from "@/lib/live-arrivals";
import { arrivalsResult, routeResult, stationsPage, vehiclesPage } from "@/lib/schemas";
import type { Result, Trace } from "@/lib/trace";
import type { Arrivals, Bus, Fleet, RouteInfo, RouteLine, Station } from "@/lib/types";

// The live feed refreshes about every 20 seconds, so one snapshot serves
// every visitor for 15: the API is called the same number of times whether
// one person watches the map or a thousand.
const fleetCache = shared<Result<Fleet>>(15_000);
const stationCache = shared<Result<Station[]>>(6 * 60 * 60_000);
const arrivalsCache = shared<Result<Arrivals>>(15_000);
const routeCache = shared<Result<RouteLine>>(60 * 60_000);

const VEHICLES = "/co/transmilenio/vehicles/v1";
const PER_PAGE = 500;

export async function getFleet(): Promise<Result<Fleet>> {
  // No key, no Croma. Rather than show an empty map, read the official feed,
  // which needs no credentials: the deployment works out of the box.
  if (!process.env.CROMA_API_KEY) return getFleetFromFeed();
  const { value, fresh } = await fleetCache("fleet", loadFleet, (r) => r.ok);
  // Clave sin créditos o API caída: el feed oficial sigue contando los buses.
  if (!value.ok) {
    const fallback = await getFleetFromFeed();
    if (fallback.ok) return { ...fallback, traces: [...value.traces, ...fallback.traces] };
  }
  return { ...value, traces: asShared(value.traces, fresh) };
}

async function loadFleet(): Promise<Result<Fleet>> {
  const first = await croma(VEHICLES, { per_page: PER_PAGE, page: 1 }, vehiclesPage);
  if (!first.ok) return { ok: false, error: first.error, traces: first.trace ? [first.trace] : [] };
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, first.data.total_pages - 1) }, (_, i) => croma(VEHICLES, { per_page: PER_PAGE, page: i + 2 }, vehiclesPage)),
  );
  const traces: Trace[] = [first.trace, ...rest.flatMap((r) => (r.trace ? [r.trace] : []))];

  const routes: Record<string, RouteInfo> = {};
  const buses: Bus[] = [];
  const seen = new Set<string>();
  for (const page of [first, ...rest]) {
    if (!page.ok) continue;
    for (const v of page.data.vehicles) {
      const id = v.vehicle_id ?? v.label ?? `${v.latitude},${v.longitude}`;
      if (seen.has(id)) continue;
      seen.add(id);
      if (v.route_id && !routes[v.route_id]) routes[v.route_id] = { code: v.route_code, name: v.route_name, system: v.system ?? "other" };
      buses.push({
        id,
        lat: v.latitude,
        lon: v.longitude,
        route: v.route_id,
        stop: v.stop_name,
        status: v.stop_status,
        label: v.label,
        plate: v.license_plate,
        reportedAt: v.reported_at,
      });
    }
  }
  return { ok: true, data: { asOf: first.data.as_of, total: buses.length, buses, routes }, traces };
}

export async function getStations(): Promise<Result<Station[]>> {
  // Keyless mode: the static GTFS shipped with the app already knows every stop.
  if (!process.env.CROMA_API_KEY) return { ok: true, data: stationsFromCatalog(), traces: [] };
  const { value, fresh } = await stationCache("stations", loadStations, (r) => r.ok);
  return { ...value, traces: asShared(value.traces, fresh) };
}

async function loadStations(): Promise<Result<Station[]>> {
  const path = "/co/transmilenio/stops-search/v1";
  const first = await croma(path, { kind: "station", per_page: 100, page: 1 }, stationsPage);
  if (!first.ok) return { ok: false, error: first.error, traces: first.trace ? [first.trace] : [] };
  const rest = await Promise.all(
    Array.from({ length: Math.max(0, first.data.total_pages - 1) }, (_, i) => croma(path, { kind: "station", per_page: 100, page: i + 2 }, stationsPage)),
  );
  const stations = [first, ...rest].flatMap((page) =>
    page.ok
      ? page.data.stops
          .filter((s) => s.systems.length > 0)
          .map((s) => ({ id: s.stop_id, name: s.name, lat: s.latitude, lon: s.longitude, routes: s.route_codes }))
      : [],
  );
  return { ok: true, data: stations, traces: [first.trace, ...rest.flatMap((r) => (r.trace ? [r.trace] : []))] };
}

export async function getArrivals(stopId: string): Promise<Result<Arrivals>> {
  // Keyless mode: the same estimate the stop screen shows, in the API's shape.
  if (!process.env.CROMA_API_KEY) {
    const detail = await estimatesAtStop(stopId);
    if (!detail) return { ok: false, error: { code: "not_found", message: "Esa parada no aparece en la red." }, traces: [] };
    return {
      ok: true,
      data: {
        as_of: detail.feed.asOf,
        found: true,
        stop_id: stopId,
        stop_name: detail.stop.name,
        count: detail.arrivals.length,
        arrivals: detail.arrivals.map((a) => ({
          predicted_at: null,
          minutes_away: a.minutes,
          basis: "estimated" as const,
          delay_seconds: null,
          route_id: a.routeId,
          route_code: a.code,
          route_name: a.name,
          system: a.system,
          vehicle_label: a.vehicle,
          license_plate: null,
        })),
      },
      traces: [],
    };
  }
  const { value, fresh } = await arrivalsCache(stopId, async () => {
    const r = await croma("/co/transmilenio/stop-arrivals/v1", { stop_id: stopId, limit: 12 }, arrivalsResult);
    return r.ok ? { ok: true, data: r.data, traces: [r.trace] } : { ok: false, error: r.error, traces: r.trace ? [r.trace] : [] };
  }, (r) => r.ok);
  return { ...value, traces: asShared(value.traces, fresh) };
}

export async function getRoute(routeId: string): Promise<Result<RouteLine>> {
  // Keyless mode: draw the route by joining its stops in order.
  if (!process.env.CROMA_API_KEY) {
    const line = routeFromCatalog(routeId);
    return line
      ? { ok: true, data: line, traces: [] }
      : { ok: false, error: { code: "not_found", message: "Esa ruta no aparece en la red." }, traces: [] };
  }
  const { value, fresh } = await routeCache(routeId, async (): Promise<Result<RouteLine>> => {
    const r = await croma("/co/transmilenio/route/v1", { route_id: routeId, include_geometry: true }, routeResult);
    if (!r.ok) {
      // Sin créditos o sin red, el catálogo estático igual conoce el trazado.
      const fallback = routeFromCatalog(routeId);
      if (fallback) return { ok: true, data: fallback, traces: r.trace ? [r.trace] : [] };
      return { ok: false, error: r.error, traces: r.trace ? [r.trace] : [] };
    }
    const route = r.data.route;
    if (!route) return { ok: false, error: { code: "not_found", message: "Esa ruta no aparece en la red." }, traces: [r.trace] };
    // The busiest pattern is the one riders know; the rest are short turns.
    const main = [...route.patterns].sort((a, b) => b.trips_per_week - a.trips_per_week)[0];
    const coordinates = main?.geometry?.coordinates ?? main?.stops.flatMap((s) => (s.latitude != null && s.longitude != null ? [[s.longitude, s.latitude]] : [])) ?? [];
    return {
      ok: true,
      data: {
        routeId: route.route_id,
        code: route.short_name,
        name: route.long_name,
        system: route.system,
        lengthM: main?.length_m ?? null,
        coordinates,
        stops: (main?.stops ?? []).flatMap((s) => (s.latitude != null && s.longitude != null ? [{ id: s.stop_id, name: s.name, lat: s.latitude, lon: s.longitude }] : [])),
      },
      traces: [r.trace],
    };
  }, (r) => r.ok);
  return { ...value, traces: asShared(value.traces, fresh) };
}
