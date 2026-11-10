"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { FeedLine, Label, Rule, Shell, TextButton } from "@/components/app/primitives";
import { setContrast, useContrast } from "@/lib/appearance";
import type { FeedState, Fleet } from "@/lib/types";
import { useJson } from "@/lib/use-live";
import { cn } from "@/lib/utils";

const PROMISES = [
  ["Sin cuenta", "No hay registro, ni correo, ni contraseña."],
  ["Sin publicidad", "Nada de anuncios ni de rastreo."],
  ["Tu ubicación no se guarda", "Se pide solo al tocar la mira y ordena la lista. No viaja al servidor."],
  ["Honestidad con el dato", "Cada pantalla dice cuándo se actualizó y qué es una estimación."],
];

const THEMES = [
  { value: "system", label: "Sistema" },
  { value: "light", label: "Clara" },
  { value: "dark", label: "Oscura" },
] as const;

export function AboutScreen() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const contrast = useContrast();

  const { data: fleet } = useJson<Fleet>("/api/fleet", 60_000);
  const feed: FeedState | undefined = fleet
    ? { asOf: fleet.asOf, total: fleet.total, live: Date.now() - Date.parse(fleet.asOf) < 10 * 60_000 }
    : undefined;

  return (
    <Shell className="max-w-[720px] py-10">
      <h1 className="text-[23px] font-medium tracking-[-0.02em]">Acerca</h1>
      <p className="mt-3 max-w-[52ch] text-[13.5px] leading-relaxed text-quiet">
        TransMiRuta es un mapa abierto para moverse en Bogotá: los buses de TransMilenio y el SITP, los próximos en cada paradero y el recorrido de
        cada ruta. Datos públicos, sin cuenta y sin publicidad.
      </p>

      <section className="mt-10">
        <Label>Lo que prometemos</Label>
        <dl className="mt-2 divide-y divide-line border-t border-line">
          {PROMISES.map(([title, body]) => (
            <div key={title} className="grid gap-1 py-3 sm:grid-cols-[190px_1fr] sm:gap-6">
              <dt className="text-[13px]">{title}</dt>
              <dd className="text-[12.5px] leading-relaxed text-quiet">{body}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-10">
        <Label>El dato</Label>
        <p className="mt-2 max-w-[54ch] text-[12.5px] leading-relaxed text-quiet">
          Posiciones del feed GTFS-Realtime de TransMilenio y paradas del GTFS público, sin llaves de API. Si el feed deja de publicar, la página lo
          dice en vez de dibujar buses viejos como si fueran actuales.
        </p>
        <FeedLine feed={feed} className="mt-3" />
      </section>

      <section className="mt-10">
        <Label>Apariencia</Label>
        <p className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px]">
          {THEMES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              aria-pressed={mounted && theme === option.value}
              className={cn(
                "underline-offset-4 transition-colors hover:text-foreground",
                mounted && theme === option.value ? "text-foreground underline" : "text-faint",
              )}
            >
              {option.label}
            </button>
          ))}
        </p>
        <p className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px]">
          <TextButton accent={contrast === "high"} onClick={() => setContrast(contrast === "high" ? "system" : "high")}>
            {contrast === "high" ? "Contraste alto activo" : "Activar contraste alto"}
          </TextButton>
        </p>
      </section>

      <section className="mt-10">
        <Label>Proyecto</Label>
        <ul className="mt-2 flex flex-col gap-1.5 text-[12.5px]">
          <li>
            <Link href="/reportar" className="text-accent underline-offset-4 hover:underline">
              Reportar un problema
            </Link>
          </li>
          <li>
            <Link href="/privacidad" className="text-accent underline-offset-4 hover:underline">
              Privacidad
            </Link>
          </li>
          <li>
            <a href="https://github.com/yanzes/TransmiRuta" target="_blank" rel="noreferrer" className="text-accent underline-offset-4 hover:underline">
              Código en GitHub
            </a>
          </li>
        </ul>
      </section>

      <Rule className="mt-10" />
      <p className="mt-4 text-[10.5px] leading-relaxed text-faint">No es una app oficial del Distrito. Mapa © CARTO, © OpenStreetMap.</p>
    </Shell>
  );
}
