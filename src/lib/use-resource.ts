import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "./api";

type State<T> = { data: T | undefined; error: string | null; loading: boolean };

/**
 * Minimal data hook: loads on mount and when `key` changes, optional polling while
 * the tab is visible, and `reload()` / `setData()` for optimistic updates.
 */
export function useResource<T>(key: string | null, load: (signal: AbortSignal) => Promise<T>, opts: { pollMs?: number } = {}) {
  const [state, setState] = useState<State<T>>({ data: undefined, error: null, loading: key !== null });
  const loadRef = useRef(load);
  loadRef.current = load;
  const ctrlRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (silent: boolean) => {
      if (key === null) return;
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      if (!silent) setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const data = await loadRef.current(ctrl.signal);
        if (!ctrl.signal.aborted) setState({ data, error: null, loading: false });
      } catch (e) {
        if ((e as Error).name === "AbortError" || ctrl.signal.aborted) return;
        // A failed background refresh keeps the last good data on screen.
        setState((s) => ({ data: s.data, error: silent && s.data !== undefined ? s.error : errorMessage(e), loading: false }));
      }
    },
    [key],
  );

  useEffect(() => {
    void run(false);
    return () => ctrlRef.current?.abort();
  }, [run]);

  useEffect(() => {
    if (!opts.pollMs || key === null) return;
    const tick = () => {
      if (document.visibilityState === "visible") void run(true);
    };
    const id = window.setInterval(tick, opts.pollMs);
    const onVisible = () => document.visibilityState === "visible" && void run(true);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [opts.pollMs, key, run]);

  const setData = useCallback((fn: (d: T | undefined) => T | undefined) => setState((s) => ({ ...s, data: fn(s.data) })), []);
  const reload = useCallback(() => run(true), [run]);
  return { ...state, reload, setData };
}
