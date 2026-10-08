import { useEffect } from 'react';

interface MediaSessionOptions {
  title: string;
  artist?: string;
  album?: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
}

/**
 * W3C Media Session API — lock-screen metadata and hardware playback controls
 * while the screen is off. The whole product thesis depends on this: the user
 * must be able to play/pause/seek from the lock screen without lighting it.
 */
export function useMediaSession({ title, artist, album, audioRef }: MediaSessionOptions) {
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;
    const audio = audioRef.current;
    if (!audio) return;

    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title,
        artist: artist || 'SkyWhisper',
        album: album || "Tonight's sky",
        artwork: [
          { src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml' },
        ],
      });
    } catch {
      // MediaMetadata is unavailable — non-fatal.
    }

    const setPlaying = () => { navigator.mediaSession.playbackState = 'playing'; };
    const setPaused = () => { navigator.mediaSession.playbackState = 'paused'; };

    const tryHandler = (action: MediaSessionAction, fn: (e: MediaSessionActionDetails) => void) => {
      try { navigator.mediaSession.setActionHandler(action, fn); } catch { /* unsupported */ }
    };

    tryHandler('play', () => { audio.play().then(setPlaying).catch(() => {}); });
    tryHandler('pause', () => { audio.pause(); setPaused(); });
    tryHandler('stop', () => { audio.pause(); audio.currentTime = 0; setPaused(); });
    tryHandler('seekbackward', (e) => {
      audio.currentTime = Math.max(audio.currentTime - (e.seekOffset || 15), 0);
    });
    tryHandler('seekforward', (e) => {
      audio.currentTime = Math.min(audio.currentTime + (e.seekOffset || 15), audio.duration || 0);
    });

    audio.addEventListener('play', setPlaying);
    audio.addEventListener('pause', setPaused);

    return () => {
      audio.removeEventListener('play', setPlaying);
      audio.removeEventListener('pause', setPaused);
    };
  }, [title, artist, album, audioRef]);
}
