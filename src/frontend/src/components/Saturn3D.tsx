import { useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from 'framer-motion';

/**
 * Enhanced 3D Saturn with realistic rings, slow rotation, and interactive tilt.
 * Inspired by perseverance.webflow.io — a living planetary system that responds
 * to pointer movement with spring-damped parallax.
 */
export function Saturn3D({ className = '' }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  // Pointer position normalized to -1..1
  const px = useMotionValue(0);
  const py = useMotionValue(0);

  const rotateY = useSpring(useTransform(px, [-1, 1], [-25, 25]), { stiffness: 60, damping: 20 });
  const rotateX = useSpring(useTransform(py, [-1, 1], [15, -15]), { stiffness: 60, damping: 20 });

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (reduce) return;
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    px.set(((e.clientX - r.left) / r.width) * 2 - 1);
    py.set(((e.clientY - r.top) / r.height) * 2 - 1);
  };

  const onPointerLeave = () => {
    px.set(0);
    py.set(0);
  };

  return (
    <div
      ref={containerRef}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={`pointer-events-auto relative ${className}`}
      style={{ perspective: '1200px' }}
      aria-hidden="true"
    >
      {/* Outer glow aura */}
      <div className="absolute inset-0 scale-[1.3] rounded-full bg-amber-400/8 blur-[80px]" />
      
      <motion.div
        className="relative"
        style={{ rotateX, rotateY, transformStyle: 'preserve-3d' }}
      >
        {/* Planet body with volumetric gradient */}
        <motion.div
          className="relative rounded-full"
          style={{
            width: 'clamp(18rem, 28vw, 26rem)',
            height: 'clamp(18rem, 28vw, 26rem)',
            background: `
              radial-gradient(circle at 35% 30%, #f5d89f 0%, #f5c97b 22%, #e5b068 48%, #c9984a 72%, #8d6832 100%)
            `,
            boxShadow: `
              0 0 80px -20px rgba(245, 201, 123, 0.5),
              inset -40px -40px 80px rgba(141, 104, 50, 0.8),
              inset 20px 20px 60px rgba(255, 255, 255, 0.1)
            `,
            transform: 'translateZ(40px)',
          }}
          animate={reduce ? undefined : { rotateZ: [0, 360] }}
          transition={{ duration: 180, repeat: Infinity, ease: 'linear' }}
        >
          {/* Surface texture overlay */}
          <div
            className="absolute inset-0 rounded-full opacity-30"
            style={{
              background: `
                repeating-linear-gradient(
                  90deg,
                  transparent,
                  transparent 8px,
                  rgba(201, 152, 74, 0.15) 8px,
                  rgba(201, 152, 74, 0.15) 10px
                )
              `,
              mixBlendMode: 'overlay',
            }}
          />
          
          {/* Polar cap highlight */}
          <div
            className="absolute inset-[20%] top-[15%] rounded-full"
            style={{
              background: 'radial-gradient(circle at 40% 30%, rgba(255, 255, 255, 0.3), transparent 50%)',
            }}
          />
        </motion.div>

        {/* Ring system — multiple tilted rings for depth */}
        {[
          { z: 35, scale: 1.8, opacity: 0.85, thickness: '24px', blur: 0 },
          { z: 30, scale: 1.75, opacity: 0.7, thickness: '20px', blur: 1 },
          { z: 25, scale: 1.7, opacity: 0.5, thickness: '16px', blur: 2 },
        ].map((ring, i) => (
          <div
            key={i}
            className="absolute inset-0 m-auto rounded-full"
            style={{
              width: `calc(clamp(18rem, 28vw, 26rem) * ${ring.scale})`,
              height: `calc(clamp(18rem, 28vw, 26rem) * ${ring.scale})`,
              border: `${ring.thickness} solid transparent`,
              borderImage: `
                linear-gradient(
                  90deg,
                  rgba(245, 201, 123, 0) 0%,
                  rgba(245, 201, 123, ${ring.opacity * 0.3}) 15%,
                  rgba(229, 176, 104, ${ring.opacity * 0.95}) 35%,
                  rgba(201, 152, 74, ${ring.opacity}) 50%,
                  rgba(229, 176, 104, ${ring.opacity * 0.95}) 65%,
                  rgba(245, 201, 123, ${ring.opacity * 0.3}) 85%,
                  rgba(245, 201, 123, 0) 100%
                ) 1
              `,
              transform: `rotateX(75deg) translateZ(${ring.z}px)`,
              transformStyle: 'preserve-3d',
              filter: ring.blur > 0 ? `blur(${ring.blur}px)` : 'none',
              boxShadow: `0 0 40px rgba(245, 201, 123, ${ring.opacity * 0.4})`,
            }}
          />
        ))}

        {/* Ring shadow cast on planet */}
        <div
          className="absolute inset-0 m-auto rounded-full pointer-events-none"
          style={{
            width: 'clamp(18rem, 28vw, 26rem)',
            height: 'clamp(18rem, 28vw, 26rem)',
            background: `
              radial-gradient(
                ellipse 60% 15% at 50% 45%,
                rgba(0, 0, 0, 0.6) 0%,
                rgba(0, 0, 0, 0.4) 40%,
                transparent 70%
              )
            `,
            transform: 'translateZ(41px)',
          }}
        />
      </motion.div>
    </div>
  );
}
