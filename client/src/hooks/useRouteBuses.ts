import { useEffect, useState } from "react";

import { getSocket } from "../lib/socket";
import type { Bus, Bounds, FeedHealth, RouteSnapshot } from "../lib/types";

export type ConnectionStatus = "idle" | "connecting" | "live" | "offline";

export interface RouteLiveState {
  buses: Bus[];
  bounds: Bounds | null;
  updatedAt: string | null;
  feedTimestamp: string | null;
  stale: boolean;
  health: FeedHealth | null;
  status: ConnectionStatus;
  error: string | null;
}

const EMPTY: RouteLiveState = {
  buses: [],
  bounds: null,
  updatedAt: null,
  feedTimestamp: null,
  stale: false,
  health: null,
  status: "idle",
  error: null,
};

interface SubscribeAck {
  ok: boolean;
  routeCode?: string;
  snapshot?: RouteSnapshot;
  error?: string;
}

/**
 * Subscribes to one route and keeps its buses in state.
 *
 * The subscription is a room join, not a stream of the whole city: switching
 * from F23 to K43 leaves the first room and joins the second, so the browser
 * only ever receives the buses it draws.
 */
export function useRouteBuses(routeCode: string | null): RouteLiveState {
  const [state, setState] = useState<RouteLiveState>(EMPTY);

  useEffect(() => {
    if (!routeCode) {
      setState(EMPTY);
      return;
    }

    const socket = getSocket();
    let cancelled = false;

    setState({ ...EMPTY, status: socket.connected ? "live" : "connecting" });

    const apply = (snapshot: RouteSnapshot) => {
      if (cancelled || snapshot.routeCode !== routeCode) return;
      setState((previous) => ({
        ...previous,
        buses: snapshot.buses,
        bounds: snapshot.bounds ?? previous.bounds,
        updatedAt: snapshot.updatedAt,
        feedTimestamp: snapshot.feedTimestamp,
        stale: snapshot.stale,
        status: "live",
        error: null,
      }));
    };

    const subscribe = () => {
      socket.emit("route:subscribe", { routeCode }, (response: SubscribeAck) => {
        if (cancelled || !response) return;
        if (response.ok && response.snapshot) apply(response.snapshot);
        else {
          setState((previous) => ({
            ...previous,
            error:
              response.error === "too_many_subscriptions"
                ? "Estás siguiendo demasiadas rutas a la vez."
                : "No pudimos suscribirnos a esa ruta.",
          }));
        }
      });
    };

    const onConnect = () => {
      if (cancelled) return;
      setState((previous) => ({ ...previous, status: "live", error: null }));
      subscribe(); // reconnect: rejoin the room and get a fresh snapshot
    };
    const onDisconnect = () => {
      if (!cancelled) setState((previous) => ({ ...previous, status: "offline" }));
    };
    const onUpdate = (snapshot: RouteSnapshot) => apply(snapshot);
    const onHealth = (health: FeedHealth) => {
      if (!cancelled) setState((previous) => ({ ...previous, health }));
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("route:update", onUpdate);
    socket.on("feed:health", onHealth);

    if (socket.connected) subscribe();
    else socket.connect();

    return () => {
      cancelled = true;
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("route:update", onUpdate);
      socket.off("feed:health", onHealth);
      socket.emit("route:unsubscribe", { routeCode });
    };
  }, [routeCode]);

  return state;
}
