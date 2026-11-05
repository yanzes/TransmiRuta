import { respond } from "@/lib/respond";
import { getFleet } from "@/lib/transit";

export const dynamic = "force-dynamic";

export async function GET() {
  return respond(await getFleet(), 10);
}
