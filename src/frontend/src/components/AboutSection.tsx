import { useEffect, useRef, useState } from 'react';
import {
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from 'framer-motion';
import { Eyebrow, Reveal, SplitText, GradientReveal } from './home/Constellation';
import { ScrollReveal } from './ScrollReveal';

const CARDS = [
  {
    n: '01',
    title: 'Darkness Is the Product',
    copy: 'Rod cells need twenty to thirty unbroken minutes of darkness to reach full sensitivity. One bright glance resets that clock to zero — so every calculation happens before you step outside.',
  },
  {
    n: '02',
    title: 'Numbers Are Computed, Never Guessed',
    copy: 'Positions come from open-source ephemeris libraries, run deterministically and cross-checked. The model may only narrate verified facts — each number checked before audio renders.',
  },
  {
    n: '03',
    title: 'Directions You Can Actually Use',
    copy: 'One fist-width held at arm’s length spans roughly ten degrees of sky, so that is the unit. Every direction is body-relative — never a raw coordinate.',
  },
  {
    n: '04',
    title: 'Open by Default',
    copy: 'Every dependency is open source, every weight is open, and the whole stack self-hosts. Nothing to trust blindly — read the code, check the maths, or run your own.',
    cta: true,
  },
];

const FACTS: Array<[string, string]> = [
  ['Ephemeris', 'Open-source engine, cross-checked against an independent implementation'],
  ['Narration', 'An open-weight model, constrained to verified facts'],
  ['Audio', 'Synthesised at home, played back from the local cache'],
  ['Runtime', 'Free-tier infrastructure, zero external calls by default'],
  ['Accounts', 'None'],
  ['Tracking', 'None'],
  ['Ads', 'None'],
];

const PROOF: Array<{ value: string; label: string }> = [
  { value: '0.00°', label: 'Median Ephemeris Error' },
  { value: '100%', label: 'Numbers Validated' },
  { value: '0', label: 'Calls In The Field' },
];

function PrincipleCard({ n, title, copy, cta = false }: { n: string; title: string; copy: string; cta?: boolean }) {
  return (
    <ScrollReveal direction="up" bidirectional>
      <article className="panel flex h-full min-h-[22rem] w-[80vw] shrink-0 flex-col overflow-hidden p-7 sm:w-[26rem] sm:p-9">
        <div className="mb-5 flex items-center gap-4">
          <span className="num text-sm tracking-[0.3em] text-amber-300/80">{n}</span>
          <span className="h-px flex-1 bg-gradient-to-r from-amber-300/25 to-transparent" />
        </div>
        <h3 className="h-display mb-4 text-2xl text-white/92 sm:text-[1.7rem]">{title}</h3>
        <p className="copy text-sm leading-relaxed sm:text-[0.95rem]">{copy}</p>
        {cta && (
          <motion.a
            href="#prepare"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('prepare')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="btn btn-ghost mt-8 w-fit !px-5 !py-2.5 !text-sm"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            Try It Tonight
          </motion.a>
        )}
      </article>
    </ScrollReveal>
  );
}

export function AboutSection() {
  const reduce = useReducedMotion();
  const wrapRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [shift, setShift] = useState(0);
  const [pct, setPct] = useState(0);

  const { scrollYProgress } = useScroll({ target: wrapRef, offset: ['start start', 'end end'] });
  const x = useTransform(scrollYProgress, [0, 1], [0, -shift]);
  useMotionValueEvent(scrollYProgress, 'change', (v) => setPct(Math.round(v * 100)));

  useEffect(() => {
    const measure = () => {
      const track = trackRef.current;
      if (!track) return;
      setShift(Math.max(0, track.scrollWidth - window.innerWidth));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  /* Reduced motion: a calm vertical stack, no pinning, no driven motion. */
  if (reduce) {
    return (
      <section id="about" className="section">
        <div className="shell">
          <Eyebrow>About SkyWhisper</Eyebrow>
          <h2 className="h-section mt-5 max-w-3xl text-white/92">
            <SplitText text="The Sky, With" as="span" />
            <br />
            <GradientReveal text="the Screen Removed." delay={0.14} className="font-accent" />
          </h2>
          <p className="lead mt-7 max-w-3xl text-base sm:text-lg">
            SkyWhisper is an audio field guide for the night sky. Prepare a narration at home,
            carry it outside, and listen with the phone face-down — no glowing rectangle between
            you and the stars.
          </p>
          <div className="mt-10 space-y-5">
            {CARDS.map((c) => (
              <div key={c.n} className="panel h-auto w-full p-7">
                <div className="mb-4 flex items-center gap-4">
                  <span className="num text-sm tracking-[0.3em] text-amber-300/80">{c.n}</span>
                  <span className="h-px flex-1 bg-gradient-to-r from-amber-300/25 to-transparent" />
                </div>
                <h3 className="h-display mb-3 text-2xl text-white/92">{c.title}</h3>
                <p className="copy text-sm leading-relaxed">{c.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      {/* ————— header + intro ————— */}
      <section id="about" className="section !pb-10 sm:!pb-14">
        <div className="shell">
          <Eyebrow>About SkyWhisper</Eyebrow>
          <h2 className="h-section mt-5 max-w-3xl text-white/92">
            <SplitText text="The Sky, With" as="span" />
            <br />
            <GradientReveal text="the Screen Removed." delay={0.14} className="font-accent" />
          </h2>
          <Reveal delay={0.12} className="mt-7">
            <p className="lead max-w-3xl text-base sm:text-lg">
              SkyWhisper is an audio field guide for the night sky. Prepare a narration at home,
              carry it outside, and listen with the phone face-down — no glowing rectangle between
              you and the stars.
            </p>
          </Reveal>
        </div>
      </section>

      {/* ————— pinned horizontal glide: keep scrolling, the archive moves sideways ————— */}
      <div ref={wrapRef} className="relative h-[320vh]">
        <div className="sticky top-0 flex h-[100svh] flex-col justify-center gap-7 overflow-hidden sm:gap-9">
          <div className="shell flex items-end justify-between gap-6">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.3em] text-amber-300/80">
              The Principles
            </p>
            <p className="num font-mono text-[0.62rem] tracking-[0.2em] text-white/40 tabular-nums">
              {String(pct).padStart(2, '0')}% ✦ Principles Timeline
            </p>
          </div>

          <div
            ref={trackRef}
            className="flex w-max items-stretch gap-5 pr-[12vw] sm:gap-7"
            style={{ paddingLeft: 'max(2rem, calc((100vw - 73.75rem) / 2 + 2rem))' }}
          >
            {CARDS.map((c) => (
              <motion.div key={c.n} style={{ x }} className="flex">
                <PrincipleCard n={c.n} title={c.title} copy={c.copy} cta={c.cta} />
              </motion.div>
            ))}
          </div>

          <div className="shell">
            <div className="h-px w-full bg-white/[0.08]">
              <motion.div className="h-px origin-left bg-amber-300/80" style={{ scaleX: scrollYProgress }} />
            </div>
          </div>

          <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#04060f] via-[#04060f]/70 to-transparent sm:w-40" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#04060f] via-[#04060f]/70 to-transparent sm:w-40" />
        </div>
      </div>

      {/* ————— chart: proof + facts, one organized panel ————— */}
      <section className="section !pt-10 sm:!pt-14">
        <div className="shell">
          <Reveal>
            <div className="panel p-6 sm:p-10">
              <p className="font-mono text-[0.62rem] uppercase tracking-[0.3em] text-amber-300/80">
                Measured, Not Promised
              </p>
              <dl className="mt-6 grid grid-cols-3 divide-x divide-white/[0.08]">
                {PROOF.map((p) => (
                  <div key={p.label} className="min-w-0 px-4 first:pl-0 last:pr-0 sm:px-7">
                    <dd className="font-display text-xl font-bold text-amber-300 sm:text-3xl">
                      {p.value}
                    </dd>
                    <dt className="mt-2 font-mono text-[0.55rem] uppercase leading-relaxed tracking-[0.16em] text-white/40 sm:text-[0.6rem]">
                      {p.label}
                    </dt>
                  </div>
                ))}
              </dl>
              <dl className="mt-8 divide-y divide-white/[0.07] border-t border-white/[0.07]">
                {FACTS.map(([k, v]) => (
                  <div
                    key={k}
                    className="grid grid-cols-[8rem_1fr] gap-3 py-3.5 sm:grid-cols-[11rem_1fr] sm:gap-4"
                  >
                    <dt className="min-w-0 font-mono text-[0.6rem] uppercase leading-relaxed tracking-[0.18em] text-amber-300/70">
                      {k}
                    </dt>
                    <dd className="min-w-0 break-words text-sm leading-relaxed text-white/60">
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
