export function secondsSince(iso: string | null, now = Date.now()): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return Math.max(0, Math.round((now - then) / 1000));
}

export function ago(seconds: number | null): string {
  if (seconds === null) return "sin datos";
  if (seconds < 5) return "ahora";
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `hace ${hours} h`;
}

export function speed(value: number | null): string {
  return value === null ? "sin dato" : `${Math.round(value)} km/h`;
}

const CARDINALS = [
  [22.5, "N"],
  [67.5, "NE"],
  [112.5, "E"],
  [157.5, "SE"],
  [180, "S"],
  [202.5, "SO"],
  [247.5, "O"],
  [292.5, "NO"],
  [337.5, "N"],
] as const;

export function cardinal(bearing: number | null): string {
  if (bearing === null) return "—";
  for (const [limit, label] of CARDINALS) if (bearing < limit) return label;
  return "N";
}

export function statusLabel(status: string | null): string {
  switch (status) {
    case "INCOMING_AT":
      return "Llegando a la estación";
    case "STOPPED_AT":
      return "Detenido en la estación";
    case "IN_TRANSIT_TO":
      return "En camino a la próxima estación";
    default:
      return "En operación";
  }
}

export function systemLabel(system: string): string {
  switch (system) {
    case "troncal":
      return "Troncal";
    case "zonal":
      return "Zonal";
    default:
      return "Otra";
  }
}
