/** One bus, already normalised out of the protobuf and joined with the route catalog. */
export interface Bus {
  /** vehicle.vehicle.id from the feed, stable across polls. */
  id: string;
  /** vehicle.vehicle.label, the fleet number riders see on the bus (e.g. "E0008"). */
  label: string;
  plate: string | null;
  /** Raw GTFS route_id: numeric in Bogotá's feed ("12819"). */
  routeId: string;
  /** The code a rider types: "F23". */
  routeCode: string;
  routeName: string | null;
  lat: number;
  lon: number;
  /** Degrees clockwise from north, null when the feed omits it. */
  bearing: number | null;
  speedKmh: number | null;
  status: "INCOMING_AT" | "STOPPED_AT" | "IN_TRANSIT_TO" | null;
  stopId: string | null;
  stopSequence: number | null;
  tripId: string | null;
  /** vehicle.timestamp, ISO 8601. */
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
  /** Header timestamp of the feed snapshot these buses came from. */
  feedTimestamp: string | null;
  /** When this server last rebuilt the snapshot. */
  updatedAt: string;
  /** True when the feed has been failing longer than STALE_AFTER_MS. */
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
  /** False when every vehicle reports speed 0: the feed has the field but no signal. */
  speedAvailable: boolean;
  /** Same for heading: a fleet of buses all pointing north means "unknown". */
  bearingAvailable: boolean;
}
