import "server-only";

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Abuse protection for a public deploy, active when the Upstash env vars are
// set. The fleet is one shared snapshot and is never limited; the per-station
// and per-route lookups each cost a call, so they are.
const redis = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN ? Redis.fromEnv() : null;

const limiter = redis ? new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(60, "10 m"), prefix: "transmilenio-live:lookup" }) : null;

/** `null` when the call may go ahead, otherwise the error to show. */
export async function limit(request: Request): Promise<{ code: string; message: string } | null> {
  if (!limiter) return null;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  const { success } = await limiter.limit(ip);
  return success ? null : { code: "rate_limited", message: "Demasiadas consultas seguidas. Espera unos minutos e intenta de nuevo." };
}
