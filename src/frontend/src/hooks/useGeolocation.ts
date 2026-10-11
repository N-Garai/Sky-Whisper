import { useState, useEffect, useCallback, useRef } from 'react';

interface GeoState {
  lat: number | null;
  lon: number | null;
  error: string | null;
  loading: boolean;
  /** True while the automatic high-accuracy second attempt is running. */
  retrying: boolean;
  /** Ask the browser for a fix now (user gesture — best grant rates). */
  request: () => void;
}

const FAST_OPTS: PositionOptions = {
  enableHighAccuracy: false,
  timeout: 10000,
  maximumAge: 300000,
};

const PRECISE_OPTS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 30000,
  maximumAge: 0,
};

function reasonFor(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) return 'permission denied';
  if (err.code === err.TIMEOUT) return 'timed out';
  return 'unavailable';
}

export function useGeolocation({ enabled = true }: { enabled?: boolean } = {}): GeoState {
  const [state, setState] = useState<GeoState>({
    lat: null,
    lon: null,
    error: null,
    loading: false,
    retrying: false,
    request: () => {},
  });
  // Guards against stale callbacks: only the latest request() may settle.
  const attemptRef = useRef(0);
  const mountedRef = useRef(false);

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: 'geolocation unsupported', loading: false, retrying: false }));
      return;
    }
    const attempt = ++attemptRef.current;
    const current = () => attemptRef.current === attempt;
    setState((s) => ({ ...s, loading: true, retrying: false, error: null }));

    const succeed = (pos: GeolocationPosition) => {
      if (!current()) return;
      // Full device precision. The server computes the snapshot from these
      // exact coordinates and snaps ONLY its cache key to a 0.5° grid —
      // rounding here would blur the astronomy and make a good fix look
      // like the sample defaults.
      setState((s) => ({
        ...s,
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        error: null,
        loading: false,
        retrying: false,
      }));
    };
    const fail = (err: GeolocationPositionError, precise: boolean) => {
      if (!current()) return;
      // A first-attempt timeout or unavailable source is worth one automatic
      // retry with the real GPS (high accuracy, fresh fix, longer budget).
      // Permission denial is final — retrying would just re-error silently.
      if (!precise && err.code !== err.PERMISSION_DENIED) {
        setState((s) => ({ ...s, retrying: true }));
        navigator.geolocation.getCurrentPosition(succeed, (e2) => fail(e2, true), PRECISE_OPTS);
        return;
      }
      setState((s) => ({
        ...s,
        lat: null,
        lon: null,
        error: reasonFor(err),
        loading: false,
        retrying: false,
      }));
    };
    navigator.geolocation.getCurrentPosition(succeed, (e) => fail(e, false), FAST_OPTS);
  }, []);

  useEffect(() => {
    setState((s) => ({ ...s, request }));
  }, [request ]);

  // Auto-request on mount only when enabled — never on later enabled flips,
  // so the gate's tap issues exactly one request (best permission-grant
  // rates, no concurrent duplicate fixes).
  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;
    if (enabled) request();
  }, [enabled, request]);

  return state;
}
