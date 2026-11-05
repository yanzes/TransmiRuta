import GtfsRealtimeBindings from "gtfs-realtime-bindings";

import type { Bus } from "../types.js";
import type { RouteCatalog } from "../routes/catalog.js";

/** protobufjs returns int64 as Long, which stringifies; normalise it to a number. */
type LongLike = number | string | { toNumber(): number; toString(): string } | null | undefined;

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

const STATUS = {
  0: "INCOMING_AT",
  1: "STOPPED_AT",
  2: "IN_TRANSIT_TO",
} as const;

export interface DecodedFeed {
  headerTimestamp: string | null;
  buses: Bus[];
  /** Entities skipped because the mapper could not build a usable bus. */
  dropped: number;
}

/**
 * The protobuf -> domain step. Pure: feed bytes in, buses out, no I/O, no clock.
 * Anything without a route id or a plausible coordinate is dropped here so the
 * rest of the server never has to think about malformed rows.
 */
export function decodeFeed(bytes: Uint8Array, catalog: RouteCatalog): DecodedFeed {
  const message = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(bytes);
  const headerTimestamp = toIso(toNumber(message.header?.timestamp as LongLike));

  let dropped = 0;
  const byVehicle = new Map<string, { bus: Bus; reported: number }>();

  for (const entity of message.entity) {
    const vehicle = entity.vehicle;
    const position = vehicle?.position;
    const routeId = vehicle?.trip?.routeId;

    if (!vehicle || !position || !routeId) {
      dropped++;
      continue;
    }

    const lat = position.latitude;
    const lon = position.longitude;
    // 0,0 is the classic "no GPS fix yet"; NaN and out-of-range are corrupt.
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      dropped++;
      continue;
    }
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) {
      dropped++;
      continue;
    }

    const reported = toNumber(vehicle.timestamp as LongLike) ?? 0;
    const id = vehicle.vehicle?.id ?? entity.id ?? `${routeId}:${lat},${lon}`;
    const speedMps = position.speed;
    const statusCode = vehicle.currentStatus as number | undefined;

    const bus: Bus = {
      id,
      label: vehicle.vehicle?.label ?? id,
      plate: vehicle.vehicle?.licensePlate ?? null,
      routeId,
      routeCode: catalog.codeFor(routeId),
      routeName: catalog.nameFor(routeId),
      lat,
      lon,
      bearing:
        typeof position.bearing === "number" && Number.isFinite(position.bearing) && position.bearing >= 0
          ? Math.round(position.bearing)
          : null,
      // GTFS-Realtime position.speed is metres per second.
      speedKmh:
        typeof speedMps === "number" && Number.isFinite(speedMps) && speedMps >= 0
          ? Math.round(speedMps * 3.6 * 10) / 10
          : null,
      status: statusCode !== undefined ? (STATUS[statusCode as 0 | 1 | 2] ?? null) : null,
      stopId: vehicle.stopId ?? null,
      stopSequence: toNumber(vehicle.currentStopSequence as LongLike),
      tripId: vehicle.trip?.tripId ?? null,
      reportedAt: toIso(reported),
    };

    // A vehicle can appear twice in one FULL_DATASET; the newest report wins.
    const existing = byVehicle.get(id);
    if (!existing || reported >= existing.reported) byVehicle.set(id, { bus, reported });
  }

  return { headerTimestamp, buses: [...byVehicle.values()].map((entry) => entry.bus), dropped };
}
