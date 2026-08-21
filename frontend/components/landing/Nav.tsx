'use client';

import { useEffect, useState } from 'react';
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

  // Close the mobile drawer when tapping/scrolling outside it.
  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      const menu = document.getElementById('nav-menu');
      if (menu && !menu.contains(e.target as Node)) setOpen(false);
    };
    const close = () => setOpen(false);
    document.addEventListener('mousedown', onOutside);
    window.addEventListener('scroll', close, { passive: true });
    return () => {
      document.removeEventListener('mousedown', onOutside);
      window.removeEventListener('scroll', close);
    };
  }, [open]);

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