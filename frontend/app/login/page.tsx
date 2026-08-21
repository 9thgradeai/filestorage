'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  SignIn,
  ShieldCheck,
  Eye,
  EyeSlash,
  ArrowLeft,
  LockKey,
} from '@phosphor-icons/react';
import { useAuth } from '../../lib/auth';
import { Brand } from '../../components/Brand';

interface LoginError extends Error {
  status?: number;
  data?: any;
}

const VAULT_CHECKS = [
  { label: 'AES-256 ENCRYPTION AT REST', delayNote: 's3:sse' },
  { label: 'MAGIC-BYTE FILE VALIDATION', delayNote: 'upload' },
  { label: 'ROTATING SESSION TOKENS', delayNote: 'auth' },
  { label: 'SHARE LINKS EXPIRE IN 7 DAYS', delayNote: 'share' },
];

export default function LoginPage() {
  const router = useRouter();
  const { login, resendOtp, user, loading: authLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [unverified, setUnverified] = useState(false);
  const [busy, setBusy] = useState(false);

  // Signed-in users have no business on the login page.
  useEffect(() => {
    if (!authLoading && user) router.replace('/dashboard');
  }, [authLoading, user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setUnverified(false);
    setBusy(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      const loginErr = err as LoginError;
      if (loginErr.data?.code === 'EMAIL_NOT_VERIFIED') {
        setUnverified(true);
      } else {
        setError(loginErr.message || 'Login failed');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setBusy(true);
    try {
      await resendOtp(email, 'email_verification');
      setUnverified(false);
      setError('A new verification code has been sent to your email.');
    } catch (err: any) {
      setError(err.message || 'Could not resend code');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      {/* Brand immersion panel */}
      <aside className="auth-brandpanel" aria-hidden="true">
        <div className="auth-brand-top">
          <Brand />
        </div>

        <div className="auth-brand-mid">
          <span className="auth-kicker">
            <LockKey size={12} weight="bold" /> Restricted area
          </span>
          <h2 className="auth-brand-title">
            Security you can <em>verify.</em>
          </h2>
          <p className="auth-brand-sub">
            Every claim on this page runs in production code. Sign in and each
            layer checks itself before letting you in.
          </p>

          <div className="vault-term">
            <div className="vault-term-head">
              <span className="vault-term-dot" />
              Vault integrity check
            </div>
            <ul className="vault-checks">
              {VAULT_CHECKS.map((c) => (
                <li key={c.label} className="vault-check">
                  <span>{c.label}</span>
                  <span className="check-tag">[ok]</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="auth-brand-stats">
          <span><i className="stat-tick" /> 15-MIN ACCESS TOKENS</span>
          <span><i className="stat-tick" /> HTTPONLY COOKIES</span>
          <span><i className="stat-tick" /> ZERO LOCALSTORAGE</span>
        </div>
      </aside>

      {/* Form panel */}
      <main className="auth-formpanel">
        <div className="auth-formcard">
          <Link href="/" className="auth-back rise d1" aria-label="Back to Vault home">
            <ArrowLeft size={14} weight="bold" /> Back to home
          </Link>

          <span className="auth-mark rise d1" aria-hidden="true">
            <ShieldCheck size={22} weight="duotone" />
          </span>

          <p className="auth-eyebrow rise d1">Secure access</p>
          <h1 className="rise d2">Welcome back</h1>
          <p className="auth-sub rise d2">Sign in to open your vault.</p>

          <form className="flex-col mt-6 rise d3" onSubmit={handleSubmit} noValidate>
            <div className="form-group">
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@company.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="password">
                Password
              </label>
              <div className="input-wrap">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className="input-toggle"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? (
                    <EyeSlash size={17} weight="bold" aria-hidden="true" />
                  ) : (
                    <Eye size={17} weight="bold" aria-hidden="true" />
                  )}
                </button>
              </div>
              <div className="row space-between" style={{ marginTop: '0.4rem' }}>
                <span className="helper">
                  <Link href="/forgot-password" className="link">
                    Forgot password?
                  </Link>
                </span>
              </div>
            </div>
            {unverified && (
              <p className="field-error" role="alert">
                This account hasn&apos;t been verified yet. Check your inbox for the 6-digit code.
              </p>
            )}
            {error && <p className="field-error" role="alert">{error}</p>}
            <button type="submit" className="btn btn-primary auth-submit mt-4" disabled={busy}>
              {busy ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" /> Signing in…
                </>
              ) : (
                <>
                  Sign in <SignIn size={16} weight="bold" aria-hidden="true" />
                </>
              )}
            </button>
            {unverified && (
              <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={handleResend} disabled={busy}>
                Resend verification code
              </button>
            )}
          </form>

          <p className="auth-footnote rise d4">
            <LockKey size={12} weight="bold" /> Session managed with HttpOnly cookies
          </p>

          <p className="auth-foot rise d5">
            New here?{' '}
            <Link href="/register" className="link">
              Create an account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
