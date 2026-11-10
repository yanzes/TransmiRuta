"use client";

import { useSyncExternalStore } from "react";

const KEY = "transmiruta.onboarded.v1";
const listeners = new Set<() => void>();

let done = false;
let loaded = false;

function get(): boolean {
  if (!loaded && typeof window !== "undefined") {
    try {
      done = window.localStorage.getItem(KEY) === "1";
    } catch {
      done = false;
    }
    loaded = true;
  }
  return done;
}

export function useOnboarded(): boolean {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get,
    () => true,
  );
}

export function finishOnboarding() {
  done = true;
  loaded = true;
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    // Private mode: the intro shows again next time, which is harmless.
  }
  listeners.forEach((listener) => listener());
}
