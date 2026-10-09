import { motion } from 'framer-motion';
import { Eyebrow, Reveal, SplitText } from './home/Constellation';

const PRINCIPLES = [
  {
    n: '01',
    title: 'darkness is the product',
    copy: 'rod cells need twenty to thirty unbroken minutes of darkness before they fully adapt. one glance at a bright screen resets that clock to zero. so skywhisper does every calculation before you step outside, and then gets out of the way.',
  },
  {
    n: '02',
    title: 'numbers are computed, never guessed',
    copy: 'positions come from open-source ephemeris libraries, run deterministically on the server. a language model is only allowed to narrate facts the ephemeris already produced — every number it speaks is checked against that computed set before audio is rendered.',
  },
  {
    n: '03',
    title: 'directions you can actually use',
    copy: 'nobody navigates by decimal degrees in the dark. one fist-width held at arm’s length spans roughly ten degrees of sky, so that is the unit. directions are body-relative — above the bright star, three fists left of the moon — never raw coordinates.',
  },
];

const FACTS: Array<[string, string]> = [
  ['ephemeris', 'open-source, cross-checked against an independent implementation'],
  ['narration', 'an open-weight model, constrained to verified facts'],
  ['audio', 'synthesised at home, played from local cache'],
  ['runtime', 'free-tier infrastructure, zero external calls by default'],
  ['accounts', 'none'],
  ['tracking', 'none'],
  ['ads', 'none'],
];

export function AboutSection() {
  return (
    <section id="about" className="section">
      <div className="shell">
        <div className="grid gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-16">
          {/* — left: heading + summary — */}
          <div>
            <Eyebrow>about skywhisper</Eyebrow>
            <h2 className="h-section mt-5 text-white/92">
              <SplitText text="the sky, with" as="span" />
              <br />
              <span className="bg-gradient-to-br from-[#FFE9C4] via-amber-300 to-amber-deep bg-clip-text text-transparent">
                <SplitText text="the screen removed." as="span" delay={0.14} />
              </span>
            </h2>

            <Reveal delay={0.1} className="mt-6">
              <p className="lead max-w-md">
                skywhisper is an audio field guide for the night sky. you prepare a narration
                at home, take it with you, and listen outside with the phone face-down.
              </p>
            </Reveal>

            {/* Facts table */}
            <Reveal delay={0.18} className="mt-9">
              <dl className="divide-y divide-white/[0.07] border-y border-white/[0.07]">
                {FACTS.map(([k, v]) => (
                  <div key={k} className="grid grid-cols-[7.5rem_1fr] gap-4 py-3 sm:grid-cols-[9rem_1fr]">
                    <dt className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-amber-300/70">
                      {k}
                    </dt>
                    <dd className="text-sm text-white/55">{v}</dd>
                  </div>
                ))}
              </dl>
            </Reveal>
          </div>

          {/* — right: principles — */}
          <div className="space-y-4 sm:space-y-5">
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.n} delay={i * 0.1} className="panel panel-hover p-6 sm:p-7">
                <div className="mb-3 flex items-center gap-3">
                  <span className="num text-sm tracking-[0.3em] text-amber-300/80">{p.n}</span>
                  <span className="h-px flex-1 bg-gradient-to-r from-amber-300/25 to-transparent" />
                </div>
                <h3 className="h-display mb-2.5 text-lg text-white/92 sm:text-xl">{p.title}</h3>
                <p className="copy text-sm">{p.copy}</p>
              </Reveal>
            ))}

            <Reveal delay={0.3} className="panel p-6 sm:p-7">
              <p className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-amber-300/70">
                open by default
              </p>
              <p className="copy mt-2.5 text-sm">
                every dependency is open source, every weight is open, and the whole stack can be
                self-hosted. nothing to trust blindly — read the code, check the maths, or run your own.
              </p>
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}
