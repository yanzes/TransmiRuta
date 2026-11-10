"use client";

import { useSyncExternalStore } from "react";

export type Contrast = "system" | "high";

const KEY = "transmiruta.contrast.v1";
const listeners = new Set<() => void>();
let contrast: Contrast = "system";

/** Painting the attribute is all the CSS needs; the store keeps the chip in step. */
function apply(value: Contrast) {
  if (typeof document === "undefined") return;
  if (value === "high") document.documentElement.dataset.contrast = "high";
  else delete document.documentElement.dataset.contrast;
}

function read(): Contrast {
  if (typeof window === "undefined") return "system";
  try {
    return window.localStorage.getItem(KEY) === "high" ? "high" : "system";
  } catch {
    return "system";
  }
}

let loaded = false;

function get(): Contrast {
  if (!loaded) {
    contrast = read();
    apply(contrast);
    loaded = true;
  }
  return contrast;
}

export function useContrast(): Contrast {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get,
    () => "system" as Contrast,
  );
}

export function setContrast(value: Contrast) {
  contrast = value;
  loaded = true;
  apply(value);
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    // Without storage the choice lasts this visit.
  }
  listeners.forEach((listener) => listener());
}
