"use client";

import { useSyncExternalStore } from "react";

import type { System } from "@/lib/schemas";
import type { RouteRef, StopRef } from "@/lib/types";

export interface SavedStop {
  type: "stop";
  id: string;
  name: string;
  lat: number;
  lon: number;
  codes: string[];
}

export interface SavedRoute {
  type: "route";
  id: string;
  code: string;
  name: string | null;
  system: System;
}

export type Saved = SavedStop | SavedRoute;

/**
 * Saved stops and routes live in the browser only: no account, nothing sent
 * anywhere. `useSyncExternalStore` keeps every screen in step without a
 * provider, and the server render always sees an empty list.
 */
const KEY = "transmiruta.saved.v1";
const EMPTY: Saved[] = [];

let snapshot: Saved[] | null = null;
const listeners = new Set<() => void>();

function load(): Saved[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as Saved[]) : [];
    return Array.isArray(parsed) ? parsed.filter((item) => item && (item.type === "stop" || item.type === "route")) : [];
  } catch {
    return EMPTY;
  }
}

function get(): Saved[] {
  if (snapshot === null) snapshot = load();
  return snapshot;
}

function write(next: Saved[]) {
  snapshot = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode with storage off: the session still works, it just forgets.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSaved(): Saved[] {
  return useSyncExternalStore(subscribe, get, () => EMPTY);
}

export function useIsSaved(type: Saved["type"], id: string | undefined): boolean {
  return useSaved().some((item) => item.type === type && item.id === id);
}

export function toggleStop(stop: StopRef): boolean {
  const current = get();
  if (current.some((item) => item.type === "stop" && item.id === stop.id)) {
    write(current.filter((item) => !(item.type === "stop" && item.id === stop.id)));
    return false;
  }
  write([...current, { type: "stop", id: stop.id, name: stop.name, lat: stop.lat, lon: stop.lon, codes: stop.routes.slice(0, 6).map((r) => r.code) }]);
  return true;
}

export function toggleRoute(route: RouteRef): boolean {
  const current = get();
  if (current.some((item) => item.type === "route" && item.id === route.id)) {
    write(current.filter((item) => !(item.type === "route" && item.id === route.id)));
    return false;
  }
  write([...current, { type: "route", id: route.id, code: route.code, name: route.name, system: route.system }]);
  return true;
}

export function removeSaved(item: Saved) {
  write(get().filter((saved) => !(saved.type === item.type && saved.id === item.id)));
}
