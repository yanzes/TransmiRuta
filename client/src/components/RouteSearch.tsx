import { useEffect, useRef, useState } from "react";

import { searchActiveRoutes, searchRoutes } from "../lib/api";
import { systemLabel } from "../lib/format";
import type { RouteHit } from "../lib/types";

interface Props {
  current: string | null;
  onSelect: (code: string) => void;
}

/**
 * One input. Typing "f2" suggests F23 (with how many are running right now);
 * focusing it with nothing typed shows what is moving across the city.
 */
export function RouteSearch({ current, onSelect }: Props) {
  const [text, setText] = useState(current ?? "");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<RouteHit[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setText(current ?? "");
  }, [current]);

  // Debounced lookup; aborts the previous request so answers never arrive late.
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const term = text.trim();

    const timer = setTimeout(
      async () => {
        setLoading(true);
        try {
          const routes = term ? await searchRoutes(term, controller.signal) : await searchActiveRoutes(controller.signal);
          setHits(routes);
          setActive(0);
        } catch {
          if (!controller.signal.aborted) setHits([]);
        } finally {
          if (!controller.signal.aborted) setLoading(false);
        }
      },
      term ? 180 : 0,
    );

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [text, open]);

  // Clicking anywhere else closes the suggestions.
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const commit = (value: string) => {
    const code = value.trim().toUpperCase();
    if (!code) return;
    onSelect(code);
    setText(code);
    setOpen(false);
    (document.activeElement as HTMLElement | null)?.blur();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((index) => Math.min(hits.length - 1, index + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (open && hits[active]) commit(hits[active].code);
      else commit(text);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="search" ref={rootRef}>
      <form
        className="search__form"
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          commit(text);
        }}
      >
        <span className="search__icon" aria-hidden="true">
          ⌕
        </span>
        <input
          className="search__input"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Ruta: F23, B12, K43…"
          aria-label="Código de la ruta"
          role="combobox"
          aria-expanded={open}
          aria-controls="route-suggestions"
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          maxLength={12}
        />
        {text && (
          <button
            type="button"
            className="search__clear"
            onClick={() => {
              setText("");
              setOpen(true);
            }}
            aria-label="Borrar ruta"
          >
            ×
          </button>
        )}
        <button type="submit" className="search__submit">
          Ver buses
        </button>
      </form>

      {open && (
        <ul className="suggestions" id="route-suggestions" role="listbox">
          {loading && hits.length === 0 && <li className="suggestions__empty">Buscando rutas…</li>}
          {!loading && hits.length === 0 && <li className="suggestions__empty">Sin resultados para “{text.trim()}”.</li>}
          {hits.map((hit, index) => (
            <li key={`${hit.code}-${hit.routeId ?? index}`} role="option" aria-selected={index === active}>
              <button
                type="button"
                className={`suggestion${index === active ? " is-active" : ""}`}
                onMouseEnter={() => setActive(index)}
                onClick={() => commit(hit.code)}
              >
                <span className="suggestion__code">{hit.code}</span>
                <span className="suggestion__name">
                  <span className="suggestion__long">{hit.name ?? "Sin nombre publicado"}</span>
                  <span className="suggestion__meta">
                    {systemLabel(hit.system)} · {hit.buses} {hit.buses === 1 ? "bus" : "buses"} en vía
                  </span>
                </span>
                <span className={`suggestion__count${hit.buses > 0 ? " is-live" : ""}`}>{hit.buses}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
