import { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  radius: number;
  baseAlpha: number;
  twinklePhase: number;
  twinklePeriod: number;
  drift: number;
}

interface Shooting {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

const STAR_COUNT = 220;
const SHOOTING_MIN_MS = 18000;
const SHOOTING_MAX_MS = 35000;

/**
 * Living starfield — a single canvas, drawn with requestAnimationFrame.
 *
 * ~220 stars with per-star twinkle (sine phase offsets, 2–7 s periods) and
 * slow parallax drift; a shooting star streaks across every 18–35 s. Under
 * prefers-reduced-motion the canvas is not animated at all and a static
 * star field is drawn once instead.
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

    const buildStars = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Deterministic-ish PRNG so the field is stable across resizes.
      let seed = 42;
      const rand = () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
      };

      stars = Array.from({ length: STAR_COUNT }, () => {
        const depth = rand(); // 0 far .. 1 near
        return {
          x: rand() * width,
          y: rand() * height,
          radius: 0.4 + depth * 1.6,
          baseAlpha: 0.25 + depth * 0.65,
          twinklePhase: rand() * Math.PI * 2,
          twinklePeriod: 2 + rand() * 5,
          drift: 2 + rand() * 4, // px/s, slow parallax
        };
      });
    };

    const spawnShooting = () => {
      const fromLeft = Math.random() < 0.5;
      const speed = 520 + Math.random() * 320;
      const angle = (Math.PI / 5) + Math.random() * (Math.PI / 6);
      shooting = {
        x: fromLeft ? -40 : width + 40,
        y: Math.random() * height * 0.45,
        vx: fromLeft ? Math.cos(angle) * speed : -Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed * 0.6,
        life: 0,
        maxLife: 0.32,
      };
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, width, height);
      for (const s of stars) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(231, 236, 247, ${s.baseAlpha})`;
        ctx.fill();
      }
    };

    const frame = (now: number) => {
      const t = (now - startTime) / 1000;
      const dt = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;

      ctx.clearRect(0, 0, width, height);

      for (const s of stars) {
        const twinkle = 0.55 + 0.45 * Math.sin(t * (Math.PI * 2 / s.twinklePeriod) + s.twinklePhase);
        const alpha = Math.max(0.05, s.baseAlpha * twinkle);
        let x = (s.x + t * s.drift) % width;
        if (x < 0) x += width;

        ctx.beginPath();
        ctx.arc(x, s.y, s.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(231, 236, 247, ${alpha.toFixed(3)})`;
        ctx.fill();
      }

      if (!shooting && now >= nextShootingAt) {
        spawnShooting();
        nextShootingAt = now + SHOOTING_MIN_MS + Math.random() * (SHOOTING_MAX_MS - SHOOTING_MIN_MS);
      }

      if (shooting) {
        shooting.x += shooting.vx * dt;
        shooting.y += shooting.vy * dt;
        shooting.life += dt;

        const fade = Math.min(shooting.life / shooting.maxLife, 1);
        const tailX = shooting.x - shooting.vx * 0.06;
        const tailY = shooting.y - shooting.vy * 0.06;

        const grad = ctx.createLinearGradient(shooting.x, shooting.y, tailX, tailY);
        grad.addColorStop(0, `rgba(245, 201, 123, ${0.9 * (1 - fade)})`);
        grad.addColorStop(1, 'rgba(245, 201, 123, 0)');

        ctx.beginPath();
        ctx.moveTo(shooting.x, shooting.y);
        ctx.lineTo(tailX, tailY);
        ctx.strokeStyle = grad;
        ctx.lineWidth = 2;
        ctx.stroke();

        if (shooting.life >= shooting.maxLife || shooting.x < -60 || shooting.x > width + 60) {
          shooting = null;
        }
      }

      rafId = requestAnimationFrame(frame);
    };

    const drawAurora = () => {
      // Slow color-graded gradient drift behind the stars — the "space vibe".
      const t = (performance.now() - startTime) / 1000;
      const g = ctx.createLinearGradient(0, 0, 0, height);
      const a1 = 0.10 + 0.05 * Math.sin(t * 0.12);
      const a2 = 0.05 + 0.03 * Math.sin(t * 0.08 + 1.5);
      g.addColorStop(0, `rgba(11, 16, 38, ${a1.toFixed(3)})`);
      g.addColorStop(0.55, `rgba(20, 26, 58, ${a2.toFixed(3)})`);
      g.addColorStop(1, 'rgba(5, 8, 20, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);
    };

    const loop = (now: number) => {
      drawAurora();
      frame(now);
    };

    buildStars();

    if (reduce) {
      drawAurora();
      drawStatic();
    } else {
      rafId = requestAnimationFrame(loop);
    }

    const onResize = () => {
      buildStars();
      if (reduce) {
        drawAurora();
        drawStatic();
      }
    };

    const onVisibility = () => {
      // Pause when the tab is hidden — battery and CPU matter on a phone.
      if (document.hidden) {
        cancelAnimationFrame(rafId);
      } else if (!reduce) {
        lastFrame = performance.now();
        rafId = requestAnimationFrame(loop);
      }
    };

    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full ${className}`}
      aria-hidden="true"
    />
  );
}
