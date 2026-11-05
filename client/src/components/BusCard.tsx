import { ago, cardinal, secondsSince, speed, statusLabel } from "../lib/format";
import type { Bus } from "../lib/types";

interface Props {
  bus: Bus | null;
  speedAvailable: boolean;
  bearingAvailable: boolean;
  onClose: () => void;
}

export function BusCard({ bus, speedAvailable, bearingAvailable, onClose }: Props) {
  if (!bus) return null;
  const age = secondsSince(bus.reportedAt);

  return (
    <section className="bus-card" aria-live="polite">
      <header className="bus-card__head">
        <div>
          <p className="eyebrow">Bus seleccionado</p>
          <h2 className="bus-card__title">
            {bus.label}
            <span className="bus-card__route">{bus.routeCode}</span>
          </h2>
        </div>
        <button type="button" className="bus-card__close" onClick={onClose} aria-label="Cerrar detalle del bus">
          ×
        </button>
      </header>

      <dl className="bus-card__grid">
        <div>
          <dt>Velocidad</dt>
          <dd>{speedAvailable ? speed(bus.speedKmh) : "sin dato"}</dd>
        </div>
        <div>
          <dt>Rumbo</dt>
          <dd>{bearingAvailable && bus.bearing !== null ? `${cardinal(bus.bearing)} · ${Math.round(bus.bearing)}°` : "sin dato"}</dd>
        </div>
        <div>
          <dt>Placa</dt>
          <dd>{bus.plate ?? "—"}</dd>
        </div>
        <div>
          <dt>Último reporte</dt>
          <dd>{ago(age)}</dd>
        </div>
      </dl>

      <p className="bus-card__status">{statusLabel(bus.status)}</p>
      {bus.routeName && <p className="bus-card__name">{bus.routeName}</p>}
    </section>
  );
}
