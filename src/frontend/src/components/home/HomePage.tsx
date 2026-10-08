import { motion, useReducedMotion } from 'framer-motion';
import { Marquee } from './Marquee';
import { Constellation } from './Constellation';
import { TonightStrip } from './TonightStrip';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

function RevealLine({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <span className="block overflow-hidden pb-[0.08em] -mb-[0.08em]">
      <motion.span
        className="block"
        initial={reduce ? { y: '0%', opacity: 1 } : { y: '112%' }}
        animate={{ y: '0%' }}
        transition={{ duration: 1, ease: EASE, delay }}
      >
        {children}
      </motion.span>
    </span>
  );
}

const RITUAL = [
  {
    n: '01',
    title: 'prepare',
    copy: 'at home, screen on. pick a place and a night — the server computes exactly what will be overhead, down to the minute.',
  },
  {
    n: '02',
    title: 'download',
    copy: 'take the pack with you. narration plus transcript, cached on the phone before you leave wifi behind.',
  },
  {
    n: '03',
    title: 'listen',
    copy: 'outside, screen off. earbuds in, phone face-down. lock-screen controls handle pause and rewind.',
  },
];

const FEATURES = [
  {
    n: '01',
    icon: '📵',
    title: 'screen off',
    copy: 'the interface retires after one tap. no glowing rectangle between you and the oldest show there is.',
  },
  {
    n: '02',
    icon: '📡',
    title: 'works offline',
    copy: 'dark sites have no bars by definition. every pack plays from local cache — airplane mode included.',
  },
  {
    n: '03',
    icon: '🔭',
    title: 'open source',
    copy: 'open ephemeris you can check, open weights you can swap, a stack you can self-host. nothing to trust blindly.',
  },
];

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
  const scrollToRitual = () => {
    document
      .getElementById('ritual')
      ?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  return (
    <div className="w-full">
      {/* ————— HERO ————— */}
      <section className="relative flex min-h-[92dvh] flex-col items-center justify-center text-center px-4 pt-10 pb-16">
        <Constellation className="constellation-wrap pointer-events-none absolute right-[-6rem] top-1/2 hidden w-[26rem] -translate-y-1/2 opacity-60 md:block lg:right-[4%] lg:w-[30rem]" />
        <Constellation className="constellation-wrap pointer-events-none absolute left-1/2 top-6 w-64 -translate-x-1/2 opacity-30 md:hidden" />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.15 }}
          className="mb-5 sm:mb-7 text-[11px] sm:text-xs uppercase tracking-[0.4em] text-amber-300/80"
        >
          screenless astronomy · an audio field guide
        </motion.p>

        <h1 className="font-display font-bold text-white/95 leading-[0.95] tracking-tight text-[clamp(3rem,11vw,7.5rem)]">
          <RevealLine delay={0.25}>tonight&rsquo;s sky,</RevealLine>
          <RevealLine delay={0.38}>
            <span className="text-amber-300">whispered.</span>
          </RevealLine>
        </h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.65 }}
          className="mt-5 sm:mt-6 max-w-md text-base sm:text-lg leading-relaxed text-white/50"
        >
          put the phone down. let the sky speak.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: EASE, delay: 0.8 }}
          className="mt-8 sm:mt-10 flex w-full sm:w-auto flex-col sm:flex-row items-stretch sm:items-center gap-3"
        >
          <motion.button
            onClick={onPrepare}
            className="px-9 py-4 rounded-2xl bg-amber-500 text-black font-semibold text-base sm:text-lg shadow-lg shadow-amber-500/20"
            whileHover={{ scale: 1.03, boxShadow: '0 0 44px rgba(245,201,123,0.35)' }}
            whileTap={{ scale: 0.97 }}
          >
            prepare my sky
          </motion.button>
          <button
            onClick={scrollToRitual}
            className="px-9 py-4 rounded-2xl border border-white/15 text-white/70 text-base sm:text-lg hover:border-amber-400/40 hover:text-amber-300 transition-colors"
          >
            see how it works
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.1 }}
          className="mt-10 sm:mt-14 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-[11px] sm:text-xs uppercase tracking-[0.25em] text-white/35"
        >
          <span>90-second narrations</span>
          <span className="text-amber-400/50">✦</span>
          <span>0 network in the field</span>
          <span className="text-amber-400/50">✦</span>
          <span>$0 to run</span>
        </motion.div>

        <motion.button
          onClick={scrollToRitual}
          aria-label="Scroll to how it works"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4, duration: 1 }}
          className="absolute bottom-5 left-1/2 -translate-x-1/2 text-white/30 hover:text-white/60 transition-colors"
        >
          <motion.span
            className="block text-xl"
            animate={reduce ? undefined : { y: [0, 8, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            aria-hidden="true"
          >
            ↓
          </motion.span>
        </motion.button>
      </section>

      <Marquee />

      {/* ————— LIVE STRIP ————— */}
      <section className="px-4 pt-12 sm:pt-16">
        <TonightStrip lat={lat} lon={lon} />
      </section>

      {/* ————— RITUAL ————— */}
      <section id="ritual" className="px-4 pt-16 sm:pt-24 pb-4 scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          <motion.p
            initial={{ opacity: 0, y: 14 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6, ease: EASE }}
            className="text-[11px] sm:text-xs uppercase tracking-[0.4em] text-amber-300/80 mb-3"
          >
            the ritual
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.08 }}
            className="font-display text-3xl sm:text-5xl font-bold text-white/90 leading-tight mb-8 sm:mb-12"
          >
            three steps.
            <br />
            <span className="text-white/40">then no screen at all.</span>
          </motion.h2>

          <div className="grid gap-4 sm:gap-5 md:grid-cols-3">
            {RITUAL.map((r, i) => (
              <motion.article
                key={r.n}
                initial={{ opacity: 0, y: 26 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.7, ease: EASE, delay: i * 0.12 }}
                whileHover={{ y: -4 }}
                className="group rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-sm p-6 sm:p-7 hover:border-amber-400/25 transition-colors"
              >
                <p className="font-display text-amber-400/70 text-sm tracking-[0.3em] mb-4">{r.n}</p>
                <h3 className="font-display text-xl sm:text-2xl text-white/90 mb-3">{r.title}</h3>
                <p className="text-white/50 text-sm leading-relaxed">{r.copy}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      {/* ————— FEATURES ————— */}
      <section className="px-4 pt-14 sm:pt-20 pb-4">
        <div className="max-w-4xl mx-auto grid gap-4 sm:gap-5 sm:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.n}
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.7, ease: EASE, delay: i * 0.12 }}
              whileHover={{ y: -4, borderColor: 'rgba(245,201,123,0.25)' }}
              className="rounded-2xl border border-white/[0.07] bg-gradient-to-b from-white/[0.05] to-transparent p-6 sm:p-7 backdrop-blur-sm transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <span className="text-2xl sm:text-3xl" aria-hidden="true">{f.icon}</span>
                <span className="font-display text-white/25 text-sm tracking-[0.3em]">{f.n}</span>
              </div>
              <h3 className="text-white/85 font-medium mb-2">{f.title}</h3>
              <p className="text-white/45 text-sm leading-relaxed">{f.copy}</p>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ————— MANIFESTO + CTA ————— */}
      <section className="px-4 pt-16 sm:pt-24 pb-20 sm:pb-28">
        <div className="max-w-2xl mx-auto text-center">
          <motion.blockquote
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.8, ease: EASE }}
            className="font-display text-xl sm:text-3xl leading-snug text-white/75"
          >
            &ldquo;your eyes need twenty minutes of darkness.
            <span className="text-amber-300"> one glance at a bright screen resets them.</span>
            &rdquo;
          </motion.blockquote>
          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, delay: 0.15 }}
            className="mt-4 text-white/40 text-sm"
          >
            so the screen was designed out of the experience.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.7, ease: EASE, delay: 0.2 }}
            className="mt-8"
          >
            <motion.button
              onClick={onPrepare}
              className="w-full sm:w-auto px-10 py-4 rounded-2xl bg-amber-500 text-black font-semibold text-lg shadow-lg shadow-amber-500/20"
              whileHover={{ scale: 1.03, boxShadow: '0 0 44px rgba(245,201,123,0.35)' }}
              whileTap={{ scale: 0.97 }}
            >
              ready when the sun is down
            </motion.button>
          </motion.div>
        </div>
      </section>
    </div>
  );
}
