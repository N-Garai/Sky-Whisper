const PHRASES = ['screen off', 'works offline', 'open source', 'look up'];

export function Marquee() {
  const row = (hidden: boolean) => (
    <div className="flex shrink-0 items-center" aria-hidden={hidden}>
      {PHRASES.map(p => (
        <span key={`${hidden}-${p}`} className="flex items-center">
          <span className="font-display mx-6 sm:mx-10 text-sm sm:text-base uppercase tracking-[0.35em] text-white/35">
            {p}
          </span>
          <span className="text-amber-400/60 text-xs">✦</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="relative overflow-hidden border-y border-white/[0.06] bg-black/30 py-4">
      <div className="marquee-track flex w-max">
        {row(false)}
        {row(true)}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#050814] to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#050814] to-transparent" />
    </div>
  );
}
