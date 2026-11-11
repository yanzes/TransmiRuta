"use client";

import { useEffect, useRef } from "react";

import { Label } from "@/components/app/primitives";
import { finishOnboarding, useOnboarded } from "@/lib/onboarded";

const SECTIONS: [string, string][] = [
  ["Mapa", "El mapa y la lista muestran los paraderos cercanos. Toca uno para ver cuánto falta para el próximo bus."],
  [
    "Buscar",
    "Escribe dos letras: el código que el bus lleva pintado (B10, K305), el nombre de una ruta o el de un paradero. Los resultados llegan separados en Rutas y Paraderos.",
  ],
  ["Guardados", "La ☆ de una ruta o de un paradero lo deja aquí, en este navegador y sin cuenta, para volver de un toque."],
  ["Paradero", "El próximo bus va arriba con los minutos que le faltan; debajo, los que vienen. Filtra por código y actualiza cuando quieras."],
  ["Ruta", "Las paradas en orden del recorrido: toca una para ver sus llegadas. En el mapa, cada bus lleva el código de la ruta que está haciendo."],
];

/**
 * First visit: one window that explains the app, dismissed for good. A dialog
 * rather than a banner because the explanation is the point, not a footnote.
 */
export function Onboarding() {
  const done = useOnboarded();
  const start = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (done) return;
    start.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") finishOnboarding();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [done]);

  if (done) return null;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-background/95 p-4"
      onClick={finishOnboarding}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="w-full max-w-[560px] border border-line bg-background p-6 sm:p-8"
        onClick={(event) => event.stopPropagation()}
      >
        <Label>Primera vez</Label>
        <h2 id="onboarding-title" className="mt-2 text-[21px] font-medium leading-tight tracking-[-0.02em]">
          Cómo se usa TransMiRuta
        </h2>
        <p className="mt-2 max-w-[46ch] text-[12.5px] leading-relaxed text-quiet">
          Todo se hace desde cinco ventanas. La barra de arriba lleva a Mapa, Buscar y Guardados.
        </p>

        <dl className="mt-5 divide-y divide-line border-y border-line">
          {SECTIONS.map(([title, body]) => (
            <div key={title} className="grid gap-1 py-3 sm:grid-cols-[92px_1fr] sm:gap-4">
              <dt className="text-[12.5px] font-medium">{title}</dt>
              <dd className="text-[12px] leading-relaxed text-quiet">{body}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <button
            ref={start}
            type="button"
            onClick={finishOnboarding}
            className="border border-foreground bg-foreground px-4 py-1.5 text-[12px] text-background transition-opacity hover:opacity-90"
          >
            Empezar
          </button>
          <p className="text-[10.5px] text-faint">Se muestra una sola vez.</p>
        </div>
      </div>
    </div>
  );
}
