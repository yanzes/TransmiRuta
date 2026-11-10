import { nearbyStops } from "@/lib/gtfs-catalog";
import { feedState } from "@/lib/live-arrivals";
import { limit } from "@/lib/ratelimit";
import { invalid, respond } from "@/lib/respond";
import type { Nearby } from "@/lib/types";

export const dynamic = "force-dynamic";

/** The stops around a point, with the feed's state so the list can date itself. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return invalid("lat y lon no son coordenadas válidas.");
  }

  const limited = await limit(request);
  if (limited) return respond({ ok: false, error: limited, traces: [] });

  const data: Nearby = { stops: nearbyStops(lat, lon, 8), feed: await feedState() };
  return respond({ ok: true, data, traces: [] }, 60);
}
