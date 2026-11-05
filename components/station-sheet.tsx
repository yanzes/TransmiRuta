"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { LiveDot } from "@/components/panels";
import { usePoll } from "@/components/use-live";
import { clockOf, delayText } from "@/lib/format";
import { systemColor } from "@/lib/systems";
import type { Trace } from "@/lib/trace";
import type { Arrivals, Station } from "@/lib/types";
import { cn } from "@/lib/utils";

export function StationSheet({ station, onClose, onTraces, dark }: { station: Station | null; onClose: () => void; onTraces: (t: Trace[]) => void; dark: boolean }) {
  const { result } = usePoll<Arrivals>(station ? `/api/arrivals?stop_id=${encodeURIComponent(station.id)}` : null, 20_000, onTraces);
  const arrivals = result?.ok ? result.data.arrivals : [];

  return (
    <Sheet open={station != null} onOpenChange={(open) => (open ? null : onClose())}>
      <SheetContent side="right" className="w-full gap-0 border-line p-0 data-[side=right]:sm:max-w-md">
        <SheetHeader className="border-b border-line px-6 pt-6 pb-5">
          <div className="flex items-center gap-2">
            <LiveDot />
            <span className="eyebrow">Próximos buses</span>
          </div>
          <SheetTitle className="mt-2 text-2xl font-semibold tracking-tight">{station?.name}</SheetTitle>
          <SheetDescription className="font-mono text-[11px]">
            {result?.ok ? `Calculado a las ${clockOf(result.data.as_of)} · se actualiza cada 20 s` : "Leyendo los buses que vienen…"}
          </SheetDescription>
          {station && station.routes.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-1">
              {station.routes.slice(0, 24).map((r) => (
                <span key={r} className="border border-line px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {r}
                </span>
              ))}
              {station.routes.length > 24 ? <span className="px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">+{station.routes.length - 24}</span> : null}
            </div>
          ) : null}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {!result ? (
            <div className="space-y-px">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : !result.ok ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">{result.error.message}</p>
          ) : arrivals.length === 0 ? (
            <p className="px-6 py-8 text-sm text-muted-foreground">Ningún bus viene hacia esta estación en las próximas dos horas.</p>
          ) : (
            <ol>
              {arrivals.map((a, i) => {
                const late = (a.delay_seconds ?? 0) >= 120;
                return (
                  <li key={`${a.route_id}-${a.vehicle_label}-${i}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 border-b border-line px-6 py-3.5">
                    <span
                      className="min-w-12 px-1.5 py-1 text-center font-mono text-xs font-semibold text-background"
                      style={{ background: systemColor(a.system ?? "other", dark) }}
                    >
                      {a.route_code ?? "?"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm">{a.route_name?.split("||").pop()?.trim() ?? "Sin nombre"}</p>
                      <p className="mt-0.5 font-mono text-[10.5px] text-muted-foreground">
                        <span className={cn(late && "text-foreground")}>{delayText(a.delay_seconds)}</span>
                        {a.vehicle_label ? ` · ${a.vehicle_label}` : ""}
                        {a.basis === "estimated" ? " · estimado" : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl leading-none font-semibold tracking-tight tabular-nums">{a.minutes_away != null && a.minutes_away <= 0 ? "Ya" : (a.minutes_away ?? "?")}</p>
                      <p className="mt-1 eyebrow-sm">{a.minutes_away != null && a.minutes_away <= 0 ? "llegando" : "min"}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
        <p className="border-t border-line px-6 py-3 text-[11px] leading-relaxed text-muted-foreground">
          Estimado desde la última parada que reportó cada bus y el tiempo de recorrido programado. <span className="font-mono">POST /co/transmilenio/stop-arrivals/v1</span>
        </p>
      </SheetContent>
    </Sheet>
  );
}
