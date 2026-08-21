'use client';

import { useState } from 'react';
import Link from 'next/link';
import { List, X } from '@phosphor-icons/react';
import { useAuth } from '../../lib/auth';
import { Brand } from '../Brand';

const LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Security', href: '#security' },
  { label: 'FAQ', href: '#faq' },
];

export default function Nav() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <nav className={`nav nav--landing ${open ? 'nav-open' : ''}`}>
      <Link href="/" onClick={() => setOpen(false)}>
        <Brand />
      </Link>
      <button
        type="button"
        className="nav-toggle"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        aria-controls="nav-menu"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? <X size={20} weight="bold" /> : <List size={20} weight="bold" />}
      </button>
      <div id="nav-menu" className="nav-links">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} className="link" onClick={() => setOpen(false)}>
            {l.label}
          </a>
        ))}
        {!user && (
          <Link href="/login" className="link" onClick={() => setOpen(false)}>
            Sign in
          </Link>
        )}
        <Link
          href={user ? '/dashboard' : '/register'}
          className="btn btn-secondary btn-sm"
          onClick={() => setOpen(false)}
        >
          {user ? 'Dashboard' : 'Get started'}
        </Link>
      </div>
    </nav>
  );
}