import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  radius: number;
  baseAlpha: number;
  twinklePhase: number;
  twinklePeriod: number;
  /** Depth: 0 = farthest (barely moves), 1 = nearest (drifts fastest). */
  depth: number;
  /** Warm stars pick up an amber cast, cool ones stay starlight-white. */
  warm: boolean;
}

interface Shooting {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  depth: number;
  width: number;
}

const STAR_COUNT = 260;
const SHOOTING_MIN_MS = 14000;
const SHOOTING_MAX_MS = 30000;
/** Extra drift applied to the nearest layer so parallax is legible. */
const DRIFT_SPAN = [1.5, 7] as const;

/**
 * Living deep-space background.
 *
 * One canvas, three depth layers. Each star twinkles on its own sine phase
 * (2–7 s) and drifts sideways at a speed proportional to its depth, so the
 * field reads as volume rather than a flat texture. A shooting star streaks
 * across every 14–30 s.
 *
 * Performance choices that matter on a 0.1-vCPU laptop and a phone alike:
 *  - DPR is capped at 2 so retina phones don't render 3x the pixels.
 *  - The rAF loop is cancelled when the tab is hidden and resumed on return.
 *  - Under prefers-reduced-motion nothing animates: one static frame is drawn.
 */
export function Starfield({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let stars: Star[] = [];
    let shooting: Shooting | null = null;
    let nextShootingAt = performance.now() + SHOOTING_MIN_MS;
    let rafId = 0;
    let startTime = performance.now();
    let lastFrame = startTime;
    let running = false;

    /** Deterministic PRNG so the field is stable across resizes. */
    const makeRand = (seed: number) => {
      let s = seed;
      return () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
      };
    };

    const buildStars = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth || window.innerWidth;
      height = canvas.clientHeight || window.innerHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const rand = makeRand(42);
      stars = Array.from({ length: STAR_COUNT }, () => {
        const depth = rand();
        return {
          x: rand() * width,
          y: rand() * height,
          // Nearer stars are physically larger and brighter.
          radius: 0.35 + depth * depth * 1.7,
          baseAlpha: 0.18 + depth * 0.62,
          twinklePhase: rand() * Math.PI * 2,
          twinklePeriod: 2.2 + rand() * 4.8,
          depth,
          warm: rand() < 0.22,
        };
      });
    };

    const spawnShooting = () => {
      const fromLeft = Math.random() < 0.5;
      const depth = 0.55 + Math.random() * 0.45;
      const speed = 480 + depth * 420;
      const angle = Math.PI / 5.5 + Math.random() * (Math.PI / 7);
      shooting = {
        x: fromLeft ? -60 : width + 60,
        y: Math.random() * height * 0.5,
        vx: (fromLeft ? 1 : -1) * Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.55,
        life: 0,
        maxLife: 0.34 + depth * 0.16,
        depth,
        width: 1.1 + depth * 1.4,
      };
    };

    const drawStars = (t: number, animated: boolean) => {
      for (const s of stars) {
        const twinkle = animated
          ? 0.55 + 0.45 * Math.sin(t * ((Math.PI * 2) / s.twinklePeriod) + s.twinklePhase)
          : 0.85;
        const alpha = Math.max(0.04, s.baseAlpha * twinkle);

        // Horizontal drift scales with depth; near stars cross the frame.
        const drift = animated ? t * (DRIFT_SPAN[0] + s.depth * (DRIFT_SPAN[1] - DRIFT_SPAN[0])) : 0;
        const x = (((s.x + drift) % width) + width) % width;

        ctx.beginPath();
        ctx.arc(x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fillStyle = s.warm
          ? `rgba(245, 201, 123, ${alpha.toFixed(3)})`
          : `rgba(231, 236, 247, ${alpha.toFixed(3)})`;
        ctx.fill();

        // The nearest stars get a soft bloom — reads as glare, not a blur filter.
        if (s.depth > 0.82) {
          ctx.beginPath();
          ctx.arc(x, s.y, s.radius * 3.4, 0, Math.PI * 2);
          ctx.fillStyle = s.warm
            ? `rgba(245, 201, 123, ${(alpha * 0.07).toFixed(3)})`
            : `rgba(231, 236, 247, ${(alpha * 0.07).toFixed(3)})`;
          ctx.fill();
        }
      }
    };

    const drawShooting = (dt: number) => {
      if (!shooting && performance.now() >= nextShootingAt) {
        spawnShooting();
        nextShootingAt =
          performance.now() + SHOOTING_MIN_MS + Math.random() * (SHOOTING_MAX_MS - SHOOTING_MIN_MS);
      }
      if (!shooting) return;

      shooting.x += shooting.vx * dt;
      shooting.y += shooting.vy * dt;
      shooting.life += dt;

      const fade = Math.min(shooting.life / shooting.maxLife, 1);
      const tailX = shooting.x - shooting.vx * 0.055;
      const tailY = shooting.y - shooting.vy * 0.055;

      const grad = ctx.createLinearGradient(shooting.x, shooting.y, tailX, tailY);
      grad.addColorStop(0, `rgba(255, 233, 186, ${(0.95 * (1 - fade)).toFixed(3)})`);
      grad.addColorStop(0.35, `rgba(245, 201, 123, ${(0.45 * (1 - fade)).toFixed(3)})`);
      grad.addColorStop(1, 'rgba(245, 201, 123, 0)');

      ctx.beginPath();
      ctx.moveTo(shooting.x, shooting.y);
      ctx.lineTo(tailX, tailY);
      ctx.strokeStyle = grad;
      ctx.lineWidth = shooting.width;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Head flare.
      ctx.beginPath();
      ctx.arc(shooting.x, shooting.y, shooting.width * 0.9, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 244, 220, ${(0.9 * (1 - fade)).toFixed(3)})`;
      ctx.fill();

      if (shooting.life >= shooting.maxLife || shooting.x < -80 || shooting.x > width + 80) {
        shooting = null;
      }
    };

    const frame = (now: number) => {
      const t = (now - startTime) / 1000;
      const dt = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;

      ctx.clearRect(0, 0, width, height);
      drawStars(t, true);
      drawShooting(dt);

      rafId = requestAnimationFrame(frame);
    };

    const start = () => {
      if (running || reduce) return;
      running = true;
      lastFrame = performance.now();
      rafId = requestAnimationFrame(frame);
    };

    const stop = () => {
      running = false;
      cancelAnimationFrame(rafId);
    };

    const onResize = () => {
      buildStars();
      if (reduce) {
        ctx.clearRect(0, 0, width, height);
        drawStars(0, false);
      }
    };

    const onVisibility = () => {
      // Pause when the tab is hidden — battery and CPU matter on a phone.
      if (document.hidden) stop();
      else start();
    };

    buildStars();
    if (reduce) {
      ctx.clearRect(0, 0, width, height);
      drawStars(0, false);
    } else {
      start();
    }

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stop();
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 h-full w-full ${className}`}
      aria-hidden="true"
    />
  );
}
