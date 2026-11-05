/** One API call as the inspector shows it. Built on the server, rendered in the browser. */
export interface Trace {
  id: string;
  at: string;
  path: string;
  body: Record<string, unknown>;
  status: number;
  ms: number;
  /** Calls answered from the app's shared snapshot instead of a fresh request. */
  shared: boolean;
}

export type Result<T> =
  | { ok: true; data: T; traces: Trace[] }
  | { ok: false; error: { code: string; message: string }; traces: Trace[] };
