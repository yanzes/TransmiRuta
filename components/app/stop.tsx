"use client";

import Link from "next/link";
import { useState } from "react";

import { TransitMap } from "@/components/app/map";
import { BackLink, Bone, Empty, FeedLine, Guide, Label, Shell, TextButton, useDark } from "@/components/app/primitives";
import { ArrivalRow, NextArrival, RouteRow } from "@/components/app/rows";
import { toggleStop, useIsSaved } from "@/lib/saved";
import type { StopDetail } from "@/lib/types";
import { useJson } from "@/lib/use-live";

export function StopScreen({ id }: { id: string }) {
  const dark = useDark();
  const { data, error, loading, reload } = useJson<StopDetail>(`/api/stop?stop_id=${encodeURIComponent(id)}`, 20_000);
  const isSaved = useIsSaved("stop", id);
  const [only, setOnly] = useState<string | null>(null);

  const stop = data?.stop;
  const arrivals = (data?.arrivals ?? []).filter((arrival) => !only || arrival.code === only);
  const [next, ...later] = arrivals;
  const buses = (data?.incoming ?? [])
    .filter((bus) => !only || bus.code === only)
    .map((bus) => ({ id: bus.id, lat: bus.lat, lon: bus.lon, code: bus.code, accent: true }));

  return (
    <Shell className="py-8">
      <BackLink href="/">Inicio</BackLink>

      {loading && !data ? (
        <div className="mt-8 space-y-3">
          <Bone className="h-5 w-1/2" />
          <Bone className="h-3 w-1/4" />
        </div>
      ) : null}

      {error && !data ? (
        <div className="mt-8">
          <Empty title="No pudimos abrir este paradero" body={error} />
        </div>
      ) : null}

      {stop ? (
        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-14">
          <div>
            <Label>Paradero</Label>
            <h1 className="mt-1 text-[26px] font-medium leading-tight tracking-[-0.025em]">{stop.name}</h1>
            <p className="mt-1 text-[11.5px] text-faint">{stop.routes.length} rutas</p>

            <Guide title="Cómo leer esta ventana">
              Arriba va el próximo bus con los minutos que le faltan; debajo, los que vienen después. Toca un código para ver solo esa ruta,
              «Actualizar» para refrescar y la ☆ para guardar el paradero en Guardados.
            </Guide>

            {stop.routes.length > 1 ? (
              <div className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono text-[11.5px]">
                <button
                  type="button"
                  onClick={() => setOnly(null)}
                  className={!only ? "text-foreground underline underline-offset-4" : "text-faint hover:text-foreground"}
                >
                  todas
                </button>
                {stop.routes.map((route) => (
                  <button
                    key={route.id}
                    type="button"
                    onClick={() => setOnly(only === route.code ? null : route.code)}
                    className={only === route.code ? "text-foreground underline underline-offset-4" : "text-faint hover:text-foreground"}
                  >
                    {route.code}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-7">
              {next ? (
                <NextArrival arrival={next} />
              ) : (
                <Empty
                  title={data ? "Ningún bus viene ahora" : "Leyendo los buses…"}
                  body={data ? "El feed no reporta buses de estas rutas acercándose. Prueba en unos minutos." : undefined}
                />
              )}
            </div>

            {later.length > 0 ? (
              <section className="mt-7">
                <Label>También vienen</Label>
                <ul className="mt-1 divide-y divide-line">
                  {later.slice(0, 10).map((arrival) => (
                    <ArrivalRow key={arrival.routeId} arrival={arrival} />
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="mt-9">
              <Label>Rutas aquí</Label>
              <ul className="mt-1 divide-y divide-line">
                {stop.routes.map((route) => (
                  <RouteRow key={route.id} route={route} />
                ))}
              </ul>
            </section>

            <div className="mt-9 flex flex-wrap gap-x-6 gap-y-2">
              <TextButton onClick={reload}>Actualizar</TextButton>
              <TextButton onClick={() => toggleStop(stop)} accent={isSaved}>
                {isSaved ? "★ Guardado" : "☆ Guardar paradero"}
              </TextButton>
              <Link
                href={`/reportar?stopId=${encodeURIComponent(stop.id)}&stopName=${encodeURIComponent(stop.name)}`}
                className="text-[12px] text-quiet underline-offset-4 hover:text-foreground hover:underline"
              >
                Reportar
              </Link>
            </div>

            <p className="mt-6 max-w-[52ch] text-[10.5px] leading-relaxed text-faint">
              Los minutos se estiman con la última posición de cada bus y la secuencia publicada de paradas. No son predicciones oficiales.
            </p>
          </div>

          <div>
            <div className="h-[300px] border border-line lg:sticky lg:top-20 lg:h-[560px]">
              <TransitMap dark={dark} center={[stop.lon, stop.lat]} zoom={15.2} stops={[stop]} buses={buses} selected={id} />
            </div>
            <FeedLine feed={data?.feed} className="mt-3" />
          </div>
        </div>
      ) : null}
    </Shell>
  );
}
