import { motion, useReducedMotion, type MotionProps } from 'framer-motion';

/* ==================================================================
   Motion primitives
   ------------------------------------------------------------------
   Small, composable pieces shared by every section. Each one respects
   prefers-reduced-motion by rendering its final state immediately.
   ================================================================== */

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Framer transition used across the app so every reveal feels identical. */
export const REVEAL_TRANSITION = { duration: 0.85, ease: EASE } as const;

/**
 * Split a string into words, then animate each word up behind a mask —
 * rising from a soft blur into full sharpness (the showcase reveal).
 * Words (not characters) keep line-breaking sane on every viewport.
 */
export function SplitText({
  text,
  className = '',
  delay = 0,
  stagger = 0.055,
  as: Tag = 'span',
  once = true,
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
  as?: 'span' | 'p' | 'h1' | 'h2' | 'h3';
  once?: boolean;
}) {
  const reduce = useReducedMotion();
  const words = text.split(' ');
  const MotionTag = motion[Tag] as typeof motion.span;

  return (
    <MotionTag className={className} aria-label={text}>
      {words.map((word, i) => (
        <span key={`${word}-${i}`} className="reveal-mask" aria-hidden="true">
          <motion.span
            className="reveal-inner"
            initial={reduce ? { y: 0, opacity: 1 } : { y: '108%', opacity: 0, filter: 'blur(14px)' }}
            animate={{ y: '0%', opacity: 1, filter: 'blur(0px)' }}
            viewport={once ? { once: true, margin: '-8% 0px' } : undefined}
            transition={{ duration: 0.95, ease: EASE, delay: delay + i * stagger }}
          >
            {word}
            {i < words.length - 1 ? '\u00A0' : ''}
          </motion.span>
        </span>
      ))}
    </MotionTag>
  );
}

/**
 * Gradient accent line — one masked span that rises from a blur while its
 * golden glow blooms around it.
 *
 * The gradient, the transparent clip, AND the animated filter all live on
 * the same element on purpose: `background-clip: text` on a parent cannot
 * paint through filtered descendants, so nesting animated words inside a
 * gradient wrapper renders permanently invisible. Single element, no bug.
 */
export function GradientReveal({
  text,
  className = '',
  delay = 0,
  duration = 1.15,
}: {
  text: string;
  className?: string;
  delay?: number;
  duration?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <span className="reveal-mask-wide" aria-label={text}>
      <motion.span
        aria-hidden="true"
        className={`reveal-inner bg-gradient-to-br from-[#FFE9C4] via-amber-300 to-amber-deep bg-clip-text text-transparent ${className}`}
        initial={
          reduce
            ? false
            : {
                y: '108%',
                opacity: 0,
                filter: 'blur(16px) drop-shadow(0 0 0px rgba(245,201,123,0))',
              }
        }
        animate={{
          y: '0%',
          opacity: 1,
          filter: 'blur(0px) drop-shadow(0 0 22px rgba(245,201,123,0.45))',
        }}
        transition={{ duration, ease: EASE, delay }}
      >
        {text}
      </motion.span>
    </span>
  );
}

/**
 * Generic in-view reveal. Wrap any block; it fades and lifts into place.
 */export function Reveal({
  children,
  delay = 0,
  y = 26,
  className = '',
  once = true,
  ...rest
}: {
  children: React.ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
} & MotionProps) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-10% 0px -8% 0px' }}
      transition={{ duration: 0.8, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/**
 * Section eyebrow: a monospace label with a drawn rule beside it.
 * The rule grows as the section enters view.
 */
export function Eyebrow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`flex items-center gap-3 ${className}`}
      initial={{ opacity: 0, x: -10 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true, margin: '-12% 0px' }}
      transition={{ duration: 0.7, ease: EASE }}
    >
      <motion.span
        className="block h-px w-8 origin-left bg-amber-300/70 sm:w-12"
        initial={reduce ? { scaleX: 1 } : { scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, margin: '-12% 0px' }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.1 }}
      />
      <span className="eyebrow">{children}</span>
    </motion.div>
  );
}

/* ==================================================================
   Constellation — abstract seven-star figure that draws itself once,
   then settles behind the headline. Pure SVG + CSS, no assets.
   ================================================================== */

const POINTS: Array<[number, number]> = [
  [52, 308],
  [118, 244],
  [182, 254],
  [242, 202],
  [304, 212],
  [344, 148],
  [298, 84],
];

const SEGMENTS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6],
];

export function Constellation({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 400"
      className={className}
      aria-hidden="true"
      focusable="false"
      preserveAspectRatio="xMidYMid meet"
    >
      {SEGMENTS.map(([a, b], i) => {
        const [x1, y1] = POINTS[a];
        const [x2, y2] = POINTS[b];
        const len = Math.hypot(x2 - x1, y2 - y1);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            className="constellation-line"
            style={{
              strokeDasharray: len,
              strokeDashoffset: len,
              animationDelay: `${0.55 + i * 0.2}s`,
            }}
          />
        );
      })}
      {POINTS.map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={i === 3 ? 4.5 : 2.8}
          className="constellation-star"
          style={{ animationDelay: `${0.55 + i * 0.2}s` }}
        />
      ))}
    </svg>
  );
}
