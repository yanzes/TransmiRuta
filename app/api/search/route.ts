import { searchCatalog } from "@/lib/gtfs-catalog";
import { limit } from "@/lib/ratelimit";
import { respond } from "@/lib/respond";
import type { SearchResult } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Routes by code or name, stops by name, from the bundled catalog. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.slice(0, 80) ?? "";
  const limited = await limit(request);
  if (limited) return respond({ ok: false, error: limited, traces: [] });

  const data: SearchResult = q.trim().length < 2 ? { routes: [], stops: [] } : searchCatalog(q);
  return respond({ ok: true, data, traces: [] }, 60);
}
