/**
 * Playback activity bus — one sender per audio source, many listeners.
 *
 * The mic must duck while ANY voice plays (pack narration or a follow-up
 * reply), or recognition hears the speaker and answers itself. Emitters
 * call setPlaybackActive with a stable id ('pack', 'reply'); VoiceBar
 * subscribes and pauses/resumes recognition around playback.
 */

type Listener = (active: boolean) => void;

const listeners = new Set<Listener>();
const activeSources = new Set<string>();

export function setPlaybackActive(id: string, on: boolean): void {
  if (on) activeSources.add(id);
  else activeSources.delete(id);
  const anyActive = activeSources.size > 0;
  listeners.forEach((fn) => {
    try {
      fn(anyActive);
    } catch {
      // a broken listener must never mute the bus
    }
  });
}

export function subscribePlayback(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
