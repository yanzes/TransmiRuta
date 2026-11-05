/** `HH:MM:SS` on Bogotá's clock, from an ISO timestamp the API returns in `-05:00`. */
export function clockOf(iso: string): string {
  const m = /T(\d{2}:\d{2}:\d{2})/.exec(iso);
  return m?.[1] ?? iso;
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function statusText(status: string | null): string {
  if (status === "stopped_at") return "Detenido en";
  if (status === "incoming_at") return "Llegando a";
  return "Va hacia";
}

export function delayText(seconds: number | null): string {
  if (seconds == null) return "Sin horario";
  const minutes = Math.round(seconds / 60);
  if (minutes === 0) return "A tiempo";
  return minutes > 0 ? `${minutes} min tarde` : `${-minutes} min antes`;
}
