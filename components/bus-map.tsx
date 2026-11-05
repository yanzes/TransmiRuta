"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import maplibregl, { type GeoJSONSource, type Map as MapLibre } from "maplibre-gl";
import { useEffect, useRef } from "react";

import type { System } from "@/lib/schemas";
import { systemColor } from "@/lib/systems";
import type { Fleet, RouteLine, Station } from "@/lib/types";

const STYLES = {
  dark: "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
  light: "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json",
};
const FONT = ["Montserrat Medium", "Open Sans Regular", "Noto Sans Regular"];
const BOGOTA: [number, number] = [-74.095, 4.645];
/** Buses glide from their last reported position to the new one over this long. */
const GLIDE_MS = 4_500;
const FRAME_MS = 33;
const TRAIL_POINTS = 6;

type Point = [number, number];

export interface BusMapProps {
  fleet: Fleet | null;
  stations: Station[];
  dark: boolean;
  hidden: ReadonlySet<System>;
  /** When set, only buses on these route ids stay lit. */
  focus: ReadonlySet<string> | null;
  routeLines: RouteLine[];
  selectedBus: string | null;
  selectedStation: string | null;
  follow: boolean;
  cinematic: boolean;
  trails: boolean;
  onSelectBus: (id: string | null) => void;
  onSelectStation: (station: Station) => void;
}

export function BusMap(props: BusMapProps) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibre | null>(null);
  const live = useRef(props);
  live.current = props;

  // Positions the glide runs between, and where each bus is drawn right now.
  const from = useRef(new Map<string, Point>());
  const to = useRef(new Map<string, Point>());
  const drawn = useRef(new Map<string, Point>());
  const history = useRef(new Map<string, Point[]>());
  const glideStart = useRef(0);
  const ready = useRef(false);

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: live.current.dark ? STYLES.dark : STYLES.light,
      center: BOGOTA,
      zoom: window.innerWidth < 768 ? 10.4 : 11.3,
      minZoom: 9,
      maxZoom: 18,
      attributionControl: { compact: true },
      fadeDuration: 0,
    });
    map.current = m;
    if (window.innerWidth >= 1024 && !live.current.cinematic) m.setPadding({ left: 360, top: 0, right: 0, bottom: 0 });
    m.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), "bottom-right");

    m.on("style.load", () => {
      addLayers(m, live.current.dark);
      ready.current = true;
      drawAll(m, true);
    });

    m.on("click", (e) => {
      const hit = m.queryRenderedFeatures(e.point, { layers: ["stations", "bus"] });
      const station = hit.find((f) => f.layer.id === "stations");
      const bus = hit.find((f) => f.layer.id === "bus");
      if (station) {
        const s = live.current.stations.find((x) => x.id === station.properties.id);
        if (s) live.current.onSelectStation(s);
      } else live.current.onSelectBus(bus ? String(bus.properties.id) : null);
    });
    for (const layer of ["bus", "stations"]) {
      m.on("mouseenter", layer, () => (m.getCanvas().style.cursor = "pointer"));
      m.on("mouseleave", layer, () => (m.getCanvas().style.cursor = ""));
    }

    let raf = 0;
    let last = 0;
    let frame = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      if (now - last < FRAME_MS || !ready.current) return;
      last = now;
      frame++;
      const p = live.current;
      if (p.cinematic && !m.isMoving()) m.setBearing(m.getBearing() + 0.03);
      if (now - glideStart.current <= GLIDE_MS + FRAME_MS * 2) drawBuses(m, now, frame % 3 === 0);
      if (p.follow && p.selectedBus) {
        const at = drawn.current.get(p.selectedBus);
        if (at && !m.isMoving()) m.setCenter(at);
      }
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ready.current = false;
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A new snapshot: start a glide from where every bus is drawn now.
  useEffect(() => {
    const fleet = props.fleet;
    if (!fleet) return;
    const next = new Map<string, Point>();
    for (const b of fleet.buses) {
      const point: Point = [b.lon, b.lat];
      next.set(b.id, point);
      const trail = history.current.get(b.id) ?? [];
      const prev = trail[trail.length - 1];
      if (!prev || Math.abs(prev[0] - point[0]) + Math.abs(prev[1] - point[1]) > 0.00003) {
        trail.push(point);
        if (trail.length > TRAIL_POINTS) trail.shift();
        history.current.set(b.id, trail);
      }
    }
    for (const id of history.current.keys()) if (!next.has(id)) history.current.delete(id);
    const start = new Map<string, Point>();
    for (const [id, point] of next) start.set(id, drawn.current.get(id) ?? point);
    from.current = start;
    to.current = next;
    glideStart.current = performance.now();
  }, [props.fleet]);

  // Theme: swap the basemap; `style.load` puts our layers back.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    ready.current = false;
    m.setStyle(props.dark ? STYLES.dark : STYLES.light, { diff: false });
  }, [props.dark]);

  // Anything that changes how buses look, without moving them.
  useEffect(() => {
    if (map.current && ready.current) drawAll(map.current, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.hidden, props.focus, props.selectedBus, props.selectedStation, props.trails, props.stations]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready.current) return;
    drawRoutes(m);
    const coords = props.routeLines.flatMap((r) => r.coordinates);
    if (coords.length > 1) {
      const bounds = coords.reduce((b, c) => b.extend(c as Point), new maplibregl.LngLatBounds(coords[0] as Point, coords[0] as Point));
      m.fitBounds(bounds, { padding: { top: 80, bottom: 80, left: 60, right: 60 }, duration: 1200, maxZoom: 14.5 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.routeLines]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const left = !props.cinematic && window.innerWidth >= 1024 ? 360 : 0;
    m.easeTo({ pitch: props.cinematic ? 52 : 0, zoom: props.cinematic ? Math.max(m.getZoom(), 11.6) : m.getZoom(), padding: { left, top: 0, right: 0, bottom: 0 }, duration: 1800 });
    if (!props.cinematic) m.easeTo({ bearing: 0, duration: 1200 });
  }, [props.cinematic]);

  // Zoom in on a bus the first time it is picked.
  useEffect(() => {
    const m = map.current;
    const at = props.selectedBus ? drawn.current.get(props.selectedBus) : null;
    if (m && at) m.easeTo({ center: at, zoom: Math.max(m.getZoom(), 14), duration: 900 });
  }, [props.selectedBus]);

  function drawAll(m: MapLibre, withRoutes: boolean) {
    drawBuses(m, performance.now(), true);
    drawStations(m);
    if (withRoutes) drawRoutes(m);
  }

  function drawBuses(m: MapLibre, now: number, withTrails: boolean) {
    const p = live.current;
    const fleet = p.fleet;
    const source = m.getSource<GeoJSONSource>("buses");
    if (!fleet || !source) return;
    const t = easeInOut(Math.min(1, (now - glideStart.current) / GLIDE_MS));
    const features: GeoJSON.Feature[] = [];
    const trails: GeoJSON.Feature[] = [];
    for (const b of fleet.buses) {
      const route = b.route ? fleet.routes[b.route] : undefined;
      const system = route?.system ?? "other";
      if (p.hidden.has(system)) continue;
      const a = from.current.get(b.id) ?? [b.lon, b.lat];
      const z = to.current.get(b.id) ?? [b.lon, b.lat];
      const at: Point = [a[0] + (z[0] - a[0]) * t, a[1] + (z[1] - a[1]) * t];
      drawn.current.set(b.id, at);
      const lit = !p.focus || (b.route != null && p.focus.has(b.route));
      const color = systemColor(system, p.dark);
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: at },
        properties: { id: b.id, color, lit: lit ? 1 : 0, big: lit && p.focus ? 1 : 0, sel: b.id === p.selectedBus ? 1 : 0, rank: system === "troncal" ? 2 : system === "dual" ? 1 : 0 },
      });
      if (withTrails && p.trails && lit) {
        const trail = history.current.get(b.id);
        if (trail && trail.length > 1) {
          trails.push({ type: "Feature", geometry: { type: "LineString", coordinates: [...trail.slice(0, -1), at] }, properties: { color } });
        }
      }
    }
    source.setData({ type: "FeatureCollection", features });
    if (withTrails) m.getSource<GeoJSONSource>("trails")?.setData({ type: "FeatureCollection", features: p.trails ? trails : [] });
  }

  function drawStations(m: MapLibre) {
    const p = live.current;
    m.getSource<GeoJSONSource>("stations")?.setData({
      type: "FeatureCollection",
      features: p.stations.map((s) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        properties: { id: s.id, name: s.name, sel: s.id === p.selectedStation ? 1 : 0 },
      })),
    });
  }

  function drawRoutes(m: MapLibre) {
    const p = live.current;
    m.getSource<GeoJSONSource>("route")?.setData({
      type: "FeatureCollection",
      features: p.routeLines.map((r) => ({
        type: "Feature",
        geometry: { type: "LineString", coordinates: r.coordinates },
        properties: { color: systemColor(r.system, p.dark) },
      })),
    });
  }

  return (
    <div className={props.cinematic ? "absolute inset-0 [&_.maplibregl-ctrl-bottom-right]:hidden" : "absolute inset-0"}>
      <div ref={container} className="h-full w-full" />
    </div>
  );
}

function addLayers(m: MapLibre, dark: boolean) {
  if (m.getLayer("bus")) return;
  const empty: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };
  for (const id of ["route", "trails", "stations", "buses"]) if (!m.getSource(id)) m.addSource(id, { type: "geojson", data: empty });

  m.addLayer({
    id: "route-glow",
    type: "line",
    source: "route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 15, 16], "line-opacity": 0.18, "line-blur": 4 },
  });
  m.addLayer({
    id: "route-line",
    type: "line",
    source: "route",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 1.5, 15, 4], "line-opacity": 0.9 },
  });
  m.addLayer({
    id: "trails",
    type: "line",
    source: "trails",
    layout: { "line-cap": "round", "line-join": "round" },
    paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.8, 15, 2.5], "line-opacity": dark ? 0.35 : 0.4 },
  });
  m.addLayer({
    id: "stations",
    type: "circle",
    source: "stations",
    minzoom: 12,
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 10, 2, 14, 5, 17, 8],
      "circle-color": dark ? "#0a0a0a" : "#ffffff",
      "circle-stroke-color": ["case", ["==", ["get", "sel"], 1], dark ? "#ffffff" : "#000000", dark ? "#8b95f5" : "#5967e8"],
      "circle-stroke-width": ["interpolate", ["linear"], ["zoom"], 10, ["case", ["==", ["get", "sel"], 1], 3, 1], 14, ["case", ["==", ["get", "sel"], 1], 3.5, 2]],
      "circle-opacity": 1,
    },
  });
  m.addLayer({
    id: "bus-glow",
    type: "circle",
    source: "buses",
    layout: { "circle-sort-key": ["get", "rank"] },
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, ["case", ["==", ["get", "big"], 1], 10, 3], 12, ["case", ["==", ["get", "big"], 1], 14, 6], 16, ["case", ["==", ["get", "big"], 1], 22, 14]],
      "circle-color": ["get", "color"],
      "circle-blur": 1,
      "circle-opacity": ["case", ["==", ["get", "lit"], 1], dark ? 0.35 : 0.2, 0],
    },
  });
  m.addLayer({
    id: "bus",
    type: "circle",
    source: "buses",
    layout: { "circle-sort-key": ["+", ["get", "rank"], ["*", ["get", "lit"], 10]] },
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, ["case", ["==", ["get", "big"], 1], 3.5, 1.1], 12, ["case", ["==", ["get", "big"], 1], 5, 2.2], 16, ["case", ["==", ["get", "big"], 1], 8, 5.5]],
      "circle-color": ["get", "color"],
      "circle-opacity": ["case", ["==", ["get", "lit"], 1], 0.95, 0.12],
    },
  });
  m.addLayer({
    id: "bus-selected",
    type: "circle",
    source: "buses",
    filter: ["==", ["get", "sel"], 1],
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 9, 6, 16, 14],
      "circle-color": "rgba(0,0,0,0)",
      "circle-stroke-color": dark ? "#ffffff" : "#000000",
      "circle-stroke-width": 2,
    },
  });
  m.addLayer({
    id: "station-labels",
    type: "symbol",
    source: "stations",
    minzoom: 13.2,
    layout: { "text-field": ["get", "name"], "text-font": FONT, "text-size": 11, "text-offset": [0, 1.1], "text-anchor": "top", "text-max-width": 9 },
    paint: { "text-color": dark ? "#d4d4d4" : "#262626", "text-halo-color": dark ? "#0a0a0a" : "#ffffff", "text-halo-width": 1.4 },
  });
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}
