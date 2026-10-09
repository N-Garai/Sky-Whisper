import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Starfield } from './Starfield';
import { altazToFistCompass } from '../lib/altaz';

function dotSize(altitude: number): string {
  if (altitude >= 50) return 'w-3.5 h-3.5';
  if (altitude >= 25) return 'w-3 h-3';
  return 'w-2 h-2';
}

interface Body {
  name: string;
  altitude_deg: number;
  azimuth_deg: number;
  visible: boolean;
  magnitude?: number | null;
}

/**
 * Tonight's cast — the visual twin of the narration. The map shows every
 * visible body; the brightest get name tags right on the map, and the list
 * below names the full cast in the same body-relative language the voice
 * uses ("6 fists above the south-east"), so what you read is what you hear.
 */
export function SkyPreview({ snapshot, loading }: { snapshot?: any; loading?: boolean }) {
  const [selectedBody, setSelectedBody] = useState<string | null>(null);

  const planets: Body[] = (snapshot?.planets ?? []).filter((b: Body) => b.visible);
  const stars: Body[] = (snapshot?.stars ?? [])
    .filter((b: Body) => b.visible)
    .sort((a: Body, b: Body) => (a.magnitude ?? 9) - (b.magnitude ?? 9));
  const constellations: any[] = (snapshot?.constellations ?? []).slice(0, 3);
  const moon = snapshot?.moon;

  const allBodies = [...planets, ...stars];
  const labeled = [...planets.slice(0, 4), ...stars.slice(0, 5)];
  const listed = [...planets.slice(0, 3), ...stars.slice(0, 4)];
  const extra = allBodies.length - listed.length;

  const moonUp = moon && typeof moon.altitude_deg === 'number' && moon.altitude_deg >= 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-lg mx-auto"
    >
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
              const isLabeled = labeled.some(b => b.name === body.name);
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
                  {isLabeled && (
                    <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 whitespace-nowrap font-mono text-[9px] uppercase tracking-[0.14em] text-amber-200/80">
                      {body.name}
                    </span>
                  )}
                </span>
              );
            })}
        </div>
        {moon && (
          <div className="absolute top-3 left-3 sm:top-4 sm:left-4 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10">
            <p className="text-xs text-amber-300 font-medium capitalize">{String(moon.phase_name).replace(/_/g, ' ')}</p>
            <p className="text-xs text-white/60">{Math.round(moon.illumination * 100)}% illuminated</p>
            <p className={`text-[10px] mt-0.5 ${moonUp ? 'text-emerald-300/80' : 'text-white/35'}`}>
              {moonUp ? 'Up now' : 'Below horizon'}
            </p>
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
                {altazToFistCompass(
                  allBodies.find(b => b.name === selectedBody)!.altitude_deg,
                  allBodies.find(b => b.name === selectedBody)!.azimuth_deg,
                )}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* The cast list — every named body, in the voice's own language */}
      {!loading && listed.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
          className="mt-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-sm px-4 py-3 sm:px-5 sm:py-4"
        >
          <p className="font-mono text-[0.58rem] uppercase tracking-[0.24em] text-white/35 mb-2.5">
            Tonight&rsquo;s Cast
          </p>
          <ul className="divide-y divide-white/[0.06]">
            {listed.map((b, i) => (
              <motion.li
                key={b.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.45, delay: 0.2 + i * 0.07 }}
                className="flex items-baseline justify-between gap-3 py-2"
              >
                <span className="min-w-0 truncate text-sm font-medium text-white/85">
                  {b.name}
                  {typeof b.magnitude === 'number' && (
                    <span className="ml-2 font-mono text-[10px] text-white/30">
                      mag {b.magnitude.toFixed(1)}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right text-xs text-amber-200/75">
                  {altazToFistCompass(b.altitude_deg, b.azimuth_deg)}
                </span>
              </motion.li>
            ))}
          </ul>
          {extra > 0 && (
            <p className="mt-2 text-[11px] text-white/35">
              +{extra} more bright {extra === 1 ? 'body' : 'bodies'} on the map above — tap any dot.
            </p>
          )}
          {constellations.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
              {constellations.map((c: any) => (
                <span
                  key={c.name}
                  className="rounded-full border border-white/10 bg-black/30 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-white/50"
                >
                  {c.name} · from {c.anchor_star}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
