import { useCallback, useEffect, useRef, useState } from "react";

export interface UserLocation {
  lat: number;
  lon: number;
  /** Metros de radio del círculo de precisión que reporta el GPS. */
  accuracy: number;
}

export type GeoStatus = "idle" | "locating" | "active" | "denied" | "unsupported" | "error";

export interface GeoState {
  status: GeoStatus;
  position: UserLocation | null;
  message: string | null;
}

/**
 * Primero una posición aproximada (la que resuelve el navegador por red) y solo
 * después el GPS fino. Pedir `enableHighAccuracy` desde el arranque en un portátil
 * sin GPS hace que el navegador espere un fix que no llega y termine en TIMEOUT;
 * con la lectura por red el punto aparece en un par de segundos.
 */
const COARSE: PositionOptions = { enableHighAccuracy: false, maximumAge: 30_000, timeout: 20_000 };
const PRECISE: PositionOptions = { enableHighAccuracy: true, maximumAge: 5_000, timeout: 30_000 };

/** Si en este tiempo no llegó nada, el navegador no va a esperarnos. */
const SLOW_MS = 12_000;

const SLOW_MESSAGE =
  "Tu ubicación tardó demasiado. Vuelve a intentarlo, o marca tu salida tocando el mapa en el planificador.";

/**
 * Ubicación del usuario con `watchPosition`, no `getCurrentPosition`.
 *
 * Un bus se mueve y el usuario también: con watch, la posición del mapa se
 * refresca sola mientras camina hacia la estación. El permiso solo se pide
 * cuando el usuario toca el botón, nunca al cargar la página.
 */
export function useUserLocation() {
  const [state, setState] = useState<GeoState>({ status: "idle", position: null, message: null });
  const watchesRef = useRef<number[]>([]);
  const positionRef = useRef<UserLocation | null>(null);
  const watchdogRef = useRef<number | null>(null);

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  const clearWatches = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
    for (const id of watchesRef.current) navigator.geolocation.clearWatch(id);
    watchesRef.current = [];
  }, []);

  const stop = useCallback(() => {
    clearWatchdog();
    clearWatches();
    positionRef.current = null;
    setState({ status: "idle", position: null, message: null });
  }, [clearWatchdog, clearWatches]);

  const start = useCallback(() => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setState({ status: "unsupported", position: null, message: "Tu navegador no permite geolocalización." });
      return;
    }

    // Ya hay una ubicación en pantalla: no abrimos otro watch, solo recentra.
    if (watchesRef.current.length > 0) {
      if (positionRef.current) return;
      // Reintento tras un fallo: empezamos de cero con una lectura nueva.
      clearWatches();
    }

    setState((previous) => ({ ...previous, status: "locating", message: null }));

    let preciseId: number | null = null;
    const embedded = window.self !== window.top;

    const accept = (fix: GeolocationPosition) => {
      clearWatchdog();
      const position = {
        lat: fix.coords.latitude,
        lon: fix.coords.longitude,
        accuracy: fix.coords.accuracy,
      };
      positionRef.current = position;
      setState({ status: "active", position, message: null });

      // Con la posición aproximada ya en el mapa, afinamos mientras se camina.
      if (preciseId === null) {
        preciseId = navigator.geolocation.watchPosition(accept, () => {}, PRECISE);
        watchesRef.current.push(preciseId);
      }
    };

    const fail = (error: GeolocationPositionError) => {
      if (error.code === error.PERMISSION_DENIED) {
        clearWatchdog();
        clearWatches();
        positionRef.current = null;
        // Dentro de un iframe sin `allow="geolocation"` el navegador responde
        // "denied" sin mostrar nunca el diálogo: hay que decirle al usuario que
        // abra la página en una pestaña normal, no que revise sus permisos.
        setState({
          status: "denied",
          position: null,
          message: embedded
            ? "Estás viendo el mapa incrustado en otro panel, y así el navegador bloquea la ubicación. Abre esta misma dirección en una pestaña normal y permite el acceso."
            : "El navegador tiene bloqueada la ubicación para este sitio. Actívala desde el candado de la barra de direcciones (o abre la página en tu navegador habitual) y vuelve a intentar.",
        });
        return;
      }

      if (error.code === error.TIMEOUT) {
        // El watch sigue vivo y puede entregar el fix un segundo después: no lo
        // cerramos, y el botón vuelve a estar disponible para reintentar.
        clearWatchdog();
        setState((previous) => (previous.position ? previous : { status: "error", position: null, message: SLOW_MESSAGE }));
        return;
      }

      clearWatchdog();
      clearWatches();
      positionRef.current = null;
      setState({
        status: "error",
        position: null,
        message:
          "El sistema no pudo ubicarte. Revisa que la ubicación del sistema esté activada (en Windows: Configuración › Privacidad y seguridad › Ubicación); mientras tanto puedes marcar tu salida tocando el mapa.",
      });
    };

    const coarseId = navigator.geolocation.watchPosition(accept, fail, COARSE);
    watchesRef.current.push(coarseId);

    // Algunos navegadores ignoran `timeout` y dejan la petición colgada: si no
    // llegó nada a tiempo, avisamos nosotros y dejamos reintentar. El watch sigue
    // abierto, así que un fix tardío todavía coloca el punto.
    clearWatchdog();
    watchdogRef.current = window.setTimeout(() => {
      watchdogRef.current = null;
      setState((previous) => (previous.position ? previous : { status: "error", position: null, message: SLOW_MESSAGE }));
    }, SLOW_MS);
  }, [clearWatchdog, clearWatches]);

  useEffect(() => {
    return () => {
      if (typeof navigator === "undefined" || !("geolocation" in navigator)) return;
      if (watchdogRef.current !== null) window.clearTimeout(watchdogRef.current);
      for (const id of watchesRef.current) navigator.geolocation.clearWatch(id);
      watchesRef.current = [];
    };
  }, []);

  return { ...state, start, stop };
}
