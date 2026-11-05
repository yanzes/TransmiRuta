/**
 * Builds data/routes.json from the official static GTFS.
 *
 * The realtime feed only carries numeric route ids ("12819"); riders type codes
 * ("F23"). routes.txt is the only place where both live together, so we pull it
 * out of GTFS.zip (121 MB) once and keep just what the app needs.
 *
 *   npm run sync:routes            # downloads GTFS.zip, writes data/routes.json
 *   GTFS_STATIC_ZIP=./GTFS.zip npm run sync:routes   # from a local copy
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";

const GTFS_URL = process.env.GTFS_STATIC_URL ?? "https://gtfs.transmilenio.gov.co/GTFS.zip";
const LOCAL_ZIP = process.env.GTFS_STATIC_ZIP;
const OUT = path.resolve(process.env.ROUTES_FILE ?? "data/routes.json");

type Row = Record<string, string>;

/** routes.txt is quoted CSV; long names contain commas. */
function parseCsv(text: string): Row[] {
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

async function readZip(): Promise<Uint8Array> {
  if (LOCAL_ZIP) {
    console.log(`Reading local ${LOCAL_ZIP}`);
    return new Uint8Array(await readFile(LOCAL_ZIP));
  }
  console.log(`Downloading ${GTFS_URL} (this is the big one, once)`);
  const res = await fetch(GTFS_URL);
  if (!res.ok) throw new Error(`GTFS.zip: HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

const zip = await readZip();
const files = unzipSync(zip, { filter: (file) => file.name === "routes.txt" });
const raw = files["routes.txt"];
if (!raw) throw new Error("routes.txt not found inside GTFS.zip");

const rows = parseCsv(new TextDecoder().decode(raw));
const routes = rows
  .filter((row) => row.route_id && (row.route_short_name || row.route_long_name))
  .map((row) => ({
    routeId: row.route_id!,
    shortName: row.route_short_name || row.route_id!,
    longName: row.route_long_name || "",
    color: row.route_color || "",
    textColor: row.route_text_color || "",
    type: row.route_type || "",
  }));

await mkdir(path.dirname(OUT), { recursive: true });
await writeFile(
  OUT,
  JSON.stringify({ generatedAt: new Date().toISOString(), source: LOCAL_ZIP ?? GTFS_URL, routes }, null, 0),
);

console.log(`Wrote ${routes.length} routes to ${OUT}`);
const troncal = routes.filter((r) => /^[A-Z]\d{1,3}$/.test(r.shortName));
console.log(`Route codes matching /^[A-Z]\\d{1,3}$/ (F23 style): ${troncal.length}`);
console.log("examples:", troncal.slice(0, 8));
for (const code of ["F23", "B12", "K43", "L18", "H710"]) {
  const hit = routes.filter((r) => r.shortName.toUpperCase() === code);
  console.log(code, "->", hit.map((r) => `${r.routeId} (${r.longName})`).join(" | ") || "not found");
}
