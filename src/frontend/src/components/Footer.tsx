import { motion } from 'framer-motion';
import { SECTIONS } from './Nav';

const LINKS = [
  { id: 'home', label: 'Home' },
  { id: 'ritual', label: 'How It Works' },
  { id: 'prepare', label: 'Prepare' },
  { id: 'about', label: 'About' },
];

export function Footer() {
  return (
    <footer className="relative mt-8 overflow-hidden">
      <div className="rule-shimmer" aria-hidden="true" />

      <div className="shell py-16 sm:py-20">
        <div className="grid gap-12 md:grid-cols-[1.4fr_1fr] md:gap-16">
          {/* Brand + pitch */}
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
                <circle cx="16" cy="16" r="14" fill="none" stroke="rgba(245,201,123,0.35)" strokeWidth="1.2" />
                <path d="M21.5 7.5a9 9 0 1 0 0 17 10.5 10.5 0 0 1 0-17Z" fill="#F5C97B" opacity="0.95" />
                <circle cx="9" cy="10.5" r="1.1" fill="#E7ECF7" opacity="0.75" />
              </svg>
              <span className="font-display text-sm font-semibold tracking-[0.16em] text-amber-300">
                skywhisper
              </span>
            </div>
            <p className="lead mt-6 max-w-sm text-base sm:text-lg">
              Screenless astronomy. Prepare the narration at home, then go
              outside, put the phone down, and let the sky speak for itself.
            </p>
            <p className="mt-5 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-white/30">
              No Accounts · No Tracking · No Ads
            </p>
          </div>

          {/* Links */}
          <div className="grid grid-cols-2 gap-8">
            <div>
              <p className="eyebrow mb-5 !text-white/35">Navigate</p>
              <ul className="space-y-3">
                {LINKS.map((l) => (
                  <li key={l.id}>
                    <button
                      onClick={() =>
                        document.getElementById(l.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                      }
                      className="text-[0.95rem] text-white/50 transition-colors hover:text-amber-300"
                    >
                      {l.label}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="eyebrow mb-5 !text-white/35">The Sky</p>
              <ul className="space-y-3 text-[0.95rem] text-white/50">
                <li>Sun &amp; Moon</li>
                <li>Planets</li>
                <li>Named Stars</li>
                <li>Satellite Passes</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Safety notice — shown once, at the end of the page. */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-10% 0px' }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="panel mt-14 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:gap-6 sm:p-7"
        >
          <span
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-amber-300/25 text-lg text-amber-300"
            aria-hidden="true"
          >
            ⚠
          </span>
          <div className="min-w-0">
            <p className="font-mono text-[0.58rem] uppercase tracking-[0.22em] text-amber-300/80">
              Outdoor Safety
            </p>
            <p className="copy mt-1.5 text-sm sm:text-[0.95rem]">
              Do not walk while listening. Stay away from roads, water, cliffs,
              and traffic. This is an astronomy companion, not a navigation tool.
            </p>
          </div>
        </motion.div>

        {/* Bottom bar */}
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t border-white/[0.07] pt-7 sm:flex-row">
          <p className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-white/25">
            © {new Date().getFullYear()} SkyWhisper
          </p>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="group flex items-center gap-2 font-mono text-[0.58rem] uppercase tracking-[0.2em] text-white/35 transition-colors hover:text-amber-300"
          >
            Back to the Sky
            <span className="transition-transform group-hover:-translate-y-0.5" aria-hidden="true">
              ↑
            </span>
          </button>
        </div>
      </div>
    </footer>
  );
}
