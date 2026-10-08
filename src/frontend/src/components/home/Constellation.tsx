/**
 * Constellation draw-in — an abstract seven-star figure that draws itself
 * once on load (stroke-dashoffset), then settles behind the headline.
 * Pure SVG + CSS, no assets, frozen under reduced-motion.
 */
const POINTS: Array<[number, number]> = [
  [52, 308],
  [118, 244],
  [182, 254],
  [242, 202],
  [304, 212],
  [344, 148],
  [298, 84],
];

const SEGMENTS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6],
];

export function Constellation({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 400"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      {SEGMENTS.map(([a, b], i) => {
        const [x1, y1] = POINTS[a];
        const [x2, y2] = POINTS[b];
        const len = Math.hypot(x2 - x1, y2 - y1);
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            className="constellation-line"
            style={{
              strokeDasharray: len,
              strokeDashoffset: len,
              animationDelay: `${0.5 + i * 0.22}s`,
            }}
          />
        );
      })}
      {POINTS.map(([cx, cy], i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={i === 3 ? 4 : 2.5}
          className="constellation-star"
          style={{ animationDelay: `${0.5 + i * 0.22}s` }}
        />
      ))}
    </svg>
  );
}
