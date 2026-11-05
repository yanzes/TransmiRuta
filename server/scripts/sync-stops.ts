/**
 * Índice de paradas por ruta troncal, para recomendar qué ruta sirve un viaje.
 *
 * routes.txt y trips.txt no dicen qué paradas toca cada ruta: eso solo está en
 * stop_times.txt, que son 578 MB dentro de GTFS.zip. Se descomprime una vez,
 * se filtra por los viajes troncales y se guarda un JSON compacto.
 *
 *   npm run sync:stops
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";

const ZIP = path.resolve(process.env.GTFS_STATIC_ZIP ?? "data/GTFS.zip");
const OUT = path.resolve(process.env.STOPS_FILE ?? "data/route-stops.json");
const CHUNK = 8 * 1024 * 1024;

console.log("Reading", ZIP);
const zip = new Uint8Array(await readFile(ZIP));

const needed = new Set(["routes.txt", "trips.txt", "stops.txt", "stop_times.txt"]);
const files = unzipSync(zip, { filter: (file) => needed.has(file.name) });
for (const name of needed) if (!files[name]) throw new Error(`${name} not found inside GTFS.zip`);

const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

/** Quoted CSV (names contain commas). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < src.length; i++) {
    const char = src[i]!;
    if (quoted) {
      if (char === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows;
  if (!header) return [];
  return body
    .filter((cells) => cells.length > 1)
    .map((cells) => Object.fromEntries(header.map((key, index) => [key.trim(), (cells[index] ?? "").trim()])));
}

function headerIndex(headerLine: string): Map<string, number> {
  return new Map(headerLine.replace(/^\uFEFF/, "").split(",").map((key, index) => [key.trim(), index]));
}

// 1. Rutas troncales: el código es una letra y un número (F23, K43, L18).
const routes = parseCsv(decode(files["routes.txt"]!));
const troncal = new Map<string, string>();
for (const row of routes) {
  const code = (row.route_short_name ?? "").trim().toUpperCase();
  if (/^[A-Z]{1,2}\d{1,3}[A-Z]?$/.test(code)) troncal.set(row.route_id!, code);
}
console.log(`troncal routes: ${troncal.size}`);

// 2. Viajes de esas rutas.
const tripToRoute = new Map<string, string>();
{
  const lines = decode(files["trips.txt"]!).split("\n");
  const head = headerIndex(lines[0] ?? "");
  const routeAt = head.get("route_id")!;
  const tripAt = head.get("trip_id")!;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const cells = line.split(",");
    const routeId = cells[routeAt];
    const tripId = cells[tripAt];
    if (routeId && tripId && troncal.has(routeId.trim())) tripToRoute.set(tripId.trim(), routeId.trim());
  }
}
console.log(`troncal trips: ${tripToRoute.size}`);

// 3. stop_times: 578 MB, en trozos para no duplicar la memoria en un string.
const routeStops = new Map<string, Map<string, number>>();
{
  const bytes = files["stop_times.txt"]!;
  let carry = "";
  let head: Map<string, number> | null = null;
  let parsed = 0;
  let kept = 0;

  for (let offset = 0; offset < bytes.length; offset += CHUNK) {
    const slice = bytes.subarray(offset, Math.min(offset + CHUNK, bytes.length));
    const lines = (carry + decode(slice)).split("\n");
    carry = lines.pop() ?? "";

    let start = 0;
    if (!head) {
      head = headerIndex(lines[0] ?? "");
      start = 1;
    }

    const tripAt = head.get("trip_id")!;
    const stopAt = head.get("stop_id")!;
    const seqAt = head.get("stop_sequence")!;

    for (let i = start; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      parsed++;
      const cells = line.split(",");
      const tripId = cells[tripAt];
      if (!tripId) continue;
      const routeId = tripToRoute.get(tripId.trim());
      if (!routeId) continue;

      const stopId = cells[stopAt]?.trim();
      if (!stopId) continue;
      const sequence = Number(cells[seqAt]) || Number.MAX_SAFE_INTEGER;

      kept++;
      let stops = routeStops.get(routeId);
      if (!stops) {
        stops = new Map();
        routeStops.set(routeId, stops);
      }
      const previous = stops.get(stopId);
      if (previous === undefined || sequence < previous) stops.set(stopId, sequence);
    }

    if (offset % (CHUNK * 4) === 0) {
      console.log(`  ${Math.round((offset / bytes.length) * 100)}% · ${(parsed / 1e6).toFixed(1)}M filas · ${kept} de troncal`);
    }
  }
  console.log(`stop_times: ${parsed} filas, ${kept} de rutas troncales`);
}

// 4. Coordenadas y nombres de las paradas usadas.
const stops = new Map<string, [string, number, number]>();
{
  const rows = parseCsv(decode(files["stops.txt"]!));
  for (const row of rows) {
    const lat = Number(row.stop_lat);
    const lon = Number(row.stop_lon);
    if (!row.stop_id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    stops.set(row.stop_id, [row.stop_name ?? "", lat, lon]);
  }
}

const used = new Set<string>();
const routesOut: Record<string, { code: string; stops: string[] }> = {};
for (const [routeId, stopMap] of routeStops) {
  const ordered = [...stopMap.entries()].sort((a, b) => a[1] - b[1]).map(([stopId]) => stopId);
  if (ordered.length < 2) continue;
  for (const stopId of ordered) used.add(stopId);
  routesOut[routeId] = { code: troncal.get(routeId)!, stops: ordered };
}

const stopsOut: Record<string, [string, number, number]> = {};
for (const stopId of used) {
  const stop = stops.get(stopId);
  if (stop) stopsOut[stopId] = stop;
}

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), routes: routesOut, stops: stopsOut }),
);

const codes = new Set(Object.values(routesOut).map((route) => route.code));
console.log(`Wrote ${OUT}`);
console.log(`  rutas con paradas: ${Object.keys(routesOut).length} (${codes.size} códigos)`);
console.log(`  paradas usadas: ${Object.keys(stopsOut).length}`);
