# TransMilenio en vivo — extensión de Chrome

La app nativa de Chrome: el mismo mapa en vivo, en la barra del navegador.

- **Popup**: click en el icono de la barra. Ventana compacta de 420×600 con el mapa.
- **Panel lateral**: click derecho en el icono → *Abrir TransMilenio en el panel lateral*.
- **Ventana propia**: el icono de ventana abre el mapa sin la barra de Chrome, como una app.
- **Ajustes**: a qué dirección apunta la extensión (por defecto `http://localhost:3000`).

La extensión no tiene datos ni claves propias: muestra la app web, que es la que habla con
Croma. Eso mantiene la `CROMA_API_KEY` en el servidor y una sola lectura de flota cada 15
segundos, la compartan un usuario o mil.

## Instalarla

1. Arranca la app web: `npm install`, define `CROMA_API_KEY` en `.env.local`, `npm run dev`.
2. Abre `chrome://extensions`.
3. Activa **Modo de desarrollador** (arriba a la derecha).
4. **Cargar descomprimida** y elige esta carpeta (`chrome-extension/`).
5. Fija el icono en la barra (el de la pieza de rompecabezas → pin).

Si ya desplegaste la app, abre Ajustes y escribe esa dirección (`https://…`). Se guarda en
`chrome.storage.sync`, así que viaja con el perfil de Chrome.

## Archivos

```
manifest.json    Manifest V3: popup, side panel, opciones, permisos mínimos
background.js    Service worker: el menú del click derecho
shell.js         Comportamiento compartido: dirección, recarga, ventana, panel lateral
popup.html       Ventana compacta de la barra
sidepanel.html   Panel lateral
options.html     Ajustes y ayuda
ui.css           Tokens: hairlines, eyebrows mono, superficies cuadradas, azul de Croma
```

Permisos: `storage` (la dirección), `sidePanel` (el panel) y `contextMenus` (el menú). Sin
`host_permissions`: la extensión enmarca la app, no la lee.

## Nota

Chrome no empaqueta extensiones MV3 con `iframe` de terceros de forma distinta a una web; si
algún día la app responde con `X-Frame-Options` o `frame-ancestors`, el marco queda vacío.
Hoy el servidor de Next no envía esas cabeceras.
