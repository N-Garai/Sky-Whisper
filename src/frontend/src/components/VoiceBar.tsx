import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useVoiceAgent } from '../hooks/useVoiceAgent';
import { WAKE_WORDS } from '../lib/voiceIntent';
import { workingChime, doneChime, errorChime, ensureAudio } from '../lib/chimes';
import { setPlaybackActive, subscribePlayback } from '../lib/audioBus';

interface VoiceBarProps {
  onDescribe: () => void;
  onReplay: () => void;
  onTransport: (action: 'play' | 'pause') => void;
  onVolume: (direction: 'up' | 'down') => void;
  lat: number | null;
  lon: number | null;
}

type AskState = 'idle' | 'thinking' | 'error';

/**
 * Visible follow-up path: type any question (e.g. "tell me more about
 * Jupiter") and it rides the same agent loop as voice, with the previous
 * exchange attached for context. Works on every browser, mic or not.
 */
function FollowUpBox({ onAsk }: { onAsk: (q: string) => void }) {
  const [value, setValue] = useState('');
  return (
    <form
      className="flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const q = value.trim();
        if (q) {
          setValue('');
          onAsk(q);
        }
      }}
    >
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Or type a follow-up…"
        aria-label="Type a follow-up question"
        className="min-w-0 flex-1 px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white/85 text-xs placeholder:text-white/25 focus:border-amber-400 focus:outline-none"
      />
      <button
        type="submit"
        className="shrink-0 px-3 py-2 rounded-lg bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-medium hover:bg-amber-500/30 transition-colors"
      >
        Ask
      </button>
    </form>
  );
}

/**
 * Floating voice control. One tap enables the mic; keywords then act
 * directly (describe / replay / pause), and anything else substantial
 * goes to the agent for a spoken answer.
 *
 * Honest limits, stated in the UI: recognition is the browser's built-in
 * engine (Chrome/Edge send audio to vendor servers), and listening needs
 * the screen on — playback is what survives screen-off.
 */
export function VoiceBar({ onDescribe, onReplay, onTransport, onVolume, lat, lon }: VoiceBarProps) {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState<AskState>('idle');
  const [reply, setReply] = useState<string | null>(null);
  const [replyAudio, setReplyAudio] = useState<string | null>(null);
  const [failReason, setFailReason] = useState<string | null>(null);
  const replyAudioRef = useRef<HTMLAudioElement>(null);
  // Last exchange, so follow-ups ("tell me more about Jupiter") land in
  // context instead of starting cold each time.
  const lastExchange = useRef<{ q: string; a: string } | null>(null);

  const agent = useVoiceAgent({
    onDescribe,
    onReplay,
    // Transport reaches the pack player through App AND this panel's own
    // reply element: without the local half, "stop" pauses nothing while
    // an answer is talking.
    onTransport: (action) => {
      try {
        if (action === 'pause') replyAudioRef.current?.pause();
        else if (replyAudioRef.current?.paused && replyAudioRef.current?.src) {
          void replyAudioRef.current.play().catch(() => {});
        }
      } catch {
        // no reply element — pack player still gets the command below
      }
      onTransport(action);
    },
    onVolume,
    onAsk: (query) => void askAgent(query),
  });

  async function askAgent(query: string) {
    setAsk('thinking');
    setReply(null);
    setReplyAudio(null);
    setFailReason(null);
    // The follow-up takes the stage: silence everything already talking —
    // the pack narration and any previous reply — so two voices never
    // overlap the new answer.
    try {
      replyAudioRef.current?.pause();
    } catch {
      // nothing playing locally
    }
    onTransport('pause');
    // Never answer for a silent default city: without a real fix (or a
    // prepared pack's sky) the reply would describe the wrong sky.
    const qlat = lat;
    const qlon = lon;
    if (qlat === null || qlon === null) {
      setAsk('error');
      errorChime();
      setFailReason(
        'No location yet — share it in Prepare above, or prepare a pack first, so the answer is about your sky.',
      );
      return;
    }
    await ensureAudio();
    workingChime();
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 100000);
    try {
      const res = await fetch('/api/voice/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          latitude: qlat,
          longitude: qlon,
          timestamp: new Date().toISOString(),
          transcript: query,
          history: lastExchange.current ? [lastExchange.current] : [],
        }),
      });
      if (!res.ok) throw new Error(`server ${res.status}`);
      const data = await res.json();
      setReply(typeof data.reply === 'string' && data.reply ? data.reply : null);
      setReplyAudio(typeof data.audioPath === 'string' ? data.audioPath : null);
      setAsk(data.reply ? 'idle' : 'error');
      if (data.reply) {
        doneChime();
        lastExchange.current = { q: query, a: String(data.reply).slice(0, 600) };
      } else {
        errorChime();
        const first = data?.generation?.attempts?.[0];
        setFailReason(
          first ? `${first.stage}: ${first.reason}` : 'empty answer from the server',
        );
      }
    } catch (err) {
      setAsk('error');
      errorChime();
      setFailReason(
        err instanceof DOMException && err.name === 'AbortError'
          ? 'timed out after 100s — the server was still working; try again'
          : 'request failed — check connection and retry',
      );
    } finally {
      window.clearTimeout(timer);
    }
  }

  useEffect(() => {
    if (replyAudio) {
      replyAudioRef.current?.play().catch(() => {
        // Autoplay blocked without a recent tap — the text reply stays visible.
      });
    }
  }, [replyAudio]);

  // The reply element reports to the playback bus like the pack player.
  useEffect(() => {
    const el = replyAudioRef.current;
    if (!el) return;
    const onPlay = () => setPlaybackActive('reply', true);
    const onStop = () => setPlaybackActive('reply', false);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onStop);
    el.addEventListener('ended', onStop);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onStop);
      el.removeEventListener('ended', onStop);
      setPlaybackActive('reply', false);
    };
  }, []);

  // Duck the mic while any voice plays: recognition hears the speaker and
  // answers itself otherwise. Resume afterwards only if it was listening —
  // a manual Stop stays stopped.
  const agentRef = useRef(agent);
  agentRef.current = agent;
  const resumeListening = useRef(false);
  const manualStop = () => {
    resumeListening.current = false;
    agent.stop();
  };
  useEffect(
    () =>
      subscribePlayback((active) => {
        const a = agentRef.current;
        if (active) {
          resumeListening.current = a.listening;
          if (a.listening) a.stop();
        } else if (resumeListening.current) {
          resumeListening.current = false;
          if (a.supported) a.start();
        }
      }),
    [],
  );

  return (
    <div className="fixed bottom-20 right-4 sm:right-6 z-40 flex flex-col items-end gap-3">
      <audio ref={replyAudioRef} src={replyAudio ?? undefined} preload="auto" className="hidden" />

      <AnimatePresence>
        {open && (
          <motion.div
            key="voice-panel"
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="w-72 rounded-2xl border border-white/10 bg-[#0a0f22]/95 backdrop-blur-md p-4 shadow-2xl"
          >
            <p className="font-mono text-[0.58rem] uppercase tracking-[0.24em] text-amber-300/80 mb-2">
              Voice Control
            </p>
            {!agent.supported ? (
              <div className="space-y-3">
                <p className="text-sm text-white/60">
                  Voice control needs Chrome, Edge, or Safari — but you can
                  still ask by typing below.
                </p>
                <FollowUpBox onAsk={(q) => void askAgent(q)} />
                {agent.error && <p className="text-xs text-red-300/80">{agent.error}</p>}
              </div>
            ) : !agent.listening ? (
              <div className="space-y-3">
                <p className="text-sm text-white/60 leading-relaxed">
                  Tap Start, then just talk. Try <span className="text-amber-200">“hey whisper”</span>,
                  then <span className="text-amber-200">“describe the sky”</span>.
                </p>
                <button
                  onClick={agent.start}
                  className="w-full py-2.5 rounded-xl bg-amber-500 text-black font-medium text-sm"
                >
                  Start Listening
                </button>
                {agent.error && <p className="text-xs text-red-300/80">{agent.error}</p>}
              </div>
            ) : (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2" aria-hidden="true">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                  <p className="text-xs text-white/60">
                    {agent.liveText ? `“${agent.liveText}”` : 'Listening…'}
                  </p>
                </div>
                {agent.lastHeard && (
                  <p className="text-[11px] text-white/35 truncate">Heard: {agent.lastHeard}</p>
                )}
                {agent.lastIntent === 'none' && agent.lastHeard && (
                  <p className="text-[11px] leading-relaxed text-amber-200/70">
                    Didn&rsquo;t catch that as a command — but any direct question works too.
                    Try “describe the sky”, ask anything about tonight&rsquo;s sky, or type below.
                  </p>
                )}
                {ask === 'thinking' && <p className="text-xs text-amber-200/80">Asking the agent…</p>}
                {ask === 'error' && (
                  <div className="space-y-1">
                    <p className="text-xs text-red-300/80">The agent didn&rsquo;t answer — try again.</p>
                    {failReason && (
                      <p className="text-[11px] leading-relaxed text-white/40 break-words">{failReason}</p>
                    )}
                  </div>
                )}
                {reply && (
                  <p className="max-h-44 overflow-y-auto text-xs text-white/65 leading-relaxed pr-1">
                    {reply}
                  </p>
                )}
                <FollowUpBox onAsk={(q) => void askAgent(q)} />
                <div className="flex flex-wrap gap-1.5">
                  {['describe the sky', 'tell me about tonight', 'repeat that', 'pause'].map((k) => (
                    <span
                      key={k}
                      className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9px] tracking-[0.08em] text-white/35"
                    >
                      {k}
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={manualStop}
                    className="flex-1 py-2 rounded-lg border border-white/15 text-white/60 text-xs hover:border-white/30"
                  >
                    Stop
                  </button>
                  <button
                    onClick={agent.start}
                    className="flex-1 py-2 rounded-lg border border-white/15 text-white/60 text-xs hover:border-white/30"
                  >
                    Restart
                  </button>
                </div>
              </div>
            )}
            <p className="mt-3 text-[10px] leading-relaxed text-white/25">
              Screen-on listening; playback keeps going with the screen off. Browser speech
              recognition may send audio to vendor servers.
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <motion.button
        onClick={() => {
          if (!open) setOpen(true);
          else if (agent.listening) manualStop();
          else setOpen(false);
          if (!open && agent.supported && !agent.listening) agent.start();
        }}
        className={`relative grid h-14 w-14 place-items-center rounded-full shadow-2xl transition-colors ${
          agent.listening
            ? 'bg-emerald-400 text-black shadow-emerald-400/30'
            : 'bg-amber-500 text-black shadow-amber-500/30'
        }`}
        whileHover={{ scale: 1.06 }}
        whileTap={{ scale: 0.94 }}
        aria-label={agent.listening ? 'Stop voice control' : 'Start voice control'}
        aria-pressed={agent.listening}
      >
        <span className="text-xl" aria-hidden="true">{agent.listening ? '●' : '🎙'}</span>
        {agent.listening && (
          <motion.span
            className="absolute inset-0 rounded-full border border-emerald-300/50"
            animate={{ scale: [1, 1.25, 1], opacity: [0.7, 0, 0.7] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </motion.button>
      <span className="sr-only">Keywords: {WAKE_WORDS.join(', ')}</span>
    </div>
  );
}
