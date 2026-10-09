const PHRASES = ['screen off', 'works offline', 'open source', 'look up'];

/** One identical row; the track holds two so the loop is seamless. */
const Row = ({ hidden }: { hidden: boolean }) => (
  <div className="flex shrink-0 items-center" aria-hidden={hidden || undefined}>
    {PHRASES.map((p) => (
      <span key={p} className="flex items-center">
        <span className="font-display mx-6 text-xs uppercase tracking-[0.42em] text-white/38 sm:mx-10 sm:text-sm">
          {p}
        </span>
        <span className="text-[0.6rem] text-amber-300/45" aria-hidden="true">
          ✦
        </span>
      </span>
    ))}
  </div>
);

/**
 * Infinite ribbon between the hero and the ritual. Pure CSS transform, so it
 * costs nothing on the main thread; edges fade into the background instead
 * of hard-clipping the text.
 */
export function Marquee() {
  return (
    <div className="relative overflow-hidden border-y border-white/[0.06] bg-black/25 py-4">
      <div className="marquee-track flex w-max">
        <Row hidden={false} />
        <Row hidden />
      </div>
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-abyss to-transparent sm:w-32"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-abyss to-transparent sm:w-32"
        aria-hidden="true"
      />
    </div>
  );
}
