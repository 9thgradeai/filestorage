'use client';

import { motion, useReducedMotion } from 'motion/react';
import type { ReactNode } from 'react';

export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export default function Reveal({
  children,
  delay = 0,
  className,
  y = 28,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  y?: number;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={`rvl ${className ?? ''}`}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}