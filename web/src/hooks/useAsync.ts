import { useEffect, useState } from 'react';

export interface AsyncState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
}

/**
 * Minimal fetch-on-mount state. Nothing here needs a data-fetching library.
 *
 * A refetch keeps whatever is already on screen instead of blanking it. Clearing
 * `data` first would collapse the caller to its empty/loading state and then
 * re-expand — a visible flash and layout jump on every navigation, for a request
 * that usually takes a few milliseconds.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });

  useEffect(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, error: null, loading: true }));

    load().then(
      (data) => !cancelled && setState({ data, error: null, loading: false }),
      (error: Error) => !cancelled && setState({ data: null, error, loading: false }),
    );

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}
