import { createRoot } from "react-dom/client";

import App from "./App";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root not found");

// No StrictMode: Leaflet's map container is imperative and double-mounting it
// in development re-initialises the same DOM node.
createRoot(container).render(<App />);

// Instalable como app (Chrome/Android necesita un service worker con `fetch`).
// En desarrollo se salta a propósito: cachearía el HMR y rompería el guardado.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // Sin service worker la app sigue funcionando; solo se pierde la instalación.
    });
  });
}
