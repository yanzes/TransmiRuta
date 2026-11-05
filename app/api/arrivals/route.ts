import { limit } from "@/lib/ratelimit";
import { invalid, respond } from "@/lib/respond";
import { stopIdParam } from "@/lib/schemas";
import { getArrivals } from "@/lib/transit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const stopId = stopIdParam.safeParse(new URL(request.url).searchParams.get("stop_id"));
  if (!stopId.success) return invalid("stop_id no es válido.");
  const limited = await limit(request);
  if (limited) return respond({ ok: false, error: limited, traces: [] });
  return respond(await getArrivals(stopId.data));
}
