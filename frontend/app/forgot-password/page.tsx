'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Key,
  ShieldCheck,
  ArrowLeft,
  ClockCountdown,
  Eye,
  EyeSlash,
} from '@phosphor-icons/react';
import { useAuth } from '../../lib/auth';

type Step = 'email' | 'reset' | 'done';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const { forgotPassword, resetPassword, resendOtp, user, loading: authLoading } = useAuth();

  // Signed-in users don't need a password reset.
  useEffect(() => {
    if (!authLoading && user) router.replace('/dashboard');
  }, [authLoading, user, router]);

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (step !== 'reset' || resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, [step, resendIn]);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    setBusy(true);
    try {
      await forgotPassword(email);
      setInfo('If an account exists for that email, a password reset code has been sent.');
      setStep('reset');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    try {
      await resetPassword({ email, otp: otp.trim(), password, confirmPassword });
      setStep('done');
    } catch (err: any) {
      setError(err.message || 'Could not reset password');
    } finally {
      setBusy(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setBusy(true);
    try {
      await resendOtp(email, 'password_reset');
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
        <Link href="/" className="auth-brand" aria-label="Vault home">
          <ShieldCheck size={40} weight="duotone" color="var(--accent-strong)" aria-hidden="true" />
        </Link>

        {step === 'email' && (
          <>
            <h1>Forgot your password?</h1>
            <p className="auth-sub">
              Enter your account email and we will send you a one-time reset code.
            </p>
            <form className="flex-col mt-6" onSubmit={handleRequestCode} noValidate>
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
              {error && <p className="field-error" role="alert">{error}</p>}
              {info && <p className="helper" style={{ color: 'var(--accent-strong)' }}>{info}</p>}
              <button type="submit" className="btn btn-primary mt-4" disabled={busy}>
                {busy ? 'Sending…' : 'Send reset code'}
                {!busy && <Key size={16} weight="bold" aria-hidden="true" />}
              </button>
            </form>
            <p className="auth-foot">
              Remembered it?{' '}
              <Link href="/login" className="link">
                Sign in
              </Link>
            </p>
          </>
        )}

        {step === 'reset' && (
          <>
            <h1>Reset your password</h1>
            <p className="auth-sub">
              Enter the 6-digit code sent to <strong>{email}</strong> and choose a new password.
            </p>
            <form className="flex-col mt-6" onSubmit={handleReset} noValidate>
              <div className="form-group">
                <label className="label" htmlFor="otp">
                  Reset code
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
              <div className="form-group">
                <label className="label" htmlFor="password">
                  New password
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
                  Confirm new password
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
              <button type="submit" className="btn btn-primary mt-4" disabled={busy || otp.length !== 6}>
                {busy ? 'Resetting…' : 'Reset password'}
                {!busy && <Key size={16} weight="bold" aria-hidden="true" />}
              </button>
            </form>
            <div className="auth-resend">
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
                onClick={() => setStep('email')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <ArrowLeft size={13} weight="bold" /> Use a different email
              </button>
            </p>
          </>
        )}

        {step === 'done' && (
          <>
            <div className="auth-brand">
              <ShieldCheck size={40} weight="duotone" color="var(--accent-strong)" aria-hidden="true" />
            </div>
            <h1>Password updated</h1>
            <p className="auth-sub">
              Your password has been reset and all existing sessions were signed out.
              You can now sign in with your new password.
            </p>
            <Link href="/login" className="btn btn-primary mt-5" style={{ justifyContent: 'center' }}>
              Sign in
            </Link>
          </>
        )}
      </div>
    </div>
  );
}