import { io, type Socket } from "socket.io-client";

import { API_BASE } from "./api";

let socket: Socket | null = null;

/**
 * One socket for the whole tab. Subscribing to another route is a join/leave,
 * not a new connection, so switching routes does not cost a handshake.
 */
export function getSocket(): Socket {
  if (socket) return socket;

  socket = io(API_BASE || undefined, {
    path: "/socket.io",
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionDelay: 600,
    reconnectionDelayMax: 5_000,
    timeout: 10_000,
  });

  return socket;
}
