import { useRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'framer-motion';

/*
 * Saturn as one SVG: a globe plus a tilted ring disk.
 *
 *  - The ring disk is a set of concentric ellipses sharing one tilted plane.
 *    Its upper arc sits behind the globe and its lower arc sits in front, so
 *    it reads as a disk wrapped around the planet, not a flat strip.
 *  - Clip regions keep the back arc hidden behind the globe and the front
 *    arc unclipped over it. Every ring element is contained in the 400×400
 *    viewBox, so nothing can spill past the element.
 *  - The globe is shaded from an upper-left light and rotates slowly: a
 *    faint limb band drifts across the disc inside the globe clip only.
 *
 * Pointer movement tilts the object with spring damping. Under
 * prefers-reduced-motion nothing moves.
 */

const CX = 200;
const CY = 200;
const R = 90; // globe radius
const TILT = -16; // ring-plane rotation (degrees)
const FLAT = 0.3; // ry / rx — how open the ring plane looks

/** Concentric ring bands (centreline rx, stroke width, colour, opacity). */
const RINGS = [
  { rx: 118, w: 10, color: '#8c8068', op: 0.45 }, // D ring, faint and close
  { rx: 130, w: 14, color: '#a99a78', op: 0.55 }, // C ring, crepe
  { rx: 156, w: 26, color: '#e6d6a8', op: 0.9 }, // B ring, brightest
  { rx: 186, w: 18, color: '#cdbb8e', op: 0.75 }, // A ring, outer
];

function RingSet({ opacity = 1 }: { opacity?: number }) {
  return (
    <g transform={`rotate(${TILT} ${CX} ${CY})`} opacity={opacity}>
      {RINGS.map((r) => (
        <ellipse
          key={r.rx}
          cx={CX}
          cy={CY}
          rx={r.rx}
          ry={r.rx * FLAT}
          fill="none"
          stroke={r.color}
          strokeWidth={r.w}
          strokeOpacity={r.op}
        />
      ))}
    </g>
  );
}

export function Saturn3D({ className = '' }: { className?: string }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotY = useSpring(useTransform(px, [-1, 1], [-12, 12]), { stiffness: 70, damping: 16 });
  const rotX = useSpring(useTransform(py, [-1, 1], [8, -8]), { stiffness: 70, damping: 16 });

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    px.set(((e.clientX - r.left) / r.width) * 2 - 1);
    py.set(((e.clientY - r.top) / r.height) * 2 - 1);
  };
  const onLeave = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`pointer-events-auto relative aspect-square overflow-hidden ${className}`}
      style={{ perspective: '1000px' }}
      aria-hidden="true"
    >
      {/* Warm halo behind the planet, contained by the parent's overflow-hidden */}
      <div
        className="absolute inset-[10%] rounded-full blur-2xl"
        style={{ background: 'radial-gradient(circle, rgba(245,201,123,0.22), transparent 62%)' }}
      />

      <motion.div
        className="absolute inset-0"
        style={{ rotateX: rotX, rotateY: rotY, transformStyle: 'preserve-3d' }}
      >
        <motion.div
          className="absolute inset-0"
          animate={reduce ? undefined : { y: [0, -6, 0] }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        >
          <svg viewBox="0 0 400 400" className="h-full w-full" role="img" aria-label="Saturn">
            <defs>
              <radialGradient id="sat-globe" cx="34%" cy="30%" r="80%">
                <stop offset="0%" stopColor="#fbf0cf" />
                <stop offset="40%" stopColor="#e4cd96" />
                <stop offset="75%" stopColor="#ad8f58" />
                <stop offset="100%" stopColor="#3f3320" />
              </radialGradient>
              <radialGradient id="sat-limb" cx="40%" cy="38%" r="62%">
                <stop offset="60%" stopColor="#000" stopOpacity="0" />
                <stop offset="100%" stopColor="#05060b" stopOpacity="0.7" />
              </radialGradient>
              <clipPath id="sat-globe-clip">
                <circle cx={CX} cy={CY} r={R} />
              </clipPath>
              {/* Back arc: everything above the globe's centre line */}
              <clipPath id="sat-back">
                <rect x="0" y="0" width="400" height={CY} />
              </clipPath>
              {/* Front arc: everything below the centre line */}
              <clipPath id="sat-front">
                <rect x="0" y={CY} width="400" height={CY} />
              </clipPath>
            </defs>

            {/* 1. Back arc of the ring disk, behind the globe */}
            <g clipPath="url(#sat-back)">
              <RingSet opacity={0.85} />
            </g>

            {/* 2. The globe, with a single slow drifting band for rotation */}
            <circle cx={CX} cy={CY} r={R} fill="url(#sat-globe)" />
            <g clipPath="url(#sat-globe-clip)">
              <motion.ellipse
                cx={CX}
                cy={CY - 30}
                rx={R * 1.1}
                ry={10}
                fill="#f6ecc9"
                opacity={0.22}
                animate={reduce ? undefined : { cx: [CX - 40, CX + 40, CX - 40] }}
                transition={{ duration: 60, repeat: Infinity, ease: 'easeInOut' }}
              />
              <circle cx={CX} cy={CY} r={R} fill="url(#sat-limb)" />
            </g>

            {/* 3. Front arc of the ring disk, over the globe */}
            <g clipPath="url(#sat-front)">
              <RingSet />
            </g>
          </svg>
        </motion.div>
      </motion.div>
    </div>
  );
}
