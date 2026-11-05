# TransMilenio en vivo — arquitectura de referencia

Aplicación web que recibe un código de ruta (`F23`, `B12`, `K43`) y dibuja sobre un mapa los
buses que la están operando en ese momento, a partir del feed **GTFS-Realtime oficial** de
TransMilenio S.A.

```
server/   Node 20+ · Express 5 · Socket.io · gtfs-realtime-bindings (Protocol Buffers)
client/   React 19 · Vite · react-leaflet 5 · Leaflet · socket.io-client
```

Todo lo que sigue está verificado contra el feed real el **4 de noviembre de 2026**; los
números de la sección *Verificación* salen de ejecuciones de este repositorio.

---

## 1. La fuente de datos: lo que realmente publica TransMilenio

### 1.1 Endpoints

El portal oficial es `https://gtfs.transmilenio.gov.co/` y publica un manifiesto en
`manifest.json`:

| Archivo | Contenido | Tamaño observado |
| --- | --- | --- |
| `positions.pb` | **VehiclePositions** (lo que usa esta app) | ~0,8 MB por snapshot |
| `tripupdates.pb` | TripUpdates (retrasos por viaje) | ~250 KB |
| `alerts.pb` | ServiceAlerts (novedades del servicio) | ~90 KB |
| `GTFS.zip` | GTFS estático completo (`routes.txt`, `stops.txt`, `trips.txt`, `shapes.txt`…) | 121 MB |

El feed es `FULL_DATASET` (no incremental): cada respuesta trae **la flota completa**,
unos 6.300 vehículos en hora valle y varios miles más en hora pico.

### 1.2 La trampa principal: `route_id` es numérico

El protobuf **no contiene el código que el usuario escribe**. Lo que trae es:

```jsonc
{
  "id": "179359216400012464",
  "vehicle": {
    "trip": { "tripId": "TTBD20874.10.12820", "routeId": "12820" },   // ← numérico
    "position": { "latitude": 4.6564, "longitude": -74.0624 },
    "vehicle": { "id": "7008", "label": "E0008", "licensePlate": "TGX724" },
    "currentStopSequence": 4,
    "stopId": "61161",
    "timestamp": "1793822990",
    "currentStatus": "IN_TRANSIT_TO"
  }
}
```

`route_id = 12820` no le dice nada a nadie. La relación `código ↔ route_id` vive **solo en el
GTFS estático**, en `routes.txt`:

```csv
route_id,agency_id,route_short_name,route_long_name,...
10082,...,F23,Banderas,...
11163,...,F23,P. Américas,...
13276,...,K43,P. ElDorado,...
```

Consecuencias de diseño, todas implementadas aquí:

1. **Sin catálogo estático no hay forma de responder "¿dónde va F23?"**. `server/scripts/sync-gtfs.ts`
   descarga `GTFS.zip`, extrae únicamente `routes.txt` (121 MB → 136 KB de JSON, 1.076 rutas)
   y escribe `server/data/routes.json`. Se ejecuta una vez y se refresca cuando cambie el
   GTFS (mensual); el arranque del servidor no depende de la red.
2. **Un código puede tener varios `route_id`** (`F23 → 10082`, `F23 → 11163`; `B12 → 11876`,
   `B12 → 12874`). El agrupamiento del mapa es **por código**, no por `route_id`, y la
   búsqueda del selector deduplica por código.
3. El servidor acepta igualmente un `route_id` numérico pegado por el usuario: si el código no
   existe en el catálogo, se intenta como `route_id`.

### 1.3 Otras particularidades medidas

| Observación | Impacto | Mitigación en el código |
| --- | --- | --- |
| `header.timestamp` venía **~2,7 días** desfasado (1793592164) | No sirve para medir frescura | La antigüedad se calcula con `vehicle.timestamp` y con la hora del último poll exitoso |
| `position.speed` y `position.bearing` vienen **en 0 para los 6.375** vehículos | Mostrar "0 km/h" sería mentir | `health.speedAvailable` / `bearingAvailable`; la UI muestra `sin dato` en lugar de un cero falso |
| `Content-Type: text/plain` | No se puede validar por MIME | Se valida que el cuerpo decodifique como protobuf y que supere un mínimo de bytes |
| Sin `ETag`/`Last-Modified` estables | No siempre hay 304 | El cliente HTTP envía condicionales igual y trata 304 como éxito, no como error |
| Latencia del feed ≈ 880–940 ms | El poll debe tener timeout | `AbortSignal.timeout(8 s)` + backoff |
| `vehicle.timestamp` con ~60 s de retraso | La UI no debe prometer "ahora" | `ago()` muestra segundos reales y `stale` a los 45 s sin poll exitoso |

### 1.4 Coste de no cachear

Un snapshot son ~0,8 MB. Si cada visitante polleara cada 10 s:

```
0,8 MB × 6 por minuto × 60 × 24 ≈ 6,9 GB/día por usuario concurrente
```

Por eso **un solo proceso consulta el feed** y todos los navegadores leen de la memoria del
servidor (§2.1). Es la diferencia entre 1 petición cada 10 s y miles.

---

## 2. Backend: polling, caché y fan-out

```
                 ┌──────────────────────── server ───────────────────────────┐
                 │                                                           │
 positions.pb ──▶│ FeedPoller (cada 10 s, single-flight, backoff)             │
   (~0,8 MB)     │      │ bytes                                             │
                 │      ▼                                                    │
                 │ decodeFeed()  protobuf → Bus[]  (puro, sin I/O)            │
                 │      │                                                    │
                 │      ▼                                                    │
                 │ SnapshotStore  Map<routeCode, Bus[]> + health + staleness  │
                 │      │                                                    │
                 │      ├─▶ RealtimeHub  rooms "route:F23" ──▶ socket.io ──┐  │
                 │      └─▶ Express REST /api/*                            │  │
                 └─────────────────────────────────────────────────────────┘  │
                                                                              ▼
                                                        navegador (solo su ruta)
```

### 2.1 Poller — un reloj para toda la ciudad

`server/src/realtime/poller.ts`

- Un `setTimeout` recurrente (no `setInterval`) cada `POLL_INTERVAL_MS`, con **jitter** de hasta
  750 ms para que varias instancias no coincidan en el mismo segundo.
- **Single flight**: un `running` boolean impide que una respuesta lenta se solape con el
  siguiente tick.
- **Backoff exponencial** 10 → 20 → 40 → 60 s ante fallos, sin dejar de servir el último
  snapshot bueno entre tanto.
- `304 Not Modified` = éxito (refresca la antigüedad, no los datos).
- Un error **no vacía el mapa**: `SnapshotStore` conserva el snapshot anterior y lo marca
  `stale` a los `STALE_AFTER_MS`.

10 s es deliberado: el feed se actualiza más o menos cada 20 s, así que pollear más rápido
solo repite posiciones y gasta ancho de banda del operador.

### 2.2 Decode — protobuf a dominio

`server/src/realtime/decode.ts` es una función pura `(bytes, catálogo) → Bus[]`:

- `FeedMessage.decode()` de `gtfs-realtime-bindings` (protobufjs).
- Los `int64` llegan como `Long`; se normalizan a `number` (`toNumber`) antes de cualquier
  aritmética — de ahí salen `timestamp`, `currentStopSequence`.
- `position.speed` está en **m/s** por especificación: se convierte a km/h.
- Se descartan entidades sin `route_id`, sin posición, con `(0,0)` o fuera de rango.
- Deduplicación por `vehicle.id` quedándose con el `timestamp` más reciente (un
  `FULL_DATASET` puede repetir un vehículo).
- `route_id` se cruza con el catálogo para obtener `routeCode` (`F23`) y `routeName`.

### 2.3 Store — el caché en memoria

`server/src/realtime/store.ts`

- `Map<routeCode, Bus[]>` reconstruido en cada poll (6.300 vehículos: sub-milisegundo) y un
  caché de `RouteSnapshot` por código, invalidado en bloque.
- El snapshot que recibe un cliente es **inmutable** (mismo array hasta el próximo poll), así
  que emitirlo a mil sockets cuesta cero serializaciones extra.
- `health()` expone frescura, latencia, fallos consecutivos, descartes y disponibilidad de
  velocidad/rumbo.
- `listActive()` alimenta el selector de rutas con lo que está operando ahora.

### 2.4 RealtimeHub — rooms, no broadcast

`server/src/realtime/hub.ts`

Un socket **entra a la room de su ruta** y solo recibe esa room. Ver una ruta cuesta 10–40
buses por mensaje, no 6.300.

Contrato de eventos:

| Dirección | Evento | Payload |
| --- | --- | --- |
| cliente → servidor | `route:subscribe` | `{ routeCode: "F23" }` + ack |
| cliente → servidor | `route:unsubscribe` | `{ routeCode: "F23" }` + ack |
| servidor → cliente (ack) | — | `{ ok: true, routeCode, snapshot }` |
| servidor → room | `route:update` | `RouteSnapshot` |
| servidor → todos | `feed:health` | `FeedHealth` |

Detalles que evitan problemas clásicos:

- **El ack trae el snapshot completo**: el mapa pinta posiciones de inmediato en lugar de
  esperar hasta 10 s al siguiente poll (nunca aparece un mapa vacío).
- **Firma por room**: se calcula un hash de `id|lat|lon|bearing|reportedAt` y no se emite nada
  si la ruta no cambió. Una ruta sin movimiento no genera tráfico.
- Máximo de suscripciones por socket (`MAX_SUBS_PER_SOCKET`, 4) para que un solo cliente no
  pueda pedir el catálogo entero.
- Al reconectar, el cliente vuelve a emitir `route:subscribe` y recibe snapshot fresco: no hay
  estado que reconciliar.

### 2.5 REST

| Endpoint | Uso |
| --- | --- |
| `GET /health` | Liveness + salud del feed |
| `GET /api/status` | Salud, rutas activas, watchers por ruta, catálogo cargado |
| `GET /api/routes?q=F2&limit=8` | Autocompletado sobre el catálogo (código y nombre) |
| `GET /api/routes?limit=8` | Rutas operando ahora, ordenadas por buses |
| `GET /api/routes/:code` | Metadatos de la ruta + cuántos buses tiene |
| `GET /api/routes/:code/vehicles` | Snapshot puntual (sin WebSocket, útil para debug y para un primer render) |
| `GET /api/stops?q=portal&limit=6` | Autocompletado de estaciones sobre las paradas del GTFS troncal |
| `GET /api/plan?from=4.75,-74.04&to=4.57,-74.13` | Qué rutas troncales sirven el viaje (radio de 900 m por defecto, máx. 3.000) |

Todo va con `Cache-Control: no-store`: son posiciones en vivo, un CDN no debe servirlas.

---

## 3. Frontend: React + Leaflet

### 3.1 Suscripción

`client/src/hooks/useRouteBuses.ts` mantiene **un solo socket por pestaña** (`lib/socket.ts`).
Cambiar de ruta es `unsubscribe` + `subscribe`, no una conexión nueva. El estado expone
`buses`, `bounds`, `updatedAt`, `stale`, `health`, `status` y `error`.

### 3.2 Marcadores que se mueven, no que parpadean

La causa del parpadeo típico es **remontar el marcador** en cada actualización (cambiar el
`icon` o usar una `key` inestable reconstruye el DOM y el pin salta). Aquí:

- La `key` de React es `bus.id` (estable durante toda la vida del bus).
- `BusMarker` crea el `L.marker` **una vez** en un `useEffect` con `[map]`, y nunca lo vuelve a
  crear al cambiar de posición.
- Cada nueva posición se interpola con `requestAnimationFrame` durante `GLIDE_MS` (1,1 s,
  alineado con el intervalo de poll): el bus *viaja* hasta su nueva coordenada.
- Si llega un update a mitad de un desplazamiento, el nuevo tramo arranca desde la posición
  **dibujada** (`positionRef`), no desde la anterior: nunca hay salto.
- Rumbo y selección se aplican tocando `style` y clases sobre el nodo existente
  (`--bearing`, `.is-selected`, `setZIndexOffset`), sin recrear el icono.

### 3.3 Cámara

- `FitRoute` vuela al bounding box de la ruta **una vez por cambio de ruta** (`flownFor`), no
  en cada update: si lo hiciera, el mapa pelearía con el usuario cada 10 s.
- `FocusSelected` vuela al bus elegido solo cuando cambia la selección.
- Al limpiar la ruta, el mapa vuelve al centro troncal de Bogotá.

### 3.4 Búsqueda

`RouteSearch` es un combobox con debounce de 180 ms y `AbortController` (una respuesta lenta no
pisa a la nueva), navegable con flechas/Enter/Esc. Con el campo vacío lista las rutas que están
operando en ese momento, con cuántos buses cada una. La ruta activa vive en la URL
(`?ruta=F23`), así que es compartible y sobrevive a un reload.

El campo vive **dentro del panel** (`.panel__search`), justo encima del estado de conexión: el
mismo sitio que dice «elige una ruta» es el sitio donde se escribe. Por eso el panel declara
`overflow: visible` (el desplegable tiene que poder salir) y el scroll queda en
`.panel__scroll`.

### 3.5 Tu ubicación

`hooks/useUserLocation.ts` usa `watchPosition` (no `getCurrentPosition`): el rider también se
mueve, así que el punto azul se refresca solo mientras camina hacia la estación.

- El permiso se pide **solo al pulsar** `Mi ubicación`, nunca al cargar la página.
- Se dibuja el punto azul con borde blanco más el círculo de precisión que reporta el GPS.
- La cámara vuela al punto **una vez por pulsación** (el `nonce` del botón), no en cada fix.
- Primero pide una posición **aproximada** (`enableHighAccuracy: false`, la que resuelve el
  navegador por red) y solo cuando llega abre un segundo `watch` con GPS fino. Pedir alta
  precisión de entrada en un portátil sin GPS termina en `TIMEOUT` y el mapa nunca se centra.
- Vigilancia propia de 12 s: algunos navegadores ignoran `timeout` y dejan la petición colgada,
  así que el aviso lo da un temporizador del cliente. El `watch` sigue abierto: un fix tardío
  igual coloca el punto, y el botón vuelve a estar disponible para reintentar sin cerrar nada.
- Errores explícitos en pantalla: permiso bloqueado, timeout, sistema sin ubicación, navegador
  sin geolocalización; todos recuerdan que también se puede escribir la estación o marcar la
  salida en el mapa desde el planificador (ver 3.6).
  En producción la geolocalización exige **HTTPS** (en `localhost` funciona igual).

El basemap **no depende de ninguna clave**: Esri World Dark Gray y, si esa capa falla,
OpenStreetMap tras 5 errores de tile. Es deliberado: un proveedor con clave puede responder
**200** con un placeholder que dice “API key required” y entonces no hay `tileerror` que
detectar, solo un mapa inútil.

Trampa adicional, medida: el servicio `Canvas` de Esri **solo tiene caché hasta el nivel 16**.
A partir de z17 devuelve la misma tesela gris de 2.521 B para cualquier coordenada (“Map data
not yet available”), también con código 200. Por eso la capa declara `maxNativeZoom: 16` con
`maxZoom: 18`: Leaflet pide la 16 y la escala, en vez de pedir niveles que el proveedor no
tiene. Cualquier basemap nuevo debe revisarse con este test: pedir dos teselas de zonas
opuestas en el mismo zoom y comparar el hash.

### 3.6 «¿A dónde vas?» — recomendación de ruta

Cuando no hay ruta activa el panel no es un cartel vacío: es el planificador
(`components/Planner.tsx`). Se eligen dos estaciones —o el origen se toma de «Usar mi ubicación»
o de un punto **marcado en el mapa**— y se pide `GET /api/plan`. El servidor, por cada ruta
troncal, busca su parada más cercana al origen y su parada más cercana al destino; solo cuenta
si **ambas** caen dentro del radio y son
distintas. Ordena por caminata total y desempata por buses en vía (una ruta muerta no puede
ganar). Devuelve subida, bajada, distancia a pie y cuántos buses están reportando ahora.

Límites deliberados: son viajes **directos**, sin transbordos ni horarios. Es la respuesta
honesta a «¿qué ruta me sirve?» con los datos que hay; prometer una combinación con tiempos
sería inventar.

El origen a mano existe por algo comprobado en este equipo: Windows resuelve la posición con
escaneos Wi-Fi, y un PC **solo con Ethernet** (aquí `Get-NetAdapter -Physical` solo lista
`Realtek PCIe GBE` y `netsh wlan show interfaces` responde «No hay ninguna interfaz
inalámbrica») no obtiene fix nunca: permiso en `Allow`, apps de escritorio en `Allow` y el
servicio `lfsvc` en marcha, y el watch expira igual. Por eso `PickPoint` (`BusMap.tsx`) escucha
**cada** clic mientras el modo está activo —no uno solo: así el punto se puede corregir sin
volver a pulsar el botón—, dibuja un pin naranja «Salida» que además se arrastra, pone el
cursor en cruz y marca el contenedor con `.is-picking` para que los pines de bus dejen pasar el
clic. Ese par de coordenadas entra en `/api/plan` como cualquier otro origen.

El índice sale de `npm run sync:stops` (`scripts/sync-stops.ts`), que recorre las 9,46 millones
de filas de `stop_times.txt` (578 MB) filtrando solo los `trip_id` de rutas troncales:
686 rutas, 471 códigos y 7.532 paradas únicas en `data/route-stops.json` (937 KB, cargado en
memoria al arrancar). Si el archivo no existe el gateway sigue levantando: `/api/plan`
responde `503 stop_index_missing` y el resto funciona igual.

Un mismo código con varios `route_id` (ramas de la misma ruta) **une** sus paradas: si no,
recomendarías F23 solo para una de sus dos terminales.

### 3.7 La lista va por ubicación, no por número

`lib/geo.ts` ordena los buses con una proyección sobre el eje principal del conjunto (PCA de
las coordenadas en metros): el primer autovector da la dirección del corredor y cada bus se
ordena por su proyección, así que la lista se lee como se ven los buses por la vía. Con menos
de 3 buses no hay eje fiable y se usa `stopSequence`. La numeración del panel (1, 2, 3…) es
ordinal de recorrido, no el número del bus.

### 3.8 Instalable en el celular (PWA)

`public/manifest.webmanifest` y `public/sw.js` convierten el mapa en una app instalable: Chrome
en Android ofrece «Instalar aplicación» y al abrirla no hay barra de navegador (`display:
standalone`). Los íconos (192, 512, 512 `maskable` y 180 para iOS) los dibuja y codifica
`npm run icons` (`scripts/make-icons.mjs`) sin dependencias: PNG a mano con `zlib` y
supersampling 3×3 para que los bordes no queden dentados. La variante `maskable` lleva el fondo
a sangre porque el lanzador recorta a círculo y las esquinas redondeadas dejarían ver un hueco.

El service worker guarda el shell (HTML, CSS, JS e íconos) para que la app abra sin red, pero
deja pasar `/api`, `/health` y `/socket.io` sin tocar: una posición cacheada mostrada como
actual sería peor que un «sin conexión» honesto. Las teselas del mapa son de otro origen y
tampoco se interceptan. El registro ocurre solo en producción (`import.meta.env.PROD`): en
`npm run dev` cachearía el HMR y rompería el guardado en caliente.

Instalar exige contexto seguro: HTTPS o `localhost`. Abrir `http://192.168.x.x:5173` en el
teléfono funciona como web normal, pero Chrome no ofrecerá instalarla.

---

## 4. Estructura de carpetas

```
server/
├── data/
│   ├── routes.json              # F23 -> 10082/11163 (generado, 136 KB)
│   └── route-stops.json         # paradas por ruta (generado, 937 KB)
├── scripts/
│   ├── probe-feed.ts            # decodifica el feed real y reporta su forma
│   ├── sync-gtfs.ts             # GTFS.zip -> routes.txt -> data/routes.json
│   └── sync-stops.ts            # GTFS.zip -> stop_times.txt -> data/route-stops.json
├── src/
│   ├── config.ts                # entorno tipado, un solo lugar
│   ├── index.ts                 # http + socket.io + poller + shutdown
│   ├── http.ts                  # Express: REST, CORS, errores
│   ├── types.ts                 # Bus, RouteSnapshot, FeedHealth
│   ├── lib/logger.ts
│   ├── realtime/
│   │   ├── decode.ts            # protobuf -> Bus[] (puro)
│   │   ├── feedClient.ts        # GET con timeout y condicionales
│   │   ├── mockFeed.ts          # feed sintético (mismo path de protobuf)
│   │   ├── poller.ts            # el reloj: 10 s, single-flight, backoff
│   │   ├── store.ts             # caché en memoria + staleness
│   │   └── hub.ts               # rooms de Socket.io + diffs
│   └── routes/
│       ├── catalog.ts           # resolución código <-> route_id
│       └── planner.ts           # índice de paradas + recomendación de rutas
└── .env.example

client/
├── scripts/smoke-ws.mjs         # prueba del contrato WebSocket sin navegador
├── scripts/make-icons.mjs       # íconos PNG de la PWA (sin dependencias)
├── public/
│   ├── manifest.webmanifest     # PWA: nombre, íconos, standalone
│   ├── sw.js                    # shell offline; datos en vivo nunca se cachean
│   └── icons/                   # 192, 512, 512 maskable, 180
├── src/
│   ├── main.tsx
│   ├── App.tsx                  # estado de ruta, layout, deep link
│   ├── styles.css
│   ├── components/
│   │   ├── BusMap.tsx           # Leaflet, gliding, cámara, portales
│   │   ├── RouteSearch.tsx      # combobox (dentro del panel)
│   │   ├── Planner.tsx          # origen/destino -> rutas recomendadas
│   │   ├── StatusBar.tsx        # conexión y frescura
│   │   └── BusCard.tsx          # detalle del bus
│   ├── data/portales.ts
│   ├── hooks/useRouteBuses.ts
│   └── lib/{api,socket,format,types,geo}.ts
└── .env.example
```

---

## 5. Cómo correrlo

```bash
# 1. Catálogo de rutas (una vez; descarga GTFS.zip de 121 MB)
cd server
npm install
npm run sync:routes
npm run sync:stops     # opcional: índice de paradas (578 MB de stop_times.txt)
cp .env.example .env

# 2. Gateway
npm run dev            # http://localhost:8787

# 3. Mapa (otra terminal)
cd client
npm install
npm run dev            # http://localhost:5173
```

Vite proxya `/api`, `/health` y `/socket.io` a `:8787`, así que en desarrollo no hay CORS ni
URLs absolutas. Para un despliegue separado, define `VITE_SERVER_URL` y `CLIENT_ORIGIN`.

Sin feed disponible: `FEED_SOURCE=mock npm run dev` genera buses sintéticos sobre los
corredores troncales **codificados como protobuf real**, de modo que se ejercita exactamente el
mismo camino de decodificación.

---

## 6. Verificación ejecutada

Con el servidor apuntando al feed oficial:

| Comprobación | Resultado |
| --- | --- |
| Decodificación del feed | 6.283–6.375 vehículos, 597–598 rutas activas, 0 descartes |
| Cruce catálogo ↔ feed | **634 de 634** `route_id` del feed existen en `routes.txt` |
| `GET /api/routes/F23/vehicles` | 10–11 buses, con placa, `stopId` y `stopSequence` |
| F23 resuelto a | `10082` (Banderas) + `11163` (P. Américas) |
| Poll | ~880–940 ms, cada 10 s, 304 y backoff contemplados |
| Smoke WebSocket (`client/scripts/smoke-ws.mjs F23`) | ack con snapshot, 1 `route:update` con posición desplazada, **0 mensajes de otras rutas**, ruta inexistente → 0 buses |
| En el navegador (`/?ruta=F23`) | 13 marcadores con su etiqueta, 36 tiles Esri (0 roto), panel «12 buses en la ruta · ahora», sin errores de consola |
| Geolocalización (con fix simulado) | punto azul `rgb(47,143,255)` con borde blanco (`z-index` sobre los buses) + círculo de precisión; «Ocultar» los retira y «Mi ubicación» los vuelve a pedir |
| Permiso real | En este equipo la geolocalización nunca resuelve: solo hay Ethernet, sin Wi-Fi, así que Windows no tiene de dónde calcular la posición aunque el permiso esté concedido y `lfsvc` corra. Se usa «Marcar en el mapa» como origen |
| Salida marcada con el puntero | «Marcar en el mapa» pone el cursor en cruz y el pin naranja «Salida» en el punto; un segundo clic lo mueve (`translate3d(640px,353px)` → `translate3d(300px,200px)`) y `.is-picking` deja pasar el clic a través de los pines de bus |
| PWA sobre el build (`vite preview`) | manifiesto con 192/512/512-`maskable` servidos `200 image/png`, service worker `active` controlando la página, `isSecureContext: true`, `display: standalone` |
| Índice de paradas (`npm run sync:stops`) | 9.457.517 filas → 686 rutas, 471 códigos, 7.532 paradas, 0 errores |
| `/api/stops?q=portal` | 6 sugerencias de Portal Norte/Tunal; `indexed: true` |
| `/api/plan` Portal Norte → Portal Tunal | 8 candidatas; **H27** (180 m + 409 m, 11 buses), B27, H13, B13, T25, E44 |
| Planificador en el navegador | «Desde» y «Hasta» con sugerencias, y al pulsar «Ver qué ruta me sirve» aparecen las 6 tarjetas con subida, bajada y buses en vía; elegir una abre la ruta |
| Orden de la lista por ubicación | H27 con 11 buses: orden distinto al del feed (proyección sobre el corredor), numerados 1…11, con la nota «En orden de recorrido sobre la vía» |
| Buscador dentro del panel | el `input` de ruta está en `.panel__search`, dentro del panel, y el desplegable no queda recortado |
| `tsc --noEmit` | server y client sin errores (y `tsconfig` raíz excluye ambos para no interferir con la app Next del repo) |

---

## 7. Producción

- **Escalado horizontal**: `SnapshotStore` vive en el proceso. Con N instancias tienes N polls
  al feed (aceptable: son 6 por minuto). Para que un cliente reciba updates de cualquier
  instancia, añade `@socket.io/redis-adapter` y sesiones sticky; el resto del código no cambia.
- **Cloudflare Workers** es viable para el frontend y para un gateway sin estado, pero el
  polling continuo necesita Durable Objects o un Cron Trigger: en Workers no hay memoria
  compartida entre invocaciones.
- **Rate limiting** en `/api/routes?q=` (Upstash Redis) si el sitio es público; el feed en sí
  ya está protegido por el snapshot compartido.
- **Observabilidad**: `/api/status` ya expone edad del feed, fallos consecutivos, latencia y
  watchers por ruta; eso es lo que hay que alertar.
- **Atribución**: los datos son de TransMilenio S.A. (licencia CC BY-SA 4.0 en datos abiertos)
  y el mapa es Esri / © OpenStreetMap. La atribución debe permanecer visible en el mapa.
- **No inventes campos**: si `speed` vuelve a 0 en toda la flota, la UI debe decir "sin dato".
  Es la diferencia entre un mapa creíble y uno que miente con precisión de un decimal.

## 8. Siguientes pasos naturales

1. **`tripupdates.pb`** para "próximo bus en la estación X" con retraso real, y `alerts.pb` para
   novedades de la ruta.
2. **`shapes.txt`** para dibujar el trazado de la ruta y las estaciones sobre el mapa (las
   paradas ya están indexadas en `data/route-stops.json`).
3. **Transbordos en el planificador**: hoy solo propone viajes directos; con `stop_times.txt`
   se puede encadenar una segunda ruta y estimar el tiempo total.
3. **ETA por bus**: distancia restante sobre el `shape` ÷ velocidad media de la ruta.
4. **Persistencia offline**: con la PWA ya instalable, guardar la última posición conocida para
   abrir el mapa con algo dibujado antes del primer poll.
