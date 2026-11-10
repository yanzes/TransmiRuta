const ZONE = "America/Bogota";

const timeFormat = new Intl.DateTimeFormat("es-CO", { hour: "numeric", minute: "2-digit", timeZone: ZONE });
const hourFormat = new Intl.DateTimeFormat("es-CO", { hour: "numeric", hourCycle: "h23", timeZone: ZONE });
const dayFormat = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "long", timeZone: ZONE });

/** `HH:MM` on Bogotá's clock, whatever the phone's timezone is. */
export function clock(iso: string): string {
  return timeFormat.format(new Date(iso));
}

/** `HH:MM:SS` straight out of the feed, for the compact status lines. */
export function clockOf(iso: string): string {
  const m = /T(\d{2}:\d{2}:\d{2})/.exec(iso);
  return m?.[1] ?? clock(iso);
}

/** "hace 12 s", "hace 3 min", "hace 2 h": how old the data is, in words. */
export function since(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `${dayFormat.format(new Date(iso))}, ${clock(iso)}`;
}

export function greeting(now = new Date()): string {
  const hour = Number(hourFormat.format(now));
  if (hour < 5) return "Buenas noches";
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

/** Metres as a walk: "a 3 min" under a kilometre, "1,2 km" after that. */
export function distanceText(metres: number | null | undefined): string {
  if (metres == null) return "";
  if (metres < 1000) {
    const minutes = Math.max(1, Math.round(metres / 75));
    return `a ${minutes} min`;
  }
  return `${(metres / 1000).toLocaleString("es-CO", { maximumFractionDigits: 1 })} km`;
}

/** Minutes as the one number a rider came for. */
export function minutesText(minutes: number | null | undefined): string {
  if (minutes == null) return "–";
  return minutes <= 0 ? "Ya" : String(minutes);
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function statusText(status: string | null): string {
  if (status === "STOPPED_AT" || status === "stopped_at") return "Detenido en";
  if (status === "INCOMING_AT" || status === "incoming_at") return "Llegando a";
  return "Va hacia";
}

/** "K635 · HK635" reads as one route with two directions. */
export function splitName(name: string | null | undefined): string {
  if (!name) return "";
  return name.split("||")[0].trim();
}
