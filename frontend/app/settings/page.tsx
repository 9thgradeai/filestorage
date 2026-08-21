'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  User,
  Envelope,
  Lock,
  Warning,
  Eye,
  EyeSlash,
  ShieldCheck,
} from '@phosphor-icons/react';
import { useAuth } from '../../lib/auth';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const router = useRouter();
  const { user, loading: authLoading, updateProfile, changePassword, changeEmail, deleteAccount } = useAuth();

  // Profile form
  const [name, setName] = useState('');
  const [nameSet, setNameSet] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);

  // Email form
  const [newEmail, setNewEmail] = useState('');
  const [emailPassword, setEmailPassword] = useState('');
  const [showEmailPw, setShowEmailPw] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);

  // Delete account
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeletePw, setShowDeletePw] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Initialize name from user
  if (user && !nameSet) {
    setName(user.name);
    setNameSet(true);
  }

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [authLoading, user, router]);

  if (authLoading) {
    return (
      <div className="settings-wrap">
        <div className="settings-loading">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  const handleProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Name is required');
    if (name.trim() === user.name) return;
    setProfileBusy(true);
    try {
      await updateProfile(name.trim());
      toast.success('Profile updated');
    } catch (err: any) {
      toast.error(err.message || 'Failed to update profile');
    } finally {
      setProfileBusy(false);
    }
  };

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match');
    setPasswordBusy(true);
    try {
      await changePassword(currentPassword, newPassword, confirmPassword);
      toast.success('Password changed');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to change password');
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim()) return toast.error('New email is required');
    setEmailBusy(true);
    try {
      await changeEmail(newEmail, emailPassword);
      toast.success('Email changed. Check your new email for verification code.');
      setNewEmail('');
      setEmailPassword('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to change email');
    } finally {
      setEmailBusy(false);
    }
  };

  const handleDelete = async () => {
    setDeleteBusy(true);
    try {
      await deleteAccount(deletePassword);
      toast.success('Account deleted');
      router.push('/');
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete account');
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="settings-wrap">
      <div className="settings-card">
        <Link href="/dashboard" className="settings-back" aria-label="Back to dashboard">
          <ArrowLeft size={18} weight="bold" />
          <span>Back to Dashboard</span>
        </Link>

        <div className="settings-header">
          <ShieldCheck size={32} weight="duotone" color="var(--accent-strong)" />
          <div>
            <h1>Settings</h1>
            <p className="settings-sub">Manage your account</p>
          </div>
        </div>

        {/* Profile */}
        <section className="settings-section">
          <h2><User size={16} weight="duotone" /> Profile</h2>
          <form onSubmit={handleProfile} noValidate>
            <div className="form-group">
              <label className="label" htmlFor="name">Display Name</label>
              <input
                id="name"
                type="text"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                minLength={2}
                maxLength={100}
                required
              />
            </div>
            <div className="form-group">
              <label className="label">Email</label>
              <input
                type="email"
                className="input"
                value={user.email}
                disabled
                style={{ opacity: 0.6, cursor: 'not-allowed' }}
              />
              <span className="form-hint">
                {user.email_verified ? 'Verified' : 'Not verified'}
              </span>
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={profileBusy || !name.trim() || name.trim() === user.name}
            >
              {profileBusy ? 'Saving...' : name.trim() === user.name ? 'Saved' : 'Save Changes'}
            </button>
          </form>
        </section>

        <hr className="settings-divider" />

        {/* Change Password */}
        <section className="settings-section">
          <h2><Lock size={16} weight="duotone" /> Change Password</h2>
          <form onSubmit={handlePassword} noValidate>
            <div className="form-group">
              <label className="label" htmlFor="current-pw">Current Password</label>
              <div className="input-group">
                <input
                  id="current-pw"
                  type={showCurrentPw ? 'text' : 'password'}
                  className="input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="input-icon"
                  onClick={() => setShowCurrentPw(!showCurrentPw)}
                  tabIndex={-1}
                >
                  {showCurrentPw ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div className="form-group">
              <label className="label" htmlFor="new-pw">New Password</label>
              <div className="input-group">
                <input
                  id="new-pw"
                  type={showNewPw ? 'text' : 'password'}
                  className="input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="input-icon"
                  onClick={() => setShowNewPw(!showNewPw)}
                  tabIndex={-1}
                >
                  {showNewPw ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <span className="form-hint">
                Min 8 chars, mixed case, number, special character
              </span>
            </div>
            <div className="form-group">
              <label className="label" htmlFor="confirm-pw">Confirm New Password</label>
              <input
                id="confirm-pw"
                type={showNewPw ? 'text' : 'password'}
                className="input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={passwordBusy}>
              {passwordBusy ? 'Changing...' : 'Change Password'}
            </button>
          </form>
        </section>

        <hr className="settings-divider" />

        {/* Change Email */}
        <section className="settings-section">
          <h2><Envelope size={16} weight="duotone" /> Change Email</h2>
          <form onSubmit={handleEmail} noValidate>
            <div className="form-group">
              <label className="label" htmlFor="new-email">New Email</label>
              <input
                id="new-email"
                type="email"
                className="input"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </div>
            <div className="form-group">
              <label className="label" htmlFor="email-pw">Current Password</label>
              <div className="input-group">
                <input
                  id="email-pw"
                  type={showEmailPw ? 'text' : 'password'}
                  className="input"
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="input-icon"
                  onClick={() => setShowEmailPw(!showEmailPw)}
                  tabIndex={-1}
                >
                  {showEmailPw ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <span className="form-hint">
                Your new email will need verification
              </span>
            </div>
            <button type="submit" className="btn btn-primary" disabled={emailBusy}>
              {emailBusy ? 'Changing...' : 'Change Email'}
            </button>
          </form>
        </section>

        <hr className="settings-divider" />

        {/* Delete Account */}
        <section className="settings-section settings-danger">
          <h2><Warning size={16} weight="duotone" /> Delete Account</h2>
          <p className="settings-danger-text">
            This will permanently delete your account, all files, and all data. This action cannot be undone.
          </p>

          {!showDeleteConfirm ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => setShowDeleteConfirm(true)}
            >
              Delete Account
            </button>
          ) : (
            <div className="settings-delete-confirm">
              <div className="form-group">
                <label className="label" htmlFor="delete-pw">Enter your password to confirm</label>
                <div className="input-group">
                  <input
                    id="delete-pw"
                    type={showDeletePw ? 'text' : 'password'}
                    className="input"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="Your password"
                  />
                  <button
                    type="button"
                    className="input-icon"
                    onClick={() => setShowDeletePw(!showDeletePw)}
                    tabIndex={-1}
                  >
                    {showDeletePw ? <EyeSlash size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="settings-delete-actions">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => { setShowDeleteConfirm(false); setDeletePassword(''); }}
                  disabled={deleteBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={handleDelete}
                  disabled={deleteBusy || !deletePassword}
                >
                  {deleteBusy ? 'Deleting...' : 'Permanently Delete'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
