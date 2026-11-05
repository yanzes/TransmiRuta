import { useEffect, useRef, useState } from "react";

import type { UserLocation } from "../hooks/useUserLocation";
import { planTrip, searchStops } from "../lib/api";
import type { PlanCandidate, StopRef } from "../lib/types";

const SHORTCUTS = ["F23", "B12", "K43", "L18", "J70"];

interface FieldProps {
  label: string;
  placeholder: string;
  selected: StopRef | null;
  hint?: string | null;
  onSelect: (stop: StopRef | null) => void;
}

/**
 * Estación por nombre. Las sugerencias se dibujan en el flujo (no flotando)
 * para que nunca queden recortadas por el scroll del panel.
 */
function StopField({ label, placeholder, selected, hint, onSelect }: FieldProps) {
  const [text, setText] = useState(selected?.name ?? "");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<StopRef[]>([]);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected) setText(selected.name);
  }, [selected]);

  useEffect(() => {
    if (!open) return;
    const term = text.trim();
    if (term.length < 2) {
      setHits([]);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        setHits(await searchStops(term, controller.signal));
      } catch {
        if (!controller.signal.aborted) setHits([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, open]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  return (
    <div className="field" ref={rootRef}>
      <label className="field__label" htmlFor={`stop-${label}`}>
        {label}
      </label>
      <input
        id={`stop-${label}`}
        className="field__input"
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        maxLength={48}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          setText(event.target.value);
          onSelect(null);
          setOpen(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            return;
          }
          // Enter toma la primera sugerencia: escribir "Portal Nor" + Enter basta.
          const first = hits[0];
          if (event.key === "Enter" && open && first) {
            event.preventDefault();
            onSelect(first);
            setText(first.name);
            setOpen(false);
          }
        }}
      />
      {hint && <p className="field__hint">{hint}</p>}

      {open && text.trim().length >= 2 && (
        <ul className="field__list" role="listbox">
          {loading && hits.length === 0 && <li className="field__empty">Buscando estaciones…</li>}
          {!loading && hits.length === 0 && (
            <li className="field__empty">Sin estaciones para “{text.trim()}”.</li>
          )}
          {hits.map((stop) => (
            <li key={stop.id}>
              <button
                type="button"
                className="field__hit"
                onClick={() => {
                  onSelect(stop);
                  setText(stop.name);
                  setOpen(false);
                }}
              >
                <span className="field__hit-name">{stop.name}</span>
                <span className="field__hit-meta">parada {stop.id}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Point {
  lat: number;
  lon: number;
}

interface Props {
  onPickRoute: (code: string) => void;
  userLocation: UserLocation | null;
  onRequestLocation: () => void;
  /** Punto marcado en el mapa: la salida a mano, cuando el GPS no responde. */
  pickedPoint: Point | null;
  /** El mapa está en modo "marca tu salida": cada clic fija o mueve el punto. */
  picking: boolean;
  onToggleMapPick: () => void;
}

/**
 * "¿A dónde voy?" — dado un origen y un destino, qué rutas troncales sirven el
 * viaje, con la estación de subida y de bajada y cuántos buses hay en la calle.
 *
 * El origen puede ser una estación escrita, la posición del GPS o un punto
 * marcado con el puntero: en un equipo sin Wi-Fi el GPS nunca resuelve, así que
 * el mapa es el camino que siempre funciona.
 */
export function Planner({
  onPickRoute,
  userLocation,
  onRequestLocation,
  pickedPoint,
  picking,
  onToggleMapPick,
}: Props) {
  const [from, setFrom] = useState<StopRef | null>(null);
  const [to, setTo] = useState<StopRef | null>(null);
  const [usingGps, setUsingGps] = useState(false);
  const [results, setResults] = useState<PlanCandidate[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPoint = picking && pickedPoint !== null;
  const onGps = !onPoint && usingGps && userLocation !== null;
  const origin: Point | StopRef | null = onPoint ? pickedPoint : onGps ? userLocation : from;
  const canPlan = Boolean(origin && to);

  const plan = async () => {
    if (!origin || !to) return;
    setBusy(true);
    setError(null);
    try {
      const candidates = await planTrip({ lat: origin.lat, lon: origin.lon }, { lat: to.lat, lon: to.lon });
      setResults(candidates);
      if (candidates.length === 0) {
        setError("Ninguna ruta troncal pasa cerca de los dos puntos. Prueba una estación más cercana.");
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No pudimos calcular el viaje.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="planner">
      <div>
        <p className="eyebrow">¿A dónde vas?</p>
        <p className="planner__lead">
          Dime de dónde sales y a dónde llegas, y te digo qué ruta troncal te sirve.
        </p>
      </div>

      <StopField
        label="Desde"
        placeholder="Estación o portal (ej. Portal Norte)"
        selected={from}
        hint={
          onPoint
            ? pickedPoint
              ? "Salida marcada en el mapa · toca el mapa o arrastra el pin para moverla"
              : "Toca el mapa para marcar tu salida"
            : onGps
              ? "Usando tu ubicación actual"
              : null
        }
        onSelect={(stop) => {
          setFrom(stop);
          setUsingGps(false);
          if (stop && picking) onToggleMapPick();
        }}
      />

      <div className="planner__pair">
        <button
          type="button"
          className={`ghost planner__me${onGps ? " is-active" : ""}`}
          onClick={() => {
            if (onGps) {
              setUsingGps(false);
              return;
            }
            if (picking) onToggleMapPick();
            if (!userLocation) onRequestLocation();
            setUsingGps(true);
          }}
        >
          {onGps ? "Usar una estación" : "Usar mi ubicación"}
        </button>

        <button
          type="button"
          className={`ghost planner__me${picking ? " is-active" : ""}`}
          onClick={() => {
            setUsingGps(false);
            onToggleMapPick();
          }}
        >
          {picking ? (pickedPoint ? "Quitar el punto" : "Cancelar") : "Marcar en el mapa"}
        </button>
      </div>

      <StopField
        label="Hasta"
        placeholder="Estación o portal de destino"
        selected={to}
        onSelect={setTo}
      />

      <button type="button" className="primary" disabled={!canPlan || busy} onClick={() => void plan()}>
        {busy ? "Buscando rutas…" : "Ver qué ruta me sirve"}
      </button>

      {!canPlan && (
        <p className="planner__note">
          Elige la estación de salida y la de llegada de la lista de sugerencias, marca tu salida tocando el
          mapa, o usa tu ubicación si el navegador la consigue.
        </p>
      )}

      {error && <p className="notice notice--error">{error}</p>}

      {results && results.length > 0 && (
        <div className="plan">
          <p className="eyebrow">Rutas recomendadas</p>
          <ul className="plan-list">
            {results.map((candidate) => (
              <li key={candidate.code}>
                <button type="button" className="plan-row" onClick={() => onPickRoute(candidate.code)}>
                  <span className="plan-row__code">{candidate.code}</span>
                  <span className="plan-row__body">
                    <span className="plan-row__stop">
                      Sube en <strong>{candidate.board.name}</strong> · {candidate.board.distanceM} m
                    </span>
                    <span className="plan-row__stop">
                      Baja en <strong>{candidate.alight.name}</strong> · {candidate.alight.distanceM} m
                    </span>
                  </span>
                  <span className={`plan-row__buses${candidate.buses > 0 ? " is-live" : ""}`}>
                    {candidate.buses > 0 ? `${candidate.buses} en vía` : "sin buses"}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <p className="eyebrow">Atajos</p>
        <div className="chips">
          {SHORTCUTS.map((code) => (
            <button key={code} type="button" className="chip" onClick={() => onPickRoute(code)}>
              {code}
            </button>
          ))}
        </div>
      </div>

      <p className="planner__note">
        Las recomendaciones cruzan las paradas del GTFS oficial con un radio de 900 m: son rutas directas, sin
        transbordos.
      </p>
    </div>
  );
}
