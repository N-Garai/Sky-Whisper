import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Starfield } from './components/Starfield';
import { HomePage } from './components/home/HomePage';
import { PrepareCard, PREPARE_STAGES } from './components/PrepareCard';
import { SkyPreview } from './components/SkyPreview';
import { PackPlayer } from './components/PackPlayer';
import { useGeolocation } from './hooks/useGeolocation';

type Page = 'home' | 'prepare' | 'listen' | 'about';

const DURATION_WORDS: Record<number, string> = {
  60: 'sixty seconds',
  90: 'ninety seconds',
  120: 'two minutes',
};

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [snapshot, setSnapshot] = useState<any>(null);
  const [packData, setPackData] = useState<any>(null);
  const [duration, setDuration] = useState(90);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [redShift, setRedShift] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const stageTimer = useRef<number | null>(null);
  const geo = useGeolocation();

  // Register the service worker so the pack survives airplane mode.
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // registration failure is non-fatal — the app still works online
      });
    }
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      if (stageTimer.current !== null) window.clearInterval(stageTimer.current);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  const handlePrepare = async (params: { lat: number; lon: number; timestamp: string; duration: number }) => {
    setLoading(true);
    setError(null);
    setDuration(params.duration);
    // The ritual advances on its own while the server works; the final
    // stage lands only when the pack is truly ready.
    let step = 0;
    setStage(PREPARE_STAGES[0]);
    stageTimer.current = window.setInterval(() => {
      step = Math.min(step + 1, PREPARE_STAGES.length - 2);
      setStage(PREPARE_STAGES[step]);
    }, 1600);
    try {
      // One call does everything: the pack endpoint already computes the
      // snapshot, narrates, renders audio, and returns all three. A second
      // snapshot call would double the work on a 0.1-vCPU server.
      const packRes = await fetch('/api/packs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: params.lat,
          longitude: params.lon,
          elevation_meters: 0,
          timestamp: params.timestamp,
          timezone: 'UTC',
          duration_seconds: params.duration,
        }),
      });
      if (!packRes.ok) throw new Error(`Server answered ${packRes.status}`);
      const pack = await packRes.json();
      if (stageTimer.current !== null) window.clearInterval(stageTimer.current);
      setSnapshot(pack.snapshot ?? null);
      setPackData(pack);
      setStage(PREPARE_STAGES[PREPARE_STAGES.length - 1]);
      setPage('listen');
    } catch {
      if (stageTimer.current !== null) window.clearInterval(stageTimer.current);
      setStage('');
      setError('the telescope is waking up — free servers nap, give it about a minute, then try again');
      window.setTimeout(() => setError(null), 8000);
    } finally {
      setLoading(false);
    }
  };

  const durationWords = DURATION_WORDS[duration] ?? `${duration} seconds`;

  return (
    <div className={`relative min-h-dvh overflow-hidden bg-[#050814] ${redShift ? 'red-shift' : ''}`}>
      {/* Aurora wash behind the starfield */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="aurora absolute -top-32 -left-24 h-96 w-96 rounded-full bg-indigo-700/20 blur-3xl" />
        <div
          className="aurora absolute top-1/3 -right-28 h-[28rem] w-[28rem] rounded-full bg-amber-500/10 blur-3xl"
          style={{ animationDelay: '-13s' }}
        />
      </div>
      <Starfield />

      {/* Navigation */}
      <nav className={`sticky top-0 z-10 flex items-center justify-between px-4 sm:px-6 py-4 transition-colors ${
        scrolled ? 'bg-[#050814]/75 backdrop-blur-md border-b border-white/[0.06]' : 'border-b border-transparent'
      }`}>
        <motion.button
          onClick={() => setPage('home')}
          className="font-display text-amber-300 font-medium tracking-wider text-sm"
          whileHover={{ opacity: 0.8 }}
        >
          skywhisper
        </motion.button>
        <div className="flex gap-3 sm:gap-4 items-center">
          <button
            onClick={() => setRedShift(!redShift)}
            className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-xs hover:border-red-400/50 transition-colors"
            aria-label="Toggle red-shift night mode"
            aria-pressed={redShift}
            title="Red-shift mode preserves dark adaptation"
          >
            {redShift ? '🔴' : '🌙'}
          </button>
          {(['home', 'prepare', 'about'] as Page[]).map(p => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`text-xs transition-colors ${page === p ? 'text-amber-300' : 'text-white/40 hover:text-white/70'}`}
            >
              {p}
            </button>
          ))}
        </div>
      </nav>

      {/* Pages */}
      <main className="relative z-10 flex flex-col items-center justify-center px-4 pt-6 sm:pt-8 pb-24">
        <AnimatePresence mode="wait">
          {page === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full"
            >
              <HomePage onPrepare={() => setPage('prepare')} lat={geo.lat} lon={geo.lon} />
            </motion.div>
          )}

          {page === 'prepare' && (
            <motion.div
              key="prepare"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-2xl space-y-6"
            >
              {geo.lat !== null && geo.lon !== null && (
                <p className="text-white/30 text-xs text-center">
                  location detected: {geo.lat.toFixed(2)}, {geo.lon.toFixed(2)} — prefilled below
                </p>
              )}
              <PrepareCard
                onPrepare={handlePrepare}
                loading={loading}
                stage={stage}
                initialLat={geo.lat}
                initialLon={geo.lon}
              />
              {error !== null && (
                <p className="text-center text-amber-300/80 text-sm" role="alert">
                  {error}
                </p>
              )}
              {snapshot && <SkyPreview snapshot={snapshot} loading={loading} />}
            </motion.div>
          )}

          {page === 'listen' && (
            <motion.div
              key="listen"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg text-center space-y-6"
            >
              <motion.div
                className="w-24 h-24 mx-auto rounded-full border-2 border-amber-400/30 flex items-center justify-center"
                animate={{ boxShadow: ['0 0 0px rgba(245,201,123,0)', '0 0 30px rgba(245,201,123,0.2)', '0 0 0px rgba(245,201,123,0)'] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                <span className="text-4xl" aria-hidden="true">🎧</span>
              </motion.div>
              <h2 className="font-display text-2xl text-white/80 font-medium">your sky is ready.</h2>
              <p className="text-white/40 text-sm">
                put the phone face-down. we&rsquo;ll talk for {durationWords}, then leave you alone.
              </p>
              <PackPlayer
                audioUrl={packData?.audioPath ?? null}
                transcriptUrl={packData?.transcriptPath ?? null}
                packId={packData?.packId ?? null}
                audioAvailable={Boolean(packData?.audio?.available)}
                script={packData?.narration?.script || snapshot?.warnings?.[0] || 'look up tonight.'}
              />
              {snapshot && <SkyPreview snapshot={snapshot} />}
            </motion.div>
          )}

          {page === 'about' && (
            <motion.div
              key="about"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-xl w-full text-center space-y-6"
            >
              <h2 className="font-display text-2xl sm:text-3xl text-white/80 font-medium">about skywhisper</h2>
              <div className="text-left space-y-4 text-white/50 text-sm leading-relaxed">
                <p>
                  human eyes need 20–30 minutes of darkness for rod cells to fully adapt.
                  a single glance at a bright screen resets that adaptation. skywhisper moves
                  all computation before your outing so the screen stays off in the field.
                </p>
                <p>
                  celestial coordinates are computed deterministically using open-source
                  ephemeris libraries. an open-weight language model narrates only verified facts.
                  audio is synthesized before you leave home. outside, you just listen.
                </p>
                <p>
                  one fist-width held at arm&rsquo;s length spans approximately 10 degrees of sky.
                  directions are given in body-relative terms, never raw coordinates.
                </p>
                <div className="pt-4 border-t border-white/10">
                  <p className="text-white/30 text-xs">
                    built with open-source astronomy engines, open-weight language models,
                    and deployed on free-tier infrastructure. no tracking, no accounts, no ads.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPage('home')}
                className="text-amber-300/60 text-sm hover:text-amber-300 transition-colors"
              >
                ← back to the sky
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Safety notice */}
      <div className="safe-bottom fixed bottom-0 left-0 right-0 z-20 bg-gradient-to-t from-black/80 to-transparent pt-6 pb-4">
        <p className="text-center text-white/20 text-[10px] px-4">
          outdoor safety: do not walk while listening. stay away from roads, water, cliffs, and traffic.
        </p>
      </div>
    </div>
  );
}
