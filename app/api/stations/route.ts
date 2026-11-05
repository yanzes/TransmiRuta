import { respond } from "@/lib/respond";
import { getStations } from "@/lib/transit";

export const dynamic = "force-dynamic";

export async function GET() {
  return respond(await getStations(), 3600);
}
