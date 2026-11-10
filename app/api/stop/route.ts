import { limit } from "@/lib/ratelimit";
import { invalid, respond } from "@/lib/respond";
import { stopIdParam } from "@/lib/schemas";
import { getArrivals, getFleet } from "@/lib/transit";
import { estimatesAtStop } from "@/lib/live-arrivals";
import type { StopArrival, StopDetail } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Everything one stop screen needs: the stop, its next buses and the ones driving there. */
export async function GET(request: Request) {
  const stopId = stopIdParam.safeParse(new URL(request.url).searchParams.get("stop_id"));
  if (!stopId.success) return invalid("stop_id no es válido.");

  const limited = await limit(request);
  if (limited) return respond({ ok: false, error: limited, traces: [] });

  // Without a key the whole answer comes from the feed and the static GTFS.
  if (!process.env.CROMA_API_KEY) {
    const detail = await estimatesAtStop(stopId.data);
    if (!detail) return respond({ ok: false, error: { code: "not_found", message: "Esa parada no aparece en la red." }, traces: [] });
    return respond<StopDetail>({ ok: true, data: detail, traces: [] });
  }

  const [arrivalsResult, fleet] = await Promise.all([getArrivals(stopId.data), getFleet()]);
  const detail = await estimatesAtStop(stopId.data);
  if (!detail) return respond({ ok: false, error: { code: "not_found", message: "Esa parada no aparece en la red." }, traces: [] });

  const arrivals: StopArrival[] = arrivalsResult.ok
    ? arrivalsResult.data.arrivals.map((a) => ({
        routeId: a.route_id ?? "",
        code: a.route_code ?? "?",
        name: a.route_name ? a.route_name.split("||").pop()?.trim() ?? null : null,
        system: a.system ?? "other",
        minutes: a.minutes_away ?? 0,
        estimated: a.basis === "estimated",
        vehicle: a.vehicle_label,
      }))
    : detail.arrivals;

  const serving = new Set(detail.stop.routes.map((route) => route.id));
  const incoming = fleet.ok
    ? fleet.data.buses
        .filter((bus) => bus.route && serving.has(bus.route))
        .slice(0, 80)
        .map((bus) => {
          const route = detail.stop.routes.find((r) => r.id === bus.route);
          return { id: bus.id, lat: bus.lat, lon: bus.lon, routeId: bus.route ?? "", code: route?.code ?? "?", system: route?.system ?? "other", label: bus.label };
        })
    : detail.incoming;

  return respond<StopDetail>({ ok: true, data: { ...detail, arrivals, incoming }, traces: arrivalsResult.traces });
}
