"use client";

import Link from "next/link";

import { TransitMap } from "@/components/app/map";
import { BackLink, Bone, Empty, FeedLine, Guide, Label, Shell, TextButton, useDark } from "@/components/app/primitives";
import { splitName } from "@/lib/format";
import { toggleRoute, useIsSaved } from "@/lib/saved";
import { systemLabel } from "@/lib/systems";
import type { Fleet, RouteLine } from "@/lib/types";
import { useJson } from "@/lib/use-live";

export function RouteScreen({ id }: { id: string }) {
  const dark = useDark();
  const { data: line, error, loading } = useJson<RouteLine>(`/api/route?route_id=${encodeURIComponent(id)}`, 0);
  const { data: fleet } = useJson<Fleet>("/api/fleet", 20_000);
  const isSaved = useIsSaved("route", id);

  const route = line?.code ? { id, code: line.code, name: line.name, system: line.system } : null;
  const onRoad = fleet?.buses.filter((bus) => bus.route === id) ?? [];
  const feed = fleet ? { asOf: fleet.asOf, total: fleet.total, live: Date.now() - Date.parse(fleet.asOf) < 10 * 60_000 } : undefined;
  const km = line?.lengthM ? (line.lengthM / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 }) : "–";

  return (
    <Shell className="py-8">
      <BackLink href="/buscar">Buscar</BackLink>

      {loading && !line ? (
        <div className="mt-8 space-y-3">
          <Bone className="h-5 w-1/3" />
          <Bone className="h-8 w-2/3" />
        </div>
      ) : null}

      {error && !line ? (
        <div className="mt-8">
          <Empty title="No pudimos abrir esta ruta" body={error} action={{ label: "Buscar otra", href: "/buscar" }} />
        </div>
      ) : null}

      {line && route ? (
        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-14">
          <div>
            <Label>Ruta</Label>
            <p className="mt-1 font-mono text-[13px] text-accent">{route.code}</p>
            <h1 className="mt-1 text-[26px] font-medium leading-tight tracking-[-0.025em]">{splitName(route.name) || systemLabel(route.system)}</h1>
            <p className="mt-1 text-[11.5px] text-faint">{systemLabel(route.system)}</p>

            <Guide title="Cómo leer esta ventana">
              Las paradas van en el orden del recorrido: toca una para ver sus próximas llegadas. En el mapa, el trazado une esas paradas y cada
              bus lleva el código de la ruta que está haciendo; la ☆ guarda la ruta en Guardados.
            </Guide>

            <dl className="mt-6 grid grid-cols-3 gap-4 border-y border-line py-3">
              {[
                { label: "Paradas", value: String(line.stops.length) },
                { label: "En vía", value: String(onRoad.length) },
                { label: "Largo", value: `${km} km` },
              ].map((fact) => (
                <div key={fact.label}>
                  <dt className="micro">{fact.label}</dt>
                  <dd className="mt-1 text-[13px] tabular-nums">{fact.value}</dd>
                </div>
              ))}
            </dl>

            <section className="mt-8">
              <Label>Paradas</Label>
              <ol className="mt-1 divide-y divide-line">
                {line.stops.map((stop, index) => (
                  <li key={`${stop.id}-${index}`}>
                    <Link href={`/parada/${stop.id}`} className="flex items-baseline gap-4 py-2.5 text-[13px] transition-colors hover:text-accent">
                      <span className="w-6 shrink-0 font-mono text-[10.5px] tabular-nums text-faint">{String(index + 1).padStart(2, "0")}</span>
                      <span className="truncate">{stop.name ?? stop.id}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2">
              <TextButton onClick={() => toggleRoute(route)} accent={isSaved}>
                {isSaved ? "★ Guardada" : "☆ Guardar ruta"}
              </TextButton>
              <Link
                href={`/reportar?routeId=${encodeURIComponent(route.id)}&routeCode=${encodeURIComponent(route.code)}`}
                className="text-[12px] text-quiet underline-offset-4 hover:text-foreground hover:underline"
              >
                Reportar
              </Link>
            </div>

            <p className="mt-6 max-w-[52ch] text-[10.5px] leading-relaxed text-faint">
              El trazado une las paradas publicadas de la ruta, en orden. No es la geometría oficial de la vía.
            </p>
          </div>

          <div>
            <div className="h-[300px] border border-line lg:sticky lg:top-20 lg:h-[560px]">
              <TransitMap
                dark={dark}
                stops={(line.stops ?? []).map((stop) => ({ id: stop.id, name: stop.name ?? stop.id, lat: stop.lat, lon: stop.lon }))}
                path={line.coordinates}
                buses={onRoad.map((bus) => ({ id: bus.id, lat: bus.lat, lon: bus.lon, code: route.code, accent: true }))}
                fit
              />
            </div>
            <FeedLine feed={feed} className="mt-3" />
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
