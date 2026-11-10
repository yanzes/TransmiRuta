"use client";

import { useCallback, useEffect, useState } from "react";

import type { Result } from "@/lib/trace";

/**
 * Poll `url` while the tab is visible and stop when it is not: the server
 * snapshot is shared anyway, and a phone in a pocket should not spend data.
 * A failed refresh keeps the last good answer on screen.
 */
export function useJson<T>(url: string | null, everyMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(url));
  const [attempt, setAttempt] = useState(0);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!url) {
      setData(null);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let busy = false;
    setLoading(true);

    const run = async () => {
      if (document.visibilityState !== "visible") {
        timer = setTimeout(run, 2_000);
        return;
      }
      busy = true;
      try {
        const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
        const json = (await res.json()) as Result<T>;
        if (json.ok) {
          setData(json.data);
          setError(null);
        } else {
          setError(json.error.message);
        }
      } catch (cause) {
        if ((cause as Error).name !== "AbortError") setError("Sin conexión con el servidor.");
      } finally {
        busy = false;
        setLoading(false);
      }
      if (everyMs > 0) timer = setTimeout(run, everyMs);
    };

    void run();
    const wake = () => {
      if (document.visibilityState === "visible" && !busy) void run();
    };
    document.addEventListener("visibilitychange", wake);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [url, everyMs, attempt]);

  return { data, error, loading, reload };
}

/** A ticking number, so "hace 12 s" ages without refetching anything. */
export function useNow(everyMs = 5_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [everyMs]);
  return now;
}
