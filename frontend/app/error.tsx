'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { ShieldWarning } from '@phosphor-icons/react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Page error:', error);
  }, [error]);

  return (
    <div className="error-wrap">
      <div className="error-card">
        <ShieldWarning size={48} weight="duotone" color="#ef4444" />
        <h1>Something went wrong</h1>
        <p className="error-desc">
          An unexpected error occurred on this page.
        </p>
        {error.digest && (
          <code className="error-code">Error: {error.digest}</code>
        )}
        <div className="error-actions">
          <button onClick={reset} className="btn btn-primary">
            Try Again
          </button>
          <Link href="/" className="btn btn-ghost">
            Go Home
          </Link>
        </div>
      </div>
    </div>
  );
}
