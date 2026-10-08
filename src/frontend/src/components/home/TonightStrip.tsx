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
 * turns the landing into a dashboard. Best-effort: any failure hides the
 * strip silently instead of showing an error state on the marketing page.
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
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-3xl mx-auto rounded-2xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-md px-5 sm:px-8 py-4 sm:py-5"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
        </span>
        <p className="text-[11px] uppercase tracking-[0.3em] text-white/40">
          {loading ? 'reading tonight…' : 'tonight above you'}
        </p>
      </div>
      {loading || data === null ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" aria-hidden="true">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="h-9 rounded-lg bg-white/[0.05] animate-pulse" />
          ))}
        </div>
      ) : (
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6">
          {cells.map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="text-[11px] uppercase tracking-[0.2em] text-white/35">{k}</dt>
              <dd className="font-display text-white/90 text-base sm:text-lg truncate">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </motion.div>
  );
}
