import "server-only";

import GtfsRealtimeBindings from "gtfs-realtime-bindings";

import catalog from "@/lib/route-catalog.json";
import { systemFor } from "@/lib/system-of";
import type { Result, Trace } from "@/lib/trace";
import type { Bus, Fleet, RouteInfo } from "@/lib/types";

/**
 * Keyless live source: the official TransMilenio GTFS-Realtime feed.
 *
 * Croma needs an API key, so a published demo would depend on a secret being
 * configured before it showed anything. This feed is public, so the deployment
 * works with no credentials at all. When CROMA_API_KEY is present Croma still
 * wins, because it also carries systems, station names and arrivals.
 */
const FEED_URL = process.env.GTFS_RT_URL ?? "https://gtfs.transmilenio.gov.co/positions.pb";
const CACHE_MS = 15_000;
const TIMEOUT_MS = 12_000;

/** route id -> [code riders type (F23), long name], from the static GTFS. */
const ROUTES = catalog as unknown as Record<string, [string, string]>;

/** protobufjs returns int64 as Long; accept every shape it can take. */
type LongLike = number | string | { toNumber(): number } | null | undefined;

function toNumber(value: LongLike): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (typeof value === "object" && typeof value.toNumber === "function") {
    const parsed = value.toNumber();
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toIso(seconds: number | null): string | null {
  return seconds && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

const STATUS: Record<number, string> = { 0: "INCOMING_AT", 1: "STOPPED_AT", 2: "IN_TRANSIT_TO" };

let cache: { at: number; value: Result<Fleet> } | null = null;

export async function getFleetFromFeed(): Promise<Result<Fleet>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;

  const started = Date.now();
  const at = new Date().toISOString();

  let value: Result<Fleet>;
  try {
    const res = await fetch(FEED_URL, {
      headers: { Accept: "application/x-protobuf, application/octet-stream, */*" },
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    // A protobuf feed is never HTML: a tiny body is a maintenance page.
    if (bytes.byteLength < 32) throw new Error(`respuesta de ${bytes.byteLength} bytes`);

    const message = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(bytes);
    const routes: Record<string, RouteInfo> = {};
    const buses: Bus[] = [];
    // A vehicle can repeat inside one full dataset; the newest report wins.
    const newest = new Map<string, number>();

    for (const entity of message.entity) {
      const vehicle = entity.vehicle;
      const position = vehicle?.position;
      const routeId = vehicle?.trip?.routeId;
      if (!vehicle || !position || !routeId) continue;

      const { latitude: lat, longitude: lon } = position;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) continue;

      const reported = toNumber(vehicle.timestamp as LongLike) ?? 0;
      const id = vehicle.vehicle?.id ?? entity.id ?? `${routeId}:${lat},${lon}`;
      const previous = newest.get(id);
      if (previous !== undefined && reported < previous) continue;
      newest.set(id, reported);

      if (!routes[routeId]) {
        const entry = ROUTES[routeId];
        const code = entry?.[0] ?? null;
        routes[routeId] = { code, name: entry?.[1] ?? null, system: systemFor(code) };
      }

      const status = vehicle.currentStatus as number | undefined;
      buses.push({
        id,
        lat,
        lon,
        route: routeId,
        stop: vehicle.stopId ?? null,
        status: status === undefined ? null : (STATUS[status] ?? null),
        label: vehicle.vehicle?.label ?? null,
        plate: vehicle.vehicle?.licensePlate ?? null,
        reportedAt: toIso(reported),
      });
    }

    const trace: Trace = {
      id: crypto.randomUUID(),
      at,
      path: FEED_URL,
      body: { source: "gtfs-realtime" },
      status: 200,
      ms: Date.now() - started,
      shared: false,
    };
    // The feed header can lag days behind; "as of" should mean the newest
    // report the map is actually drawing, not when the file was written.
    const newestReport = buses.reduce((max, bus) => {
      const time = bus.reportedAt ? Date.parse(bus.reportedAt) : 0;
      return time > max ? time : max;
    }, 0);
    const asOf =
      toIso(Math.round(newestReport / 1000)) ??
      toIso(toNumber(message.header?.timestamp as LongLike)) ??
      at;

    value = { ok: true, data: { asOf, total: buses.length, buses, routes }, traces: [trace] };
  } catch (error) {
    value = {
      ok: false,
      error: {
        code: "feed_unavailable",
        message: `No pudimos leer el feed oficial de TransMilenio (${(error as Error).message}).`,
      },
      traces: [],
    };
  }

  cache = { at: Date.now(), value };
  return value;
}
