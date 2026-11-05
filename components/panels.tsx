"use client";

import { CheckIcon, ChevronRightIcon, CopyIcon, CrosshairIcon, SearchIcon, TerminalSquareIcon, XIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clockOf, formatMs, statusText } from "@/lib/format";
import type { System } from "@/lib/schemas";
import { SYSTEM_STYLE, systemColor } from "@/lib/systems";
import type { Trace } from "@/lib/trace";
import type { Bus, Fleet, RouteInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function Section({ title, aside, children, className }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("border-b border-line", className)}>
      <div className="flex items-center justify-between px-5 pt-4 pb-2.5">
        <span className="eyebrow">{title}</span>
        {aside}
      </div>
      <div className="px-5 pb-4">{children}</div>
    </section>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative flex size-2", className)}>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-agent opacity-70" />
      <span className="relative inline-flex size-2 rounded-full bg-agent" />
    </span>
  );
}

/** Counts up to `value` instead of jumping, so a new snapshot reads as movement. */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const start = current.current;
    const began = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / 1200);
      const v = Math.round(start + (value - start) * (1 - (1 - t) ** 3));
      current.current = v;
      setShown(v);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={cn("tabular-nums", className)}>{shown.toLocaleString("es-CO")}</span>;
}

export function LiveCounter({ fleet, error }: { fleet: Fleet | null; error: string | null }) {
  return (
    <section className="border-b border-line px-5 pt-5 pb-5">
      <div className="flex items-center gap-2">
        <LiveDot />
        <span className="eyebrow">En vivo · Bogotá</span>
      </div>
      <div className="mt-4 font-sans text-[64px] leading-none font-semibold tracking-[-0.04em]">
        {fleet ? <AnimatedNumber value={fleet.total} /> : <span className="text-muted-foreground/40">0</span>}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">buses de TransMilenio en vía ahora mismo</p>
      <p className="mt-3 font-mono text-[10.5px] text-muted-foreground tabular-nums">
        {error ? <span className="text-destructive">{error}</span> : fleet ? `Posiciones de las ${clockOf(fleet.asOf)} · cada 15 s` : "Cargando la flota…"}
      </p>
    </section>
  );
}

export function SystemLegend({ fleet, hidden, onToggle, dark }: { fleet: Fleet | null; hidden: ReadonlySet<System>; onToggle: (s: System) => void; dark: boolean }) {
  const counts = new Map<System, number>();
  for (const b of fleet?.buses ?? []) {
    const system = (b.route && fleet?.routes[b.route]?.system) || "other";
    counts.set(system, (counts.get(system) ?? 0) + 1);
  }
  const rows = [...counts.entries()].sort((a, b) => SYSTEM_STYLE[a[0]].order - SYSTEM_STYLE[b[0]].order);
  const max = Math.max(1, ...counts.values());
  return (
    <Section title="Por sistema" aside={<span className="eyebrow-sm">toca para ocultar</span>}>
      <ul className="-mx-2 space-y-0.5">
        {rows.map(([system, count]) => {
          const off = hidden.has(system);
          return (
            <li key={system}>
              <button
                type="button"
                onClick={() => onToggle(system)}
                className={cn("grid w-full grid-cols-[10px_1fr_auto] items-center gap-3 px-2 py-1.5 text-left transition-colors hover:bg-secondary/50", off && "opacity-40")}
              >
                <span className="size-2.5 rounded-full" style={{ background: systemColor(system, dark) }} />
                <span className="min-w-0">
                  <span className="block text-[13px]">{SYSTEM_STYLE[system].label}</span>
                  <span className="mt-1 block h-px bg-line">
                    <span className="block h-px origin-left transition-transform duration-700" style={{ background: systemColor(system, dark), transform: `scaleX(${count / max})` }} />
                  </span>
                </span>
                <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{count.toLocaleString("es-CO")}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

export function RouteSearch({
  fleet,
  query,
  onQuery,
  matched,
  dark,
}: {
  fleet: Fleet | null;
  query: string;
  onQuery: (q: string) => void;
  matched: { routes: number; buses: number } | null;
  dark: boolean;
}) {
  const top = topRoutes(fleet, 8);
  return (
    <Section title="Busca una ruta">
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => onQuery(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 8))}
          placeholder="B10, K43, H710…"
          className="h-9 pl-8 font-mono text-sm uppercase"
          aria-label="Código de ruta"
        />
        {query ? (
          <button type="button" aria-label="Limpiar" onClick={() => onQuery("")} className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
            <XIcon className="size-3.5" />
          </button>
        ) : null}
      </div>
      {query && matched ? (
        <p className="mt-2.5 text-xs text-muted-foreground">
          {matched.buses > 0 ? `${matched.buses.toLocaleString("es-CO")} buses en ${matched.routes === 1 ? "1 sentido" : `${matched.routes} recorridos`} con el código ${query}.` : `Ningún bus con el código ${query} está en vía ahora.`}
        </p>
      ) : (
        <>
          <p className="mt-3 mb-2 eyebrow-sm">Más buses en vía</p>
          <div className="flex flex-wrap gap-1.5">
            {top.map((r) => (
              <button
                key={r.code}
                type="button"
                onClick={() => onQuery(r.code)}
                className="flex items-center gap-1.5 border border-line px-2 py-1 font-mono text-[11px] transition-colors hover:border-foreground/40 hover:bg-secondary/50"
              >
                <span className="size-1.5 rounded-full" style={{ background: systemColor(r.system, dark) }} />
                {r.code}
                <span className="text-muted-foreground">{r.count}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </Section>
  );
}

function topRoutes(fleet: Fleet | null, n: number) {
  const counts = new Map<string, { code: string; system: System; count: number }>();
  for (const b of fleet?.buses ?? []) {
    const r = b.route ? fleet?.routes[b.route] : undefined;
    if (!r?.code) continue;
    const entry = counts.get(r.code) ?? { code: r.code, system: r.system, count: 0 };
    entry.count++;
    counts.set(r.code, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, n);
}

export function BusCard({
  bus,
  route,
  follow,
  onFollow,
  onShowRoute,
  onClose,
  dark,
}: {
  bus: Bus;
  route: RouteInfo | undefined;
  follow: boolean;
  onFollow: () => void;
  onShowRoute: () => void;
  onClose: () => void;
  dark: boolean;
}) {
  const system = route?.system ?? "other";
  return (
    <section className="border-b border-line bg-secondary/30">
      <div className="flex items-start justify-between gap-3 px-5 pt-4">
        <div className="min-w-0">
          <span className="eyebrow">Bus {bus.label ?? bus.id}</span>
          <div className="mt-2 flex items-center gap-2.5">
            <span className="px-2 py-0.5 font-mono text-sm font-semibold text-background" style={{ background: systemColor(system, dark) }}>
              {route?.code ?? "?"}
            </span>
            <span className="truncate text-sm">{route?.name?.split("||").pop()?.trim() ?? "Sin ruta asignada"}</span>
          </div>
        </div>
        <Button size="icon-xs" variant="ghost" aria-label="Cerrar" onClick={onClose}>
          <XIcon />
        </Button>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-px border-y border-line bg-line">
        <Fact label={statusText(bus.status)} value={bus.stop ?? "Sin parada"} wide />
        <Fact label="Placa" value={bus.plate ?? "No reportada"} />
        <Fact label="Reportó" value={bus.reportedAt ? clockOf(bus.reportedAt) : "Sin hora"} />
        <Fact label="Sistema" value={SYSTEM_STYLE[system].label} />
        <Fact label="Posición" value={`${bus.lat.toFixed(4)}, ${bus.lon.toFixed(4)}`} />
      </dl>
      <div className="flex gap-2 px-5 py-3">
        <Button size="sm" variant={follow ? "default" : "outline"} onClick={onFollow}>
          <CrosshairIcon />
          {follow ? "Siguiendo" : "Seguir bus"}
        </Button>
        {bus.route ? (
          <Button size="sm" variant="outline" onClick={onShowRoute}>
            Ver recorrido
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function Fact({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={cn("bg-background px-5 py-2.5", wide && "col-span-2")}>
      <dt className="eyebrow-sm">{label}</dt>
      <dd className="mt-1 truncate text-[13px]">{value}</dd>
    </div>
  );
}

export function Inspector({ traces }: { traces: Trace[] }) {
  return (
    <section>
      <div className="flex items-center justify-between px-5 pt-4 pb-2.5">
        <div className="flex items-center gap-2">
          <TerminalSquareIcon className="size-3.5 text-agent" />
          <span className="eyebrow">Inspector</span>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{traces.length} llamadas</span>
      </div>
      <p className="px-5 pb-3 text-[11px] leading-relaxed text-muted-foreground">
        Cada llamada a la API de Croma sale del servidor y se comparte entre todos los visitantes durante 15 s. La API key nunca llega al navegador.
      </p>
      <div className="border-t border-line">
        {traces.map((t) => (
          <TraceRow key={t.id} trace={t} />
        ))}
      </div>
    </section>
  );
}

function TraceRow({ trace }: { trace: Trace }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ok = trace.status < 300;
  const curl = `curl https://api.croma.run${trace.path} \\\n  -H "Authorization: Bearer $CROMA_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(trace.body)}'`;
  return (
    <div className="border-b border-line">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2.5 px-5 py-2.5 text-left transition-colors hover:bg-secondary/40">
        <ChevronRightIcon className={cn("size-3 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
        <span className={cn("font-mono text-[10px] font-medium tabular-nums", ok ? "text-positive" : "text-destructive")}>{trace.status}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
          {trace.path.replace("/co/transmilenio/", "").replace("/v1", "")}
          {typeof trace.body.page === "number" && trace.body.page > 1 ? <span className="text-muted-foreground"> · p{String(trace.body.page)}</span> : null}
        </span>
        <span className="font-mono text-[10px] text-muted-foreground tabular-nums">{formatMs(trace.ms)}</span>
      </button>
      {open ? (
        <div className="space-y-2 px-5 pb-3">
          <div className="flex items-center justify-between">
            <span className="eyebrow-sm">POST · {new Date(trace.at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                void navigator.clipboard.writeText(curl);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              cURL
            </Button>
          </div>
          <pre className="overflow-auto border border-line bg-secondary/30 p-2.5 font-mono text-[10.5px] leading-relaxed">{curl}</pre>
        </div>
      ) : null}
    </div>
  );
}
