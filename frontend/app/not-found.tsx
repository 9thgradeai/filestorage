'use client';

import Link from 'next/link';
import { Warning } from '@phosphor-icons/react';

export default function NotFound() {
  return (
    <div className="error-wrap">
      <div className="error-card">
        <Warning size={48} weight="duotone" color="#f59e0b" />
        <h1>Page not found</h1>
        <p className="error-desc">
          The page you are looking for does not exist or has been moved.
        </p>
        <div className="error-actions">
          <Link href="/" className="btn btn-primary">
            Go Home
          </Link>
          <Link href="/dashboard" className="btn btn-ghost">
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
