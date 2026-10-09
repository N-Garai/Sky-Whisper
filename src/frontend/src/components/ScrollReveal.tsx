import { motion, useInView, useReducedMotion } from 'framer-motion';
import { useRef, ReactNode } from 'react';

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  /** Fade out as user scrolls past (bidirectional) */
  bidirectional?: boolean;
}

const directionVariants = {
  up: { y: 60, x: 0 },
  down: { y: -60, x: 0 },
  left: { x: 60, y: 0 },
  right: { x: -60, y: 0 },
};

/**
 * Scroll-triggered reveal with fade + directional slide.
 * Bidirectional mode: fades in on scroll down, fades out on scroll up.
 * Inspired by Zentry's smooth, organic scroll choreography.
 */
export function ScrollReveal({
  children,
  className = '',
  delay = 0,
  direction = 'up',
  bidirectional = false,
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, {
    once: !bidirectional,
    margin: '-10% 0px -10% 0px',
  });
  const reduce = useReducedMotion();

  if (reduce) {
    return <div className={className}>{children}</div>;
  }

  const initial = directionVariants[direction];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, ...initial, filter: 'blur(10px)' }}
      animate={
        isInView
          ? { opacity: 1, y: 0, x: 0, filter: 'blur(0px)' }
          : bidirectional
          ? { opacity: 0, ...initial, filter: 'blur(10px)' }
          : undefined
      }
      transition={{
        duration: 0.9,
        delay,
        ease: [0.16, 1, 0.3, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Staggered reveal for lists — each child reveals with an incremental delay.
 */
export function ScrollRevealList({
  children,
  className = '',
  stagger = 0.12,
  direction = 'up',
}: {
  children: ReactNode[];
  className?: string;
  stagger?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
}) {
  return (
    <div className={className}>
      {children.map((child, i) => (
        <ScrollReveal key={i} delay={i * stagger} direction={direction}>
          {child}
        </ScrollReveal>
      ))}
    </div>
  );
}
