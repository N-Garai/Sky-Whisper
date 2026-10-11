import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ping } from '../lib/chimes';

interface PointerTarget {
  name: string;
  azimuth: number;
}

interface BlackoutPointerProps {
  snapshot: any | null;
  lat: number;
  lon: number;
  onClose: () => void;
}

function wrapDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Signed shortest turn to the target, in [-180, 180). Positive = right. */
function signedDiff(targetAz: number, heading: number): number {
  return ((targetAz - heading + 540) % 360) - 180;
}

/**
 * Blackout pointer mode — the honest version of "point your phone at it".
 *
 * The screen goes pure black (OLED emits nothing, so dark adaptation is
 * safe) while the compass, vibration, and pitch guide your aim. Listening
 * stays off: mobile browsers suspend the mic on lock, so this mode is
 * strictly output — compass in, haptics and beeps out.
 *
 * Nothing here emits meaningful light: all chrome is deep red on black,
 * kept tiny and dim. Keep this view open; the compass dies with it.
 */
export function BlackoutPointer({ snapshot, lat, lon, onClose }: BlackoutPointerProps) {
  const [targets, setTargets] = useState<PointerTarget[]>([]);
  const [targetName, setTargetName] = useState<string | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [noCompass, setNoCompass] = useState(false);
  const [loading, setLoading] = useState(!snapshot);
  const [locked, setLocked] = useState(false);
  const lockedSpoken = useRef<string | null>(null);

  // Targets: visible planets, bright stars, Moon when up.
  useEffect(() => {
    const load = async () => {
      let snap = snapshot;
      if (!snap && lat !== null && lon !== null) {
        try {
          const res = await fetch('/api/sky/snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude: lat, longitude: lon, elevation_meters: 0,
              timestamp: new Date().toISOString(), timezone: 'UTC', duration_seconds: 90,
            }),
          });
          if (res.ok) snap = await res.json();
        } catch {
          snap = null;
        }
      }
      if (!snap) {
        setLoading(false);
        return;
      }
      const out: PointerTarget[] = [];
      for (const p of snap.planets ?? []) {
        if (p.visible) out.push({ name: p.name, azimuth: p.azimuth_deg });
      }
      const stars = [...(snap.stars ?? [])]
        .filter((s: any) => s.visible)
        .sort((a: any, b: any) => (a.magnitude ?? 9) - (b.magnitude ?? 9))
        .slice(0, 6);
      for (const s of stars) out.push({ name: s.name, azimuth: s.azimuth_deg });
      if (snap.moon && snap.moon.altitude_deg >= 0) {
        out.push({ name: 'Moon', azimuth: snap.moon.azimuth_deg });
      }
      setTargets(out);
      setTargetName(out[0]?.name ?? null);
      setLoading(false);
    };
    void load();
  }, [snapshot, lat, lon]);

  // Compass: absolute orientation preferred; iOS needs a tap for permission.
  useEffect(() => {
    let alive = true;
    let gotReading = false;
    const onOrientation = (e: DeviceOrientationEvent) => {
      if (!alive) return;
      const w = e as any;
      let h: number | null = null;
      if (typeof w.webkitCompassHeading === 'number' && Number.isFinite(w.webkitCompassHeading)) {
        h = w.webkitCompassHeading;
      } else if (e.absolute && typeof e.alpha === 'number' && Number.isFinite(e.alpha)) {
        h = wrapDeg(360 - e.alpha);
      } else if (typeof e.alpha === 'number' && Number.isFinite(e.alpha)) {
        h = wrapDeg(360 - e.alpha); // relative fallback — roughly right
      }
      if (h !== null) {
        gotReading = true;
        setHeading(h);
      }
    };
    const start = () => {
      window.addEventListener('deviceorientationabsolute', onOrientation as EventListener);
      window.addEventListener('deviceorientation', onOrientation as EventListener);
    };
    const DOE = window.DeviceOrientationEvent as any;
    if (DOE && typeof DOE.requestPermission === 'function') {
      setNeedsPermission(true); // iOS: listeners attach anyway; events flow after the tap below
    }
    start();
    const timer = window.setTimeout(() => {
      if (alive && !gotReading) setNoCompass(true);
    }, 4000);
    return () => {
      alive = false;
      window.clearTimeout(timer);
      window.removeEventListener('deviceorientationabsolute', onOrientation as EventListener);
      window.removeEventListener('deviceorientation', onOrientation as EventListener);
    };
  }, []);

  const enableCompass = async () => {
    try {
      const DOE = window.DeviceOrientationEvent as any;
      const res = await DOE.requestPermission();
      if (res === 'granted') setNeedsPermission(false);
      else setNoCompass(true);
    } catch {
      setNoCompass(true);
    }
  };

  const target = targets.find((t) => t.name === targetName) ?? null;
  const diff = target && heading !== null ? signedDiff(target.azimuth, heading) : null;
  const aligned = diff !== null && Math.abs(diff) < 8;

  // Fresh heading for the interval: effects below re-run rarely, the ref never lies.
  const headingRef = useRef<number | null>(null);
  headingRef.current = heading;
  const targetRef = useRef<PointerTarget | null>(null);
  targetRef.current = target;

  // Guidance loop: pitch + vibration track alignment; speak once per lock.
  // Reads live values through refs so one interval serves the whole session.
  useEffect(() => {
    const id = window.setInterval(() => {
      const t = targetRef.current;
      const h = headingRef.current;
      if (!t || h === null) return;
      const d = signedDiff(t.azimuth, h);
      const closeness = 1 - Math.min(Math.abs(d), 180) / 180;
      if (Math.abs(d) < 8) {
        if (lockedSpoken.current !== t.name) {
          lockedSpoken.current = t.name;
          setLocked(true);
          try {
            navigator.vibrate?.([120, 60, 120]);
          } catch {
            // vibration unsupported — beeps carry it
          }
          ping(880, 0.3);
          try {
            window.speechSynthesis?.cancel();
            const u = new SpeechSynthesisUtterance(`Locked on ${t.name}. Look up.`);
            u.rate = 1;
            window.speechSynthesis?.speak(u);
          } catch {
            // speech unavailable — haptics already fired
          }
        }
      } else {
        if (lockedSpoken.current === t.name && Math.abs(d) > 20) {
          lockedSpoken.current = null;
        }
        setLocked(false);
        ping(440 + closeness * 440, 0.08);
        try {
          navigator.vibrate?.(25);
        } catch {
          // ignore
        }
      }
    }, 600);
    return () => window.clearInterval(id);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-[70] bg-black"
      role="dialog"
      aria-modal="true"
      aria-label="Point at the sky"
    >
      <div className="flex h-full flex-col items-center justify-between px-5 py-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#7a1f1f]">
          Point Mode · Screen Stays Dark
        </p>

        <div className="flex flex-col items-center gap-5">
          {/* Alignment dial: ring fills as you turn onto the target. */}
          <div className="relative grid h-40 w-40 place-items-center">
            <svg viewBox="0 0 128 128" className="absolute h-40 w-40 -rotate-90" aria-hidden="true">
              <circle cx="64" cy="64" r="56" fill="none" stroke="rgba(127,29,29,0.5)" strokeWidth="2" />
              <circle
                cx="64" cy="64" r="56" fill="none" stroke="#b91c1c" strokeWidth="3"
                strokeLinecap="round" strokeDasharray={2 * Math.PI * 56}
                strokeDashoffset={2 * Math.PI * 56 * (diff !== null ? Math.abs(diff) / 180 : 1)}
              />
            </svg>
            <div className="text-center">
              <p className="font-display text-lg text-[#a33]">{target?.name ?? '…'}</p>
              <p className="mt-1 font-mono text-[11px] tracking-[0.2em] text-[#7a1f1f]">
                {heading === null
                  ? 'WAITING FOR COMPASS'
                  : aligned
                    ? 'LOCKED — LOOK UP'
                    : diff !== null && diff > 0
                      ? 'TURN RIGHT →'
                      : '← TURN LEFT'}
              </p>
            </div>
          </div>

          {needsPermission ? (
            <button
              onClick={() => void enableCompass()}
              className="rounded-full border border-[#7a1f1f] px-5 py-2.5 text-xs text-[#c66]"
            >
              Enable Compass
            </button>
          ) : noCompass && heading === null ? (
            <p className="max-w-[16rem] text-center text-[11px] leading-relaxed text-[#7a1f1f]">
              No compass on this device — use the sky map instead.
            </p>
          ) : null}

          {/* Target picker */}
          {targets.length > 0 && (
            <div className="flex max-w-full gap-2 overflow-x-auto pb-1">
              {targets.map((t) => (
                <button
                  key={t.name}
                  onClick={() => {
                    setTargetName(t.name);
                    lockedSpoken.current = null;
                    setLocked(false);
                  }}
                  aria-pressed={t.name === targetName}
                  className={`shrink-0 rounded-full border px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors ${
                    t.name === targetName
                      ? 'border-[#b91c1c] text-[#e88]'
                      : 'border-[#3a0d0d] text-[#7a1f1f]'
                  }`}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}
          {loading && <p className="text-[11px] text-[#7a1f1f]">Reading tonight…</p>}
        </div>

        <button
          onClick={onClose}
          className="font-mono text-[10px] uppercase tracking-[0.3em] text-[#5a1414] hover:text-[#a33] transition-colors"
        >
          Exit · Screen Returns
        </button>
      </div>
    </motion.div>
  );
}

// Re-export guard: AnimatePresence exit needs a keyed parent — App provides it.
export function BlackoutPointerGate(props: { open: boolean } & React.ComponentProps<typeof BlackoutPointer>) {
  const { open, ...rest } = props;
  return <AnimatePresence>{open && <BlackoutPointer {...rest} />}</AnimatePresence>;
}
