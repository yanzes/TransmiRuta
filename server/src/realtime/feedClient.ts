import { config } from "../config.js";

export interface FeedResponse {
  /** null when the server answered 304 Not Modified. */
  bytes: Uint8Array | null;
  status: number;
  latencyMs: number;
  etag: string | null;
  lastModified: string | null;
}

/**
 * One HTTP GET of the protobuf feed, with two cheap protections for a public
 * endpoint we do not own: a hard timeout, and conditional requests so a feed
 * that only updates every 20 s is not re-downloaded every 10 s.
 */
export class FeedClient {
  private etag: string | null = null;
  private lastModified: string | null = null;

  constructor(
    private readonly url = config.feedUrl,
    private readonly timeoutMs = config.fetchTimeoutMs,
  ) {}

  async fetch(): Promise<FeedResponse> {
    const started = Date.now();
    const headers: Record<string, string> = {
      Accept: "application/x-protobuf, application/octet-stream, */*",
      "User-Agent": "transmi-live/0.1 (+https://github.com/; GTFS-Realtime poller)",
    };
    if (this.etag) headers["If-None-Match"] = this.etag;
    if (this.lastModified) headers["If-Modified-Since"] = this.lastModified;

    const res = await fetch(this.url, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    const latencyMs = Date.now() - started;

    if (res.status === 304) {
      return { bytes: null, status: 304, latencyMs, etag: this.etag, lastModified: this.lastModified };
    }
    if (!res.ok) {
      // Drain the body so the socket is reusable.
      await res.body?.cancel().catch(() => {});
      throw new Error(`feed responded ${res.status} ${res.statusText}`);
    }

    const bytes = new Uint8Array(await res.arrayBuffer());
    // A protobuf feed is never HTML: an empty or tiny body means a captive portal
    // or maintenance page, which decodes to garbage instead of failing.
    if (bytes.byteLength < 32) throw new Error(`feed body too small (${bytes.byteLength} bytes)`);

    this.etag = res.headers.get("etag");
    this.lastModified = res.headers.get("last-modified");

    return {
      bytes,
      status: res.status,
      latencyMs,
      etag: this.etag,
      lastModified: this.lastModified,
    };
  }
}
