"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Result, Trace } from "@/lib/trace";

const MAX_TRACES = 60;

/** Every call the app made, newest first, once each (a shared snapshot keeps its id). */
export function useTraces() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const add = useCallback((incoming: Trace[]) => {
    if (incoming.length === 0) return;
    setTraces((current) => {
      const known = new Set(current.map((t) => t.id));
      const fresh = incoming.filter((t) => !known.has(t.id));
      return fresh.length ? [...fresh.reverse(), ...current].slice(0, MAX_TRACES) : current;
    });
  }, []);
  return { traces, add };
}

export async function getJson<T>(url: string, onTraces: (t: Trace[]) => void, signal?: AbortSignal): Promise<Result<T>> {
  try {
    const res = await fetch(url, { signal, cache: "no-store" });
    const json = (await res.json()) as Result<T>;
    onTraces(json.traces ?? []);
    return json;
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    return { ok: false, error: { code: "network", message: "Sin conexión con el servidor." }, traces: [] };
  }
}

/** Poll `url` every `everyMs` while the tab is visible. */
export function usePoll<T>(url: string | null, everyMs: number, onTraces: (t: Trace[]) => void) {
  const [result, setResult] = useState<Result<T> | null>(null);
  const [loading, setLoading] = useState(false);
  const traces = useRef(onTraces);
  traces.current = onTraces;

  useEffect(() => {
    setResult(null);
    if (!url) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false;
    const run = async () => {
      clearTimeout(timer);
      busy = true;
      if (document.visibilityState === "visible") {
        setLoading(true);
        try {
          const next = await getJson<T>(url, (t) => traces.current(t), controller.signal);
          // Keep showing the last good answer through a failed refresh.
          setResult((prev) => (next.ok || !prev?.ok ? next : prev));
        } catch {
          return;
        } finally {
          setLoading(false);
        }
      }
      busy = false;
      timer = setTimeout(run, everyMs);
    };
    void run();
    const wake = () => {
      if (document.visibilityState === "visible" && !busy) {
        void run();
      }
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [url, everyMs]);

  return { result, loading };
}
