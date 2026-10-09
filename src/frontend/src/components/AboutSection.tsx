import { motion } from 'framer-motion';
import { Eyebrow, Reveal, SplitText } from './home/Constellation';

const PRINCIPLES = [
  {
    n: '01',
    title: 'Darkness Is the Product',
    copy: 'Human rod cells need twenty to thirty unbroken minutes of darkness to reach full sensitivity. A single glance at a bright display bleaches that progress back to zero. SkyWhisper moves every calculation to before you step outside — then gets out of the way and lets the night do the talking.',
  },
  {
    n: '02',
    title: 'Numbers Are Computed, Never Guessed',
    copy: 'Every position comes from open-source ephemeris libraries, evaluated deterministically on the server and cross-checked against an independent implementation. The language model is only ever allowed to narrate facts the math already produced — each number it speaks is verified against that computed set before a single second of audio is rendered.',
  },
  {
    n: '03',
    title: 'Directions You Can Actually Use',
    copy: 'Nobody navigates by decimal degrees in the dark. One fist-width held at arm’s length spans roughly ten degrees of sky, so that is the unit of the narration. Every direction is body-relative — above the bright star, three fists left of the Moon — never a raw coordinate.',
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

export function AboutSection() {
  return (
    <section id="about" className="section">
      <div className="shell">
        <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
          {/* — left: heading + summary — */}
          <div className="min-w-0">
            <Eyebrow>About SkyWhisper</Eyebrow>
            <h2 className="h-section mt-5 text-white/92">
              <SplitText text="The Sky, With" as="span" />
              <br />
              <span className="bg-gradient-to-br from-[#FFE9C4] via-amber-300 to-amber-deep bg-clip-text text-transparent">
                <SplitText text="the Screen Removed." as="span" delay={0.14} />
              </span>
            </h2>

            <Reveal delay={0.1} className="mt-7">
              <p className="lead max-w-xl text-base sm:text-lg">
                SkyWhisper is an audio field guide for the night sky. Prepare a
                narration at home, carry it outside, and listen with the phone
                face-down — no glowing rectangle between you and the stars.
              </p>
            </Reveal>

            {/* Proof band */}
            <Reveal delay={0.14} className="mt-8">
              <dl className="grid grid-cols-3 gap-4 rounded-2xl border border-white/[0.08] bg-white/[0.02] px-5 py-5 sm:gap-6 sm:px-7">
                {PROOF.map((p) => (
                  <div key={p.label} className="min-w-0">
                    <dd className="font-display text-xl font-bold text-amber-300 sm:text-2xl">
                      {p.value}
                    </dd>
                    <dt className="mt-1.5 font-mono text-[0.58rem] uppercase leading-relaxed tracking-[0.18em] text-white/40">
                      {p.label}
                    </dt>
                  </div>
                ))}
              </dl>
            </Reveal>

            {/* Facts table */}
            <Reveal delay={0.18} className="mt-8">
              <dl className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
                {FACTS.map(([k, v]) => (
                  <div
                    key={k}
                    className="grid grid-cols-[6.5rem_1fr] gap-3 py-3.5 sm:grid-cols-[9rem_1fr] sm:gap-4"
                  >
                    <dt className="min-w-0 font-mono text-[0.58rem] uppercase leading-relaxed tracking-[0.2em] text-amber-300/70">
                      {k}
                    </dt>
                    <dd className="min-w-0 break-words text-sm leading-relaxed text-white/60">
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          {/* — right: principles — */}
          <div className="min-w-0 space-y-4 sm:space-y-5">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.n} delay={i * 0.1} className="panel panel-hover p-6 sm:p-8">
                <div className="mb-4 flex items-center gap-4">
                  <span className="num text-sm tracking-[0.3em] text-amber-300/80">{p.n}</span>
                  <span className="h-px flex-1 bg-gradient-to-r from-amber-300/25 to-transparent" />
                </div>
                <h3 className="h-display mb-3 text-xl text-white/92 sm:text-2xl">{p.title}</h3>
                <p className="copy text-sm sm:text-[0.95rem]">{p.copy}</p>
              </Reveal>
            ))}

            <Reveal delay={0.3} className="panel p-6 sm:p-8">
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-amber-300/70">
                Open by Default
              </p>
              <p className="copy mt-3 text-sm sm:text-[0.95rem]">
                Every dependency is open source, every weight is open, and the
                whole stack can be self-hosted. Nothing to trust blindly — read
                the code, check the maths, or run your own.
              </p>
              <motion.a
                href="#prepare"
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById('prepare')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="btn btn-ghost mt-6 !px-5 !py-2.5 !text-sm"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                Try It Tonight
              </motion.a>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
