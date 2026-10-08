import { useState, useEffect } from 'react';

interface GeoState {
  lat: number | null;
  lon: number | null;
  error: string | null;
  loading: boolean;
}

export function useGeolocation(): GeoState {
  const [state, setState] = useState<GeoState>({
    lat: null,
    lon: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({ lat: null, lon: null, error: 'geolocation unsupported', loading: false });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState({
          lat: Math.round(pos.coords.latitude * 2) / 2, // 0.5° grid
          lon: Math.round(pos.coords.longitude * 2) / 2,
          error: null,
          loading: false,
        });
      },
      () => {
        setState({ lat: null, lon: null, error: null, loading: false });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  }, []);

  return state;
}