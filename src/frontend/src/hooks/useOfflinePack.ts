import { useCallback, useState } from 'react';

type OfflineStatus = 'idle' | 'caching' | 'cached' | 'error';

interface OfflinePack {
  audioBlob: Blob | null;
  transcript: string | null;
  status: OfflineStatus;
  bytes: number;
  error: string | null;
}

/**
 * Download a pack into browser storage so it plays with no network.
 *
 * The service worker holds the audio in its pack cache (stale-while-revalidate),
 * and we keep the transcript in component state. After `cached`, the user can
 * switch to airplane mode and still listen — that is the field promise.
 */
export function useOfflinePack() {
  const [state, setState] = useState<OfflinePack>({
    audioBlob: null,
    transcript: null,
    status: 'idle',
    bytes: 0,
    error: null,
  });

  const download = useCallback(async (packId: string, audioUrl: string | null, transcriptUrl: string | null) => {
    setState({ audioBlob: null, transcript: null, status: 'caching', bytes: 0, error: null });
    try {
      let audioBlob: Blob | null = null;
      let bytes = 0;

      if (audioUrl) {
        const res = await fetch(audioUrl);
        if (!res.ok) throw new Error(`audio fetch failed (${res.status})`);
        audioBlob = await res.blob();
        bytes = audioBlob.size;
      }

      let transcript: string | null = null;
      if (transcriptUrl) {
        const res = await fetch(transcriptUrl);
        if (res.ok) transcript = await res.text();
      }

      setState({ audioBlob, transcript, status: 'cached', bytes, error: null });
    } catch (err) {
      setState({
        audioBlob: null,
        transcript: null,
        status: 'error',
        bytes: 0,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  const reset = useCallback(() => {
    setState({ audioBlob: null, transcript: null, status: 'idle', bytes: 0, error: null });
  }, []);

  return { ...state, download, reset };
}
