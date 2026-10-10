import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import * as THREE from 'three';

interface Particle {
  x: number;
  y: number;
  z: number; // depth 0-1
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  hue: number; // 0=amber, 1=purple
}

/**
 * Dynamic deep-space background with layered particles, nebula clouds,
 * and subtle aurora gradients. Inspired by Zentry and Spaced — living,
 * breathing depth that never repeats.
 */
/*
 * Rotating point-cloud layer (a cyan point cloud over a starfield): 5,000 cyan
 * points in a 100-unit cube, rotated slowly on X and Y. Sits over the canvas
 * starfield base, and is skipped entirely under prefers-reduced-motion.
 */
function PointCloudLayer() {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
    camera.position.z = 10;

    const count = 5000;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i++) pos[i] = (Math.random() - 0.5) * 100;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0x00f5ff,
      size: 0.15,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const t = (performance.now() - start) / 1000;
      points.rotation.x = t * 0.05;
      points.rotation.y = t * 0.03;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={mountRef} className="pointer-events-none absolute inset-0" />;
}

export function DynamicSpaceBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let particles: Particle[] = [];
    let rafId = 0;
    let time = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.scale(dpr, dpr);
    };

    const initParticles = () => {
      particles = [];
      const count = reduce ? 80 : Math.min(200, Math.floor((width * height) / 8000));
      
      for (let i = 0; i < count; i++) {
        const z = Math.pow(Math.random(), 2); // bias toward distant
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          z,
          vx: (Math.random() - 0.5) * (0.15 + z * 0.4),
          vy: (Math.random() - 0.5) * (0.1 + z * 0.3) + z * 0.08,
          radius: 0.8 + z * 2.2,
          alpha: 0.15 + z * 0.75,
          hue: Math.random(),
        });
      }
    };

    const drawNebulaLayer = (t: number) => {
      // Flowing gradient nebulae — three overlapping color washes
      const layers = [
        {
          x: width * (0.3 + Math.sin(t * 0.00015) * 0.15),
          y: height * (0.2 + Math.cos(t * 0.0001) * 0.1),
          r: Math.min(width, height) * (0.5 + Math.sin(t * 0.0002) * 0.1),
          color: 'rgba(109, 92, 240, 0.08)',
        },
        {
          x: width * (0.7 + Math.cos(t * 0.00012) * 0.12),
          y: height * (0.6 + Math.sin(t * 0.00015) * 0.15),
          r: Math.min(width, height) * (0.45 + Math.cos(t * 0.00018) * 0.08),
          color: 'rgba(245, 201, 123, 0.05)',
        },
        {
          x: width * (0.5 + Math.sin(t * 0.0001) * 0.1),
          y: height * (0.8 + Math.cos(t * 0.00013) * 0.12),
          r: Math.min(width, height) * (0.4 + Math.sin(t * 0.00016) * 0.09),
          color: 'rgba(127, 216, 234, 0.04)',
        },
      ];

      ctx.save();
      ctx.filter = 'blur(80px)';
      layers.forEach(({ x, y, r, color }) => {
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, color);
        grad.addColorStop(0.7, 'rgba(0,0,0,0)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);
      });
      ctx.restore();
    };

    const drawParticles = (t: number) => {
      particles.forEach((p) => {
        // Update position with depth-based speed
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around edges
        if (p.x < -50) p.x = width + 50;
        if (p.x > width + 50) p.x = -50;
        if (p.y < -50) p.y = height + 50;
        if (p.y > height + 50) p.y = -50;

        // Subtle pulsing
        const pulse = reduce ? 1 : 0.85 + Math.sin(t * 0.002 + p.x * 0.01) * 0.15;

        // Color mix: amber to purple based on hue
        const amber = [245, 201, 123];
        const purple = [109, 92, 240];
        const r = Math.round(amber[0] * (1 - p.hue) + purple[0] * p.hue);
        const g = Math.round(amber[1] * (1 - p.hue) + purple[1] * p.hue);
        const b = Math.round(amber[2] * (1 - p.hue) + purple[2] * p.hue);

        // Draw particle with soft glow
        const alpha = p.alpha * pulse;
        const glowSize = p.radius * 4;
        
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowSize);
        grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${alpha})`);
        grad.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${alpha * 0.4})`);
        grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

        ctx.fillStyle = grad;
        ctx.fillRect(p.x - glowSize, p.y - glowSize, glowSize * 2, glowSize * 2);

        // Core dot
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.min(1, alpha * 2)})`;        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      });
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      if (!reduce) {
        time += 16; // ~60fps
        drawNebulaLayer(time);
      }

      drawParticles(time);

      rafId = requestAnimationFrame(render);
    };

    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
      } else {
        render();
      }
    };

    resize();
    initParticles();
    render();

    window.addEventListener('resize', () => {
      resize();
      initParticles();
    });
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <>
      {/* Base gradient layer */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#020308] via-[#04060f] to-[#060913]" />
      
      {/* Animated aurora gradient overlay */}
      <motion.div
        className="absolute inset-0 opacity-30"
        style={{
          background: `
            radial-gradient(ellipse 80% 50% at 50% 0%, rgba(109, 92, 240, 0.15), transparent 70%),
            radial-gradient(ellipse 70% 50% at 50% 100%, rgba(245, 201, 123, 0.1), transparent 70%)
          `,
        }}
        animate={{
          opacity: [0.25, 0.35, 0.25],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />

      {/* Particle canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 mix-blend-screen"
        style={{ opacity: 0.85 }}
      />

      {/* Rotating cyan point cloud, a cyan point cloud over a starfield */}
      <PointCloudLayer />
    </>
  );
}
