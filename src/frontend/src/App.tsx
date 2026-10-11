import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { DynamicSpaceBackground } from './components/DynamicSpaceBackground';
import { HomePage } from './components/home/HomePage';
import { Nav } from './components/Nav';
import { PrepareCard, PREPARE_STAGES } from './components/PrepareCard';
import { PackPlayer } from './components/PackPlayer';
import { SkyPreview } from './components/SkyPreview';
import { AboutSection } from './components/AboutSection';
import { Footer } from './components/Footer';
import { VoiceBar } from './components/VoiceBar';
import { LocationGate } from './components/LocationGate';
import { BlackoutPointerGate } from './components/BlackoutPointer';
import { streamPack } from './lib/packStream';
import { Eyebrow, Reveal } from './components/home/Constellation';
import { useGeolocation } from './hooks/useGeolocation';

function storedLocChoice(): string | null {
  try {
    const v = localStorage.getItem('skywhisper-loc');
    // Only real choices suppress the gate. Anything else (including stale
    // or foreign values under this key) means "not asked yet".
    return v === 'auto' || v === 'manual' ? v : null;
  } catch {
    return null;
  }
}

function rememberLocChoice(value: string) {
  try {
    localStorage.setItem('skywhisper-loc', value);
  } catch {
    // private mode — ask again next visit, harmless
  }
}

export default function App() {
  const [snapshot, setSnapshot] = useState<any>(null);
  const [packData, setPackData] = useState<any>(null);
  const [duration, setDuration] = useState(90);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [redShift, setRedShift] = useState(false);
  const [autoPlayKey, setAutoPlayKey] = useState(0);
  const [pointerOpen, setPointerOpen] = useState(false);
  const [transport, setTransport] = useState<{ action: 'play' | 'pause' | 'volume'; dir?: 'up' | 'down'; n: number } | null>(null);
  const stageTimer = useRef<number | null>(null);
  const prepareRef = useRef<HTMLElement>(null);
  const listenRef = useRef<HTMLDivElement>(null);
  // First-visit location gate: null = not asked yet (modal open).
  const [locChoice, setLocChoice] = useState<string | null>(() => storedLocChoice());
  // Only 'auto' arms background acquisition: manual/later users asked for
  // no prompt, and the gate's tap issues its own request (see the hook —
  // exactly one fix attempt per tap, no duplicate).
  const geo = useGeolocation({ enabled: locChoice === 'auto' });

  // Register the service worker so the pack survives airplane mode.
  useEffect(() => {
    console.info('[SkyWhisper] build', __BUILD_SHA__);
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

    const finish = (pack: any) => {
      setSnapshot(pack.snapshot ?? null);
      setPackData(pack);
      setStage(PREPARE_STAGES[PREPARE_STAGES.length - 1]);
      // Bring the listener to the result once it exists.
      window.setTimeout(() => {
        listenRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 120);
    };
    const fail = () => {
      setStage('');
      setError('The telescope is waking up — free servers nap. Give it about a minute, then try again');
      window.setTimeout(() => setError(null), 8000);
    };

    // Live progress first: the server streams its real stages, which drive
    // the ritual. Any transport failure falls back to the plain POST pack.
    setStage(PREPARE_STAGES[0]);
    let streamed = false;
    try {
      const pack = await streamPack(params, (label) => setStage(label));
      finish(pack);
      streamed = true;
    } catch {
      // Stream unavailable — same pack via POST, timer-driven ritual below.
    } finally {
      setLoading(false);
    }
    if (streamed) return;

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
      finish(pack);
    } catch {
      if (stageTimer.current !== null) window.clearInterval(stageTimer.current);
      fail();
    } finally {
      setLoading(false);
    }
  };

  const hasPack = packData !== null;

  /* ---- voice-agent wiring (M2): keywords act without taps ---- */
  const coords = () => ({
    lat: geo.lat ?? 22.57,
    lon: geo.lon ?? 88.36,
  });

  const voiceDescribe = () => {
    if (hasPack) {
      prepareRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setAutoPlayKey((n) => n + 1);
      return;
    }
    const { lat, lon } = coords();
    void handlePrepare({
      lat,
      lon,
      timestamp: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
      duration: 90,
    }).then(() => setAutoPlayKey((n) => n + 1));
  };

  const voiceReplay = () => {
    if (!hasPack) {
      voiceDescribe();
      return;
    }
    prepareRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setAutoPlayKey((n) => n + 1);
  };

  const voiceTransport = (action: 'play' | 'pause') => {
    if (!hasPack) return;
    prepareRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTransport((t) => ({ action, n: (t?.n ?? 0) + 1 }));
  };

  const voiceVolume = (direction: 'up' | 'down') => {
    if (!hasPack) return;
    setTransport((t) => ({ action: 'volume', dir: direction, n: (t?.n ?? 0) + 1 }));
  };

  /* ---- first-visit location gate ---- */
  const chooseShareLocation = () => {
    rememberLocChoice('auto');
    setLocChoice('auto');
    geo.request(); // direct tap → best permission-grant rates
  };
  const chooseManualLocation = () => {
    rememberLocChoice('manual');
    setLocChoice('manual');
    document.getElementById('prepare')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className={`relative min-h-dvh bg-[#030508] ${redShift ? 'red-shift' : ''}`}>
      {/* ————— dynamic deep-space background ————— */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
        <DynamicSpaceBackground />
      </div>

      {/* ————— app ————— */}
      <div className="relative z-10">
        <Nav redShift={redShift} onToggleRedShift={() => setRedShift((v) => !v)} />

        <main>
          <HomePage
            onPrepare={() =>
              document.getElementById('prepare')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }
          />

          {/* ————— PREPARE ————— */}
          <section id="prepare" ref={prepareRef} className="section">
            <div className="shell">
              <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-start lg:gap-16">
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
                  <Reveal delay={0.1} className="mt-7">
                    <p className="lead max-w-md leading-[1.8]">
                      Pick where you&rsquo;ll be standing. The server works out exactly what will be
                      overhead tonight — Sun, Moon, planets, named stars — writes the narration, and
                      seals it into a pack you can carry with no signal at all.
                    </p>
                  </Reveal>

                  {geo.lat !== null && geo.lon !== null ? (
                    <Reveal delay={0.16} className="mt-6">
                      <p className="inline-flex items-center gap-2.5 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-white/45" title="Your device GPS fix">
                        <span className="relative flex h-1.5 w-1.5">
                          <span className="pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
                          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                        </span>
                        Location Detected · {geo.lat.toFixed(2)}, {geo.lon.toFixed(2)}
                      </p>
                    </Reveal>
                  ) : (
                    <Reveal delay={0.16} className="mt-6">
                      <div className="inline-flex flex-wrap items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-2.5">
                        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${geo.loading ? 'bg-amber-300 animate-pulse' : 'bg-white/30'}`} />
                        </span>
                        <p className="font-mono text-[0.6rem] uppercase tracking-[0.18em] text-white/45">
                          {geo.loading && !geo.retrying
                            ? 'Locating you…'
                            : geo.retrying
                              ? 'Slow fix — retrying with high accuracy…'
                              : geo.error === 'permission denied'
                                ? 'Location blocked — using defaults'
                                : geo.error === 'unavailable'
                                  ? 'No location source — using defaults'
                                  : 'No GPS fix — using defaults'}
                        </p>
                        {!geo.loading && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => geo.request()}
                            className="rounded-full border border-amber-400/40 px-3 py-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-amber-300 hover:bg-amber-400/10 transition-colors"
                          >
                            Retry GPS
                          </button>
                          <button
                            onClick={() => setLocChoice(null)}
                            className="rounded-full border border-white/15 px-3 py-1 font-mono text-[0.6rem] uppercase tracking-[0.18em] text-white/50 hover:border-white/30 hover:text-white/70 transition-colors"
                            title="Reopen the location explainer"
                          >
                            Why Ask?
                          </button>
                        </div>
                      )}
                      </div>
                      {!geo.loading && !geo.retrying && (
                        <p className="mt-2 text-[11px] text-white/35">
                          {geo.error === 'unavailable'
                            ? 'The browser is allowed but the device gave no fix — check the OS location toggle, or type coordinates below.'
                            : 'Allow location in the browser address bar, or type coordinates below.'}
                        </p>
                      )}
                    </Reveal>
                  )}

                  <Reveal delay={0.22} className="mt-9">
                    <PrepareCard
                      onPrepare={handlePrepare}
                      loading={loading}
                      stage={stage}
                      initialLat={geo.lat}
                      initialLon={geo.lon}
                    />
                  </Reveal>

                  {error !== null && (
                    <p className="mt-5 text-center text-sm text-amber-300/85" role="alert">
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
                          generation={packData?.narration?.generation ?? null}
                          autoPlayKey={autoPlayKey}
                          transport={transport}
                        />
                        {snapshot && <SkyPreview snapshot={snapshot} />}
                        {snapshot && (
                          <div className="flex justify-center">
                            <button
                              onClick={() => setPointerOpen(true)}
                              className="rounded-full border border-white/15 px-5 py-2.5 text-xs text-white/60 transition-colors hover:border-amber-400/40 hover:text-amber-300"
                            >
                              Point at the Sky — Dark Compass
                            </button>
                          </div>
                        )}
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

        <VoiceBar
          onDescribe={voiceDescribe}
          onReplay={voiceReplay}
          onTransport={voiceTransport}
          onVolume={voiceVolume}
          lat={geo.lat}
          lon={geo.lon}
        />

        <LocationGate
          open={locChoice === null}
          denied={geo.error === 'permission denied'}
          onShare={chooseShareLocation}
          onManual={chooseManualLocation}
          onDismiss={() => setLocChoice('later')}
        />

        <BlackoutPointerGate
          open={pointerOpen}
          snapshot={snapshot}
          lat={geo.lat ?? 22.57}
          lon={geo.lon ?? 88.36}
          onClose={() => setPointerOpen(false)}
          onTransport={voiceTransport}
          onReplay={() => {
            setPointerOpen(false);
            voiceReplay();
          }}
          transport={transport}
        />
      </div>
    </div>
  );
}
