"use client";

import { finishOnboarding, useOnboarded } from "@/lib/onboarded";

/** A single line on the first visit, dismissed for good with one tap. */
export function Onboarding() {
  const done = useOnboarded();
  if (done) return null;

  return (
    <div className="mb-7 flex items-start justify-between gap-6 border-b border-line pb-3">
      <p className="max-w-[48ch] text-[12px] leading-relaxed text-quiet">
        Primera vez: toca un paradero en el mapa o en la lista para ver cuánto falta para el próximo bus.
      </p>
      <button type="button" onClick={finishOnboarding} className="shrink-0 text-[11px] text-faint underline-offset-4 hover:text-foreground hover:underline">
        Entendido
      </button>
    </div>
  );
}
