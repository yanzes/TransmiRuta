import { config } from "../config.js";
import { log } from "../lib/logger.js";
import type { RouteCatalog } from "../routes/catalog.js";
import { decodeFeed } from "./decode.js";
import { FeedClient } from "./feedClient.js";
import { MockFeed } from "./mockFeed.js";
import type { SnapshotStore } from "./store.js";

/**
 * The single clock of the system.
 *
 * Every POLL_INTERVAL_MS (10 s) it reads the feed once, on behalf of every
 * connected client, and hands the decoded fleet to the store. Ten thousand
 * riders on a route cost the transit authority exactly one request per 10 s.
 *
 * Guarantees that keep it safe against an endpoint we do not control:
 *  - single flight: a slow response never doubles up with the next tick;
 *  - exponential backoff (10 s -> 60 s) after failures, while the store keeps
 *    serving the last good snapshot;
 *  - 304 Not Modified is treated as a success, not a failure.
 */
export class FeedPoller {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;
  private currentDelay = config.pollIntervalMs;
  private readonly client = new FeedClient();
  private readonly mock = config.feedSource === "mock" ? new MockFeed() : null;

  constructor(
    private readonly store: SnapshotStore,
    private readonly catalog: RouteCatalog,
    private readonly onUpdate: () => void,
  ) {}

  start(): void {
    log.info("poller started", {
      source: config.feedSource,
      url: config.feedUrl,
      everyMs: config.pollIntervalMs,
    });
    this.schedule(0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private schedule(delayMs: number): void {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), delayMs);
    this.timer.unref();
  }

  private async tick(): Promise<void> {
    if (this.running || this.stopped) return;
    this.running = true;

    try {
      const started = Date.now();
      const bytes = this.mock ? this.mock.fetch() : (await this.client.fetch()).bytes;

      if (bytes === null) {
        // 304: the agency has not published anything new. Refresh the "age"
        // without pretending the data changed.
        this.currentDelay = config.pollIntervalMs;
        log.debug("feed not modified");
      } else {
        const decoded = decodeFeed(bytes, this.catalog);
        this.store.apply(decoded.buses, decoded.headerTimestamp, Date.now() - started);
        this.store.setDropped(decoded.dropped);
        this.currentDelay = config.pollIntervalMs;
        log.info("feed", {
          vehicles: decoded.buses.length,
          routes: this.store.activeCodes().size,
          dropped: decoded.dropped,
          ms: Date.now() - started,
        });
      }
    } catch (error) {
      this.store.markFailure(error);
      const next = Math.min(this.currentDelay * 2, config.maxBackoffMs);
      this.currentDelay = next;
      log.warn("feed poll failed, serving last snapshot", {
        error: error instanceof Error ? error.message : String(error),
        retryInMs: next,
        failures: this.store.health().consecutiveFailures,
      });
    } finally {
      this.running = false;
      // A little jitter so many instances never line up on the same second.
      this.schedule(this.currentDelay + Math.floor(Math.random() * 750));
      this.onUpdate();
    }
  }
}
