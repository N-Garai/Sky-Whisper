import { useState, useEffect, useCallback } from 'react';

interface GeoState {
  lat: number | null;
  lon: number | null;
  error: string | null;
  loading: boolean;
  /** Ask the browser for a fix now (user gesture — best grant rates). */
  request: () => void;
}

export function useGeolocation({ enabled = true }: { enabled?: boolean } = {}): GeoState {
  const [state, setState] = useState<GeoState>({
    lat: null,
    lon: null,
    error: null,
    loading: true,
    request: () => {},
  });

  const request = useCallback(() => {
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: 'geolocation unsupported', loading: false }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState((s) => ({
          ...s,
          lat: Math.round(pos.coords.latitude * 2) / 2, // 0.5° grid
          lon: Math.round(pos.coords.longitude * 2) / 2,
          error: null,
          loading: false,
        }));
      },
      (err) => {
        const reason =
          err.code === err.PERMISSION_DENIED
            ? 'permission denied'
            : err.code === err.TIMEOUT
              ? 'timed out'
              : 'unavailable';
        setState((s) => ({
          ...s,
          lat: null,
          lon: null,
          error: reason,
          loading: false,
        }));
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  useEffect(() => {
    setState((s) => ({ ...s, request }));
  }, [request]);

  // Auto-request on mount only when enabled (the location gate enables it
  // after the user chooses). The gate's own button also calls request()
  // directly, which keeps the browser prompt tied to a tap.
  useEffect(() => {
    if (enabled) request();
  }, [enabled, request]);

  return state;
}
