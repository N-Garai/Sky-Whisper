import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface Tonight {
  moonPhase: string;
  moonIllum: number;
  planets: number;
  stars: number;
  passes: number;
}

/**
 * Live sky strip — one cheap snapshot call proves the backend is awake and
 * turns the landing into a dashboard. Best-effort by design: any failure hides
 * the strip silently rather than showing an error state on the marketing page.
 */
export function TonightStrip({ lat, lon }: { lat: number | null; lon: number | null }) {
  const [data, setData] = useState<Tonight | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), 12000);

    (async () => {
      try {
        const res = await fetch('/api/sky/snapshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: ctrl.signal,
          body: JSON.stringify({
            latitude: lat ?? 22.57,
            longitude: lon ?? 88.36,
            elevation_meters: 0,
            timestamp: new Date().toISOString(),
            timezone: 'UTC',
            duration_seconds: 90,
          }),
        });
        if (!res.ok) return;
        const snap = await res.json();
        if (cancelled) return;
        setData({
          moonPhase: String(snap?.moon?.phase_name ?? 'moon').replace(/_/g, ' '),
          moonIllum: Math.round((snap?.moon?.illumination ?? 0) * 100),
          planets: (snap?.planets ?? []).filter((b: any) => b.visible).length,
          stars: (snap?.stars ?? []).filter((b: any) => b.visible).length,
          passes: (snap?.satellite_passes ?? []).length,
        });
      } catch {
        // offline or cold server — the strip simply stays hidden
      } finally {
        if (!cancelled) setLoading(false);
        window.clearTimeout(timer);
      }
    })();

    return () => {
      cancelled = true;
      ctrl.abort();
      window.clearTimeout(timer);
    };
  }, [lat, lon]);

  if (!loading && data === null) return null;

  const cells: Array<[string, string]> = data
    ? [
        ['moon', `${data.moonPhase} · ${data.moonIllum}%`],
        ['planets up', String(data.planets)],
        ['bright stars', String(data.stars)],
        ['satellite passes', String(data.passes)],
      ]
    : [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
      className="panel mx-auto w-full max-w-3xl px-5 py-5 sm:px-8 sm:py-6"
    >
      <div className="mb-4 flex items-center gap-2.5">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        <p className="eyebrow !text-amber-300/60">
          {loading ? 'reading tonight…' : 'tonight above you'}
        </p>
      </div>

      {loading || data === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-6" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-10 animate-pulse rounded-lg bg-white/[0.05]" />
          ))}
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-6">
          {cells.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="font-mono text-[0.58rem] uppercase tracking-[0.2em] text-white/40">{k}</dt>
              <dd className="num mt-1 truncate text-base text-white/90 sm:text-lg">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </motion.div>
  );
}
