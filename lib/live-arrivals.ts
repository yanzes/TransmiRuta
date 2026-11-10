import "server-only";

import catalog from "@/lib/gtfs-catalog.json";
import { getFleetFromFeed } from "@/lib/feed-live";
import { haversineM } from "@/lib/geo";
import { stopById } from "@/lib/gtfs-catalog";
import type { FeedState, IncomingBus, StopArrival, StopDetail } from "@/lib/types";

/**
 * Keyless arrivals: no Croma, so the times are worked out from the live feed
 * and the published stop sequence. A bus counts as coming when it is on a
 * route that serves the stop, it has not passed it yet, and it is within a
 * few kilometres; the minutes are that distance at city speed. Every arrival
 * is marked as an estimate, because that is what it is.
 */
const ROUTES = catalog.routes as unknown as Record<string, { code: string; stops: string[] }>;

const MAX_METRES = 3_000;
const MAX_STOPS_AHEAD = 12;
const METRES_PER_MINUTE = 240;
const MAX_ARRIVALS = 12;
const LIVE_WINDOW_MS = 10 * 60_000;

const sequences = new Map<string, Map<string, number>>();

/** Where each stop sits in a route's published order. */
function sequence(routeId: string): Map<string, number> | null {
  const known = sequences.get(routeId);
  if (known) return known;
  const route = ROUTES[routeId];
  if (!route) return null;
  const map = new Map<string, number>();
  route.stops.forEach((stopId, index) => {
    if (!map.has(stopId)) map.set(stopId, index);
  });
  sequences.set(routeId, map);
  return map;
}

export async function estimatesAtStop(stopId: string): Promise<StopDetail | null> {
  const stop = stopById(stopId);
  if (!stop) return null;

  const fleet = await getFleetFromFeed();
  if (!fleet.ok) {
    const empty: FeedState = { asOf: new Date().toISOString(), total: 0, live: false };
    return { stop, arrivals: [], incoming: [], feed: empty };
  }

  const { buses, asOf, total } = fleet.data;
  const feed: FeedState = { asOf, total, live: Date.now() - Date.parse(asOf) < LIVE_WINDOW_MS };
  const serving = new Map(stop.routes.map((route) => [route.id, route]));
  const soonest = new Map<string, StopArrival>();
  const incoming: IncomingBus[] = [];

  for (const bus of buses) {
    if (!bus.route) continue;
    const route = serving.get(bus.route);
    if (!route) continue;

    const metres = haversineM(bus.lat, bus.lon, stop.lat, stop.lon);
    if (metres > MAX_METRES) continue;

    incoming.push({ id: bus.id, lat: bus.lat, lon: bus.lon, routeId: route.id, code: route.code, system: route.system, label: bus.label });

    // The feed names the last stop the bus reported. If that stop comes after
    // this one on the route, the bus already passed it (or is the other way).
    const order = sequence(bus.route);
    const target = order?.get(stopId);
    if (order && bus.stop && target !== undefined) {
      const last = order.get(bus.stop);
      if (last !== undefined && (last >= target || target - last > MAX_STOPS_AHEAD)) continue;
    }

    const minutes = Math.max(1, Math.round((metres - 100) / METRES_PER_MINUTE));
    const current = soonest.get(route.id);
    if (current && current.minutes <= minutes) continue;
    soonest.set(route.id, {
      routeId: route.id,
      code: route.code,
      name: route.name,
      system: route.system,
      minutes,
      estimated: true,
      vehicle: bus.label,
    });
  }

  const arrivals = [...soonest.values()].sort((a, b) => a.minutes - b.minutes).slice(0, MAX_ARRIVALS);
  return { stop, arrivals, incoming: incoming.slice(0, 80), feed };
}

/** The feed on its own, for screens that only want to say how live it is. */
export async function feedState(): Promise<FeedState> {
  const fleet = await getFleetFromFeed();
  if (!fleet.ok) return { asOf: new Date().toISOString(), total: 0, live: false };
  return { asOf: fleet.data.asOf, total: fleet.data.total, live: Date.now() - Date.parse(fleet.data.asOf) < LIVE_WINDOW_MS };
}
