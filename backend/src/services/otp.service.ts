import crypto from 'crypto';
import { pool } from '../config/database';

// One-time passcode lifecycle. Codes are 6 numeric digits (from a CSPRNG),
// stored only as SHA-256 hashes, short-lived, single-use, and protected against
// brute force with an attempt counter that invalidates the code past a limit.

export const OTP_TTL_MINUTES = parseInt(process.env.OTP_TTL_MINUTES || '10', 10);
export const OTP_MAX_ATTEMPTS = parseInt(process.env.OTP_MAX_ATTEMPTS || '5', 10);

export type OtpPurpose = 'email_verification' | 'password_reset';

// Read at call time (not module load) so tests can vary the value per-case.
const resendCooldownSeconds = (): number =>
  parseInt(process.env.OTP_RESEND_COOLDOWN_SECONDS || '60', 10);

const hashCode = (code: string): string =>
  crypto.createHash('sha256').update(code).digest('hex');

// Cryptographically-secure 6-digit code.
export const generateOtp = (): string =>
  crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

// Replace any prior unused code for (email, purpose) with a fresh one. Returns
// the code so the caller can email it out.
export const issueOtp = async (email: string, purpose: OtpPurpose): Promise<string> => {
  const normalized = normalizeEmail(email);
  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // One active code per (email, purpose): invalidate stale ones first.
    await client.query(
      'UPDATE email_otps SET used_at = NOW() WHERE email = $1 AND purpose = $2 AND used_at IS NULL',
      [normalized, purpose]
    );
    await client.query(
      `INSERT INTO email_otps (email, purpose, code_hash, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [normalized, purpose, hashCode(code), expiresAt]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  return code;
};

// Seconds remaining before another code may be issued for (email, purpose).
// Returns 0 when a resend is allowed.
export const secondsUntilResendAllowed = async (
  email: string,
  purpose: OtpPurpose
): Promise<number> => {
  const { rows } = await pool.query(
    `SELECT created_at FROM email_otps
     WHERE email = $1 AND purpose = $2
     ORDER BY id DESC LIMIT 1`,
    [normalizeEmail(email), purpose]
  );
  if (rows.length === 0) return 0;
  const createdAt = new Date(rows[0].created_at).getTime();
  const elapsed = (Date.now() - createdAt) / 1000;
  const cooldownSeconds = parseInt(
    process.env.OTP_RESEND_COOLDOWN_SECONDS || '60',
    10
  );
  return Math.max(0, Math.ceil(cooldownSeconds - elapsed));
};

// Atomically verify a code. Consumes the code on success, and counts each
// failure — once OTP_MAX_ATTEMPTS is exceeded the code is invalidated.
export const verifyOtp = async (
  email: string,
  purpose: OtpPurpose,
  code: string
): Promise<boolean> => {
  const normalized = normalizeEmail(email);
  const providedHash = hashCode(code);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT id, code_hash, expires_at, attempts, used_at
       FROM email_otps
       WHERE email = $1 AND purpose = $2
       ORDER BY id DESC LIMIT 1
       FOR UPDATE`,
      [normalized, purpose]
    );
    const row = rows[0] as
      | { id: number; code_hash: string; expires_at: string; attempts: number; used_at: string | null }
      | undefined;

    if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
      await client.query('COMMIT');
      return false;
    }

    if (row.attempts >= OTP_MAX_ATTEMPTS) {
      // Brute-force guard: burn the code.
      await client.query('UPDATE email_otps SET used_at = NOW() WHERE id = $1', [row.id]);
      await client.query('COMMIT');
      return false;
    }

    const match = crypto.timingSafeEqual(
      Buffer.from(row.code_hash, 'hex'),
      Buffer.from(providedHash, 'hex')
    );

    if (!match) {
      await client.query(
        'UPDATE email_otps SET attempts = attempts + 1 WHERE id = $1',
        [row.id]
      );
      await client.query('COMMIT');
      return false;
    }

    await client.query('UPDATE email_otps SET used_at = NOW() WHERE id = $1', [row.id]);
    await client.query('COMMIT');
    return true;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

// Housekeeping: drop codes older than their TTL (call at boot / on request).
export const purgeExpiredOtps = async (): Promise<void> => {
  await pool.query('DELETE FROM email_otps WHERE expires_at < NOW()');
};