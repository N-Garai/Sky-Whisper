import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Starfield } from './components/Starfield';
import { PrepareCard } from './components/PrepareCard';
import { SkyPreview } from './components/SkyPreview';
import { PackPlayer } from './components/PackPlayer';
import { useGeolocation } from './hooks/useGeolocation';

type Page = 'home' | 'prepare' | 'listen' | 'about';

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [snapshot, setSnapshot] = useState<any>(null);
  const [packData, setPackData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [redShift, setRedShift] = useState(false);
  const geo = useGeolocation();

  // Register the service worker so the pack survives airplane mode.
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // registration failure is non-fatal — the app still works online
      });
    }
  }, []);

  const handlePrepare = async (params: { lat: number; lon: number; timestamp: string; duration: number }) => {
    setLoading(true);
    setStage('reading the stars');
    try {
      const res = await fetch('/api/sky/snapshot', {
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
      if (!res.ok) throw new Error('Server unavailable');
      const snap = await res.json();
      setSnapshot(snap);
      setStage('writing the guide');

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
      if (packRes.ok) {
        const pack = await packRes.json();
        setPackData(pack);
      }
      setStage('');
      setPage('listen');
    } catch {
      setStage('the telescope is waking up — about a minute');
      setTimeout(() => setStage(''), 5000);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`relative min-h-screen overflow-hidden ${redShift ? 'filter hue-rotate-[300deg] saturate-150' : ''}`}>
      <Starfield />

      {/* Navigation */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-4">
        <motion.button
          onClick={() => setPage('home')}
          className="text-amber-300 font-medium tracking-wider text-sm"
          whileHover={{ opacity: 0.8 }}
        >
          skywhisper
        </motion.button>
        <div className="flex gap-4 items-center">
          <button
            onClick={() => setRedShift(!redShift)}
            className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-xs cursor-pointer hover:border-red-400/50 transition-colors"
            aria-label="Toggle red-shift night mode"
            title="Red-shift mode preserves dark adaptation"
          >
            {redShift ? '🔴' : '🌙'}
          </button>
          {(['home', 'prepare', 'about'] as Page[]).map(p => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`text-xs cursor-pointer transition-colors ${page === p ? 'text-amber-300' : 'text-white/40 hover:text-white/70'}`}
            >
              {p}
            </button>
          ))}
        </div>
      </nav>

      {/* Pages */}
      <main className="relative z-10 flex flex-col items-center justify-center px-4 pt-8 pb-20">
        <AnimatePresence mode="wait">
          {page === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="text-center max-w-xl"
            >
              <motion.h1
                className="text-5xl md:text-7xl font-bold text-white/90 mb-6 leading-tight"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
              >
                tonight's sky,
                <br />
                <span className="text-amber-300">whispered.</span>
              </motion.h1>
              <p className="text-white/50 text-lg mb-8 leading-relaxed">
                put the phone down. let the sky speak.
              </p>
              <motion.button
                onClick={() => setPage('prepare')}
                className="px-8 py-4 rounded-2xl bg-amber-500 text-black font-semibold text-lg cursor-pointer shadow-lg shadow-amber-500/20"
                whileHover={{ scale: 1.03, boxShadow: '0 0 40px rgba(245,201,123,0.3)' }}
                whileTap={{ scale: 0.97 }}
              >
                prepare my sky
              </motion.button>

              <div className="grid grid-cols-3 gap-4 mt-16">
                {[
                  { icon: '📵', label: 'screen off' },
                  { icon: '📡', label: 'works offline' },
                  { icon: '🔭', label: 'open source' },
                ].map(tile => (
                  <motion.div
                    key={tile.label}
                    className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] backdrop-blur-sm"
                    whileHover={{ y: -2, borderColor: 'rgba(255,255,255,0.12)' }}
                  >
                    <span className="text-2xl">{tile.icon}</span>
                    <p className="text-white/40 text-xs mt-2">{tile.label}</p>
                  </motion.div>
                ))}
              </div>
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
              {geo.lat && geo.lon && (
                <p className="text-white/30 text-xs text-center">
                  location detected: {geo.lat.toFixed(2)}, {geo.lon.toFixed(2)}
                </p>
              )}
              <PrepareCard
                onPrepare={handlePrepare}
                loading={loading}
                stage={stage}
              />
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
                <span className="text-4xl">🎧</span>
              </motion.div>
              <h2 className="text-2xl text-white/80 font-medium">your sky is ready.</h2>
              <p className="text-white/40 text-sm">put the phone face-down. we'll talk for ninety seconds, then leave you alone.</p>
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
              className="max-w-xl text-center space-y-6"
            >
              <h2 className="text-3xl text-white/80 font-medium">about skywhisper</h2>
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
                  one fist-width held at arm's length spans approximately 10 degrees of sky.
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
                className="text-amber-300/60 text-sm cursor-pointer hover:text-amber-300 transition-colors"
              >
                ← back to the sky
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Safety notice */}
      <div className="fixed bottom-4 left-0 right-0 text-center z-20">
        <p className="text-white/20 text-[10px] px-4">
          outdoor safety: do not walk while listening. stay away from roads, water, cliffs, and traffic.
        </p>
      </div>
    </div>
  );
}