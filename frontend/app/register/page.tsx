'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  UserPlus,
  ShieldCheck,
  ArrowLeft,
  ClockCountdown,
  Eye,
  EyeSlash,
  LockKey,
} from '@phosphor-icons/react';
import { useAuth } from '../../lib/auth';
import { Brand } from '../../components/Brand';
import { isValidEmail, passwordIssue } from '../../lib/validate';

const VAULT_CHECKS = [
  'PASSWORD HASHED · BCRYPT 12 ROUNDS',
  'OTP VERIFICATION REQUIRED',
  'NO SESSION BEFORE VERIFY',
];

const STRENGTH_LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];

export default function RegisterPage() {
  const router = useRouter();
  const { register, verifyEmail, resendOtp, user, loading: authLoading } = useAuth();

  // Signed-in users have no business on the register page.
  useEffect(() => {
    if (!authLoading && user) router.replace('/dashboard');
  }, [authLoading, user, router]);

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

  // Live password strength: length + character classes (mirrors backend policy).
  const pwScore = useMemo(() => {
    if (!password) return 0;
    let s = 0;
    if (password.length >= 8) s += 1;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) s += 1;
    if (/\d/.test(password)) s += 1;
    if (/[^A-Za-z0-9]/.test(password)) s += 1;
    return s;
  }, [password]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) return setError('Name is required');
    if (!email.trim()) return setError('Email is required');
    if (!isValidEmail(email)) return setError('Enter a valid email address');
    const pwIssue = passwordIssue(password);
    if (pwIssue) return setError(pwIssue);
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
    if (!otp.trim()) return setError('Verification code is required');
    if (!/^\d{6}$/.test(otp.trim())) return setError('The code is 6 digits');
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
            Build your vault in <em>seconds.</em>
          </h2>
          <p className="auth-brand-sub">
            One account, every layer of protection already on. Verify your email
            and the vault seals itself behind you.
          </p>

          <div className="vault-term">
            <div className="vault-term-head">
              <span className="vault-term-dot" />
              Account provisioning
            </div>
            <ul className="vault-checks">
              <li className="vault-check"><span>{VAULT_CHECKS[0]}</span><span className="check-tag">[ok]</span></li>
              <li className="vault-check"><span>{VAULT_CHECKS[1]}</span><span className="check-tag">[ok]</span></li>
              <li className="vault-check"><span>{VAULT_CHECKS[2]}</span><span className="check-tag">[ok]</span></li>
              <li className="vault-check"><span>5 GB ENCRYPTED STORAGE</span><span className="check-tag">[ok]</span></li>
            </ul>
          </div>
        </div>

        <div className="auth-brand-stats">
          <span><i className="stat-tick" /> MAGIC-BYTE VALIDATION</span>
          <span><i className="stat-tick" /> AES-256 AT REST</span>
        </div>
      </aside>

      {/* Form panel */}
      <main className="auth-formpanel">
        <div className="auth-formcard">
          {step === 'form' ? (
            <>
              <Link href="/" className="auth-back rise d1" aria-label="Back to Vault home">
                <ArrowLeft size={14} weight="bold" /> Back to home
              </Link>

              <span className="auth-mark rise d1" aria-hidden="true">
                <ShieldCheck size={22} weight="duotone" />
              </span>

              <p className="auth-eyebrow rise d1">Create account</p>
              <h1 className="rise d2">Your encrypted vault awaits.</h1>
              <p className="auth-sub rise d2">Seconds to create. Sealed from the first file.</p>

              <form className="flex-col mt-6 rise d3" onSubmit={handleRegister} noValidate>
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
                  {password && (
                    <div className="pw-meter" aria-live="polite">
                      {[1, 2, 3, 4].map((n) => (
                        <span
                          key={n}
                          className={`pw-seg${pwScore >= n ? ` s${pwScore}` : ''}`}
                        />
                      ))}
                      <span className={`pw-label l${pwScore}`}>
                        {STRENGTH_LABELS[pwScore]}
                      </span>
                    </div>
                  )}
                  {!password && (
                    <p className="helper">
                      Min 8 characters with an uppercase, lowercase, number, and symbol.
                    </p>
                  )}
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
                <button type="submit" className="btn btn-primary auth-submit mt-4" disabled={busy}>
                  {busy ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" /> Creating account…
                    </>
                  ) : (
                    <>
                      Create account <UserPlus size={16} weight="bold" aria-hidden="true" />
                    </>
                  )}
                </button>
              </form>

              <p className="auth-footnote rise d4">
                <LockKey size={12} weight="bold" /> Hashed with bcrypt · never stored in plain text
              </p>

              <p className="auth-foot rise d5">
                Already have an account?{' '}
                <Link href="/login" className="link">
                  Sign in
                </Link>
              </p>
            </>
          ) : (
            <>
              <span className="auth-mark rise d1" aria-hidden="true">
                <ShieldCheck size={22} weight="duotone" />
              </span>

              <p className="auth-eyebrow rise d1">Verify email</p>
              <h1 className="rise d2">Check your inbox.</h1>
              <p className="auth-sub rise d2">
                We sent a 6-digit code to <strong>{email}</strong>. Enter it below
                to activate your account.
              </p>

              <form className="flex-col mt-6 rise d3" onSubmit={handleVerify} noValidate>
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
                <button
                  type="submit"
                  className="btn btn-primary auth-submit mt-4"
                  disabled={busy || otp.length !== 6}
                >
                  {busy ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" /> Verifying…
                    </>
                  ) : (
                    <>
                      Verify &amp; continue <ShieldCheck size={16} weight="bold" aria-hidden="true" />
                    </>
                  )}
                </button>
              </form>

              <div className="auth-foot rise d4" style={{ marginTop: '1.25rem' }}>
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

              <p className="auth-foot rise d5">
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
      </main>
    </div>
  );
}
