import "server-only";

import type { Result } from "@/lib/trace";

export function respond<T>(result: Result<T>, cacheSeconds = 0): Response {
  const status = result.ok ? 200 : result.error.code === "rate_limited" ? 429 : result.error.code === "not_found" ? 404 : 502;
  const headers: Record<string, string> = { "Cache-Control": cacheSeconds && result.ok ? `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds}` : "no-store" };
  return Response.json(result, { status, headers });
}

export function invalid(message: string): Response {
  return Response.json({ ok: false, error: { code: "invalid_request", message }, traces: [] }, { status: 400 });
}
