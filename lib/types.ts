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
