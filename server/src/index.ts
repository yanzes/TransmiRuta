import { createServer } from "node:http";

import { Server } from "socket.io";

import { config } from "./config.js";
import { createApp } from "./http.js";
import { log } from "./lib/logger.js";
import { RealtimeHub } from "./realtime/hub.js";
import { FeedPoller } from "./realtime/poller.js";
import { SnapshotStore } from "./realtime/store.js";
import { RouteCatalog } from "./routes/catalog.js";
import { StopIndex } from "./routes/planner.js";

async function main(): Promise<void> {
  const catalog = await RouteCatalog.load();
  const stops = await StopIndex.load();
  const store = new SnapshotStore();

  // Order matters and has a cycle: the app needs the hub (for watcher counts),
  // the hub needs Socket.io, Socket.io needs the HTTP server, the server needs
  // the app. Creating the server empty and attaching the handler at the end is
  // the clean way out of that.
  const server = createServer();
  const io = new Server(server, {
    cors: { origin: config.allowedOrigins, methods: ["GET", "POST"] },
    // Phones on a moving bus lose packets; let the client reconnect quietly.
    pingInterval: 20_000,
    pingTimeout: 25_000,
  });

  const hub = new RealtimeHub(io, store);
  const app = createApp({ store, catalog, hub, stops });
  server.on("request", app);

  hub.attach();
  const poller = new FeedPoller(store, catalog, () => hub.publish());
  poller.start();

  server.listen(config.port, () => {
    const health = store.health();
    log.info("transmi-live gateway listening", {
      port: config.port,
      http: `http://localhost:${config.port}`,
      socket: `ws://localhost:${config.port}/socket.io`,
      feed: health.url,
      source: health.source,
      origins: config.allowedOrigins,
    });
  });

  const shutdown = (signal: string) => {
    log.info("shutting down", { signal });
    poller.stop();
    io.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3_000).unref();
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  log.error("fatal", { error: error instanceof Error ? error.message : String(error) });
  process.exit(1);
});
