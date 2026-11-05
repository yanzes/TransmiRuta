import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * The browser talks to the same origin it was served from; Vite forwards both
 * the REST calls and the Socket.io WebSocket to the Node server. That keeps
 * cookies, CORS and the socket URL out of the picture in development.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8787", changeOrigin: true },
      "/health": { target: "http://localhost:8787", changeOrigin: true },
      "/socket.io": { target: "http://localhost:8787", ws: true, changeOrigin: true },
    },
  },
});
