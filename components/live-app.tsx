"use client";

import { ClapperboardIcon, SparklesIcon, XIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AnimatedNumber, BusCard, Inspector, LiveCounter, LiveDot, RouteSearch, SystemLegend } from "@/components/panels";
import { SiteHeader } from "@/components/site-header";
import { StationSheet } from "@/components/station-sheet";
import { Button } from "@/components/ui/button";
import { getJson, usePoll, useTraces } from "@/components/use-live";
import { clockOf } from "@/lib/format";
import type { System } from "@/lib/schemas";
import type { Fleet, RouteLine, Station } from "@/lib/types";
import { cn } from "@/lib/utils";

const BusMap = dynamic(() => import("@/components/bus-map").then((m) => m.BusMap), { ssr: false });

export function LiveApp() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = !mounted || resolvedTheme !== "light";

  const { traces, add } = useTraces();
  const { result: fleetResult } = usePoll<Fleet>("/api/fleet", 15_000, add);
  const { result: stationsResult } = usePoll<Station[]>("/api/stations", 6 * 60 * 60_000, add);
  const fleet = fleetResult?.ok ? fleetResult.data : null;
  const stations = useMemo(() => (stationsResult?.ok ? stationsResult.data : []), [stationsResult]);

  const [hidden, setHidden] = useState<ReadonlySet<System>>(new Set());
  const [query, setQuery] = useState("");
  const [pinnedRoute, setPinnedRoute] = useState<string | null>(null);
  const [routeLines, setRouteLines] = useState<RouteLine[]>([]);
  const [selectedBus, setSelectedBus] = useState<string | null>(null);
  const [station, setStation] = useState<Station | null>(null);
  const [follow, setFollow] = useState(false);
  const [trails, setTrails] = useState(true);
  const [record, setRecord] = useState(false);

  // Which route ids the map lights up: a picked bus's route, or every route
  // whose code matches the search (exactly when one does, else by prefix).
  const focus = useMemo<ReadonlySet<string> | null>(() => {
    if (pinnedRoute) return new Set([pinnedRoute]);
    if (!query || !fleet) return null;
    const entries = Object.entries(fleet.routes);
    const exact = entries.filter(([, r]) => r.code?.toUpperCase() === query);
    const hits = exact.length ? exact : entries.filter(([, r]) => r.code?.toUpperCase().startsWith(query));
    return new Set(hits.map(([id]) => id));
  }, [query, pinnedRoute, fleet]);

  const matched = useMemo(() => {
    if (!focus || !fleet) return null;
    return { routes: focus.size, buses: fleet.buses.filter((b) => b.route && focus.has(b.route)).length };
  }, [focus, fleet]);

  // Draw the line of the route(s) in focus: the two busiest directions at most.
  const focusKey = useMemo(() => {
    if (!focus || !fleet || focus.size === 0) return "";
    const counts = new Map<string, number>();
    for (const b of fleet.buses) if (b.route && focus.has(b.route)) counts.set(b.route, (counts.get(b.route) ?? 0) + 1);
    const ids = focus.size <= 2 ? [...focus] : [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([id]) => id);
    return ids.sort().join(",");
  }, [focus, fleet]);

  useEffect(() => {
    if (!focusKey) {
      setRouteLines([]);
      return;
    }
    const controller = new AbortController();
    Promise.all(focusKey.split(",").map((id) => getJson<RouteLine>(`/api/route?route_id=${encodeURIComponent(id)}`, add, controller.signal)))
      .then((results) => setRouteLines(results.flatMap((r) => (r.ok && r.data.coordinates.length > 1 ? [r.data] : []))))
      .catch(() => {});
    return () => controller.abort();
  }, [focusKey, add]);

  const bus = selectedBus ? fleet?.buses.find((b) => b.id === selectedBus) : undefined;

  const selectBus = useCallback((id: string | null) => {
    setSelectedBus(id);
    if (!id) {
      setFollow(false);
      setPinnedRoute(null);
    }
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "r" || e.key === "R") setRecord((r) => !r);
      if (e.key === "Escape") {
        setRecord(false);
        selectBus(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectBus]);

  const error = fleetResult && !fleetResult.ok ? fleetResult.error.message : null;

  const panel = (
    <>
      <LiveCounter fleet={fleet} error={error} />
      {bus ? (
        <BusCard
          bus={bus}
          route={bus.route ? fleet?.routes[bus.route] : undefined}
          follow={follow}
          onFollow={() => setFollow((f) => !f)}
          onShowRoute={() => setPinnedRoute(bus.route)}
          onClose={() => selectBus(null)}
          dark={dark}
        />
      ) : null}
      <RouteSearch
        fleet={fleet}
        query={query}
        onQuery={(q) => {
          setQuery(q);
          setPinnedRoute(null);
        }}
        matched={matched}
        dark={dark}
      />
      <SystemLegend
        fleet={fleet}
        hidden={hidden}
        dark={dark}
        onToggle={(s) =>
          setHidden((h) => {
            const next = new Set(h);
            if (next.has(s)) next.delete(s);
            else next.add(s);
            return next;
          })
        }
      />
      <section className="flex flex-wrap gap-2 border-b border-line px-5 py-4">
        <Button size="sm" variant={trails ? "default" : "outline"} onClick={() => setTrails((t) => !t)}>
          <SparklesIcon />
          Estelas
        </Button>
        <Button size="sm" variant="outline" onClick={() => setRecord(true)}>
          <ClapperboardIcon />
          Modo grabación
          <kbd className="ml-1 border border-line px-1 font-mono text-[9px] text-muted-foreground">R</kbd>
        </Button>
      </section>
      <Inspector traces={traces} />
    </>
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {record ? null : <SiteHeader />}
      <main className="relative min-h-0 flex-1">
        <BusMap
          fleet={fleet}
          stations={stations}
          dark={dark}
          hidden={hidden}
          focus={focus}
          routeLines={routeLines}
          selectedBus={selectedBus}
          selectedStation={station?.id ?? null}
          follow={follow}
          cinematic={record}
          trails={trails}
          onSelectBus={selectBus}
          onSelectStation={setStation}
        />

        {record ? (
          <RecordOverlay fleet={fleet} onExit={() => setRecord(false)} />
        ) : (
          <>
            <aside className="absolute inset-y-0 left-0 z-10 hidden w-[360px] flex-col overflow-y-auto border-r border-line bg-background/90 backdrop-blur-md lg:flex">
              {panel}
              <Footer />
            </aside>
            <MobileBar fleet={fleet}>{panel}</MobileBar>
          </>
        )}
      </main>
      <StationSheet station={station} onClose={() => setStation(null)} onTraces={add} dark={dark} />
    </div>
  );
}

function Footer() {
  return (
    <p className="mt-auto border-t border-line px-5 py-3 text-[11px] leading-relaxed text-muted-foreground">
      Datos de TransMilenio S.A. vía <a className="underline-offset-2 hover:underline" href="https://usecroma.com">Croma</a>. Mapa © CARTO, © OpenStreetMap.
    </p>
  );
}

function RecordOverlay({ fleet, onExit }: { fleet: Fleet | null; onExit: () => void }) {
  const [hint, setHint] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setHint(false), 2500);
    return () => clearTimeout(t);
  }, []);
  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[55%] bg-gradient-to-t from-background via-background/75 to-transparent" />
      <div className="pointer-events-none absolute bottom-8 left-8 z-20 sm:bottom-12 sm:left-12">
        <div className="flex items-center gap-2">
          <LiveDot />
          <span className="eyebrow">En vivo · Bogotá{fleet ? ` · ${clockOf(fleet.asOf)}` : ""}</span>
        </div>
        <div className="mt-3 text-[88px] leading-none font-semibold tracking-[-0.045em] sm:text-[128px]">
          {fleet ? <AnimatedNumber value={fleet.total} /> : "…"}
        </div>
        <p className="mt-3 text-lg text-muted-foreground sm:text-xl">buses de TransMilenio moviéndose ahora mismo</p>
      </div>
      <div className="pointer-events-none absolute right-8 bottom-8 z-20 text-right sm:right-12 sm:bottom-12">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="Croma" src="/croma_brand_black.svg" className="ml-auto h-5 w-auto dark:invert" />
        <p className="mt-2 font-mono text-[11px] text-muted-foreground">POST api.croma.run/co/transmilenio/vehicles/v1</p>
      </div>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Salir del modo grabación"
        onClick={onExit}
        className={cn("absolute top-4 right-4 z-20 transition-opacity duration-700", hint ? "opacity-100" : "opacity-0 hover:opacity-100")}
      >
        <XIcon />
      </Button>
      <div className={cn("pointer-events-none absolute top-5 left-1/2 z-20 -translate-x-1/2 border border-line bg-background/80 px-3 py-1.5 font-mono text-[11px] text-muted-foreground backdrop-blur transition-opacity duration-700", hint ? "opacity-100" : "opacity-0")}>
        R o Esc para salir
      </div>
    </>
  );
}

function MobileBar({ fleet, children }: { fleet: Fleet | null; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute inset-x-0 bottom-0 z-10 lg:hidden">
      {open ? (
        <div className="max-h-[70dvh] overflow-y-auto border-t border-line bg-background/95 backdrop-blur-md">
          {children}
          <Footer />
        </div>
      ) : null}
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between border-t border-line bg-background/90 px-5 py-3.5 backdrop-blur-md">
        <span className="flex items-center gap-3">
          <LiveDot />
          <span className="text-2xl font-semibold tracking-tight">{fleet ? <AnimatedNumber value={fleet.total} /> : "…"}</span>
          <span className="text-sm text-muted-foreground">buses en vía</span>
        </span>
        <span className="eyebrow-sm">{open ? "Cerrar" : "Detalles"}</span>
      </button>
    </div>
  );
}
