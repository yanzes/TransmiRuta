import { useCallback, useEffect, useMemo, useState } from "react";

import { BusCard } from "./components/BusCard";
import { BusMap } from "./components/BusMap";
import { Intro } from "./components/Intro";
import { Planner } from "./components/Planner";
import { RouteSearch } from "./components/RouteSearch";
import { StatusBar } from "./components/StatusBar";
import { useRouteBuses } from "./hooks/useRouteBuses";
import { useUserLocation } from "./hooks/useUserLocation";
import { ago, cardinal, secondsSince, speed } from "./lib/format";
import { orderAlongRoute } from "./lib/geo";

export default function App() {
  const [routeCode, setRouteCode] = useState<string | null>(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("ruta");
    return fromUrl ? fromUrl.trim().toUpperCase() : null;
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locateNonce, setLocateNonce] = useState(0);
  // Sin GPS, el origen se marca tocando el mapa (ver `PickPoint`).
  const [pickedPoint, setPickedPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [picking, setPicking] = useState(false);
  // La bienvenida sale al abrir la app y se puede reabrir desde el encabezado.
  const [introOpen, setIntroOpen] = useState(true);
  const live = useRouteBuses(routeCode);
  const geo = useUserLocation();

  // Cada toque en "Mi ubicación" pide el permiso (la primera vez) y recentra el
  // mapa; los fixes siguientes solo mueven el punto, no la cámara.
  const locate = useCallback(() => {
    geo.start();
    setLocateNonce((nonce) => nonce + 1);
  }, [geo.start]);

  // The route lives in the URL: ?ruta=F23 is shareable and survives a reload.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (routeCode) url.searchParams.set("ruta", routeCode);
    else url.searchParams.delete("ruta");
    window.history.replaceState(null, "", url);
    setSelectedId(null);
    setPicking(false);
  }, [routeCode]);

  // "Marcar en el mapa" es un interruptor: activo = cada clic fija la salida.
  const toggleMapPick = useCallback(() => {
    setPicking((on) => !on);
  }, []);

  const handlePickPoint = useCallback((point: { lat: number; lon: number }) => {
    setPickedPoint(point);
  }, []);

  const selectedBus = useMemo(
    () => live.buses.find((bus) => bus.id === selectedId) ?? null,
    [live.buses, selectedId],
  );

  // La lista va "uno detrás del otro" sobre la vía, no por número de bus.
  const orderedBuses = useMemo(() => orderAlongRoute(live.buses), [live.buses]);

  // The official feed currently reports 0 km/h and 0° for the whole fleet;
  // showing those numbers as facts would be worse than showing nothing.
  const speedAvailable = live.health?.speedAvailable !== false;
  const bearingAvailable = live.health?.bearingAvailable !== false;

  const clearSelection = useCallback(() => setSelectedId(null), []);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          {/* El logo de marca tapa las iniciales cuando existe (`npm run brand`). */}
          <span className="brand__mark" aria-hidden="true">
            TM
            <img
              src="/brand/logo.png"
              alt=""
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          </span>
          <div className="brand__text">
            <h1 className="brand__title">TransMilenio en vivo</h1>
            <p className="brand__sub">Bogotá · posiciones oficiales, ruta por ruta</p>
          </div>
        </div>
        <button type="button" className="ghost topbar__help" onClick={() => setIntroOpen(true)}>
          ¿Cómo se usa?
        </button>
      </header>

      <main className="workspace">
        <BusMap
          buses={live.buses}
          bounds={live.bounds}
          routeCode={routeCode}
          selectedId={selectedId}
          userLocation={geo.position}
          locateNonce={locateNonce}
          locating={geo.status === "locating"}
          picking={picking}
          pickedPoint={pickedPoint}
          onPickPoint={handlePickPoint}
          geoMessage={geo.message}
          onSelect={setSelectedId}
          onBackgroundClick={clearSelection}
          onLocate={locate}
          onHideLocation={geo.stop}
        />

        <aside className="panel">
          <div className="panel__search">
            <RouteSearch current={routeCode} onSelect={setRouteCode} />
          </div>

          <StatusBar
            health={live.health}
            status={live.status}
            buses={live.buses.length}
            updatedAt={live.updatedAt}
            stale={live.stale}
            routeCode={routeCode}
          />

          <div className="panel__scroll">
            {routeCode ? (
              <>
                <div className="panel__head">
                  <div>
                    <p className="eyebrow">Ruta en seguimiento</p>
                    <h2 className="panel__code">{routeCode}</h2>
                  </div>
                  <button type="button" className="ghost" onClick={() => setRouteCode(null)}>
                    Cambiar
                  </button>
                </div>

                {live.error && <p className="notice notice--error">{live.error}</p>}
                {live.stale && !live.error && (
                  <p className="notice">El feed oficial viene retrasado. Mostramos la última posición conocida.</p>
                )}

                {orderedBuses.length > 0 && <p className="panel__hint">En orden de recorrido sobre la vía</p>}

                <ul className="bus-list">
                  {orderedBuses.map((bus, index) => (
                    <li key={bus.id}>
                      <button
                        type="button"
                        className={`bus-row${bus.id === selectedId ? " is-selected" : ""}`}
                        onClick={() => setSelectedId(bus.id)}
                      >
                        <span className="bus-row__index">{index + 1}</span>
                        <span className="bus-row__label">{bus.label}</span>
                        <span className="bus-row__meta">
                          {speedAvailable ? speed(bus.speedKmh) : "velocidad n/d"} ·{" "}
                          {bearingAvailable ? cardinal(bus.bearing) : "rumbo n/d"}
                        </span>
                        <span className="bus-row__ago">{ago(secondsSince(bus.reportedAt))}</span>
                      </button>
                    </li>
                  ))}

                  {orderedBuses.length === 0 && (
                    <li className="bus-list__empty">
                      {live.updatedAt
                        ? "Ningún bus de esta ruta está reportando ahora mismo."
                        : "Conectando con el feed de TransMilenio…"}
                    </li>
                  )}
                </ul>
              </>
            ) : (
              <Planner
                onPickRoute={setRouteCode}
                userLocation={geo.position}
                onRequestLocation={locate}
                pickedPoint={pickedPoint}
                picking={picking}
                onToggleMapPick={toggleMapPick}
              />
            )}

            <BusCard
              bus={selectedBus}
              speedAvailable={speedAvailable}
              bearingAvailable={bearingAvailable}
              onClose={clearSelection}
            />
          </div>
        </aside>
      </main>

      {introOpen && (
        <Intro
          updateSeconds={Math.round((live.health?.pollIntervalMs ?? 10_000) / 1000)}
          onClose={() => setIntroOpen(false)}
        />
      )}

      <footer className="footer">
        <span>Datos: TransMilenio S.A. (GTFS-Realtime)</span>
        <span>Mapa: Esri · © OpenStreetMap</span>
      </footer>
    </div>
  );
}
