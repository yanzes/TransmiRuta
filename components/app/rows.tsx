"use client";

import Link from "next/link";

import { Label, RouteCode } from "@/components/app/primitives";
import { distanceText, splitName } from "@/lib/format";
import type { SavedStop } from "@/lib/saved";
import { systemLabel } from "@/lib/systems";
import type { RouteRef, StopArrival, StopDetail, StopRef } from "@/lib/types";
import { useJson } from "@/lib/use-live";

/** A stop as a line of type: name, distance, and the routes that reach it. */
export function StopRow({ stop, saved = false }: { stop: StopRef; saved?: boolean }) {
  return (
    <li>
      <Link href={`/parada/${stop.id}`} className="group flex items-baseline justify-between gap-4 py-3">
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] leading-snug group-hover:text-accent">
            {saved ? <span className="mr-1.5 text-accent">★</span> : null}
            {stop.name}
          </span>
          <span className="mt-0.5 block truncate font-mono text-[10.5px] text-faint">
            {stop.routes.slice(0, 5).map((route) => route.code).join("  ")}
            {stop.routes.length > 5 ? `  +${stop.routes.length - 5}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-right text-[11px] tabular-nums text-faint">
          {stop.distanceM != null ? distanceText(stop.distanceM) : `${stop.routes.length} rutas`}
        </span>
      </Link>
    </li>
  );
}

export function RouteRow({ route, detail }: { route: RouteRef; detail?: string }) {
  return (
    <li>
      <Link href={`/ruta/${route.id}`} className="group flex items-baseline justify-between gap-4 py-3">
        <span className="flex min-w-0 items-baseline gap-3">
          <RouteCode code={route.code} strong className="w-[52px] shrink-0 group-hover:text-accent" />
          <span className="truncate text-[13.5px] leading-snug group-hover:text-accent">{splitName(route.name) || systemLabel(route.system)}</span>
        </span>
        <span className="shrink-0 text-[11px] text-faint">{detail ?? systemLabel(route.system)}</span>
      </Link>
    </li>
  );
}

export function ArrivalRow({ arrival }: { arrival: StopArrival }) {
  return (
    <li className="flex items-baseline justify-between gap-4 py-2.5">
      <span className="flex min-w-0 items-baseline gap-3">
        <RouteCode code={arrival.code} className="w-[52px] shrink-0" />
        <span className="truncate text-[13px] text-quiet">{splitName(arrival.name) || systemLabel(arrival.system)}</span>
      </span>
      <span className="shrink-0 text-[13px] tabular-nums">
        {arrival.minutes}
        <span className="ml-1 text-[10.5px] text-faint">min</span>
      </span>
    </li>
  );
}

/** The next bus, set as a line with one number larger: no card, no colour block. */
export function NextArrival({ arrival }: { arrival: StopArrival }) {
  return (
    <div className="flex items-baseline justify-between gap-6 border-t border-foreground pt-4">
      <div className="min-w-0">
        <Label>Próximo</Label>
        <p className="mt-1 flex items-baseline gap-3">
          <RouteCode code={arrival.code} strong className="text-[15px]" />
          <span className="truncate text-[14px]">{splitName(arrival.name) || systemLabel(arrival.system)}</span>
        </p>
        <p className="mt-1 text-[11px] text-faint">
          {arrival.vehicle ? `Bus ${arrival.vehicle} · ` : ""}estimado por su última posición
        </p>
      </div>
      <p className="shrink-0 text-right text-[38px] font-medium leading-none tracking-[-0.04em] tabular-nums">
        {arrival.minutes}
        <span className="ml-1 align-baseline text-[10.5px] font-normal tracking-normal text-faint">min</span>
      </p>
    </div>
  );
}

/** A saved stop in the list, with its next two buses already on the line. */
export function SavedRow({ saved }: { saved: SavedStop }) {
  const { data, error } = useJson<StopDetail>(`/api/stop?stop_id=${encodeURIComponent(saved.id)}`, 60_000);
  const next = data?.arrivals.slice(0, 2) ?? [];

  return (
    <li>
      <Link href={`/parada/${saved.id}`} className="group flex items-baseline justify-between gap-4 py-3">
        <span className="min-w-0">
          <span className="block truncate text-[13.5px] leading-snug group-hover:text-accent">
            <span className="mr-1.5 text-accent">★</span>
            {saved.name}
          </span>
          <span className="mt-0.5 block font-mono text-[10.5px] text-faint">
            {next.length === 0
              ? error
                ? "sin datos"
                : data
                  ? "sin buses a la vista"
                  : "leyendo…"
              : next.map((arrival) => `${arrival.code} ${arrival.minutes} min`).join("  ·  ")}
          </span>
        </span>
        <span className="shrink-0 text-[11px] text-faint">{saved.codes.slice(0, 2).join(" ")}</span>
      </Link>
    </li>
  );
}
