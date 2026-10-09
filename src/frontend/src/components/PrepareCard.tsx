import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface PrepareCardProps {
  onPrepare: (params: { lat: number; lon: number; timestamp: string; duration: number }) => void;
  loading: boolean;
  stage: string;
  initialLat?: number | null;
  initialLon?: number | null;
}

export const PREPARE_STAGES = [
  'Reading the Stars',
  'Tracing Constellations',
  'Writing the Guide',
  'Recording the Voice',
  'Sealing the Pack',
];

const DURATIONS = [
  { value: 60, label: '60s', hint: 'A Quick Pass' },
  { value: 90, label: '90s', hint: 'The Standard Tour' },
  { value: 120, label: '120s', hint: 'The Long Look' },
];

/** How long the narration will run, in words. */
const DURATION_WORDS: Record<number, string> = {
  60: 'Sixty Seconds',
  90: 'Ninety Seconds',
  120: 'Two Minutes',
};

export function PrepareCard({ onPrepare, loading, stage, initialLat, initialLon }: PrepareCardProps) {
  const [lat, setLat] = useState('22.57');
  const [lon, setLon] = useState('88.36');
  const [duration, setDuration] = useState(90);
  const [touched, setTouched] = useState(false);

  // Prefill from device geolocation when it arrives — unless the user
  // already typed their own coordinates.
  useEffect(() => {
    if (!touched && initialLat !== null && initialLat !== undefined) setLat(initialLat.toFixed(2));
  }, [initialLat, touched]);
  useEffect(() => {
    if (!touched && initialLon !== null && initialLon !== undefined) setLon(initialLon.toFixed(2));
  }, [initialLon, touched]);

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  const valid =
    Number.isFinite(latNum) && Number.isFinite(lonNum) &&
    latNum >= -90 && latNum <= 90 && lonNum >= -180 && lonNum <= 180;

  const handleSubmit = () => {
    if (!valid || loading) return;
    // Six hours ahead: tonight, not this afternoon.
    const timestamp = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    onPrepare({ lat: latNum, lon: lonNum, timestamp, duration });
  };

  const activeStage = PREPARE_STAGES.indexOf(stage);

  return (
    <div className="panel w-full p-6 sm:p-8 lg:p-10">
      {/* Header */}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="eyebrow mb-3">Step One · At Home, Screen On</p>
          <h2 className="h-display text-2xl text-white/92 sm:text-3xl">Prepare Your Sky</h2>
        </div>
        <p className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-white/35">
          {DURATION_WORDS[duration] ?? `${duration} Seconds`} · Cached Before You Leave
        </p>
      </div>

      {/* Coordinates */}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block min-w-0">
          <span className="field-label">latitude</span>
          <input
            type="number"
            step="0.01"
            min="-90"
            max="90"
            value={lat}
            onChange={(e) => {
              setLat(e.target.value);
              setTouched(true);
            }}
            className="field"
            aria-describedby="lat-help"
          />
        </label>
        <label className="block min-w-0">
          <span className="field-label">longitude</span>
          <input
            type="number"
            step="0.01"
            min="-180"
            max="180"
            value={lon}
            onChange={(e) => {
              setLon(e.target.value);
              setTouched(true);
            }}
            className="field"
            aria-describedby="lon-help"
          />
        </label>
      </div>
      <p id="lat-help" className="mt-2.5 font-mono text-[0.6rem] text-white/28">
        Decimal Degrees · −90 to 90
      </p>

      {/* Duration — segmented control with a sliding indicator */}
      <div className="mt-8">
        <span className="field-label">Narration Length</span>
        <div
          className="relative grid grid-cols-3 gap-1.5 rounded-xl border border-white/10 bg-black/40 p-1.5"
          role="group"
          aria-label="Narration length"
        >
          {DURATIONS.map((d) => {
            const active = duration === d.value;
            return (
              <button
                key={d.value}
                type="button"
                onClick={() => setDuration(d.value)}
                aria-pressed={active}
                className="relative z-10 min-h-[4.4rem] rounded-lg px-2 py-2.5 text-center transition-colors"
              >
                {active && (
                  <motion.span
                    layoutId="duration-pill"
                    className="absolute inset-0 -z-10 rounded-lg bg-amber-300/15 ring-1 ring-amber-300/40"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  />
                )}
                <span
                  className={`block font-display text-sm font-semibold transition-colors ${
                    active ? 'text-amber-300' : 'text-white/55'
                  }`}
                >
                  {d.label}
                </span>
                <span className="mt-0.5 block font-mono text-[0.52rem] uppercase tracking-[0.14em] text-white/30">
                  {d.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Submit */}
      <motion.button
        onClick={handleSubmit}
        disabled={loading || !valid}
        className="btn btn-primary mt-8 w-full"
        whileHover={{ scale: loading || !valid ? 1 : 1.02 }}
        whileTap={{ scale: loading || !valid ? 1 : 0.98 }}
      >
        {loading ? 'Preparing…' : valid ? 'Prepare My Sky' : 'Enter a Valid Location'}
      </motion.button>

      {/* Staged prepare ritual — advances with the real request lifecycle */}
      {loading && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="mt-6 space-y-2.5 overflow-hidden"
          aria-live="polite"
        >
          {PREPARE_STAGES.map((s, i) => {
            const active = stage === s;
            const done = activeStage > i;
            return (
              <motion.div
                key={s}
                className="flex items-center gap-3 text-sm"
                initial={{ opacity: 0.2 }}
                animate={{ opacity: active || done ? 1 : 0.22 }}
                transition={{ duration: 0.4 }}
              >
                <span
                  className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.6rem] ${
                    done
                      ? 'bg-amber-300/25 text-amber-300'
                      : active
                        ? 'ring-1 ring-amber-300/60'
                        : 'ring-1 ring-white/15'
                  }`}
                >
                  {done ? '✦' : active ? '·' : ''}
                </span>
                <span className={active ? 'text-amber-300' : done ? 'text-white/70' : 'text-white/40'}>
                  {s}
                </span>
                {active && (
                  <motion.span
                    className="ml-auto inline-block h-1.5 w-1.5 rounded-full bg-amber-300"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                )}
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
