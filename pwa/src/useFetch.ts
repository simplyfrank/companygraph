import { useEffect, useState } from "react";

export type FetchState<T> =
  | { status: "loading" }
  | { status: "ok"; data: T }
  | { status: "error"; error: string };

// Architecture: fn receives an AbortSignal so it can pass it to fetch()
// via api.*. When the component unmounts or deps change the controller is
// aborted, which cancels the in-flight HTTP request — not just the React
// state update. AbortError is swallowed silently (it is not an app error).
//
// The signal parameter in fn is optional for backward compatibility:
// - Call sites that pass `(signal) => api.foo(signal)` get full HTTP cancellation.
// - Existing call sites that pass `() => api.foo()` still work and get
//   React-state-level cancellation (no stale state after unmount).
// New call sites should always accept and forward the signal.
export function useFetch<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  deps: ReadonlyArray<unknown> = [],
): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ status: "loading" });
  useEffect(() => {
    const controller = new AbortController();
    setState({ status: "loading" });
    fn(controller.signal).then(
      (data) => { if (!controller.signal.aborted) setState({ status: "ok", data }); },
      (err) => {
        // Swallow cancellations from ANY source, not just this controller:
        // page navigation or the api client's own timeout signal produces an
        // AbortError whose abort was not triggered by our controller, so
        // controller.signal.aborted is false. Rendering it as an app error
        // was the "signal is aborted without reason" leak on nav/unmount.
        if (controller.signal.aborted || (err as Error)?.name === "AbortError") return;
        setState({ status: "error", error: String((err as Error)?.message ?? err) });
      },
    );
    return () => { controller.abort(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return state;
}
