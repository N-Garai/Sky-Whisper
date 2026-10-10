import { useRef } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import { Eyebrow, SplitText, GradientReveal } from './home/Constellation';

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

/**
 * One principle card with scroll-linked reveal.
 *
 * The card fades and rises as its top edge enters the lower part of the
 * viewport, sits fully visible in the middle, and fades + sinks again as it
 * leaves the top. Progress is driven by the card's own scroll position
 * (useScroll on its element), so it reverses correctly when scrolling up —
 * no IntersectionObserver, no one-shot triggers.
 */
function PrincipleCard({ n, title, copy, cta = false }: { n: string; title: string; copy: string; cta?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  // 0 = card just entering at the bottom, 0.5 = centred, 1 = leaving at the top.
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const opacity = useTransform(scrollYProgress, [0, 0.28, 0.72, 1], [0, 1, 1, 0]);
  const y = useTransform(scrollYProgress, [0, 0.28, 0.72, 1], [70, 0, 0, -50]);
  const blur = useTransform(scrollYProgress, [0, 0.28, 0.72, 1], [10, 0, 0, 10]);
  const filter = useTransform(blur, (b) => `blur(${b}px)`);

  return (
    <motion.div ref={ref} style={reduce ? undefined : { opacity, y, filter }} className="min-w-0">
      <article className="panel flex min-w-0 flex-col overflow-hidden p-7 sm:p-9">
        <div className="mb-5 flex items-center gap-4">
          <span className="num text-sm tracking-[0.3em] text-amber-300/80">{n}</span>
          <span className="h-px flex-1 bg-gradient-to-r from-amber-300/25 to-transparent" />
        </div>
        <h3 className="h-display mb-4 text-2xl text-white/92 sm:text-[1.7rem]">{title}</h3>
        <p className="copy text-sm leading-relaxed sm:text-[0.92rem]">{copy}</p>
        {cta && (
          <a
            href="#prepare"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('prepare')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="btn btn-ghost mt-8 w-fit !px-5 !py-2.5 !text-sm"
          >
            Try It Tonight
          </a>
        )}
      </article>
    </motion.div>
  );
}

export function AboutSection() {
  return (
    <>
      {/* ————— header + intro ————— */}
      <section id="about" className="section !pb-6 sm:!pb-10">
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
        </div>
      </section>

      {/* ————— principles: each card fades in on scroll and fades out going up ————— */}
      <section className="section !pt-4 sm:!pt-6">
        <div className="shell">
          <p className="mb-8 font-mono text-[0.62rem] uppercase tracking-[0.3em] text-amber-300/80">The Principles</p>
          <div className="grid gap-6 md:grid-cols-2">
            {CARDS.map((c) => (
              <PrincipleCard key={c.n} n={c.n} title={c.title} copy={c.copy} cta={c.cta} />
            ))}
          </div>
        </div>
      </section>

      {/* ————— chart: proof + facts, one organized panel ————— */}
      <section className="section !pt-6 sm:!pt-8">
        <div className="shell">
          <div className="panel p-6 sm:p-10">
            <p className="font-mono text-[0.62rem] uppercase tracking-[0.3em] text-amber-300/80">
              Measured, Not Promised
            </p>
            <dl className="mt-6 grid grid-cols-3 divide-x divide-white/[0.08]">
              {PROOF.map((p) => (
                <div key={p.label} className="min-w-0 px-4 first:pl-0 last:pr-0 sm:px-7">
                  <dd className="font-display text-xl font-bold text-amber-300 sm:text-3xl">{p.value}</dd>
                  <dt className="mt-2 font-mono text-[0.55rem] uppercase leading-relaxed tracking-[0.16em] text-white/40 sm:text-[0.6rem]">
                    {p.label}
                  </dt>
                </div>
              ))}
            </dl>
            <dl className="mt-8 divide-y divide-white/[0.07] border-t border-white/[0.07]">
              {FACTS.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[8rem_1fr] gap-3 py-3.5 sm:grid-cols-[11rem_1fr] sm:gap-4">
                  <dt className="min-w-0 font-mono text-[0.6rem] uppercase leading-relaxed tracking-[0.18em] text-amber-300/70">
                    {k}
                  </dt>
                  <dd className="min-w-0 break-words text-sm leading-relaxed text-white/60">{v}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
    </>
  );
}
