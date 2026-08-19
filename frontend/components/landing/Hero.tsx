'use client';

import Link from 'next/link';
import { motion, useMotionValue, useMotionTemplate, useReducedMotion } from 'motion/react';
import { LockSimple, ArrowRight } from '@phosphor-icons/react';
import { useAuth } from '../../lib/auth';
import { ProductPreview } from '../ProductPreview';
import { EASE } from './Reveal';

export default function Hero() {
  const { user } = useAuth();
  const reduce = useReducedMotion();

  const mx = useMotionValue(50);
  const my = useMotionValue(30);
  const spot = useMotionTemplate`radial-gradient(560px circle at ${mx}% ${my}%, rgba(16,185,129,0.12), transparent 70%)`;

  return (
    <header className="hero-split">
      <div className="glow glow-emerald" style={{ width: 480, height: 480, top: -140, left: -160 }} />
      <motion.div
        className="hero-spot"
        style={reduce ? undefined : { background: spot }}
        onPointerMove={(e) => {
          if (reduce) return;
          const r = e.currentTarget.getBoundingClientRect();
          mx.set(((e.clientX - r.left) / r.width) * 100);
          my.set(((e.clientY - r.top) / r.height) * 100);
        }}
      />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: EASE }}
          className="eyebrow-pill"
        >
          <LockSimple size={12} weight="bold" aria-hidden="true" />
          Encrypted · Magic-byte validated
        </motion.div>

        <motion.h1
          className="hero-title"
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.08, ease: EASE }}
        >
          Store it like it&apos;s <em>classified.</em>
        </motion.h1>

        <motion.p
          className="hero-sub"
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.16, ease: EASE }}
        >
          Encrypted file storage with magic-byte validation, rotating sessions, and share links
          that expire on a schedule.
        </motion.p>

        <motion.div
          className="hero-cta"
          initial={reduce ? false : { opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.24, ease: EASE }}
        >
          <Link
            href={user ? '/dashboard' : '/register'}
            className="btn btn-primary"
            style={{ fontSize: '1rem', padding: '0.85rem 1.6rem' }}
          >
            {user ? 'Open dashboard' : 'Get started'}
            <ArrowRight size={16} weight="bold" aria-hidden="true" />
          </Link>
          <Link
            href="/login"
            className="btn btn-ghost"
            style={{ fontSize: '1rem', padding: '0.85rem 1.6rem' }}
          >
            Sign in
          </Link>
        </motion.div>
      </div>

      <motion.div
        initial={reduce ? false : { opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.9, delay: 0.32, ease: EASE }}
        style={{ position: 'relative', zIndex: 1 }}
      >
        <ProductPreview />
      </motion.div>
    </header>
  );
}