import { config } from "../config.js";
import type { Bounds, Bus, FeedHealth, RouteSnapshot } from "../types.js";

function boundsOf(buses: Bus[]): Bounds | null {
  if (!buses.length) return null;
  let south = 90;
  let west = 180;
  let north = -90;
  let east = -180;
  for (const bus of buses) {
    if (bus.lat < south) south = bus.lat;
    if (bus.lat > north) north = bus.lat;
    if (bus.lon < west) west = bus.lon;
    if (bus.lon > east) east = bus.lon;
  }
  return { south, west, north, east };
}

/**
 * The in-memory cache the whole app reads from: one decoded fleet snapshot,
 * indexed by route code, rebuilt only when a poll succeeds.
 *
 * A poll that fails leaves the previous snapshot untouched and marks it stale,
 * so a flaky feed degrades to "these positions are N seconds old" instead of
 * emptying the map.
 */
export class SnapshotStore {
  private buses: Bus[] = [];
  private byCode = new Map<string, Bus[]>();
  private cache = new Map<string, RouteSnapshot>();
  private feedTimestamp: string | null = null;
  private updatedAt = new Date(0).toISOString();
  private updatedMs = 0;

  private source: "live" | "mock" = config.feedSource;
  private lastSuccessAt: string | null = null;
  private lastErrorAt: string | null = null;
  private lastError: string | null = null;
  private lastLatencyMs: number | null = null;
  private consecutiveFailures = 0;
  private pollCount = 0;
  private dropped = 0;
  private speedAvailable = false;
  private bearingAvailable = false;

  constructor(private readonly url = config.feedUrl) {}

  /** Swap in a freshly decoded snapshot. Called once per successful poll. */
  apply(buses: Bus[], headerTimestamp: string | null, latencyMs: number): void {
    const grouped = new Map<string, Bus[]>();
    for (const bus of buses) {
      const list = grouped.get(bus.routeCode);
      if (list) list.push(bus);
      else grouped.set(bus.routeCode, [bus]);
    }

    // Bogotá's feed fills speed and bearing with 0 for the whole fleet. Keep the
    // raw numbers, but tell the UI they carry no information, instead of drawing
    // 6,000 buses standing still at 0 km/h.
    this.speedAvailable = buses.some((bus) => (bus.speedKmh ?? 0) > 0.5);
    this.bearingAvailable = buses.some((bus) => bus.bearing !== null && bus.bearing !== 0);

    this.buses = buses;
    this.byCode = grouped;
    this.cache.clear();
    this.feedTimestamp = headerTimestamp;
    this.updatedAt = new Date().toISOString();
    this.updatedMs = Date.now();
    this.lastSuccessAt = this.updatedAt;
    this.lastLatencyMs = latencyMs;
    this.consecutiveFailures = 0;
    this.lastError = null;
    this.pollCount++;
  }

  markFailure(error: unknown): void {
    this.lastErrorAt = new Date().toISOString();
    this.lastError = error instanceof Error ? error.message : String(error);
    this.consecutiveFailures++;
    this.pollCount++;
  }

  setDropped(count: number): void {
    this.dropped = count;
  }

  /** Counts are kept even when a route is momentarily empty, so the UI can dim it. */
  activeCodes(): Map<string, number> {
    const counts = new Map<string, number>();
    for (const [code, list] of this.byCode) counts.set(code, list.length);
    return counts;
  }

  has(code: string): boolean {
    return this.byCode.has(code);
  }

  get(code: string): RouteSnapshot {
    const cached = this.cache.get(code);
    if (cached) return cached;

    const buses = this.byCode.get(code) ?? [];
    const snapshot: RouteSnapshot = {
      routeCode: code,
      buses,
      bounds: boundsOf(buses),
      feedTimestamp: this.feedTimestamp,
      updatedAt: this.updatedAt,
      stale: this.isStale(),
    };
    this.cache.set(code, snapshot);
    return snapshot;
  }

  /** Every route in the feed right now, busiest first. */
  listActive(limit: number): { code: string; buses: number }[] {
    return [...this.activeCodes().entries()]
      .map(([code, buses]) => ({ code, buses }))
      .sort((a, b) => b.buses - a.buses || a.code.localeCompare(b.code))
      .slice(0, limit);
  }

  get ageMs(): number {
    return this.updatedMs ? Date.now() - this.updatedMs : Number.POSITIVE_INFINITY;
  }

  isStale(): boolean {
    return this.ageMs > config.staleAfterMs;
  }

  get vehicleCount(): number {
    return this.buses.length;
  }

  health(): FeedHealth {
    const ageMs = this.ageMs;
    return {
      source: this.source,
      url: this.url,
      ok: this.lastError === null && this.lastSuccessAt !== null,
      lastSuccessAt: this.lastSuccessAt,
      lastErrorAt: this.lastErrorAt,
      lastError: this.lastError,
      consecutiveFailures: this.consecutiveFailures,
      lastLatencyMs: this.lastLatencyMs,
      pollIntervalMs: config.pollIntervalMs,
      feedTimestamp: this.feedTimestamp,
      ageSeconds: Number.isFinite(ageMs) ? Math.round(ageMs / 1000) : null,
      stale: this.isStale(),
      vehicles: this.buses.length,
      routes: this.byCode.size,
      pollCount: this.pollCount,
      dropped: this.dropped,
      speedAvailable: this.speedAvailable,
      bearingAvailable: this.bearingAvailable,
    };
  }
}
