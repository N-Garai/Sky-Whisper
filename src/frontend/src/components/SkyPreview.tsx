import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Starfield } from './Starfield';

function dotSize(altitude: number): string {
  if (altitude >= 50) return 'h-3.5 w-3.5';
  if (altitude >= 25) return 'h-3 w-3';
  return 'h-2 w-2';
}

export function SkyPreview({ snapshot, loading }: { snapshot?: any; loading?: boolean }) {
  const [selectedBody, setSelectedBody] = useState<string | null>(null);

  const allBodies = [
    ...(snapshot?.planets || []),
    ...(snapshot?.stars || []),
  ].filter((b) => b.visible);

  return (
    <div className="relative mx-auto w-full max-w-lg">
      <div className="panel relative aspect-video overflow-hidden !rounded-2xl !bg-gradient-to-b !bg-none p-0">
        {/* Sky backdrop */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#141a3a] via-[#0a0f24] to-[#04060f]" />
        <Starfield className="opacity-55" />

        {/* Altitude grid: two faint arcs + the horizon line */}
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute inset-x-0 bottom-[10%] h-px bg-amber-300/15" />
          <div className="absolute inset-x-[12%] bottom-[36%] h-px bg-white/[0.06]" />
          <div className="absolute inset-x-[26%] bottom-[62%] h-px bg-white/[0.04]" />
        </div>

        {/* Compass edges */}
        {[
          ['N', 'top-1.5 left-1/2 -translate-x-1/2'],
          ['S', 'bottom-1.5 left-1/2 -translate-x-1/2'],
          ['W', 'left-2 top-1/2 -translate-y-1/2'],
          ['E', 'right-2 top-1/2 -translate-y-1/2'],
        ].map(([label, pos]) => (
          <span
            key={label}
            className={`absolute font-mono text-[0.55rem] tracking-[0.15em] text-white/30 ${pos}`}
            aria-hidden="true"
          >
            {label}
          </span>
        ))}

        {/* Bodies */}
        <div className="absolute inset-0">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <span
                  key={i}
                  className="absolute h-2 w-2 animate-pulse rounded-full bg-white/20"
                  style={{
                    left: `${8 + ((i * 37) % 84)}%`,
                    top: `${12 + ((i * 53) % 70)}%`,
                  }}
                  aria-hidden="true"
                />
              ))
            : allBodies.map((body) => {
                const x = ((body.azimuth_deg || 0) / 360) * 100;
                const y = Math.max(5, 95 - ((body.altitude_deg || 0) / 90) * 90);
                return (
                  <span
                    key={body.name}
                    className="absolute -translate-x-1/2 -translate-y-1/2"
                    style={{ left: `${x}%`, top: `${y}%` }}
                  >
                    <motion.button
                      type="button"
                      className={`block cursor-pointer rounded-full bg-amber-300 transition-transform ${dotSize(body.altitude_deg || 0)}`}
                      style={{ opacity: body.altitude_deg >= 25 ? 0.95 : 0.6 }}
                      animate={{ scale: selectedBody === body.name ? 1.6 : 1 }}
                      whileHover={{ scale: 1.5 }}
                      onClick={() => setSelectedBody(body.name)}
                      aria-label={`${body.name} at ${body.altitude_deg} degrees altitude`}
                      title={body.name}
                    />
                  </span>
                );
              })}
        </div>

        {/* Moon readout */}
        {snapshot?.moon && (
          <div className="absolute left-3 top-3 rounded-lg border border-white/10 bg-black/55 px-3 py-2 backdrop-blur-sm">
            <p className="font-mono text-[0.58rem] uppercase tracking-[0.18em] text-amber-300">
              {snapshot.moon.phase_name.replace(/_/g, ' ')}
            </p>
            <p className="num mt-0.5 text-xs text-white/65">
              {Math.round(snapshot.moon.illumination * 100)}% illuminated
            </p>
          </div>
        )}
      </div>

      {/* Selected body readout */}
      <AnimatePresence>
        {selectedBody && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="panel mt-3 p-4"
          >
            <p className="font-display font-medium text-amber-300">{selectedBody}</p>
            {allBodies.find((b) => b.name === selectedBody) && (
              <p className="num mt-1 text-sm text-white/60">
                alt {allBodies.find((b) => b.name === selectedBody)!.altitude_deg}° · az{' '}
                {allBodies.find((b) => b.name === selectedBody)!.azimuth_deg}°
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
