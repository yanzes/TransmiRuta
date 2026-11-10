"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import maplibregl, { type GeoJSONSource, type Map as MapLibre } from "maplibre-gl";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";

/** Basemaps without labels or points of interest: the page supplies the meaning. */
const STYLES = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-nolabels-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json",
};
const BOGOTA: [number, number] = [-74.075, 4.648];

export interface MapStop {
  id: string;
  name: string;
  lat: number;
  lon: number;
}

export interface MapBus {
  id: string;
  lat: number;
  lon: number;
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
 * A monochrome map: graphite dots for buses and stops, a single accent for the
 * route or stop in focus. No glows, no labels from the basemap, no colour code.
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
      ready.current = true;
      draw(m, true);
    });

    m.on("click", (event) => {
      const hits = m.queryRenderedFeatures(event.point, { layers: ["stops"] });
      const stop = hits[0];
      if (stop) live.current.onStop?.(String(stop.properties.id));
    });
    m.on("mouseenter", "stops", () => (m.getCanvas().style.cursor = "pointer"));
    m.on("mouseleave", "stops", () => (m.getCanvas().style.cursor = ""));

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
        properties: { id: stop.id, sel: stop.id === p.selected ? 1 : 0 },
      })),
    });
    m.getSource<GeoJSONSource>("buses")?.setData({
      type: "FeatureCollection",
      features: (p.buses ?? []).map((bus) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [bus.lon, bus.lat] },
        properties: { id: bus.id, accent: bus.accent ? 1 : 0 },
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

function addLayers(m: MapLibre, dark: boolean) {
  if (m.getLayer("buses")) return;
  const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
  for (const id of ["path", "stops", "buses"]) if (!m.getSource(id)) m.addSource(id, { type: "geojson", data: empty });

  const ink = dark ? "#eceee9" : "#111211";
  const paper = dark ? "#0a0b0a" : "#fbfbfa";
  const accent = dark ? "#90c4af" : "#1f5040";

  m.addLayer({
    id: "path",
    type: "line",
    source: "path",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": accent, "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.2, 15, 2.4], "line-opacity": 0.9 },
  });
  m.addLayer({
    id: "stops",
    type: "circle",
    source: "stops",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 1.8, 14, 3, 17, 4.5],
      "circle-color": ink,
      "circle-opacity": 0.55,
    },
  });
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
      "circle-radius": ["case", ["==", ["get", "accent"], 1], 2.8, 1.8],
      "circle-color": ["case", ["==", ["get", "accent"], 1], accent, ink],
      "circle-opacity": ["case", ["==", ["get", "accent"], 1], 1, 0.45],
      "circle-stroke-color": paper,
      "circle-stroke-width": 0.8,
    },
  });
}
