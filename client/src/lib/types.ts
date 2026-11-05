/** Mirrors the server payloads in server/src/types.ts. */
export interface Bus {
  id: string;
  label: string;
  plate: string | null;
  routeId: string;
  routeCode: string;
  routeName: string | null;
  lat: number;
  lon: number;
  bearing: number | null;
  speedKmh: number | null;
  status: "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO" | null;
  stopId: string | null;
  stopSequence: number | null;
  tripId: string | null;
  reportedAt: string | null;
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

export interface RouteSnapshot {
  routeCode: string;
  buses: Bus[];
  bounds: Bounds | null;
  feedTimestamp: string | null;
  updatedAt: string;
  stale: boolean;
}

export interface FeedHealth {
  source: "live" | "mock";
  url: string;
  ok: boolean;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  lastLatencyMs: number | null;
  pollIntervalMs: number;
  feedTimestamp: string | null;
  ageSeconds: number | null;
  stale: boolean;
  vehicles: number;
  routes: number;
  pollCount: number;
  dropped: number;
  speedAvailable: boolean;
  bearingAvailable: boolean;
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
  buses: number;
}

export interface RouteHit {
  code: string;
  name: string | null;
  routeId: string | null;
  system: "troncal" | "zonal" | "other";
  buses: number;
}
