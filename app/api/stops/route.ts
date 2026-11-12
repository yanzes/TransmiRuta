import { mapStops } from "@/lib/gtfs-catalog";
import { respond } from "@/lib/respond";

export const dynamic = "force-dynamic";

export async function GET() {
  const stops = mapStops();
  return respond({ ok: true, data: { stops, total: stops.length }, traces: [] }, 3600);
}
