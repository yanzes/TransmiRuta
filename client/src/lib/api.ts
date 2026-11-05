import type { PlanCandidate, RouteHit, RouteSnapshot, StopRef } from "./types";

/** Same origin by default (Vite proxies /api to the Node server in dev). */
export const API_BASE = import.meta.env.VITE_SERVER_URL ?? "";

export async function searchRoutes(query: string, signal?: AbortSignal): Promise<RouteHit[]> {
  const url = new URL(`${API_BASE}/api/routes`, window.location.origin);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "8");

  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Búsqueda falló (${res.status})`);
  const data = (await res.json()) as { routes: RouteHit[] };
  return data.routes;
}

export async function searchActiveRoutes(signal?: AbortSignal): Promise<RouteHit[]> {
  const url = new URL(`${API_BASE}/api/routes`, window.location.origin);
  url.searchParams.set("limit", "8");

  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`No pudimos leer las rutas activas (${res.status})`);
  const data = (await res.json()) as { routes: RouteHit[] };
  return data.routes;
}

export async function searchStops(query: string, signal?: AbortSignal): Promise<StopRef[]> {
  const url = new URL(`${API_BASE}/api/stops`, window.location.origin);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "6");

  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`Búsqueda de estaciones falló (${res.status})`);
  const data = (await res.json()) as { stops: StopRef[] };
  return data.stops;
}

/** Qué rutas troncales sirven ir de `from` a `to`. */
export async function planTrip(
  from: { lat: number; lon: number },
  to: { lat: number; lon: number },
  signal?: AbortSignal,
): Promise<PlanCandidate[]> {
  const url = new URL(`${API_BASE}/api/plan`, window.location.origin);
  url.searchParams.set("from", `${from.lat},${from.lon}`);
  url.searchParams.set("to", `${to.lat},${to.lon}`);

  const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
  if (res.status === 503) throw new Error("Falta el índice de paradas en el servidor (npm run sync:stops).");
  if (!res.ok) throw new Error(`No pudimos calcular el viaje (${res.status})`);
  const data = (await res.json()) as { candidates: PlanCandidate[] };
  return data.candidates;
}

export async function getRouteSnapshot(code: string, signal?: AbortSignal): Promise<RouteSnapshot> {
  const res = await fetch(`${API_BASE}/api/routes/${encodeURIComponent(code)}/vehicles`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (res.status === 404) throw new Error("Esa ruta no está operando en este momento.");
  if (!res.ok) throw new Error(`No pudimos leer la ruta (${res.status})`);
  return (await res.json()) as RouteSnapshot;
}
