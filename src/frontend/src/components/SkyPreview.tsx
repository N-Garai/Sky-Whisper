import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Starfield } from './Starfield';

function dotSize(altitude: number): string {
  if (altitude >= 50) return 'w-3.5 h-3.5';
  if (altitude >= 25) return 'w-3 h-3';
  return 'w-2 h-2';
}

export function SkyPreview({ snapshot, loading }: { snapshot?: any; loading?: boolean }) {
  const [selectedBody, setSelectedBody] = useState<string | null>(null);

  const allBodies = [
    ...(snapshot?.planets || []),
    ...(snapshot?.stars || []),
  ].filter(b => b.visible);

  return (
    <div className="relative w-full max-w-lg mx-auto">
      <div className="relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-b from-indigo-950/80 to-black border border-white/10">
        <Starfield className="opacity-60" />
        {/* Compass edges */}
        <span className="absolute top-1.5 left-1/2 -translate-x-1/2 text-[10px] text-white/30" aria-hidden="true">N</span>
        <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 text-[10px] text-white/30" aria-hidden="true">S</span>
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-white/30" aria-hidden="true">W</span>
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/30" aria-hidden="true">E</span>
        <div className="absolute inset-0">
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className="absolute w-2 h-2 rounded-full bg-white/20 animate-pulse"
                style={{
                  left: `${8 + ((i * 37) % 84)}%`,
                  top: `${12 + ((i * 53) % 70)}%`,
                }}
                aria-hidden="true"
              />
            ))
            : allBodies.map(body => {
              const x = ((body.azimuth_deg || 0) / 360) * 100;
              const y = Math.max(5, 95 - ((body.altitude_deg || 0) / 90) * 90);
              return (
                <span
                  key={body.name}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${x}%`, top: `${y}%` }}
                >
                  <motion.button
                    className={`block rounded-full bg-amber-300 cursor-pointer hover:scale-150 transition-transform ${dotSize(body.altitude_deg || 0)}`}
                    style={{ opacity: body.altitude_deg >= 25 ? 0.95 : 0.6 }}
                    animate={{ scale: selectedBody === body.name ? 1.5 : 1 }}
                    onClick={() => setSelectedBody(body.name)}
                    aria-label={`${body.name} at ${body.altitude_deg} degrees altitude`}
                    title={body.name}
                  />
                </span>
              );
            })}
        </div>
        {snapshot?.moon && (
          <div className="absolute top-4 left-4 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10">
            <p className="text-xs text-amber-300 font-medium">{snapshot.moon.phase_name.replace(/_/g, ' ')}</p>
            <p className="text-xs text-white/60">{Math.round(snapshot.moon.illumination * 100)}% illuminated</p>
          </div>
        )}
      </div>
      <AnimatePresence>
        {selectedBody && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-3 p-4 rounded-xl bg-white/5 backdrop-blur border border-white/10"
          >
            <p className="text-amber-300 font-medium">{selectedBody}</p>
            {allBodies.find(b => b.name === selectedBody) && (
              <p className="text-sm text-white/60 mt-1">
                alt {allBodies.find(b => b.name === selectedBody)!.altitude_deg} deg, az {allBodies.find(b => b.name === selectedBody)!.azimuth_deg} deg
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
