import type { Bus } from "./types";

const EARTH_RADIUS_M = 6_371_000;

export function distanceM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(aLat * toRad) * Math.cos(bLat * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Ordena los buses "uno detrás del otro" según su posición, no por su número.
 *
 * Se proyecta cada bus sobre el eje principal del conjunto (análisis de
 * componentes principales de sus coordenadas, en metros) y se ordena por esa
 * proyección: en un corredor como la Caracas, la lista queda como se ven los
 * buses a lo largo de la vía. Con menos de 3 buses no hay eje fiable y se usa
 * el número de parada reportado.
 */
export function orderAlongRoute(buses: Bus[]): Bus[] {
  if (buses.length < 3) {
    return [...buses].sort((a, b) => (a.stopSequence ?? 0) - (b.stopSequence ?? 0));
  }

  const lat0 = buses.reduce((sum, bus) => sum + bus.lat, 0) / buses.length;
  const lon0 = buses.reduce((sum, bus) => sum + bus.lon, 0) / buses.length;
  const mPerDegLat = 110_574;
  const mPerDegLon = 111_320 * Math.cos((lat0 * Math.PI) / 180);

  const points = buses.map((bus) => ({
    bus,
    x: (bus.lon - lon0) * mPerDegLon,
    y: (bus.lat - lat0) * mPerDegLat,
  }));

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const point of points) {
    sxx += point.x * point.x;
    syy += point.y * point.y;
    sxy += point.x * point.y;
  }

  // Eje principal del conjunto: autovector dominante de la covarianza 2×2.
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);

  return points
    .map((point) => ({ bus: point.bus, projection: point.x * ux + point.y * uy }))
    .sort((a, b) => b.projection - a.projection)
    .map((entry) => entry.bus);
}
