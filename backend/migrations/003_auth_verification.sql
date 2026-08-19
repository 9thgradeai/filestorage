-- 003_auth_verification.sql
-- Account identity + email verification for OTP-based flows.

-- Existing accounts get an empty display name; new registrations must supply one.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS name VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMP;

-- One-time passcodes for email verification and password reset.
-- Only the SHA-256 hash of the code is stored; the raw code is never persisted.
-- `attempts` counts failed verifications so brute-forcing a 6-digit code is
-- impractical; after OTP_MAX_ATTEMPTS the code is invalidated.
-- expires_at is TIMESTAMPTZ so the app's UTC timestamps compare correctly.
CREATE TABLE IF NOT EXISTS email_otps (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  purpose VARCHAR(32) NOT NULL,           -- 'email_verification' | 'password_reset'
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_email_otps_email_purpose ON email_otps(email, purpose);
CREATE INDEX IF NOT EXISTS idx_email_otps_expires ON email_otps(expires_at);