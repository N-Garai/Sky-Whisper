import { useRef } from 'react';
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from 'framer-motion';
import { Constellation, Eyebrow, Reveal, SplitText, GradientReveal } from './Constellation';
import { TonightStrip } from './TonightStrip';

const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

/* Row entrance: each card reveals on its own scroll trigger with a
   staggered delay — no variant propagation, so a stalled parent can
   never swallow the animation. */
function RowCard({
  index,
  className = '',
  children,
}: {
  index: number;
  className?: string;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.article
      initial={reduce ? { opacity: 1, y: 0 } : { opacity: 0, y: 38, filter: 'blur(8px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.9, ease: EASE, delay: reduce ? 0 : index * 0.14 }}
      whileHover={{ y: -5 }}
      className={`group panel min-w-0 overflow-hidden p-8 sm:p-9 ${className}`}
    >
      {children}
    </motion.article>
  );
}

/* ------------------------------------------------------------------ *
 * Hero art — a crescent moon on a tilted orbital plane.
 *
 * Three nested rings carry one satellite each. The ring borders are static
 * (spinning a uniform circle is invisible); each satellite rides a carrier
 * that rotates, so the dots visibly travel their orbits — two clockwise,
 * one counter-clockwise. The whole scope tilts toward the cursor via
 * spring-damped motion values, and the moon breathes on a slow float.
 * ------------------------------------------------------------------ */

const ORBITS = [
  { size: 'clamp(15rem, 26vw, 24rem)', duration: '24s', tilt: 'rotateX(72deg)', reverse: false, dot: 5, glow: 'rgba(231,236,247,0.8)' },
  { size: 'clamp(19rem, 32vw, 30rem)', duration: '36s', tilt: 'rotateX(66deg) rotateY(12deg)', reverse: true, dot: 7, glow: 'rgba(245,201,123,0.9)' },
  { size: 'clamp(23rem, 38vw, 36rem)', duration: '52s', tilt: 'rotateX(78deg) rotateY(-10deg)', reverse: false, dot: 5, glow: 'rgba(231,236,247,0.8)' },
];

function OrbitScope() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // Pointer position normalised to -1..1 around the element centre.
  const px = useMotionValue(0);
  const py = useMotionValue(0);

  const rotateY = useSpring(useTransform(px, [-1, 1], [-18, 18]), { stiffness: 90, damping: 18 });
  const rotateX = useSpring(useTransform(py, [-1, 1], [12, -12]), { stiffness: 90, damping: 18 });

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    px.set(((e.clientX - r.left) / r.width) * 2 - 1);
    py.set(((e.clientY - r.top) / r.height) * 2 - 1);
  };

  const onPointerLeave = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className="pointer-events-auto relative grid aspect-square w-full max-w-[30rem] place-items-center"
      style={{ perspective: '900px' }}
      aria-hidden="true"
    >
      {/* Ambient glow behind the scope */}
      <div className="absolute inset-[12%] rounded-full bg-amber-400/10 blur-3xl" />

      <motion.div
        className="relative grid h-full w-full place-items-center"
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      >
        {/* Rings — static tilted borders, each with a satellite carrier
            that rotates so the dot visibly travels the orbit. */}
        {ORBITS.map((o, i) => (
          <div
            key={i}
            className="absolute rounded-full border"
            style={{
              width: o.size,
              height: o.size,
              borderColor: `rgba(245, 201, 123, ${0.22 - i * 0.045})`,
              transform: `${o.tilt} translateZ(${i * 10}px)`,
              transformStyle: 'preserve-3d',
            }}
          >
            <span
              className="orbit-carrier absolute inset-0"
              style={{
                animation: reduce
                  ? undefined
                  : `${o.reverse ? 'orbit-spin-rev' : 'orbit-spin'} ${o.duration} linear infinite`,
              }}
            >
              <span
                className="absolute block rounded-full"
                style={{
                  left: '50%',
                  top: '-3px',
                  width: o.dot,
                  height: o.dot,
                  transform: 'translate(-50%, -50%)',
                  background: i === 1 ? '#F5C97B' : '#E7ECF7',
                  boxShadow: `0 0 ${i === 1 ? 16 : 10}px ${o.glow}`,
                }}
              />
            </span>
          </div>
        ))}

        {/* The crescent at the centre */}
        <motion.div
          className="relative grid place-items-center"
          style={{ transform: 'translateZ(60px)', transformStyle: 'preserve-3d' }}
          animate={reduce ? undefined : { y: [0, -10, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        >
          <div
            className="relative grid place-items-center rounded-full"
            style={{
              width: 'clamp(7rem, 13vw, 10.5rem)',
              height: 'clamp(7rem, 13vw, 10.5rem)',
              background:
                'radial-gradient(circle at 32% 28%, #2a2350 0%, #131a38 45%, #070b18 100%)',
              boxShadow:
                'inset -14px -10px 34px rgba(0,0,0,0.85), inset 8px 6px 22px rgba(109,92,240,0.16), 0 0 70px -10px rgba(109,92,240,0.45)',
            }}
          >
            {/* Lit crescent */}
            <div
              className="absolute rounded-full"
              style={{
                width: '78%',
                height: '78%',
                background:
                  'radial-gradient(circle at 34% 30%, #FFE7BC 0%, #F5C97B 38%, #D99F4A 100%)',
                boxShadow: '0 0 44px rgba(245,201,123,0.55), inset -8px -6px 18px rgba(0,0,0,0.35)',
                clipPath:
                  'ellipse(100% 100% at 100% 100%)',
                WebkitMaskImage:
                  'radial-gradient(circle at 84% 82%, transparent 58%, #000 58.5%)',
                maskImage:
                  'radial-gradient(circle at 84% 82%, transparent 58%, #000 58.5%)',
              }}
            />
            {/* Terminator highlight */}
            <div
              className="absolute inset-0 rounded-full"
              style={{
                boxShadow: 'inset 6px 4px 16px rgba(255,255,255,0.14)',
              }}
            />
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Copy
 * ------------------------------------------------------------------ */

const STATS: Array<{ value: string; label: string }> = [
  { value: '90s', label: 'Narrations' },
  { value: '0', label: 'Network in the field' },
  { value: '$0', label: 'To run' },
];

const RITUAL = [
  {
    n: '01',
    title: 'Prepare',
    copy: 'At home, screen on. Pick a place and a night — the server computes exactly what will be overhead, down to the minute.',
  },
  {
    n: '02',
    title: 'Download',
    copy: 'Take the pack with you. Narration plus transcript, cached on the phone before you leave wifi behind.',
  },
  {
    n: '03',
    title: 'Listen',
    copy: 'Outside, screen off. Earbuds in, phone face-down. Lock-screen controls handle pause and rewind.',
  },
];

const FEATURES = [
  {
    n: '01',
    icon: '📵',
    title: 'Screen Off',
    copy: 'The interface retires after one tap. No glowing rectangle between you and the oldest show there is.',
  },
  {
    n: '02',
    icon: '📡',
    title: 'Works Offline',
    copy: 'Dark sites have no bars by definition. Every pack plays from local cache — airplane mode included.',
  },
  {
    n: '03',
    icon: '🔭',
    title: 'Open Source',
    copy: 'Open ephemeris you can check, open weights you can swap, a stack you can self-host. Nothing to trust blindly.',
  },
];

/** Scroll cue: a hairline that grows, then a dot that travels down it. */
function ScrollCue({ onClick }: { onClick: () => void }) {
  const reduce = useReducedMotion();
  return (
    <button
      onClick={onClick}
      aria-label="Scroll to see how it works"
      className="group absolute bottom-6 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2"
    >
      <span className="eyebrow !text-[0.55rem] !tracking-[0.3em] opacity-60 transition-opacity group-hover:opacity-100">
        scroll
      </span>
      <span className="relative block h-12 w-px overflow-hidden bg-white/12">
        {!reduce && (
          <motion.span
            className="absolute inset-x-0 top-0 block h-4 bg-gradient-to-b from-transparent via-amber-300 to-transparent"
            animate={{ y: [-16, 48] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
          />
        )}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */

export function HomePage({
  onPrepare,
  lat,
  lon,
}: {
  onPrepare: () => void;
  lat: number | null;
  lon: number | null;
}) {
  const reduce = useReducedMotion();
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] });
  const heroY = useTransform(scrollYProgress, [0, 1], ['0%', '18%']);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.85], [1, 0]);

  const scrollTo = (id: string) => () =>
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });

  return (
    <div className="w-full">
      {/* ————— HERO ————— */}
      <section
        id="home"
        ref={heroRef}
        className="relative flex min-h-[100svh] flex-col justify-center overflow-hidden pb-16 pt-28 sm:pt-32"
      >
        <Constellation className="pointer-events-none absolute -right-24 top-1/2 hidden w-[30rem] -translate-y-1/2 opacity-40 md:block lg:right-[2%] lg:w-[34rem]" />
        <Constellation className="pointer-events-none absolute left-1/2 top-10 w-56 -translate-x-1/2 opacity-20 md:hidden" />

        <motion.div
          className="shell relative z-10"
          style={reduce ? undefined : { y: heroY, opacity: heroOpacity }}
        >
          <div className="grid items-center gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-6">
            {/* — copy column — */}
            <div className="text-center lg:text-left">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: EASE, delay: 0.1 }}
                className="mb-6 flex justify-center lg:justify-start"
              >
                <span className="eyebrow inline-flex items-center gap-2.5 rounded-full border border-amber-300/20 bg-amber-300/[0.06] px-4 py-2">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="pulse-ring absolute inline-flex h-full w-full rounded-full bg-amber-300" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-amber-300" />
                  </span>
                  screenless astronomy · an audio field guide
                </span>
              </motion.div>

              <h1 className="h-display text-white/95" style={{ fontSize: 'var(--fs-hero)' }}>
                <SplitText text="Tonight’s Sky," delay={0.22} as="span" />
                <br />
                <GradientReveal text="Whispered." delay={0.45} className="font-accent pr-[0.12em]" />
              </h1>

              <motion.p
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.72 }}
                className="lead mx-auto mt-6 max-w-md lg:mx-0"
              >
                Put the phone down. Let the sky speak.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.9, ease: EASE, delay: 0.86 }}
                className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-center lg:justify-start"
              >
                <button onClick={onPrepare} className="btn btn-primary">
                  Prepare My Sky
                </button>
                <button onClick={scrollTo('ritual')} className="btn btn-ghost">
                  See How It Works
                </button>
              </motion.div>

              {/* Stats row */}
              <motion.dl
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1, delay: 1.05 }}
                className="mt-11 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 lg:justify-start"
              >
                {STATS.map((s, i) => (
                  <div key={s.label} className="flex items-baseline gap-2">
                    <dt className="num text-xl font-semibold text-amber-300 sm:text-2xl">{s.value}</dt>
                    <dd className="font-mono text-[0.6rem] uppercase tracking-[0.22em] text-white/45">
                      {s.label}
                    </dd>
                    {i < STATS.length - 1 && (
                      <span className="ml-4 hidden text-amber-400/40 sm:inline" aria-hidden="true">
                        ✦
                      </span>
                    )}
                  </div>
                ))}
              </motion.dl>
            </div>

            {/* — 3D scope column — */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1.4, ease: EASE, delay: 0.35 }}
              className="flex justify-center lg:justify-end"
            >
              <OrbitScope />
            </motion.div>
          </div>
        </motion.div>

        <ScrollCue onClick={scrollTo('ritual')} />
      </section>

      {/* ————— LIVE STRIP ————— */}
      <section className="section !py-14 sm:!py-16">
        <div className="shell">
          <TonightStrip lat={lat} lon={lon} />
        </div>
      </section>

      {/* ————— RITUAL ————— */}
      <section id="ritual" className="section">
        <div className="shell">
          <div className="max-w-3xl">
            <Eyebrow>The Ritual</Eyebrow>
            <h2 className="h-section mt-5 text-white/92">
              <SplitText text="Three Steps." as="span" />
              <br />
              <span className="text-white/38">
                <SplitText text="Then No Screen At All." as="span" delay={0.12} />
              </span>
            </h2>
          </div>

          <div className="mt-12 grid gap-5 sm:gap-6 md:grid-cols-3">
            {RITUAL.map((r, i) => (
              <RowCard key={r.n} index={i}>
                <div className="mb-6 flex items-center justify-between">
                  <span className="num text-sm tracking-[0.3em] text-amber-300/80">{r.n}</span>
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-amber-300/50 transition-all duration-500 group-hover:scale-150 group-hover:bg-amber-300"
                    aria-hidden="true"
                  />
                </div>
                <h3 className="h-display mb-3.5 text-xl text-white/92 sm:text-2xl">{r.title}</h3>
                <p className="copy text-sm leading-relaxed">{r.copy}</p>
              </RowCard>
            ))}
          </div>
        </div>
      </section>

      {/* ————— FEATURES ————— */}
      <section className="section">
        <div className="shell">
          <div className="grid gap-5 sm:gap-6 md:grid-cols-3">
            {FEATURES.map((f, i) => (
              <RowCard key={f.n} index={i}>
                <div className="mb-6 flex items-start justify-between">
                  <span className="text-2xl sm:text-3xl" aria-hidden="true">
                    {f.icon}
                  </span>
                  <span className="num text-sm tracking-[0.3em] text-white/25">{f.n}</span>
                </div>
                <h3 className="mb-2.5 text-lg font-semibold text-white/90">{f.title}</h3>
                <p className="copy text-sm leading-relaxed">{f.copy}</p>
              </RowCard>
            ))}
          </div>
        </div>
      </section>

      {/* ————— MANIFESTO + CTA ————— */}
      <section className="section">
        <div className="shell">
          <Reveal className="mx-auto max-w-2xl text-center">
            <div className="rule-shimmer mx-auto mb-10 w-full max-w-xs" />
            <blockquote className="h-display text-white/78" style={{ fontSize: 'var(--fs-h3)' }}>
              &ldquo;Your eyes need twenty minutes of darkness.{' '}
              <GradientReveal
                text="One glance at a bright screen resets them."
                delay={0.15}
                duration={1}
                className="font-accent"
              />
              &rdquo;
            </blockquote>
            <p className="copy mt-5 text-sm">So the screen was designed out of the experience.</p>
            <button onClick={onPrepare} className="btn btn-primary mt-9">
              Ready When the Sun Is Down
            </button>
          </Reveal>
        </div>
      </section>
    </div>
  );
}
