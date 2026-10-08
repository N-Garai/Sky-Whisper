import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Starfield } from './Starfield';

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
        <div className="absolute inset-0">
          {allBodies.map(body => {
            const x = ((body.azimuth_deg || 0) / 360) * 100;
            const y = Math.max(5, 95 - ((body.altitude_deg || 0) / 90) * 90);
            return (
              <motion.button
                key={body.name}
                className="absolute w-3 h-3 rounded-full bg-amber-300 cursor-pointer hover:scale-150 transition-transform"
                style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}
                animate={{ scale: selectedBody === body.name ? 1.5 : 1 }}
                onClick={() => setSelectedBody(body.name)}
                aria-label={`${body.name} at ${body.altitude_deg} degrees altitude`}
              />
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