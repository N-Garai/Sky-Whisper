/**
 * Status chimes — tiny WebAudio motifs, zero assets, zero network.
 *
 * A short "working" motif masks agent latency, a rising "done" marks
 * arrival, a low blip marks failure. Created lazily on first user gesture
 * so autoplay policy is never tripped. For a spoken "working on it",
 * generate one TTS clip once with a key and drop it in public/audio/.
 */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as any).webkitAudioContext ?? null;
      if (!AC) return null;
      ctx = new AC();
    }
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Unlock audio for a gesture handler: creates the context and waits until
 * it is actually running. Fire-and-forget tones scheduled while suspended
 * play silently — the exact "no working sound" bug. Always await this
 * before the first chime in a tap/keypress handler.
 */
export async function ensureAudio(): Promise<boolean> {
  const ac = audio();
  if (!ac) return false;
  try {
    if (ac.state === 'suspended') await ac.resume();
    return ac.state === 'running';
  } catch {
    return false;
  }
}

function tone(
  frequency: number,
  startIn: number,
  duration: number,
  volume = 0.05,
  type: OscillatorType = 'sine',
): void {
  const ac = audio();
  if (!ac) return;
  try {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const t = ac.currentTime + startIn;
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(ac.destination);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  } catch {
    // Audio unavailable — status stays visual only.
  }
}

/** Two soft rising notes: "heard you, working on it." */
export function workingChime(): void {
  tone(620, 0, 0.14);
  tone(830, 0.13, 0.18);
}

/** Bright arrival: the answer is here. */
export function doneChime(): void {
  tone(740, 0, 0.12);
  tone(988, 0.11, 0.2);
}

/** Low blip: something failed, read the screen. */
export function errorChime(): void {
  tone(220, 0, 0.22, 0.05, 'triangle');
}

/** Single alignment ping for pointer mode; pitch rises as you align. */
export function ping(frequency: number, duration = 0.09): void {
  tone(frequency, 0, duration, 0.045);
}
