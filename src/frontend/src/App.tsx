import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Starfield } from './components/Starfield';
import { HomePage } from './components/home/HomePage';
import { Nav } from './components/Nav';
import { PrepareCard, PREPARE_STAGES } from './components/PrepareCard';
import { PackPlayer } from './components/PackPlayer';
import { SkyPreview } from './components/SkyPreview';
import { AboutSection } from './components/AboutSection';
import { Footer } from './components/Footer';
import { Eyebrow, Reveal } from './components/home/Constellation';
import { useGeolocation } from './hooks/useGeolocation';

export default function App() {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [packData, setPackData] = useState<any>(null);
  const [duration, setDuration] = useState(90);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [redShift, setRedShift] = useState(false);
  const stageTimer = useRef<number | null>(null);
  const prepareRef = useRef<HTMLElement>(null);
  const listenRef = useRef<HTMLDivElement>(null);
  const geo = useGeolocation();

  // Register the service worker so the pack survives airplane mode.
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // registration failure is non-fatal — the app still works online
      });
    }
    return () => {
      if (stageTimer.current !== null) window.clearInterval(stageTimer.current);
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
      // Bring the listener to the result once it exists.
      window.setTimeout(() => {
        listenRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
    } catch {
      if (stageTimer.current !== null) window.clearInterval(stageTimer.current);
      setStage('');
      setError('The telescope is waking up — free servers nap. Give it about a minute, then try again');
      window.setTimeout(() => setError(null), 8000);
    } finally {
      setLoading(false);
    }
  };

  const hasPack = packData !== null;

  return (
    <div className={`relative min-h-dvh bg-abyss ${redShift ? 'red-shift' : ''}`}>
      {/* ————— background: nebula + living starfield ————— */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div
          className="nebula nebula-a absolute -left-[18%] -top-[22%] h-[46rem] w-[46rem] rounded-full blur-[110px]"
          style={{ background: 'radial-gradient(circle, rgba(109,92,240,0.42), transparent 68%)' }}
        />
        <div
          className="nebula nebula-b absolute -right-[20%] top-[22%] h-[40rem] w-[40rem] rounded-full blur-[120px]"
          style={{ background: 'radial-gradient(circle, rgba(245,201,123,0.20), transparent 66%)' }}
        />
        <div
          className="nebula nebula-c absolute bottom-[-24%] left-[26%] h-[42rem] w-[42rem] rounded-full blur-[130px]"
          style={{ background: 'radial-gradient(circle, rgba(47,42,107,0.62), transparent 70%)' }}
        />
        {/* Vignette keeps text legible over the brightest part of the wash. */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 90% at 50% 40%, transparent 40%, rgba(4,6,15,0.55) 78%, rgba(4,6,15,0.9) 100%)',
          }}
        />
      </div>
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <Starfield />
      </div>

      {/* ————— app ————— */}
      <div className="relative z-10">
        <Nav redShift={redShift} onToggleRedShift={() => setRedShift((v) => !v)} />

        <main>
          <HomePage
            onPrepare={() =>
              document.getElementById('prepare')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
            lat={geo.lat}
            lon={geo.lon}
          />

          {/* ————— PREPARE ————— */}
          <section id="prepare" ref={prepareRef} className="section">
            <div className="shell">
              <div className="grid gap-10 lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-14">
                {/* Form column */}
                <div className="min-w-0">
                  <Eyebrow>Step Two · Before You Leave</Eyebrow>
                  <Reveal delay={0.05}>
                    <h2 className="h-section mt-5 text-white/92">
                      Compute It Now,
                      <br />
                      <span className="text-white/38">So Nothing Glows Later.</span>
                    </h2>
                  </Reveal>
                  <Reveal delay={0.1} className="mt-6">
                    <p className="lead max-w-md">
                      Pick where you&rsquo;ll be standing. The server works out exactly what will be
                      overhead tonight — Sun, Moon, planets, named stars — writes the narration, and
                      seals it into a pack you can carry with no signal at all.
                    </p>
                  </Reveal>

                  {geo.lat !== null && geo.lon !== null && (
                    <Reveal delay={0.16} className="mt-6">
                      <p className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-white/45">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        </span>
                        Location Detected · {geo.lat.toFixed(2)}, {geo.lon.toFixed(2)}
                      </p>
                    </Reveal>
                  )}

                  <Reveal delay={0.22} className="mt-8">
                    <PrepareCard
                      onPrepare={handlePrepare}
                      loading={loading}
                      stage={stage}
                      initialLat={geo.lat}
                      initialLon={geo.lon}
                    />
                  </Reveal>

                  {error !== null && (
                    <p className="mt-4 text-center text-sm text-amber-300/85" role="alert">
                      {error}
                    </p>
                  )}
                </div>

                {/* Result column */}
                <div className="lg:sticky lg:top-28">
                  <AnimatePresence mode="wait">
                    {hasPack ? (
                      <motion.div
                        key="result"
                        initial={{ opacity: 0, y: 24 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -16 }}
                        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                        className="space-y-6"
                      >
                        <div className="text-center lg:text-left">
                          <Eyebrow>Step Three · Outside</Eyebrow>
                          <h3 className="h-display mt-4 text-2xl text-white/92 sm:text-3xl">
                            Your Sky Is Ready.
                          </h3>
                          <p className="copy mt-3 text-sm sm:text-[0.95rem]">
                            Put the phone face-down. We&rsquo;ll talk for {duration === 60 ? 'sixty' : duration === 120 ? 'two' : 'ninety'}{' '}
                            {duration === 120 ? 'minutes' : 'seconds'}, then leave you alone.
                          </p>
                        </div>
                        <PackPlayer
                          audioUrl={packData?.audioPath ?? null}
                          transcriptUrl={packData?.transcriptPath ?? null}
                          packId={packData?.packId ?? null}
                          audioAvailable={Boolean(packData?.audio?.available)}
                           script={packData?.narration?.script || snapshot?.warnings?.[0] || 'Look up tonight.'}
                        />
                        {snapshot && <SkyPreview snapshot={snapshot} />}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="panel grid min-h-[22rem] place-items-center p-8 text-center"
                      >
                        <div>
                          <div className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-full border border-white/10 bg-white/[0.02]">
                            <span className="text-2xl opacity-45" aria-hidden="true">
                              🔭
                            </span>
                          </div>
                          <p className="font-display text-lg text-white/70">Your Sky, Once You Ask For It</p>
                          <p className="copy mx-auto mt-2 max-w-xs text-sm">
                            Nothing appears here until you prepare. The pack is computed, narrated,
                            and sealed before a single star comes out.
                          </p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
          </section>

          <AboutSection />
        </main>

        <Footer />
      </div>
    </div>
  );
}
