import { useCallback, useEffect, useRef, useState } from 'react';
import { matchIntent, type VoiceIntent } from '../lib/voiceIntent';

interface VoiceAgentOptions {
  onDescribe: () => void;
  onReplay: () => void;
  onTransport: (action: 'play' | 'pause') => void;
  onVolume: (direction: 'up' | 'down') => void;
  onAsk: (query: string) => void;
}

export interface VoiceAgentState {
  supported: boolean;
  listening: boolean;
  liveText: string;
  lastHeard: string;
  error: string | null;
  start: () => void;
  stop: () => void;
}

type Rec = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function createRecognizer(): Rec | null {
  const w = window as any;
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
  if (!Ctor) return null;
  const rec: Rec = new Ctor();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = 'en-US';
  return rec;
}

const COMMAND_WINDOW_MS = 12000;

/**
 * Hands-free voice control.
 *
 * Recognition itself is the browser's built-in Web Speech API (free, no key
 * — Chrome/Edge stream audio to vendor servers; see the privacy note in
 * VoiceBar). Intent matching is 100% local via matchIntent. Only unmatched,
 * substantial speech inside a command window goes to the Mastra agent.
 *
 * Listening requires an explicit tap (mic permission + autoplay policy) and
 * works with the screen ON; playback keeps going with the screen off.
 */
export function useVoiceAgent(opts: VoiceAgentOptions): VoiceAgentState {
  const [supported] = useState(() => createRecognizer() !== null);
  const [listening, setListening] = useState(false);
  const [liveText, setLiveText] = useState('');
  const [lastHeard, setLastHeard] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recRef = useRef<Rec | null>(null);
  const enabledRef = useRef(false);
  const failCount = useRef(0);
  const wakeAt = useRef(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  const handleFinal = useCallback((transcript: string) => {
    setLastHeard(transcript);
    setLiveText('');
    const windowOpen = Date.now() - wakeAt.current < COMMAND_WINDOW_MS;
    const intent: VoiceIntent = matchIntent(transcript, { commandWindowOpen: windowOpen });
    const o = optsRef.current;
    switch (intent.type) {
      case 'wake':
        wakeAt.current = Date.now();
        break;
      case 'describe':
        o.onDescribe();
        break;
      case 'replay':
        o.onReplay();
        break;
      case 'pause':
        o.onTransport('pause');
        break;
      case 'play':
        o.onTransport('play');
        break;
      case 'volume':
        o.onVolume(intent.direction);
        break;
      case 'ask':
        o.onAsk(intent.query);
        break;
      case 'none':
        break;
    }
  }, []);

  const start = useCallback(() => {
    if (!supported) {
      setError('voice control needs Chrome, Edge, or Safari');
      return;
    }
    setError(null);
    failCount.current = 0;
    try {
      const rec = createRecognizer();
      if (!rec) throw new Error('unavailable');
      recRef.current = rec;
      rec.onresult = (e: any) => {
        let interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) handleFinal(r[0].transcript);
          else interim += r[0].transcript;
        }
        setLiveText(interim);
      };
      rec.onerror = (e: any) => {
        const kind = e?.error ?? 'unknown';
        if (kind === 'not-allowed' || kind === 'service-not-allowed') {
          setError('microphone blocked — allow it in the browser address bar, then tap again');
          enabledRef.current = false;
          setListening(false);
          return;
        }
        // 'no-speech' / 'aborted' / network blips: count, restart a few times.
        failCount.current += 1;
        if (failCount.current >= 4) {
          setError('voice keeps dropping — check connection, then tap to retry');
          enabledRef.current = false;
          setListening(false);
        }
      };
      rec.onend = () => {
        // Continuous mode ends on silence/errors — restart while enabled.
        if (enabledRef.current && failCount.current < 4) {
          window.setTimeout(() => {
            try {
              recRef.current?.start();
            } catch {
              // already started — harmless
            }
          }, 250);
        } else {
          setListening(false);
        }
      };
      enabledRef.current = true;
      rec.start();
      setListening(true);
    } catch {
      setError('could not start listening on this device');
      enabledRef.current = false;
      setListening(false);
    }
  }, [supported, handleFinal]);

  const stop = useCallback(() => {
    enabledRef.current = false;
    try {
      recRef.current?.stop();
    } catch {
      // already stopped — harmless
    }
    setListening(false);
    setLiveText('');
  }, []);

  useEffect(() => () => {
    enabledRef.current = false;
    try {
      recRef.current?.abort();
    } catch {
      // unmounting — harmless
    }
  }, []);

  return { supported, listening, liveText, lastHeard, error, start, stop };
}
