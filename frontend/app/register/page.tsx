'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  UserPlus,
  ShieldCheck,
  ArrowLeft,
  ClockCountdown,
  Eye,
  EyeSlash,
} from '@phosphor-icons/react';
import { useAuth } from '../../lib/auth';

export default function RegisterPage() {
  const router = useRouter();
  const { register, verifyEmail, resendOtp } = useAuth();

  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  // Countdown shown on the OTP step so users know when they can request a new code.
  useEffect(() => {
    if (step !== 'verify' || resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [step, resendIn]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await register({ name, email, password, confirmPassword });
      setStep('verify');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await verifyEmail(email, otp.trim());
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setBusy(true);
    try {
      await resendOtp(email, 'email_verification');
      setOtp('');
      setResendIn(60);
    } catch (err: any) {
      setError(err.message || 'Could not resend code');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        {step === 'form' ? (
          <>
            <Link href="/" className="auth-brand" aria-label="Vault home">
              <ShieldCheck size={40} weight="duotone" color="var(--accent-strong)" aria-hidden="true" />
            </Link>
            <h1>Create your account</h1>
            <p className="auth-sub">Your encrypted vault is seconds away.</p>

            <form className="flex-col mt-6" onSubmit={handleRegister} noValidate>
              <div className="form-group">
                <label className="label" htmlFor="name">
                  Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                  placeholder="Jane Doe"
                  autoComplete="name"
                  minLength={2}
                  maxLength={100}
                  required
                />
              </div>
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
                    autoComplete="new-password"
                    minLength={8}
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
                <p className="helper">
                  Minimum 8 characters, with an uppercase, a lowercase, a number, and a symbol.
                </p>
              </div>
              <div className="form-group">
                <label className="label" htmlFor="confirmPassword">
                  Confirm password
                </label>
                <div className="input-wrap">
                  <input
                    id="confirmPassword"
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input"
                    placeholder="••••••••"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                  <button
                    type="button"
                    className="input-toggle"
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    aria-pressed={showConfirm}
                    onClick={() => setShowConfirm((v) => !v)}
                  >
                    {showConfirm ? (
                      <EyeSlash size={17} weight="bold" aria-hidden="true" />
                    ) : (
                      <Eye size={17} weight="bold" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>
              {error && <p className="field-error" role="alert">{error}</p>}
              <button type="submit" className="btn btn-primary mt-4" disabled={busy}>
                {busy ? 'Creating account…' : 'Create account'}
                {!busy && <UserPlus size={16} weight="bold" aria-hidden="true" />}
              </button>
            </form>

            <p className="auth-note">PASSWORDS HASHED WITH BCRYPT · 12 ROUNDS</p>

            <p className="auth-foot">
              Already have an account?{' '}
              <Link href="/login" className="link">
                Sign in
              </Link>
            </p>
          </>
        ) : (
          <>
            <div className="auth-brand">
              <ShieldCheck size={40} weight="duotone" color="var(--accent-strong)" aria-hidden="true" />
            </div>
            <h1>Check your email</h1>
            <p className="auth-sub">
              We sent a 6-digit code to <strong>{email}</strong>. Enter it below to
              verify your email and activate your account.
            </p>

            <form className="flex-col mt-6" onSubmit={handleVerify} noValidate>
              <div className="form-group">
                <label className="label" htmlFor="otp">
                  Verification code
                </label>
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="input otp-input"
                  placeholder="••••••"
                  required
                  autoFocus
                />
              </div>
              {error && <p className="field-error" role="alert">{error}</p>}
              <button type="submit" className="btn btn-primary mt-4" disabled={busy || otp.length !== 6}>
                {busy ? 'Verifying…' : 'Verify & continue'}
                {!busy && <ShieldCheck size={16} weight="bold" aria-hidden="true" />}
              </button>
            </form>

            <div className="auth-foot" style={{ marginTop: '1.25rem' }}>
              {resendIn > 0 ? (
                <span className="muted">
                  <ClockCountdown size={14} weight="bold" /> Resend available in {resendIn}s
                </span>
              ) : (
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleResend} disabled={busy}>
                  Resend code
                </button>
              )}
            </div>

            <p className="auth-foot">
              <button
                type="button"
                className="link"
                onClick={() => setStep('form')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <ArrowLeft size={13} weight="bold" /> Edit email or password
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}