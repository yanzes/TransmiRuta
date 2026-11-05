import type { System } from "@/lib/schemas";

/**
 * The static GTFS carries no system column, so the route code is the only
 * signal: troncal routes are a letter plus one or two digits (B10, C25, F23),
 * a third digit is zonal or feeder, and everything else is left unknown.
 */
export function systemFor(code: string | null): System {
  if (!code) return "other";
  const upper = code.toUpperCase();
  if (/^[A-Z]\d{1,2}$/.test(upper)) return "troncal";
  if (/^[A-Z]\d{3,4}$/.test(upper) || /^\d{1,4}[A-Z]?$/.test(upper)) return "zonal_urbano";
  return "other";
}
