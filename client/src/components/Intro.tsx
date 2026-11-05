import { useEffect, useRef } from "react";

interface Props {
  /** Segundos entre snapshots del feed, tal como los reporta el gateway. */
  updateSeconds: number;
  onClose: () => void;
}

/**
 * Lo primero que ve quien abre la app: qué se puede hacer y con qué frecuencia
 * cambia la posición de los buses. Los segundos no están escritos en el texto:
 * salen de `pollIntervalMs` del feed, así que si el gateway se reconfigura el
 * aviso sigue diciendo la verdad.
 */
export function Intro({ updateSeconds, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="intro" role="dialog" aria-modal="true" aria-labelledby="intro-title">
      <button type="button" className="intro__scrim" aria-label="Cerrar" onClick={onClose} tabIndex={-1} />

      <div className="intro__card">
        {/* Si la imagen de marca todavía no se generó (`npm run brand`), el
            banner se va en silencio en vez de mostrar una imagen rota. */}
        <img
          className="intro__hero"
          src="/brand/hero.jpg"
          alt="Bus de TransMilenio en un corredor de Bogotá"
          width={1536}
          height={864}
          onError={(event) => {
            event.currentTarget.hidden = true;
          }}
        />

        <div className="intro__body">
          <p className="eyebrow">Cómo buscar tu viaje</p>
          <h2 id="intro-title" className="intro__title">
            ¿Qué ruta te sirve y dónde viene el bus?
          </h2>

          <ol className="intro__steps">
            <li>
              <strong>Busca la ruta.</strong> Escribe su código —<code>F23</code>, <code>B12</code>,{" "}
              <code>K43</code>— o su nombre en el buscador del panel. Con el campo vacío te muestra
              las rutas que están operando ahora.
            </li>
            <li>
              <strong>O pide que te la recomiende.</strong> Sin ruta elegida, el panel pregunta desde
              dónde sales y a dónde vas; si no tienes GPS, marca tu salida tocando el mapa. Devuelve
              las rutas directas con la subida, la bajada y los buses en la vía.
            </li>
            <li>
              <strong>Sigue un bus.</strong> Toca su fila en la lista —van en orden de recorrido sobre
              la vía— o su pin en el mapa para ver placa, próxima parada y hora del último reporte.
            </li>
          </ol>

          <p className="intro__live">
            La ubicación de los buses se actualiza sola cada {updateSeconds} segundos
          </p>
          <p className="intro__note">
            Sin recargar la página. Si el feed oficial se retrasa, la app lo dice en vez de inventar
            posiciones; la velocidad y el rumbo aparecen como «sin dato» porque TransMilenio los
            publica en cero para toda la flota.
          </p>

          <div className="intro__actions">
            <button type="button" className="intro__cta" ref={closeRef} onClick={onClose}>
              Entendido, a buscar mi bus
            </button>
            <span className="intro__hint">Puedes volver a abrirlo con el botón «Cómo se usa» de arriba.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
