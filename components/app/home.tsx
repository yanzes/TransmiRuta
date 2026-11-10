"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { TransitMap } from "@/components/app/map";
import { Onboarding } from "@/components/app/onboarding";
import { Bone, FeedLine, Label, Shell, TextButton, useDark } from "@/components/app/primitives";
import { SavedRow, StopRow } from "@/components/app/rows";
import { BOGOTA } from "@/lib/geo";
import { useSaved, type SavedStop } from "@/lib/saved";
import type { Fleet, Nearby } from "@/lib/types";
import { useJson } from "@/lib/use-live";

export function HomeScreen() {
  const dark = useDark();
  const router = useRouter();
  const [here, setHere] = useState<{ lat: number; lon: number } | null>(null);
  const [denied, setDenied] = useState(false);
  const anchor = here ?? BOGOTA;

  const { data: fleet } = useJson<Fleet>("/api/fleet", 15_000);
  const { data: nearby, loading } = useJson<Nearby>(`/api/nearby?lat=${anchor.lat.toFixed(3)}&lon=${anchor.lon.toFixed(3)}`, 60_000);
  const saved = useSaved().filter((item): item is SavedStop => item.type === "stop").slice(0, 5);
  const stops = nearby?.stops ?? [];

  // Only buses on routes that touch the stops on screen: the map stays quiet.
  const buses = useMemo(() => {
    if (!fleet) return [];
    const codes = new Set(stops.flatMap((stop) => stop.routes.map((route) => route.code)));
    return fleet.buses
      .flatMap((bus) => {
        const route = bus.route ? fleet.routes[bus.route] : undefined;
        if (!route?.code || !codes.has(route.code)) return [];
        return [{ id: bus.id, lat: bus.lat, lon: bus.lon }];
      })
      .slice(0, 300);
  }, [fleet, stops]);

  const locate = () => {
    if (!navigator.geolocation) {
      setDenied(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setHere({ lat: position.coords.latitude, lon: position.coords.longitude });
        setDenied(false);
      },
      () => setDenied(true),
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 300_000 },
    );
  };

  return (
    <Shell className="py-8 sm:py-10">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] lg:gap-14">
        <div className="order-2 lg:order-1">
          <Onboarding />

          <h1 className="max-w-[24ch] text-[23px] font-medium leading-[1.15] tracking-[-0.02em]">Todos los buses de Bogotá, ahora.</h1>
          <p className="mt-3 max-w-[46ch] text-[12.5px] leading-relaxed text-quiet">
            TransMilenio y SITP sobre un mismo mapa. Toca un paradero para ver cuánto falta para el próximo bus, o busca una ruta por su código.
          </p>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              router.push("/buscar");
            }}
            className="mt-7"
          >
            <input
              type="search"
              placeholder="Ruta o paradero"
              aria-label="Buscar una ruta o un paradero"
              className="w-full border-b border-line bg-transparent pb-2 text-[15px] outline-none placeholder:text-faint focus:border-foreground"
            />
          </form>

          <FeedLine feed={nearby?.feed} className="mt-3" />

          {saved.length > 0 ? (
            <section className="mt-9">
              <Label>Guardados</Label>
              <ul className="mt-1 divide-y divide-line">
                {saved.map((stop) => (
                  <SavedRow key={stop.id} saved={stop} />
                ))}
              </ul>
            </section>
          ) : null}

          <section className="mt-9">
            <div className="flex items-baseline justify-between gap-4">
              <Label>{here ? "Cerca de ti" : "Cerca del centro"}</Label>
              <TextButton onClick={locate} accent={!here}>
                {here ? "Actualizar ubicación" : "Usar mi ubicación"}
              </TextButton>
            </div>

            {denied ? <p className="mt-2 text-[11.5px] leading-relaxed text-faint">Sin ubicación: esto es lo que hay alrededor del centro de Bogotá. No guardamos nada.</p> : null}

            <ul className="mt-1 divide-y divide-line">
              {loading && stops.length === 0
                ? Array.from({ length: 5 }, (_, index) => (
                    <li key={index} className="py-3">
                      <Bone className="h-3 w-2/3" />
                      <Bone className="mt-2 h-2 w-1/3" />
                    </li>
                  ))
                : stops.map((stop) => <StopRow key={stop.id} stop={stop} />)}
            </ul>
          </section>

          <p className="mt-10 max-w-[52ch] text-[10.5px] leading-relaxed text-faint">
            Datos abiertos de TransMilenio S.A. · Mapa © CARTO, © OpenStreetMap. Los minutos se calculan con la última posición de cada bus.
          </p>
        </div>

        <div className="order-1 lg:order-2">
          <div className="h-[44vh] min-h-[260px] border border-line lg:sticky lg:top-20 lg:h-[calc(100dvh-9rem)]">
            <TransitMap
              dark={dark}
              center={[anchor.lon, anchor.lat]}
              zoom={13.4}
              stops={stops}
              buses={buses}
              fit={!here}
              onStop={(id) => router.push(`/parada/${id}`)}
            />
          </div>
        </div>
      </div>
    </Shell>
  );
}
