import { useEffect, useState } from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';

export const SECTIONS = [
  { id: 'home', label: 'home' },
  { id: 'ritual', label: 'how it works' },
  { id: 'prepare', label: 'prepare' },
  { id: 'about', label: 'about' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

/**
 * Sticky navigation with a reading-progress bar and a scroll spy that marks
 * the section currently in view. On narrow screens the links collapse into a
 * labelled menu sheet rather than disappearing — the product is a single
 * scrolling page, so navigation has to stay reachable one-handed outdoors.
 */
export function Nav({
  redShift,
  onToggleRedShift,
}: {
  redShift: boolean;
  onToggleRedShift: () => void;
}) {
  const [active, setActive] = useState<SectionId>('home');
  const [open, setOpen] = useState(false);
  const [condensed, setCondensed] = useState(false);

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 220, damping: 40, restDelta: 0.001 });

  // Condense the bar once the user leaves the hero.
  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Scroll spy.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the entry closest to the top of the viewport.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id as SectionId);
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 },
    );

    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean);
    els.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const go = (id: string) => {
    setOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
          condensed ? 'border-b border-white/[0.07] bg-abyss/80 backdrop-blur-xl' : 'border-b border-transparent'
        }`}
      >
        <nav className="shell flex items-center justify-between py-3.5" aria-label="Primary">
          {/* Wordmark */}
          <button
            onClick={() => go('home')}
            className="group flex items-center gap-2.5"
            aria-label="SkyWhisper — back to top"
          >
            <span className="relative grid h-7 w-7 place-items-center">
              <svg viewBox="0 0 32 32" className="h-7 w-7" aria-hidden="true">
                <circle cx="16" cy="16" r="14" fill="none" stroke="rgba(245,201,123,0.35)" strokeWidth="1.2" />
                <path
                  d="M21.5 7.5a9 9 0 1 0 0 17 10.5 10.5 0 0 1 0-17Z"
                  fill="#F5C97B"
                  opacity="0.95"
                />
                <circle cx="9" cy="10.5" r="1.1" fill="#E7ECF7" opacity="0.75" />
              </svg>
            </span>
            <span className="font-display text-sm font-semibold tracking-[0.16em] text-amber-300">
              skywhisper
            </span>
          </button>

          {/* Desktop links */}
          <div className="hidden items-center gap-1 md:flex">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => go(s.id)}
                aria-current={active === s.id ? 'true' : undefined}
                className="relative rounded-full px-3.5 py-1.5 font-mono text-[0.62rem] uppercase tracking-[0.2em] transition-colors"
              >
                <span className={active === s.id ? 'text-amber-300' : 'text-white/45 hover:text-white/80'}>
                  {s.label}
                </span>
                {active === s.id && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-amber-300/10 ring-1 ring-amber-300/25"
                    transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                  />
                )}
              </button>
            ))}

            <span className="mx-2 h-4 w-px bg-white/12" aria-hidden="true" />

            <button
              onClick={onToggleRedShift}
              aria-pressed={redShift}
              title="Red-shift mode preserves dark adaptation"
              className="grid h-8 w-8 place-items-center rounded-full border border-white/15 text-xs transition-colors hover:border-red-400/50"
            >
              {redShift ? '🔴' : '🌙'}
            </button>
          </div>

          {/* Mobile controls */}
          <div className="flex items-center gap-2 md:hidden">
            <button
              onClick={onToggleRedShift}
              aria-pressed={redShift}
              title="Red-shift mode preserves dark adaptation"
              className="grid h-8 w-8 place-items-center rounded-full border border-white/15 text-xs"
            >
              {redShift ? '🔴' : '🌙'}
            </button>
            <button
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              aria-label={open ? 'Close menu' : 'Open menu'}
              className="grid h-9 w-9 place-items-center rounded-full border border-white/15"
            >
              <span className="relative block h-3 w-4">
                <span
                  className={`absolute left-0 block h-px w-4 bg-white/70 transition-transform duration-300 ${
                    open ? 'top-1.5 rotate-45' : 'top-0'
                  }`}
                />
                <span
                  className={`absolute left-0 block h-px w-4 bg-white/70 transition-transform duration-300 ${
                    open ? 'top-1.5 -rotate-45' : 'top-3'
                  }`}
                />
              </span>
            </button>
          </div>
        </nav>

        {/* Reading progress */}
        <motion.div
          className="h-px origin-left bg-gradient-to-r from-amber-deep via-amber-300 to-amber-deep"
          style={{ scaleX: progress }}
          aria-hidden="true"
        />

        {/* Mobile sheet */}
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-b border-white/[0.07] bg-abyss/95 backdrop-blur-xl md:hidden"
          >
            <div className="shell flex flex-col py-2">
              {SECTIONS.map((s) => (
                <button
                  key={s.id}
                  onClick={() => go(s.id)}
                  aria-current={active === s.id ? 'true' : undefined}
                  className={`flex items-center justify-between rounded-lg px-2 py-3 text-left font-mono text-[0.68rem] uppercase tracking-[0.22em] transition-colors ${
                    active === s.id ? 'text-amber-300' : 'text-white/50'
                  }`}
                >
                  {s.label}
                  {active === s.id && <span className="text-[0.6rem] text-amber-300/60">●</span>}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </header>
    </>
  );
}
