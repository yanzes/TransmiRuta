/**
 * Diagnostic: decode the live TransMilenio VehiclePositions feed and report the
 * shape of what actually arrives, so the mapping in src/realtime/decode.ts can be
 * checked against reality instead of assumptions.
 *
 *   npm run probe
 */
import GtfsRealtimeBindings from "gtfs-realtime-bindings";

const URL = process.env.GTFS_RT_URL ?? "https://gtfs.transmilenio.gov.co/positions.pb";

const res = await fetch(URL, { headers: { "User-Agent": "transmi-tracker/0.1 (probe)" } });
console.log("HTTP", res.status, res.headers.get("content-type"), res.headers.get("content-length"));

const buf = new Uint8Array(await res.arrayBuffer());
console.log("bytes", buf.byteLength, "incrementality", res.headers.get("x-incrementality"));

const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(buf);
console.log("header", JSON.stringify(feed.header));
console.log("entities", feed.entity.length);

const vehicles = feed.entity.map((e) => e.vehicle).filter((v) => v && v.position);
console.log("entities with position", vehicles.length);

console.log("sample entities:", JSON.stringify(feed.entity.slice(0, 3), null, 2));

const routeIds = new Set<string>();
const statuses = new Set<string>();
const labels = new Set<string>();
for (const v of vehicles) {
  if (v.trip?.routeId) routeIds.add(v.trip.routeId);
  statuses.add(String(v.currentStatus));
  if (v.vehicle?.label) labels.add(v.vehicle.label);
}
const ids = [...routeIds].sort();
console.log("distinct routeIds", ids.length);
console.log("routeIds sample", ids.slice(0, 40));
console.log("routeIds matching /^[A-Z]\\d+$/", ids.filter((r) => /^[A-Z]\d+$/.test(r)).length);
console.log("routeIds containing '-'", ids.filter((r) => r.includes("-")).slice(0, 20));
console.log("currentStatus values", [...statuses]);
console.log("vehicle.label sample", [...labels].slice(0, 10));
console.log("has trip.routeId", vehicles.filter((v) => v.trip?.routeId).length);
console.log("has vehicle.id", vehicles.filter((v) => v.vehicle?.id).length);
console.log("has bearing", vehicles.filter((v) => typeof v.position?.bearing === "number").length);
console.log("has speed", vehicles.filter((v) => typeof v.position?.speed === "number").length);
const withTs = vehicles.filter((v) => v.timestamp?.toNumber?.() ?? v.timestamp);
console.log("has timestamp", withTs.length, "newest", withTs[0]?.timestamp);
