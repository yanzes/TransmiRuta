"use client";

import { Empty, Guide, Label, Shell } from "@/components/app/primitives";
import { RouteRow, SavedRow } from "@/components/app/rows";
import { useSaved, type SavedRoute, type SavedStop } from "@/lib/saved";

export function SavedScreen() {
  const saved = useSaved();
  const stops = saved.filter((item): item is SavedStop => item.type === "stop");
  const routes = saved.filter((item): item is SavedRoute => item.type === "route");

  return (
    <Shell className="max-w-[760px] py-10">
      <h1 className="text-[23px] font-medium tracking-[-0.02em]">Guardados</h1>
      <Guide title="Cómo funciona">
        Todo lo que marques con ☆ queda aquí, en este navegador y sin cuenta: paraderos para ver sus próximos buses y rutas para abrirlas de
        un toque. Se guarda desde la página del paradero o de la ruta, y la misma ☆ lo quita.
      </Guide>

      {saved.length === 0 ? (
        <div className="mt-7">
          <Empty
            title="Nada guardado todavía"
            body="Guarda un paradero para ver sus próximos buses en la página de inicio, o una ruta para abrirla de un toque."
            action={{ label: "Buscar una ruta o un paradero", href: "/buscar" }}
          />
        </div>
      ) : null}

      {stops.length > 0 ? (
        <section className="mt-9">
          <Label>Paraderos</Label>
          <ul className="mt-1 divide-y divide-line">
            {stops.map((stop) => (
              <SavedRow key={stop.id} saved={stop} />
            ))}
          </ul>
        </section>
      ) : null}

      {routes.length > 0 ? (
        <section className="mt-9">
          <Label>Rutas</Label>
          <ul className="mt-1 divide-y divide-line">
            {routes.map((route) => (
              <RouteRow key={route.id} route={route} />
            ))}
          </ul>
        </section>
      ) : null}
    </Shell>
  );
}
