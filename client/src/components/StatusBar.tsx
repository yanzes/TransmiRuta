import { useEffect, useState } from "react";

import { ago, secondsSince } from "../lib/format";
import type { FeedHealth } from "../lib/types";
import type { ConnectionStatus } from "../hooks/useRouteBuses";

interface Props {
  health: FeedHealth | null;
  status: ConnectionStatus;
  buses: number;
  updatedAt: string | null;
  stale: boolean;
  routeCode: string | null;
}

function useNow(everyMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}

export function StatusBar({ health, status, buses, updatedAt, stale, routeCode }: Props) {
  const now = useNow(1_000);
  const age = secondsSince(updatedAt, now);
  const delayed = stale || (health?.consecutiveFailures ?? 0) > 0;

  const dotClass = status === "offline" ? "is-offline" : delayed ? "is-delayed" : status === "live" ? "is-live" : "";

  return (
    <div className="status">
      <span className={`status__dot ${dotClass}`} aria-hidden="true" />
      <span className="status__text">
        {status === "offline"
          ? "Reconectando con el servidor…"
          : routeCode
            ? `${buses} ${buses === 1 ? "bus" : "buses"} en la ruta · ${ago(age)}`
            : "Elige una ruta para ver sus buses"}
      </span>
      {health && (
        <span className="status__meta" title={health.url}>
          {health.vehicles.toLocaleString("es-CO")} vehículos en la ciudad
        </span>
      )}
    </div>
  );
}
