"use client";

import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";
import { isAbort } from "../api/client";

export type ResourceStatus = "loading" | "success" | "error";

export interface Resource<T> {
  status: ResourceStatus;
  /** last good value; kept while a reload is in flight */
  data: T | undefined;
  error: unknown;
  /** true whenever a request is in flight (first load or reload) */
  loading: boolean;
  reload: () => void;
  setData: (updater: (prev: T | undefined) => T | undefined) => void;
}

/**
 * Small data hook: aborts superseded requests, ignores late answers, keeps the last good value while reloading
 * (so sections can show a stale value plus a spinner instead of blanking).
 */
export function useResource<T>(load: (signal: AbortSignal) => Promise<T>, deps: DependencyList, opts: { enabled?: boolean } = {}): Resource<T> {
  const enabled = opts.enabled ?? true;
  const [state, setState] = useState<{ status: ResourceStatus; data: T | undefined; error: unknown }>({
    status: "loading",
    data: undefined,
    error: null,
  });
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    setState((s) => ({ ...s, status: "loading", error: null }));
    loadRef
      .current(ctrl.signal)
      .then((data) => {
        if (!ctrl.signal.aborted) setState({ status: "success", data, error: null });
      })
      .catch((error) => {
        if (ctrl.signal.aborted || isAbort(error)) return;
        setState((s) => ({ status: "error", data: s.data, error }));
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const setData = useCallback((updater: (prev: T | undefined) => T | undefined) => setState((s) => ({ ...s, data: updater(s.data) })), []);

  return { status: state.status, data: state.data, error: state.error, loading: state.status === "loading", reload, setData };
}
