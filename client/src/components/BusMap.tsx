import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { Circle, CircleMarker, MapContainer, Marker, TileLayer, Tooltip, ZoomControl, useMap } from "react-leaflet";

import { BOGOTA_CENTER, CITY_ZOOM, PORTALES } from "../data/portales";
import type { UserLocation } from "../hooks/useUserLocation";
import type { Bounds, Bus } from "../lib/types";

/** Matches the poll interval, so a bus glides for the whole gap between fixes. */
const GLIDE_MS = 1_100;

type LeafletMarker = L.Marker;

/**
 * Basemaps, in order of preference.
 *
 * Neither one asks for an API key: a keyless provider cannot answer 200 with an
 * "API key required" placeholder painted over the city. The second entry is the
 * safety net for when the first one is unreachable.
 */
const BASEMAPS = [
  {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
    attribution: 'Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    // El servicio Canvas de Esri solo tiene cache hasta el nivel 16. Por encima
    // devuelve una tesela gris que dice "Map data not yet available", así que
    // Leaflet escala la 16 en lugar de pedir una que no existe.
    maxNativeZoom: 16,
    maxZoom: 18,
  },
  {
    url: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxNativeZoom: 19,
    maxZoom: 19,
  },
];

function Basemap() {
  const [index, setIndex] = useState(0);
  const failures = useRef(0);
  const layer = BASEMAPS[index] ?? BASEMAPS[0]!;

  return (
    <TileLayer
      key={layer.url}
      url={layer.url}
      attribution={layer.attribution}
      maxZoom={layer.maxZoom}
      maxNativeZoom={layer.maxNativeZoom}
      eventHandlers={{
        tileerror: () => {
          failures.current += 1;
          if (failures.current >= 5 && index < BASEMAPS.length - 1) {
            failures.current = 0;
            setIndex(index + 1);
          }
        },
      }}
    />
  );
}

/** Punto azul de "estás aquí": un divIcon, para que el color sea CSS y no SVG. */
const USER_ICON = L.divIcon({
  className: "me",
  html: '<span class="me__halo"></span><span class="me__dot"></span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

/** Pin de la salida puesta a mano: naranja, con etiqueta, para que se vea dónde quedó. */
const PICK_ICON = L.divIcon({
  className: "pick",
  html: '<span class="pick__pin" aria-hidden="true"></span><span class="pick__label">Salida</span>',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function iconFor(bus: Bus): L.DivIcon {
  return L.divIcon({
    className: "bus",
    html: `<div class="pin" style="--bearing:${bus.bearing ?? 0}deg">
        <svg class="pin__arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 1.8 19.6 21.6 12 17.2 4.4 21.6Z"/></svg>
        <span class="pin__label">${escapeHtml(bus.label)}</span>
      </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

/**
 * One bus on the map.
 *
 * The marker is created imperatively and kept for the lifetime of the bus, so
 * an update never unmounts it (that is what makes markers flicker). Each new
 * position is reached with requestAnimationFrame over GLIDE_MS, which means the
 * bus *moves* to its new fix instead of teleporting, and a second update mid
 * glide starts from wherever the bus currently is drawn.
 */
function BusMarker({ bus, selected, onSelect }: { bus: Bus; selected: boolean; onSelect: (id: string) => void }) {
  const map = useMap();
  const markerRef = useRef<LeafletMarker | null>(null);
  const positionRef = useRef<L.LatLng | null>(null);
  const frameRef = useRef(0);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const marker = L.marker([bus.lat, bus.lon], {
      icon: iconFor(bus),
      keyboard: false,
      riseOnHover: true,
    });

    marker.on("click", () => onSelectRef.current(bus.id));
    marker.bindTooltip(bus.label, { direction: "top", offset: [0, -14], className: "bus-tooltip" });
    marker.addTo(map);

    markerRef.current = marker;
    positionRef.current = L.latLng(bus.lat, bus.lon);

    return () => {
      cancelAnimationFrame(frameRef.current);
      marker.remove();
      markerRef.current = null;
      positionRef.current = null;
    };
    // `bus` is the React key: one marker per vehicle, reused across updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  // Move (never remount) when a new fix arrives.
  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    const from = positionRef.current ?? marker.getLatLng();
    const to = L.latLng(bus.lat, bus.lon);
    if (from.equals(to)) return;

    const startedAt = performance.now();
    cancelAnimationFrame(frameRef.current);

    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / GLIDE_MS);
      const lat = from.lat + (to.lat - from.lat) * t;
      const lng = from.lng + (to.lng - from.lng) * t;
      marker.setLatLng([lat, lng]);
      positionRef.current = L.latLng(lat, lng);
      if (t < 1) frameRef.current = requestAnimationFrame(step);
    };

    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [bus.lat, bus.lon]);

  // Heading and selection without touching the DOM node Leaflet owns.
  useEffect(() => {
    const element = markerRef.current?.getElement();
    if (!element) return;
    element.querySelector<HTMLElement>(".pin")?.style.setProperty("--bearing", `${bus.bearing ?? 0}deg`);
    element.classList.toggle("is-selected", selected);
    markerRef.current?.setZIndexOffset(selected ? 1_000 : 0);
  }, [bus.bearing, selected]);

  useEffect(() => {
    const label = markerRef.current?.getElement()?.querySelector<HTMLElement>(".pin__label");
    if (label && label.textContent !== bus.label) label.textContent = bus.label;
  }, [bus.label]);

  return null;
}

/** Flies to the route once per route change; later updates never move the camera. */
function FitRoute({ routeCode, bounds }: { routeCode: string | null; bounds: Bounds | null }) {
  const map = useMap();
  const flownFor = useRef<string | null>(null);

  useEffect(() => {
    if (!routeCode) return;
    if (!bounds) return;
    if (flownFor.current === routeCode) return;

    flownFor.current = routeCode;
    map.flyToBounds(
      [
        [bounds.south, bounds.west],
        [bounds.north, bounds.east],
      ],
      { padding: [80, 80], maxZoom: 15, duration: 1.2 },
    );
  }, [routeCode, bounds, map]);

  useEffect(() => {
    if (routeCode) return;
    flownFor.current = null;
    map.flyTo(BOGOTA_CENTER, CITY_ZOOM, { duration: 0.8 });
  }, [routeCode, map]);

  return null;
}

/** Centres the camera on a bus the rider picked from the list or the map. */
function FocusSelected({ bus }: { bus: Bus | null }) {
  const map = useMap();
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    if (!bus || bus.id === lastId.current) return;
    lastId.current = bus.id;
    map.flyTo([bus.lat, bus.lon], Math.max(map.getZoom(), 15), { duration: 0.9 });
    // Only the selection should move the camera, not every position update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bus?.id]);

  return null;
}

/**
 * "Mi ubicación": blue dot with a white ring over the GPS accuracy circle.
 *
 * It is a divIcon marker (not an SVG circle) so the colour is plain CSS, it can
 * pulse, and `zIndexOffset` keeps it above the buses. The camera flies once per
 * button press, never on every fix, so it does not chase the rider on foot.
 */
function UserLayer({ position, nonce }: { position: UserLocation | null; nonce: number }) {
  const map = useMap();
  const flownFor = useRef(-1);

  useEffect(() => {
    if (!position) return;
    if (flownFor.current === nonce) return;
    flownFor.current = nonce;
    map.flyTo([position.lat, position.lon], Math.max(map.getZoom(), 16), { duration: 0.9 });
  }, [position, nonce, map]);

  if (!position) return null;

  return (
    <>
      <Circle
        center={[position.lat, position.lon]}
        radius={Math.max(position.accuracy, 20)}
        pathOptions={{ color: "#2f8fff", weight: 1, fillColor: "#2f8fff", fillOpacity: 0.12 }}
      />
      <Marker
        position={[position.lat, position.lon]}
        icon={USER_ICON}
        zIndexOffset={2_000}
        interactive={false}
        keyboard={false}
      />
    </>
  );
}

function PortalLayer() {
  return (
    <>
      {PORTALES.map((portal) => (
        <CircleMarker
          key={portal.name}
          center={[portal.lat, portal.lon]}
          radius={4}
          pathOptions={{ color: "#8b95a5", weight: 1, fillColor: "#0b0d10", fillOpacity: 1 }}
        >
          <Tooltip direction="top" offset={[0, -6]} className="bus-tooltip">
            {portal.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </>
  );
}

interface ToolProps {
  showReset: boolean;
  locating: boolean;
  picking: boolean;
  hasPoint: boolean;
  locationActive: boolean;
  geoMessage: string | null;
  onLocate: () => void;
  onHideLocation: () => void;
}

function MapTools({
  showReset,
  locating,
  picking,
  hasPoint,
  locationActive,
  geoMessage,
  onLocate,
  onHideLocation,
}: ToolProps) {
  const map = useMap();
  return (
    <div className="map__tools">
      {picking ? (
        <p className="map__note" role="status">
          {hasPoint
            ? "Salida marcada. Toca otro punto o arrastra el pin para ajustarla."
            : "Toca el mapa para marcar desde dónde sales."}
        </p>
      ) : (
        geoMessage && (
          <p className={`map__note${locationActive ? "" : " is-error"}`} role="status">
            {geoMessage}
          </p>
        )
      )}
      <div className="map__toolbar">
        <button
          type="button"
          className={`map__tool${locationActive ? " is-active" : ""}`}
          onClick={onLocate}
          disabled={locating}
        >
          <span className="map__dot" aria-hidden="true" />
          {locating ? "Buscándote…" : locationActive ? "Actualizar mi ubicación" : "Mi ubicación"}
        </button>
        {locationActive && (
          <button type="button" className="map__tool" onClick={onHideLocation}>
            Ocultar
          </button>
        )}
        <button type="button" className="map__tool" onClick={() => map.flyTo(BOGOTA_CENTER, CITY_ZOOM, { duration: 0.9 })}>
          {showReset ? "Toda la ciudad" : "Centrar en Bogotá"}
        </button>
      </div>
    </div>
  );
}

interface Props {
  buses: Bus[];
  bounds: Bounds | null;
  routeCode: string | null;
  selectedId: string | null;
  userLocation: UserLocation | null;
  locateNonce: number;
  locating: boolean;
  /** El siguiente clic en el mapa marca el origen del viaje. */
  picking: boolean;
  pickedPoint: { lat: number; lon: number } | null;
  onPickPoint: (point: { lat: number; lon: number }) => void;
  geoMessage: string | null;
  onSelect: (id: string | null) => void;
  onBackgroundClick: () => void;
  onLocate: () => void;
  onHideLocation: () => void;
}

export function BusMap({
  buses,
  bounds,
  routeCode,
  selectedId,
  userLocation,
  locateNonce,
  locating,
  picking,
  pickedPoint,
  onPickPoint,
  geoMessage,
  onSelect,
  onBackgroundClick,
  onLocate,
  onHideLocation,
}: Props) {
  const selectedBus = buses.find((bus) => bus.id === selectedId) ?? null;

  return (
    <MapContainer
      className="map"
      center={BOGOTA_CENTER}
      zoom={CITY_ZOOM}
      minZoom={10}
      maxZoom={18}
      zoomControl={false}
      worldCopyJump={false}
    >
      <Basemap />
      <ZoomControl position="bottomright" />
      <PortalLayer />

      {buses.map((bus) => (
        <BusMarker key={bus.id} bus={bus} selected={bus.id === selectedId} onSelect={(id) => onSelect(id)} />
      ))}

      <UserLayer position={userLocation} nonce={locateNonce} />
      <PickPoint point={pickedPoint} picking={picking} onPickPoint={onPickPoint} />
      <FitRoute routeCode={routeCode} bounds={bounds} />
      <FocusSelected bus={selectedBus} />
      <MapTools
        showReset={Boolean(routeCode)}
        locating={locating}
        picking={picking}
        hasPoint={pickedPoint !== null}
        locationActive={userLocation !== null}
        geoMessage={geoMessage}
        onLocate={onLocate}
        onHideLocation={onHideLocation}
      />
      <BackgroundClicks onBackgroundClick={onBackgroundClick} />
    </MapContainer>
  );
}

/** Clicking empty map clears the selected bus, like any map UI. */
function BackgroundClicks({ onBackgroundClick }: { onBackgroundClick: () => void }) {
  const map = useMap();
  useEffect(() => {
    const handler = () => onBackgroundClick();
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [map, onBackgroundClick]);
  return null;
}

/**
 * Marca la salida con el puntero. Mientras el modo está activo se escucha cada
 * clic —no uno solo— y el pin se puede arrastrar: así se corrige el punto sin
 * volver a pulsar el botón. Con `.is-picking` los pines de bus dejan pasar el
 * clic (si no, tocar cerca de un bus no marcaba nada) y el cursor es una cruz.
 */
function PickPoint({
  point,
  picking,
  onPickPoint,
}: {
  point: { lat: number; lon: number } | null;
  picking: boolean;
  onPickPoint: (point: { lat: number; lon: number }) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!picking) return;
    const container = map.getContainer();
    container.classList.add("is-picking");

    const handler = (event: L.LeafletMouseEvent) => {
      onPickPoint({ lat: event.latlng.lat, lon: event.latlng.lng });
    };
    map.on("click", handler);

    return () => {
      map.off("click", handler);
      container.classList.remove("is-picking");
    };
  }, [picking, map, onPickPoint]);

  if (!picking || !point) return null;

  return (
    <Marker
      position={[point.lat, point.lon]}
      icon={PICK_ICON}
      draggable
      zIndexOffset={1_500}
      eventHandlers={{
        dragend: (event) => {
          const { lat, lng } = (event.target as LeafletMarker).getLatLng();
          onPickPoint({ lat, lon: lng });
        },
      }}
    />
  );
}
