'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { SignIn } from '@phosphor-icons/react';
import { useAuth } from '../../lib/auth';
import { Brand } from '../../components/Brand';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await login(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Link href="/" className="auth-brand">
          <Brand />
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
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary mt-4" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
            {!busy && <SignIn size={16} weight="bold" />}
          </button>
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