# TransMilenio en vivo — guía de la app

Mapa en vivo de los buses de TransMilenio (GTFS-Realtime oficial) con buscador de ruta,
recomendación de viajes y vista instalable en el celular. Este README es el de la aplicación
(`server/` + `client/`); la arquitectura a fondo está en
[`docs/transmilenio-en-vivo.md`](docs/transmilenio-en-vivo.md).

## Qué hace

- **Sigue una ruta completa**: escribes `F23`, `B12`, `K43` o el nombre y el mapa dibuja sus
  buses moviéndose sin parpadeos.
- **Te dice qué ruta te sirve**: con el panel vacío eliges desde dónde sales y a dónde vas, y
  devuelve las rutas directas con la parada de subida, la de bajada, la caminata y cuántos buses
  van en la vía.
- **Ordena los buses por dónde van sobre la vía**, no por número, para que la lista se lea como
  se ven en el corredor.
- **Se instala como app** en Chrome de Android: ícono propio, pantalla completa y arranque sin
  red (los datos en vivo nunca se cachean).

## Cómo se usa (lo mismo que muestra la pantalla de bienvenida)

1. **Busca la ruta.** Escribe su código —`F23`, `B12`, `K43`— o su nombre en el buscador del
   panel. Con el campo vacío lista las rutas que están operando ahora.
2. **O pide que te la recomiende.** Sin ruta elegida, el panel pregunta desde dónde sales y a
   dónde vas; si el equipo no tiene GPS, marca tu salida tocando el mapa.
3. **Sigue un bus.** Toca su fila en la lista o su pin en el mapa para ver placa, próxima parada
   y hora del último reporte.

**La ubicación de los buses se actualiza sola cada 10 segundos**, sin recargar la página. Ese
número no está escrito a mano: sale de `pollIntervalMs` del gateway (`POLL_INTERVAL_MS`), y la
pantalla de bienvenida lo muestra tal cual. Si el feed oficial se retrasa, la app avisa en vez de
inventar posiciones; la velocidad y el rumbo se muestran como «sin dato» porque el feed los
publica en cero para toda la flota.

## Arranque

```bash
# 1. Catálogo de rutas (una vez; descarga el GTFS de 121 MB)
cd server
npm install
npm run sync:routes
npm run sync:stops     # opcional: índice de paradas para el planificador (578 MB)
cp .env.example .env
npm run dev            # gateway en http://localhost:8787

# 2. Mapa (otra terminal)
cd client
npm install
npm run icons          # íconos de la PWA (solo si cambias la imagen de marca)
npm run dev            # http://localhost:5173
```

Sin feed disponible: `FEED_SOURCE=mock npm run dev` en `server/` genera buses sintéticos
codificados como protobuf real, así que se ejercita el mismo camino de decodificación.

## Instalarla en el celular

1. Sirve el cliente por **HTTPS** (Chrome exige contexto seguro; `http://IP-de-tu-PC` no basta).
2. Ábrela en Chrome de Android y usa el menú → **Instalar aplicación**.
3. Queda con el ícono de la app, sin barra del navegador, y abre aunque no haya red.

El service worker (`client/public/sw.js`) guarda solo el shell (HTML, CSS, JS, íconos). `/api`,
`/health` y `/socket.io` pasan siempre a la red: una posición cacheada mostrada como actual sería
peor que un «sin conexión» honesto.

## Marca e íconos

Una sola foto manda: `client/public/brand/source.png` (o `.jpg`). De ahí salen todos los
recortes con:

```bash
cd client
npm run brand
```

| Archivo | Uso | Recorte |
| --- | --- | --- |
| `brand/hero.jpg` | Banner de la bienvenida | todo el ancho, 16:9 desde el 15 % de alto |
| `brand/logo.png` | Marca del encabezado (96 px) | ficha TransMilenio de arriba a la izquierda |
| `icons/icon-192.png` · `icon-512.png` · `apple-touch-icon.png` | PWA y favicon | frente del bus, cuadrado |
| `icons/icon-maskable-512.png` | PWA en Android (recorta a círculo) | igual, con más aire alrededor |

Los recortes son proporciones, no píxeles: funcionan con la foto a cualquier resolución. El
script usa `System.Drawing` (Windows). Si no hay foto, `npm run icons` dibuja el bus de forma
vectorial sin dependencias, que es lo que trae el repo por ahora.

## Scripts

| Dónde | Comando | Qué hace |
| --- | --- | --- |
| `client` | `npm run dev` | Vite en `:5173` |
| `client` | `npm run build` | `tsc --noEmit` + build de producción |
| `client` | `npm run icons` | Regenera los íconos PNG de la PWA |
| `client` | `npm run smoke` | Prueba el contrato WebSocket sin navegador |
| `server` | `npm run dev` | Gateway HTTP + Socket.io + poller |
| `server` | `npm run sync:routes` | GTFS.zip → `routes.txt` → `data/routes.json` |
| `server` | `npm run sync:stops` | `stop_times.txt` → `data/route-stops.json` |

## Estructura

```
server/                  gateway: poll del feed, caché en memoria, REST + Socket.io
  src/realtime/          poller, decode (protobuf), store, hub (rooms por ruta)
  src/routes/            catálogo de rutas y planificador (/api/plan)
client/                  React + Leaflet
  src/components/        BusMap, RouteSearch, Planner, Intro, StatusBar, BusCard
  src/hooks/             useRouteBuses (socket), useUserLocation (GPS)
  public/                manifest, service worker, íconos y marca
docs/                    arquitectura medida contra el feed real
```

## Datos y atribución

Datos de TransMilenio S.A. (datos abiertos, CC BY-SA 4.0). Mapa: Esri / © OpenStreetMap. La
atribución se mantiene visible en el mapa y en el pie de la app. Este proyecto no está afiliado a
TransMilenio S.A. ni al SITP; las marcas se usan solo para identificar el sistema que se consulta.
