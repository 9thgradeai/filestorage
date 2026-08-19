'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SignIn, ShieldCheck } from '@phosphor-icons/react';
import { useAuth } from '../../lib/auth';

interface LoginError extends Error {
  status?: number;
  data?: any;
}

export default function LoginPage() {
  const router = useRouter();
  const { login, resendOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [unverified, setUnverified] = useState(false);
  const [busy, setBusy] = useState(false);

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
    <div className="auth-wrap">
      <div className="auth-card">
        <Link href="/" className="auth-brand">
          <ShieldCheck size={40} weight="duotone" color="var(--accent-strong)" />
        </Link>
        <h1>Welcome back</h1>
        <p className="auth-sub">Sign in to your vault.</p>

        <form className="flex-col mt-6" onSubmit={handleSubmit} noValidate>
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
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="input"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
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
          <button type="submit" className="btn btn-primary mt-4" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
            {!busy && <SignIn size={16} weight="bold" />}
          </button>
          {unverified && (
            <button type="button" className="btn btn-ghost btn-sm mt-3" onClick={handleResend} disabled={busy}>
              Resend verification code
            </button>
          )}
        </form>

        <p className="auth-note">SESSION MANAGED WITH HTTPONLY COOKIES</p>

        <p className="auth-foot">
          New here?{' '}
          <Link href="/register" className="link">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  );
}