import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Starfield } from './Starfield';

const COMPASS8 = [
  'north', 'north-east', 'east', 'south-east',
  'south', 'south-west', 'west', 'north-west',
];

function compass8(az: number): string {
  const a = ((az % 360) + 360) % 360;
  return COMPASS8[Math.round(a / 45) % 8];
}

/** Body-relative phrase in the narration's own voice. */
function fistPhrase(alt: number, az: number): string {
  const c = compass8(az);
  if (alt < 10) return `near the ${c} horizon`;
  const f = Math.max(1, Math.round(alt / 10));
  return `${f} ${f === 1 ? 'fist' : 'fists'} above the ${c}`;
}

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
 * Tonight's cast — a live, pannable sky.
 *
 * Drag horizontally to turn a full 360°: the dot field rotates like a
 * compass rose while the readout names the direction you face, so a body
 * on the map can be matched to the real sky. The list below names the
 * cast in the same body-relative language the voice uses.
 */
export function SkyPreview({ snapshot, loading }: { snapshot?: any; loading?: boolean }) {
  const [selectedBody, setSelectedBody] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const mapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startX: number; startOff: number } | null>(null);
  const movedRef = useRef(false);

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

  const wrap = (deg: number) => ((deg % 360) + 360) % 360;
  const posX = (az: number) => (wrap(az + offset) / 360) * 100;
  const facingAz = wrap(180 - offset);

  const onPointerDown = (e: React.PointerEvent) => {
    if (loading) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    movedRef.current = false;
    drag.current = { startX: e.clientX, startOff: offset };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const el = mapRef.current;
    if (!d || !el) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 6) movedRef.current = true;
    setOffset(d.startOff + (dx / el.clientWidth) * 360);
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-lg mx-auto min-w-0"
    >
      <div
        ref={mapRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-b from-indigo-950/80 to-black border border-white/10 cursor-grab active:cursor-grabbing touch-pan-y select-none"
        role="application"
        aria-label="Draggable sky map. Drag sideways to turn 360 degrees."
      >
        <Starfield className="opacity-60" />
        {/* Live facing readout */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-black/55 backdrop-blur-sm px-3.5 py-1.5">
          <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-amber-200/90 whitespace-nowrap">
            Facing {compass8(facingAz)}
          </p>
        </div>
        <p className="absolute bottom-2 left-1/2 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.24em] text-white/30 whitespace-nowrap">
          Drag to look around
        </p>
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
              const y = Math.max(5, 95 - ((body.altitude_deg || 0) / 90) * 90);
              const isLabeled = labeled.some(b => b.name === body.name);
              return (
                <span
                  key={body.name}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${posX(body.azimuth_deg || 0)}%`, top: `${y}%` }}
                >
                  <motion.button
                    className={`block rounded-full bg-amber-300 cursor-pointer hover:scale-150 transition-transform ${dotSize(body.altitude_deg || 0)}`}
                    style={{ opacity: body.altitude_deg >= 25 ? 0.95 : 0.6 }}
                    animate={{ scale: selectedBody === body.name ? 1.5 : 1 }}
                    onClick={() => {
                      if (!movedRef.current) setSelectedBody(body.name);
                    }}
                    aria-label={`${body.name}, ${fistPhrase(body.altitude_deg, body.azimuth_deg)}`}
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
          <div className="absolute bottom-3 left-3 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 border border-white/10">
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
                {fistPhrase(
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
          className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] px-5 py-5 sm:px-6 sm:py-6"
        >
          <p className="font-mono text-[0.58rem] uppercase tracking-[0.24em] text-white/35 mb-1">
            Tonight&rsquo;s Cast
          </p>
          <ul className="divide-y divide-white/[0.06]">
            {listed.map((b, i) => (
              <motion.li
                key={b.name}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.45, delay: 0.2 + i * 0.07 }}
                className="flex items-center justify-between gap-4 py-3"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[0.95rem] font-medium text-white/90">
                    {b.name}
                  </span>
                  {typeof b.magnitude === 'number' && (
                    <span className="mt-0.5 block font-mono text-[10px] tracking-[0.08em] text-white/30">
                      mag {b.magnitude.toFixed(1)}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-right text-[0.8rem] leading-snug text-amber-200/80">
                  {fistPhrase(b.altitude_deg, b.azimuth_deg)}
                </span>
              </motion.li>
            ))}
          </ul>
          {extra > 0 && (
            <p className="mt-3 text-xs leading-relaxed text-white/35">
              +{extra} more bright {extra === 1 ? 'body' : 'bodies'} on the map above — drag to turn, tap any dot.
            </p>
          )}
          {constellations.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
              {constellations.map((c: any) => (
                <span
                  key={c.name}
                  className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/50"
                >
                  {c.name} · From {c.anchor_star}
                </span>
              ))}
            </div>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
