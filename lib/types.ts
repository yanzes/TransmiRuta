import type { z } from "zod";

import type { arrivalsResult, System } from "@/lib/schemas";

/** One bus as the map draws it: positions change every snapshot, the rest rarely. */
export interface Bus {
  id: string;
  lat: number;
  lon: number;
  route: string | null;
  stop: string | null;
  status: string | null;
  label: string | null;
  plate: string | null;
  reportedAt: string | null;
}

export interface RouteInfo {
  code: string | null;
  name: string | null;
  system: System;
}

export interface Fleet {
  asOf: string;
  total: number;
  buses: Bus[];
  routes: Record<string, RouteInfo>;
}

export interface Station {
  id: string;
  name: string;
  lat: number;
  lon: number;
  routes: string[];
}

export type Arrivals = z.infer<typeof arrivalsResult>;

export interface RouteLine {
  routeId: string;
  code: string | null;
  name: string | null;
  system: System;
  lengthM: number | null;
  coordinates: number[][];
  stops: { id: string; name: string | null; lat: number; lon: number }[];
}

/** A route as the app names it: id, spoken code, long name and network. */
export interface RouteRef {
  id: string;
  code: string;
  name: string | null;
  system: System;
}

/** A stop as the lists and maps use it, with the routes that reach it. */
export interface StopRef {
  id: string;
  name: string;
  lat: number;
  lon: number;
  routes: RouteRef[];
  distanceM?: number;
}

/** The live state of the feed, so the screen can say where the times come from. */
export interface FeedState {
  asOf: string;
  total: number;
  live: boolean;
}

/** One estimated arrival: which route, how soon, and that it is an estimate. */
export interface StopArrival {
  routeId: string;
  code: string;
  name: string | null;
  system: System;
  minutes: number;
  estimated: boolean;
  vehicle: string | null;
}

export interface IncomingBus {
  id: string;
  lat: number;
  lon: number;
  routeId: string;
  code: string;
  system: System;
  label: string | null;
}

export interface StopDetail {
  stop: StopRef;
  arrivals: StopArrival[];
  incoming: IncomingBus[];
  feed: FeedState;
}

export interface Nearby {
  stops: StopRef[];
  feed: FeedState;
}

export interface SearchResult {
  routes: RouteRef[];
  stops: StopRef[];
}
