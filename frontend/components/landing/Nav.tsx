'use client';

import Link from 'next/link';
import { useAuth } from '../../lib/auth';
import { Brand } from '../Brand';

const LINKS = [
  { label: 'Features', href: '#features' },
  { label: 'Security', href: '#security' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
];

export default function Nav() {
  const { user } = useAuth();
  return (
    <nav className="nav">
      <Link href="/">
        <Brand />
      </Link>
      <div className="nav-links" style={{ gap: '1.6rem' }}>
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} className="link">
            {l.label}
          </a>
        ))}
        <Link href="/login" className="link">
          Sign in
        </Link>
        <Link
          href={user ? '/dashboard' : '/register'}
          className="btn btn-secondary btn-sm"
        >
          {user ? 'Dashboard' : 'Get started'}
        </Link>
      </div>
    </nav>
  );
}