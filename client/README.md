# @transmi/client — el mapa

React 19 + Vite + react-leaflet. Se suscribe a una ruta por WebSocket y dibuja sus buses
moviéndose sobre Bogotá, sin parpadeos: cada marcador se crea una sola vez y se interpola con
`requestAnimationFrame` hasta su nueva posición.

Arquitectura completa: [`../docs/transmilenio-en-vivo.md`](../docs/transmilenio-en-vivo.md).

## Arranque

```bash
npm install
npm run dev     # http://localhost:5173
```

Requiere el gateway en `:8787` (ver `../server/README.md`). Vite proxya `/api`, `/health` y
`/socket.io`, así que no hace falta configurar URLs ni CORS en desarrollo.

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run dev` | Vite en `:5173` |
| `npm run build` | `tsc --noEmit` + build de producción |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run smoke` | Prueba el contrato WebSocket sin navegador (`node scripts/smoke-ws.mjs F23`) |
| `npm run icons` | Regenera los íconos PNG de la PWA (`scripts/make-icons.mjs`, sin dependencias) |
| `npm run brand` | Recorta la foto de `public/brand/source.png` en íconos, logo del encabezado y banner |

## Instalarla como app (PWA)

`public/manifest.webmanifest` + `public/sw.js` la vuelven instalable: en Chrome de Android sale
«Instalar aplicación» y abre sin barra del navegador, como una app. El service worker guarda el
shell (HTML, JS, CSS, íconos) para que abra sin red, pero **nunca** cachea `/api`, `/health` ni
`/socket.io`: una posición vieja mostrada como actual sería peor que decir «sin conexión». Las
teselas del mapa son de otro origen y van directas a la red.

- Los íconos salen de `npm run brand`, que recorta la foto de `public/brand/source.png` a 192,
  512, 512 `maskable` (arte dentro del 80% central) y 180 para iOS. Sin foto, `npm run icons`
  dibuja el bus de forma vectorial con `zlib` y sin dependencias.
- El service worker se registra **solo en producción** (`npm run build` y servir `dist`); en
  `npm run dev` cachearía el HMR y rompería el guardado en caliente.
- Chrome exige HTTPS (o `localhost`) para instalar: en el celular hay que abrir la app por una URL
  HTTPS, no por `http://IP-de-tu-PC`.

## Variables

| Variable | Por defecto | Notas |
| --- | --- | --- |
| `VITE_SERVER_URL` | vacío | Vacío = mismo origen (proxy de Vite). Defínela si sirves el cliente en otro dominio |

## Cómo está armado

- `App.tsx` — ruta activa (en la URL como `?ruta=F23`), selección de bus, lista ordenada por
  ubicación y planificador en el panel cuando no hay ruta.
- `hooks/useRouteBuses.ts` — un socket por pestaña, `route:subscribe` + ack con snapshot,
  re-suscripción automática al reconectar.
- `components/BusMap.tsx` — marcadores imperativos reutilizados, *gliding* con rAF, cámara que
  solo se mueve al cambiar de ruta o de bus elegido.
- `components/RouteSearch.tsx` — combobox con debounce y `AbortController`, **dentro del panel**;
  con el campo vacío lista las rutas que están operando.
- `components/Planner.tsx` — «¿A dónde vas?»: origen por estación, por GPS o **marcado en el mapa**
  (útil en equipos sin Wi-Fi ni GPS, que nunca obtienen posición), destino, y las rutas que sirven
  el viaje con subida, bajada y buses en vía.
- `lib/geo.ts` — `distanceM` y `orderAlongRoute`: la lista se ordena por la posición de cada bus
  sobre el corredor (proyección PCA), no por su número; con menos de 3 buses usa `stopSequence`.
- `components/StatusBar.tsx` / `BusCard.tsx` — frescura del feed y detalle del bus.
- `public/manifest.webmanifest` / `public/sw.js` — PWA instalable con shell offline; los datos en
  vivo quedan siempre fuera del caché.
- `hooks/useUserLocation.ts` — botón «Mi ubicación» con `watchPosition`: punto azul + círculo de
  precisión, permiso pedido solo al pulsar y cámara centrada una vez por pulsación. Pide primero
  una posición aproximada (red) y luego afina con GPS; si a los 12 s no llegó nada, avisa y deja
  reintentar en vez de quedarse en «Buscándote…».

Los datos de velocidad y rumbo se muestran como `sin dato` cuando el feed los publica en cero
para toda la flota (`speedAvailable` / `bearingAvailable` en `/health`).
