# @transmi/server — gateway GTFS-Realtime

Lee el feed oficial de TransMilenio **una vez cada 10 segundos**, decodifica el protobuf,
filtra por ruta y reparte solo los buses que cada cliente está mirando por Socket.io.

Diseño completo, hallazgos del feed y despliegue: [`../docs/transmilenio-en-vivo.md`](../docs/transmilenio-en-vivo.md).

## Arranque

```bash
npm install
npm run sync:routes   # GTFS.zip -> data/routes.json (una vez; 121 MB de descarga)
npm run sync:stops    # GTFS.zip -> data/route-stops.json (opcional: recomendaciones)
cp .env.example .env
npm run dev           # http://localhost:8787
```

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Servidor con recarga (`tsx watch`) |
| `npm run build` / `npm start` | Compila a `dist/` y ejecuta |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run probe` | Decodifica el feed real e imprime su forma (vehículos, `route_id`, estados) |
| `npm run sync:routes` | Extrae `routes.txt` de GTFS.zip y genera `data/routes.json` |
| `npm run sync:stops` | Extrae `stop_times.txt` y genera `data/route-stops.json` (686 rutas, 7.532 paradas) |

## Endpoints

| Método | Ruta | Devuelve |
| --- | --- | --- |
| GET | `/health` | Liveness + salud del feed |
| GET | `/api/status` | Salud, rutas activas, watchers por ruta, catálogo |
| GET | `/api/routes?q=F2&limit=8` | Autocompletado de rutas (un row por código) |
| GET | `/api/routes?limit=8` | Rutas operando ahora, ordenadas por buses |
| GET | `/api/routes/:code` | Metadatos + número de buses |
| GET | `/api/routes/:code/vehicles` | Snapshot puntual |
| GET | `/api/stops?q=portal&limit=6` | Autocompletado de estaciones |
| GET | `/api/plan?from=lat,lon&to=lat,lon` | Rutas troncales que sirven el viaje (directas, radio 900 m) |

`/api/plan` compara la parada más cercana al origen y al destino de cada ruta, exige que ambas
estén dentro del radio y las ordena por caminata total, desempatando por buses en vía. Sin
`data/route-stops.json` responde `503 stop_index_missing` y el resto de endpoints sigue igual.

## Socket.io

```js
socket.emit("route:subscribe", { routeCode: "F23" }, (ack) => {
  // ack.snapshot ya trae las posiciones actuales: el mapa no espera al próximo poll
});
socket.on("route:update", (snapshot) => { /* misma ruta, cada vez que se mueve */ });
socket.on("feed:health", (health) => { /* frescura, fallos, latencia */ });
```

Cada socket entra a la room `route:F23`: nunca recibe la flota completa.

## Variables

| Variable | Por defecto | Notas |
| --- | --- | --- |
| `GTFS_RT_URL` | `https://gtfs.transmilenio.gov.co/positions.pb` | Feed oficial VehiclePositions |
| `FEED_SOURCE` | `live` | `mock` genera un feed protobuf sintético |
| `PORT` | `8787` | |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Orígenes CORS, separados por coma |
| `POLL_INTERVAL_MS` | `10000` | El feed se actualiza ~cada 20 s |
| `STALE_AFTER_MS` | `45000` | A partir de aquí el snapshot se marca retrasado |
| `ROUTES_FILE` | `data/routes.json` | Catálogo estático |
| `STOPS_FILE` | `data/route-stops.json` | Índice de paradas para `/api/plan` |

## Notas del feed real

- `trip.routeId` es **numérico** (`"12820"`); el código `F23` solo existe en `routes.txt`.
- `header.timestamp` puede venir con días de retraso: la frescura se mide con `vehicle.timestamp`.
- `speed` y `bearing` llegaron en 0 para toda la flota; por eso `/health` publica
  `speedAvailable` / `bearingAvailable` y la UI muestra `sin dato`.
