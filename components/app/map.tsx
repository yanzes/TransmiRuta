"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import maplibregl, { type GeoJSONSource, type Map as MapLibre, type SymbolLayerSpecification } from "maplibre-gl";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/** Basemaps with street names: a map nobody can read is not a map. */
const STYLES = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
};
const BOGOTA: [number, number] = [-74.075, 4.648];

export interface MapStop {
  id: string;
  /** The code the stop is known by; the id when the caller has no other. */
  code?: string;
  name: string;
  lat: number;
  lon: number;
  /** Drawn as a rectangle: a TransMilenio station, not a street stop. */
  station?: boolean;
}

export interface MapBus {
  id: string;
  lat: number;
  lon: number;
  /** The route the bus is running, as riders read it on the windscreen. */
  code?: string;
  /** "troncal" for TransMilenio, anything else for the SITP. */
  system?: string;
  /** Highlighted buses of the route in focus. */
  accent?: boolean;
}

export interface TransitMapProps {
  dark: boolean;
  center?: [number, number];
  zoom?: number;
  stops?: MapStop[];
  buses?: MapBus[];
  /** Lon/lat pairs of a route's shape. */
  path?: number[][];
  selected?: string | null;
  onStop?: (id: string) => void;
  fit?: boolean;
  className?: string;
}

/**
 * A quiet map: graphite dots for buses and stops, a single accent for the
 * route or stop in focus, and typed street names and addresses from the
 * basemap, recoloured to the page ink so nothing shouts.
 */
export function TransitMap(props: TransitMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const ready = useRef(false);
  const live = useRef(props);
  live.current = props;

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: live.current.dark ? STYLES.dark : STYLES.light,
      center: live.current.center ?? BOGOTA,
      zoom: live.current.zoom ?? 12,
      minZoom: 9,
      maxZoom: 18,
      attributionControl: { compact: true },
      fadeDuration: 0,
    });
    map.current = m;

    m.on("style.load", () => {
      addLayers(m, live.current.dark);
      if (live.current.dark) liftBasemap(m);
      tuneLabels(m, live.current.dark);
      ready.current = true;
      draw(m, true);
    });

    m.on("click", (event) => {
      const hits = m.queryRenderedFeatures(event.point, { layers: ["stops", "stations"] });
      const stop = hits[0];
      if (stop) live.current.onStop?.(String(stop.properties.id));
    });
    for (const layer of ["stops", "stations"]) {
      m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
    }

    const observer = new ResizeObserver(() => m.resize());
    observer.observe(container.current);

    return () => {
      observer.disconnect();
      ready.current = false;
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    ready.current = false;
    m.setStyle(props.dark ? STYLES.dark : STYLES.light, { diff: false });
  }, [props.dark]);

  useEffect(() => {
    const m = map.current;
    if (m && ready.current) draw(m, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.stops, props.buses, props.path, props.selected]);

  useEffect(() => {
    if (props.fit) fitBounds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.path, props.stops, props.fit]);

  useEffect(() => {
    const m = map.current;
    if (!m || !props.center) return;
    m.easeTo({ center: props.center, zoom: props.zoom ?? m.getZoom(), duration: 600 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.center?.[0], props.center?.[1], props.zoom]);

  function draw(m: MapLibre, withFit: boolean) {
    const p = live.current;
    m.getSource<GeoJSONSource>("path")?.setData({
      type: "Feature",
      geometry: { type: "LineString", coordinates: p.path ?? [] },
      properties: {},
    });
    m.getSource<GeoJSONSource>("stops")?.setData({
      type: "FeatureCollection",
      features: (p.stops ?? []).map((stop) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [stop.lon, stop.lat] },
        properties: { id: stop.id, code: stop.code ?? stop.id, station: stop.station ? 1 : 0, sel: stop.id === p.selected ? 1 : 0 },
      })),
    });
    m.getSource<GeoJSONSource>("buses")?.setData({
      type: "FeatureCollection",
      features: (p.buses ?? []).map((bus) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [bus.lon, bus.lat] },
        properties: { id: bus.id, code: bus.code ?? "", system: bus.system ?? "other", accent: bus.accent ? 1 : 0 },
      })),
    });
    if (withFit) fitBounds();
  }

  function fitBounds() {
    const m = map.current;
    if (!m || !ready.current) return;
    const p = live.current;
    const coords: [number, number][] = [
      ...(p.path ?? []).map((c) => [c[0], c[1]] as [number, number]),
      ...(p.stops ?? []).map((s) => [s.lon, s.lat] as [number, number]),
    ];
    if (coords.length === 0) return;
    if (coords.length === 1) {
      m.easeTo({ center: coords[0], zoom: 15.5, duration: 500 });
      return;
    }
    const bounds = coords.reduce((box, coord) => box.extend(coord), new maplibregl.LngLatBounds(coords[0], coords[0]));
    m.fitBounds(bounds, { padding: 40, duration: 500, maxZoom: 15.5 });
  }

  return <div ref={container} className={cn("size-full", props.className)} />;
}

/**
 * Street names and house numbers in the page ink instead of the basemap blue,
 * and the address layer, which the stock style paints transparent, switched on
 * from the zoom where a rider can actually use it.
 */
/**
 * The dark basemap ships almost black. Mixing every surface a little towards
 * white keeps the map quiet but readable, and leaves the labels for last.
 */
function liftBasemap(m: MapLibre) {
  for (const layer of m.getStyle()?.layers ?? []) {
    if (layer.type === "symbol") continue;
    const paint = (layer as { paint?: Record<string, unknown> }).paint;
    if (!paint) continue;
    for (const key of Object.keys(paint)) {
      if (!/color$/.test(key)) continue;
      const value = paint[key];
      if (typeof value !== "string") continue;
      const amount =
        key === "background-color"
          ? 0.16
          : layer.id.startsWith("road")
            ? key.includes("case")
              ? 0.2
              : 0.26
            : layer.id.startsWith("building")
              ? 0.32
              : 0.12;
      const lifted = mixWhite(value, amount);
      if (lifted) m.setPaintProperty(layer.id, key, lifted);
    }
  }
}

/** Blend a CSS colour towards white; null when it is not a plain colour. */
function mixWhite(color: string, amount: number): string | null {
  const parsed = parseColor(color);
  if (!parsed) return null;
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  return `rgba(${mix(parsed[0])}, ${mix(parsed[1])}, ${mix(parsed[2])}, ${parsed[3]})`;
}

function parseColor(color: string): [number, number, number, number] | null {
  const value = color.trim();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value);
  if (hex) {
    const body = hex[1].length === 3 ? hex[1].split("").map((c) => c + c).join("") : hex[1];
    return [parseInt(body.slice(0, 2), 16), parseInt(body.slice(2, 4), 16), parseInt(body.slice(4, 6), 16), 1];
  }
  const rgba = /^rgba?(([^)]+))$/i.exec(value);
  if (!rgba) return null;
  const parts = rgba[1].split(",").map((part) => Number(part.trim()));
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
  return [parts[0], parts[1], parts[2], parts[3] ?? 1];
}

function tuneLabels(m: MapLibre, dark: boolean) {
  const ink = dark ? "#d6dcd3" : "#5c615c";
  const halo = dark ? "rgba(18,21,18,0.9)" : "rgba(251,251,250,0.95)";

  for (const id of ["roadname_major", "roadname_pri", "roadname_sec", "roadname_minor", "place_suburbs"]) {
    if (!m.getLayer(id)) continue;
    m.setPaintProperty(id, "text-color", ink);
    m.setPaintProperty(id, "text-halo-color", halo);
    m.setPaintProperty(id, "text-halo-width", 1.6);
  }

  // House numbers ("63-25") are noise at street level: a rider needs the
  // street name, so the address layer stays hidden.
  if (m.getLayer("housenumber")) m.setLayoutProperty("housenumber", "visibility", "none");
}
function addLayers(m: MapLibre, dark: boolean) {
  if (m.getLayer("buses")) return;
  const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
  for (const id of ["path", "stops", "buses"]) if (!m.getSource(id)) m.addSource(id, { type: "geojson", data: empty });

  const ink = dark ? "#eceee9" : "#111211";
  const paper = dark ? "#0a0b0a" : "#fbfbfa";
  const accent = dark ? "#90c4af" : "#1f5040";
  // Red for TransMilenio, blue for the SITP: the two fleets riders name apart.
  const troncal = dark ? "#ec4b41" : "#be4a3c";
  const sitp = dark ? "#4d8bf2" : "#3d63a8";
  const grey = dark ? "#9ba196" : "#7a7f78";

  m.addLayer({
    id: "path",
    type: "line",
    source: "path",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": accent, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 15, 2.4], "line-opacity": 0.9 },
  });
  if (!m.hasImage("stop-frame")) m.addImage("stop-frame", frameIcon(24, 24, 3), { sdf: true });
  if (!m.hasImage("station-frame")) m.addImage("station-frame", frameIcon(34, 16, 3.5), { sdf: true });
  m.addLayer({
    id: "stops",
    type: "symbol",
    source: "stops",
    filter: ["!=", ["get", "station"], 1],
    layout: {
      "icon-image": "stop-frame",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.32, 14, 0.46, 17, 0.7],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
    paint: { "icon-color": grey, "icon-halo-color": paper, "icon-halo-width": 0.6 },
  } satisfies SymbolLayerSpecification);
  // A station is wider than a stop frame, so the corridor reads apart from the street.
  m.addLayer({
    id: "stations",
    type: "symbol",
    source: "stops",
    filter: ["==", ["get", "station"], 1],
    layout: {
      "icon-image": "station-frame",
      "icon-size": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 14, 0.75, 17, 1.05],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
    paint: { "icon-color": grey, "icon-halo-color": paper, "icon-halo-width": 0.6 },
  } satisfies SymbolLayerSpecification);
  m.addLayer({
    id: "stop-selected",
    type: "circle",
    source: "stops",
    filter: ["==", ["get", "sel"], 1],
    paint: { "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 6, 16, 12], "circle-color": accent, "circle-opacity": 0.18 },
  });
  m.addLayer({
    id: "stop-selected-dot",
    type: "circle",
    source: "stops",
    filter: ["==", ["get", "sel"], 1],
    paint: { "circle-radius": 3, "circle-color": accent, "circle-stroke-color": paper, "circle-stroke-width": 1.5 },
  });
  m.addLayer({
    id: "buses",
    type: "circle",
    source: "buses",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 11, 2.4, 17, 5],
      "circle-color": ["case", ["==", ["get", "system"], "troncal"], troncal, sitp],
      "circle-opacity": ["case", ["==", ["get", "accent"], 1], 1, 0.85],
      "circle-stroke-color": paper,
      "circle-stroke-width": ["case", ["==", ["get", "accent"], 1], 2, 1],
    },
  });

  // The stop in focus always says which stop it is; the rest say it once the
  // map is close enough that the code helps rather than clutters.
  m.addLayer({
    id: "stop-code-selected",
    type: "symbol",
    source: "stops",
    filter: ["==", ["get", "sel"], 1],
    layout: {
      "text-field": ["get", "code"],
      "text-font": labelFont(m),
      "text-size": 11,
      "text-anchor": "top",
      "text-offset": [0, 1.2],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: { "text-color": accent, "text-halo-color": paper, "text-halo-width": 1.4 },
  } satisfies SymbolLayerSpecification);
  m.addLayer({
    id: "stop-codes",
    type: "symbol",
    source: "stops",
    minzoom: 15,
    filter: ["!=", ["get", "sel"], 1],
    layout: {
      "text-field": ["get", "code"],
      "text-font": labelFont(m),
      "text-size": ["interpolate", ["linear"], ["zoom"], 15, 9.5, 18, 11.5],
      "text-anchor": "top",
      "text-offset": [0, 1.2],
      "text-optional": true,
    },
    paint: { "text-color": ink, "text-opacity": 0.72, "text-halo-color": paper, "text-halo-width": 1.2 },
  } satisfies SymbolLayerSpecification);

  // A bus is known by its route, never by its fleet number: the highlighted
  // ones always say it, the rest once the map is close enough to tell them apart.
  m.addLayer({
    id: "bus-code-accent",
    type: "symbol",
    source: "buses",
    filter: ["all", ["==", ["get", "accent"], 1], ["!=", ["get", "code"], ""]],
    layout: {
      "text-field": ["get", "code"],
      "text-font": labelFont(m),
      "text-size": 11,
      "text-anchor": "top",
      "text-offset": [0, -1.2],
      "text-allow-overlap": true,
      "text-ignore-placement": true,
    },
    paint: { "text-color": accent, "text-halo-color": paper, "text-halo-width": 1.4 },
  } satisfies SymbolLayerSpecification);
  m.addLayer({
    id: "bus-codes",
    type: "symbol",
    source: "buses",
    minzoom: 14.5,
    filter: ["all", ["!=", ["get", "accent"], 1], ["!=", ["get", "code"], ""]],
    layout: {
      "text-field": ["get", "code"],
      "text-font": labelFont(m),
      "text-size": ["interpolate", ["linear"], ["zoom"], 15, 9.5, 18, 11.5],
      "text-anchor": "top",
      "text-offset": [0, -1.2],
      "text-optional": true,
    },
    paint: { "text-color": ink, "text-opacity": 0.7, "text-halo-color": paper, "text-halo-width": 1.2 },
  } satisfies SymbolLayerSpecification);
}

/** An outline frame, tinted at paint time: a square for a stop, a rectangle for a station. */
function frameIcon(width: number, height: number, lineWidth: number): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = lineWidth;
    ctx.strokeRect(lineWidth / 2, lineWidth / 2, width - lineWidth, height - lineWidth);
  }
  return ctx ? ctx.getImageData(0, 0, width, height) : new ImageData(width, height);
}

/** The font stack the basemap already loads, so our labels reuse its glyphs. */
function labelFont(m: MapLibre): string[] {
  for (const layer of m.getStyle()?.layers ?? []) {
    const font = (layer as { layout?: { "text-font"?: unknown } }).layout?.["text-font"];
    if (Array.isArray(font) && font.length > 0 && font.every((f) => typeof f === "string")) return font as string[];
  }
  return ["Open Sans Regular"];
}
