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
  'reading the stars',
  'tracing constellations',
  'writing the guide',
  'recording the voice',
  'sealing the pack',
];

export function PrepareCard({ onPrepare, loading, stage, initialLat, initialLon }: PrepareCardProps) {
  const [lat, setLat] = useState('22.57');
  const [lon, setLon] = useState('88.36');
  const [duration, setDuration] = useState(90);
  const [touched, setTouched] = useState(false);

  // Prefill from device geolocation when it arrives — unless the user
  // already typed their own coordinates.
  useEffect(() => {
    if (!touched && initialLat !== null && initialLat !== undefined) {
      setLat(initialLat.toFixed(2));
    }
  }, [initialLat, touched]);
  useEffect(() => {
    if (!touched && initialLon !== null && initialLon !== undefined) {
      setLon(initialLon.toFixed(2));
    }
  }, [initialLon, touched]);

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);
  const valid =
    Number.isFinite(latNum) && Number.isFinite(lonNum) &&
    latNum >= -90 && latNum <= 90 && lonNum >= -180 && lonNum <= 180;

  const handleSubmit = () => {
    if (!valid || loading) return;
    const timestamp = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    onPrepare({ lat: latNum, lon: lonNum, timestamp, duration });
  };

  return (
    <div className="w-full max-w-lg mx-auto p-5 sm:p-6 rounded-2xl bg-white/5 backdrop-blur border border-white/10">
      <h2 className="font-display text-lg text-amber-300 mb-4">prepare your sky</h2>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <label className="block min-w-0">
          <span className="text-xs text-white/50">latitude</span>
          <input
            type="number" step="0.01" min="-90" max="90" value={lat}
            onChange={e => { setLat(e.target.value); setTouched(true); }}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white/90 text-sm focus:border-amber-400 focus:outline-none"
          />
        </label>
        <label className="block min-w-0">
          <span className="text-xs text-white/50">longitude</span>
          <input
            type="number" step="0.01" min="-180" max="180" value={lon}
            onChange={e => { setLon(e.target.value); setTouched(true); }}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-white/90 text-sm focus:border-amber-400 focus:outline-none"
          />
        </label>
      </div>

      <div className="flex gap-2 mb-5" role="group" aria-label="Narration length">
        {[60, 90, 120].map(d => (
          <button
            key={d}
            onClick={() => setDuration(d)}
            aria-pressed={duration === d}
            className={`flex-1 py-2 rounded-lg text-sm border transition-colors ${
              duration === d
                ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                : 'bg-black/30 border-white/10 text-white/50 hover:border-white/25'
            }`}
          >
            {d}s
          </button>
        ))}
      </div>

      <motion.button
        onClick={handleSubmit}
        disabled={loading || !valid}
        className="w-full py-3 rounded-xl bg-amber-500 text-black font-medium disabled:opacity-60"
        whileHover={{ scale: loading || !valid ? 1 : 1.02 }}
        whileTap={{ scale: loading || !valid ? 1 : 0.98 }}
      >
        {loading ? 'preparing…' : valid ? 'prepare my sky' : 'enter a valid location'}
      </motion.button>

      {/* Staged prepare ritual — advances with the real request lifecycle */}
      {loading && (
        <div className="mt-5 space-y-2" aria-live="polite">
          {PREPARE_STAGES.map((s, i) => {
            const active = stage === s;
            const done = PREPARE_STAGES.indexOf(stage) > i;
            return (
              <motion.div
                key={s}
                className="flex items-center gap-3 text-sm"
                initial={{ opacity: 0.25 }}
                animate={{ opacity: active || done ? 1 : 0.25 }}
                transition={{ duration: 0.4 }}
              >
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] ${
                  done ? 'bg-amber-500/30 text-amber-300' : active ? 'border border-amber-400/60' : 'border border-white/15'
                }`}>
                  {done ? '✦' : active ? '·' : ''}
                </span>
                <span className={active ? 'text-amber-300' : done ? 'text-white/70' : 'text-white/40'}>
                  {s}
                </span>
                {active && (
                  <motion.span
                    className="ml-auto inline-block w-1.5 h-1.5 rounded-full bg-amber-400"
                    animate={{ opacity: [0.2, 1, 0.2] }}
                    transition={{ duration: 1.2, repeat: Infinity }}
                  />
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
