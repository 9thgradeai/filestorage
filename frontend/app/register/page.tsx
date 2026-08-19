'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserPlus } from '@phosphor-icons/react';
import { useAuth } from '../../lib/auth';
import { Brand } from '../../components/Brand';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(email, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
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
        <h1>Create your account</h1>
        <p className="auth-sub">Your encrypted vault is seconds away.</p>

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
              autoComplete="new-password"
              minLength={8}
              required
            />
            <p className="helper">
              Minimum 8 characters, with an uppercase, a lowercase, a number, and a symbol.
            </p>
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary mt-4" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
            {!busy && <UserPlus size={16} weight="bold" />}
          </button>
        </form>

        <p className="auth-note">PASSWORDS HASHED WITH BCRYPT · 12 ROUNDS</p>

        <p className="auth-foot">
          Already have an account?{' '}
          <Link href="/login" className="link">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}