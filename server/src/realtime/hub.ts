import type { Server, Socket } from "socket.io";
import { z } from "zod";

import { config } from "../config.js";
import { log } from "../lib/logger.js";
import { normalizeCode } from "../routes/catalog.js";
import type { RouteSnapshot } from "../types.js";
import type { SnapshotStore } from "./store.js";

const subscribeSchema = z.object({
  routeCode: z.string().trim().min(1).max(12),
});

const roomFor = (code: string) => `route:${code}`;

type Ack = (response: { ok: true; routeCode: string; snapshot: RouteSnapshot } | { ok: false; error: string }) => void;

/**
 * Socket.io fan-out.
 *
 * A socket joins the room of the route it is watching and receives that room's
 * updates only: the server never pushes 6,000 vehicles to someone watching F23.
 * Rooms are keyed by the code the rider typed, because that is what the UI
 * draws; each snapshot already contains the raw numeric route ids.
 */
export class RealtimeHub {
  /** Last payload signature per room, so an unchanged route emits nothing. */
  private readonly signatures = new Map<string, number>();

  constructor(
    private readonly io: Server,
    private readonly store: SnapshotStore,
  ) {}

  attach(): void {
    this.io.on("connection", (socket) => this.onConnection(socket));
  }

  private onConnection(socket: Socket): void {
    socket.data.rooms = new Set<string>();
    log.debug("socket connected", { id: socket.id });

    socket.on("route:subscribe", (payload: unknown, ack?: Ack) => {
      const parsed = subscribeSchema.safeParse(payload);
      if (!parsed.success) {
        ack?.({ ok: false, error: "invalid_payload" });
        return;
      }

      const code = normalizeCode(parsed.data.routeCode);
      const rooms = socket.data.rooms as Set<string>;

      if (!rooms.has(code) && rooms.size >= config.maxSubscriptionsPerSocket) {
        ack?.({ ok: false, error: "too_many_subscriptions" });
        return;
      }

      rooms.add(code);
      void socket.join(roomFor(code));

      // Immediate answer: the map paints the current positions instead of
      // waiting up to 10 s for the next poll (and never shows an empty map).
      const snapshot = this.store.get(code);
      ack?.({ ok: true, routeCode: code, snapshot });
      log.debug("subscribe", { socket: socket.id, code, buses: snapshot.buses.length });
    });

    socket.on("route:unsubscribe", (payload: unknown, ack?: (response: { ok: boolean }) => void) => {
      const parsed = subscribeSchema.safeParse(payload);
      if (!parsed.success) {
        ack?.({ ok: false });
        return;
      }
      const code = normalizeCode(parsed.data.routeCode);
      (socket.data.rooms as Set<string>).delete(code);
      void socket.leave(roomFor(code));
      ack?.({ ok: true });
    });

    socket.on("disconnect", () => {
      log.debug("socket disconnected", { id: socket.id });
    });
  }

  /**
   * Called after every poll (successful or not). Emits one message per room
   * whose buses actually moved, plus a light health update for the whole city.
   */
  publish(): void {
    const adapter = this.io.sockets.adapter.rooms;

    for (const [room, sockets] of adapter) {
      if (!room.startsWith("route:") || sockets.size === 0) continue;
      const code = room.slice("route:".length);
      const snapshot = this.store.get(code);

      const signature = signatureOf(snapshot);
      if (this.signatures.get(code) === signature) continue;
      this.signatures.set(code, signature);

      this.io.to(room).emit("route:update", snapshot);
    }

    this.io.emit("feed:health", this.store.health());
  }

  /** How many sockets are watching each route right now (for /api/status). */
  watchers(): Record<string, number> {
    const subscribers: Record<string, number> = {};
    for (const [room, sockets] of this.io.sockets.adapter.rooms) {
      if (!room.startsWith("route:")) continue;
      subscribers[room.slice("route:".length)] = sockets.size;
    }
    return subscribers;
  }
}

/** Cheap change detector: position, heading and report time are what the map draws. */
function signatureOf(snapshot: RouteSnapshot): number {
  let hash = 2166136261;
  for (const bus of snapshot.buses) {
    const text = `${bus.id}|${bus.lat.toFixed(5)}|${bus.lon.toFixed(5)}|${bus.bearing ?? -1}|${bus.reportedAt ?? ""}`;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  hash ^= snapshot.buses.length;
  return hash >>> 0;
}
