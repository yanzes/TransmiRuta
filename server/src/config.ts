import "dotenv/config";

function integer(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export type FeedSource = "live" | "mock";

export const config = {
  port: integer("PORT", 8787),

  /** Vite dev server (and any other origin you host the map on). Comma separated. */
  allowedOrigins: (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),

  /** Official TransMilenio VehiclePositions feed (protobuf, FULL_DATASET). */
  feedUrl: process.env.GTFS_RT_URL ?? "https://gtfs.transmilenio.gov.co/positions.pb",
  feedSource: (process.env.FEED_SOURCE ?? "live") as FeedSource,

  /** One poll per 10 s serves the whole city: the feed itself updates ~every 20 s. */
  pollIntervalMs: integer("POLL_INTERVAL_MS", 10_000),
  fetchTimeoutMs: integer("FEED_TIMEOUT_MS", 8_000),
  maxBackoffMs: integer("MAX_BACKOFF_MS", 60_000),
  /** Older than this and the map says "datos retrasados" instead of pretending. */
  staleAfterMs: integer("STALE_AFTER_MS", 45_000),
  /** A route older than this is not worth showing in the picker. */
  activeRouteWindowMs: integer("ACTIVE_WINDOW_MS", 5 * 60_000),

  /** data/routes.json, built by `npm run sync:routes`. */
  routesFile: process.env.ROUTES_FILE ?? "data/routes.json",
  /** data/route-stops.json, built by `npm run sync:stops`. */
  stopsFile: process.env.STOPS_FILE ?? "data/route-stops.json",

  maxSubscriptionsPerSocket: integer("MAX_SUBS_PER_SOCKET", 4),
} as const;

export type Config = typeof config;
