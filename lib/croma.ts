import "server-only";

import type { z } from "zod";

import { apiError } from "@/lib/schemas";
import type { Trace } from "@/lib/trace";

const BASE_URL = process.env.CROMA_API_URL ?? "https://api.croma.run";

export type Call<T> = { ok: true; data: T; trace: Trace } | { ok: false; error: { code: string; message: string }; trace: Trace | null };

/** POST to a Croma endpoint and validate `data` with `schema`. */
export async function croma<S extends z.ZodType>(path: string, body: Record<string, unknown>, schema: S): Promise<Call<z.infer<S>>> {
  const key = process.env.CROMA_API_KEY;
  if (!key) return { ok: false, error: { code: "missing_api_key", message: "Esta parte necesita una CROMA_API_KEY configurada en el servidor." }, trace: null };
  const started = Date.now();
  const at = new Date().toISOString();

  let res: Response;
  let json: unknown;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    json = await res.json().catch(() => null);
  } catch {
    return { ok: false, error: { code: "network", message: "No pudimos llegar a la API. Intenta de nuevo." }, trace: null };
  }

  const trace: Trace = { id: crypto.randomUUID(), at, path, body, status: res.status, ms: Date.now() - started, shared: false };
  const failed = apiError.safeParse(json);
  if (!res.ok || failed.success) {
    return { ok: false, error: failed.success ? failed.data.error : { code: `http_${res.status}`, message: res.statusText }, trace };
  }
  const parsed = schema.safeParse((json as { data?: unknown }).data);
  if (!parsed.success) {
    console.error("Unexpected response shape", path, parsed.error.issues.slice(0, 5));
    return { ok: false, error: { code: "unexpected_response", message: "La respuesta no tiene la forma esperada." }, trace };
  }
  return { ok: true, data: parsed.data, trace };
}

/**
 * Keep one answer per key for `ttlMs`, shared by every visitor of this
 * instance, and join a request already in flight instead of starting another.
 */
export function shared<T>(ttlMs: number) {
  const entries = new Map<string, { at: number; value: Promise<T> }>();
  return (key: string, load: () => Promise<T>, keep: (value: T) => boolean): Promise<{ value: T; fresh: boolean }> => {
    const hit = entries.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value.then((value) => ({ value, fresh: false }));
    const value = load();
    entries.set(key, { at: Date.now(), value });
    return value.then((v) => {
      if (!keep(v)) entries.delete(key);
      return { value: v, fresh: true };
    });
  };
}

export function asShared(traces: Trace[], fresh: boolean): Trace[] {
  return fresh ? traces : traces.map((t) => ({ ...t, shared: true }));
}
