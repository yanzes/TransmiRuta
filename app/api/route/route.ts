import { limit } from "@/lib/ratelimit";
import { invalid, respond } from "@/lib/respond";
import { routeIdParam } from "@/lib/schemas";
import { getRoute } from "@/lib/transit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const routeId = routeIdParam.safeParse(new URL(request.url).searchParams.get("route_id"));
  if (!routeId.success) return invalid("route_id no es válido.");
  const limited = await limit(request);
  if (limited) return respond({ ok: false, error: limited, traces: [] });
  return respond(await getRoute(routeId.data), 3600);
}
