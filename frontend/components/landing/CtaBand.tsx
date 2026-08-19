'use client';

import Link from 'next/link';
import { ArrowRight } from '@phosphor-icons/react';
import { useAuth } from '../../lib/auth';
import Reveal from './Reveal';

export default function CtaBand() {
  const { user } = useAuth();
  return (
    <section className="section-pad" style={{ paddingTop: 0 }}>
      <div className="container">
        <Reveal>
          <div className="cta-band-big">
            <h2>
              Start storing files <span className="grad-text">the right way.</span>
            </h2>
            <p>Create an account and your first encrypted file is seconds away.</p>
            <Link
              href={user ? '/dashboard' : '/register'}
              className="btn btn-primary"
              style={{ fontSize: '1rem', padding: '0.9rem 1.8rem' }}
            >
              {user ? 'Open dashboard' : 'Get started'}
              <ArrowRight size={16} weight="bold" aria-hidden="true" />
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  );
}