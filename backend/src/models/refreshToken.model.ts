import crypto from 'crypto';
import { pool } from '../config/database';
import { randomToken } from '../utils/crypto';

// Persist only the SHA-256 hash of each refresh token. The raw token value is
// returned once to the client (in an HttpOnly cookie) and never stored.

const hashToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

interface ValidRefreshToken {
  id: number;
  user_id: number;
}

export const RefreshTokenModel = {
  async create(userId: number, daysToLive: number): Promise<string> {
    const token = randomToken(48);
    const expiresAt = new Date(Date.now() + daysToLive * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [userId, hashToken(token), expiresAt.toISOString()]
    );
    return token;
  },

  // Validate + atomically rotate a refresh token. Returns the new raw token and
  // the owning user, or null if the token is unknown/revoked/expired.
  async rotate(token: string, daysToLive: number): Promise<{ token: string; userId: number } | null> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `SELECT id, user_id, expires_at, revoked_at
         FROM refresh_tokens
         WHERE token_hash = $1
         FOR UPDATE`,
        [hashToken(token)]
      );
      const row = rows[0] as
        | { id: number; user_id: number; expires_at: string; revoked_at: string | null }
        | undefined;

      if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) {
        await client.query('ROLLBACK');
        return null;
      }

      // Revoke the old token (prevents replay of a rotated token).
      await client.query(
        'UPDATE refresh_tokens SET revoked_at = NOW() WHERE id = $1',
        [row.id]
      );

      // Issue its replacement.
      const newToken = randomToken(48);
      const expiresAt = new Date(Date.now() + daysToLive * 24 * 60 * 60 * 1000);
      await client.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
         VALUES ($1, $2, $3)`,
        [row.user_id, hashToken(newToken), expiresAt.toISOString()]
      );

      await client.query('COMMIT');
      return { token: newToken, userId: row.user_id };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  async revoke(token: string): Promise<void> {
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [hashToken(token)]
    );
  },

  async revokeAllForUser(userId: number): Promise<void> {
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId]
    );
  },
};