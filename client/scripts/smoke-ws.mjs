/**
 * End-to-end check of the realtime contract, without a browser.
 *
 *   node scripts/smoke-ws.mjs F23
 *
 * Asserts: the ack carries a snapshot, updates arrive only for the subscribed
 * route, and a code that does not exist is answered with an empty snapshot
 * instead of an error or a leak of the whole fleet.
 */
import { io } from "socket.io-client";

const URL = process.env.SERVER_URL ?? "http://localhost:8787";
const CODE = (process.argv[2] ?? "F23").toUpperCase();
const UNKNOWN = "ZZZ999";

const socket = io(URL, { transports: ["websocket"] });
let acked = false;
let updates = 0;
let foreign = 0;

const finish = (ok, reason) => {
  console.log(ok ? `\n✅ ${reason}` : `\n❌ ${reason}`);
  socket.close();
  process.exit(ok ? 0 : 1);
};

const timer = setTimeout(() => finish(updates > 0, `updates=${updates} after 75s`), 75_000);

socket.on("connect_error", (error) => finish(false, `no pude conectarme: ${error.message}`));

socket.on("connect", () => {
  console.log(`connected to ${URL}, subscribing to ${CODE}`);

  socket.emit("route:subscribe", { routeCode: CODE }, (ack) => {
    if (!ack?.ok) return finish(false, `ack falló: ${ack?.error}`);
    acked = true;
    const buses = ack.snapshot?.buses ?? [];
    console.log(`ack ${ack.routeCode}: ${buses.length} buses, bounds=${ack.snapshot?.bounds ? "sí" : "no"}`);
    if (buses.length > 0) {
      const bus = buses[0];
      console.log(`  primero: ${bus.label} (${bus.routeCode}) @ ${bus.lat.toFixed(5)},${bus.lon.toFixed(5)}`);
    }

    socket.emit("route:subscribe", { routeCode: UNKNOWN }, (unknownAck) => {
      const leaked = unknownAck?.snapshot?.buses?.length ?? -1;
      console.log(`unknown route ack: ok=${unknownAck?.ok} buses=${leaked}`);
      if (!unknownAck?.ok || leaked !== 0) finish(false, "una ruta inexistente devolvió datos");
    });
  });
});

socket.on("route:update", (snapshot) => {
  if (snapshot.routeCode !== CODE) {
    foreign++;
    return;
  }
  updates++;
  const first = snapshot.buses[0];
  console.log(
    `update #${updates} ${snapshot.routeCode}: ${snapshot.buses.length} buses` +
      (first ? `, ${first.label} @ ${first.lat.toFixed(5)},${first.lon.toFixed(5)}` : ""),
  );
  if (acked && updates >= 1) {
    clearTimeout(timer);
    finish(foreign === 0, `ack + ${updates} update(s), ${foreign} de otras rutas`);
  }
});

socket.on("feed:health", (health) => {
  console.log(
    `health: ${health.vehicles} vehículos, edad ${health.ageSeconds}s, ` +
      `velocidad=${health.speedAvailable} rumbo=${health.bearingAvailable}`,
  );
});
