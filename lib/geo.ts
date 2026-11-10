const EARTH_RADIUS_M = 6_371_000;

/** Straight-line metres between two points. Good enough to sort stops and trim buses. */
export function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = Math.PI / 180;
  const dLat = (bLat - aLat) * toRad;
  const dLon = (bLon - aLon) * toRad;
  const lat1 = aLat * toRad;
  const lat2 = bLat * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Bogotá's centre, for when the rider has not shared a location (and never will). */
export const BOGOTA = { lat: 4.6486, lon: -74.0625 } as const;
