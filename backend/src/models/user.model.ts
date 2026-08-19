import { pool } from '../config/database';
import { normalizeEmail } from '../services/otp.service';

export interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  email_verified_at: Date | null;
  created_at: Date;
}

export interface PublicUser {
  id: number;
  name: string;
  email: string;
  email_verified: boolean;
  created_at: Date;
}

// Never expose internal fields (password hash, verification timestamps, etc.).
export const toPublicUser = (row: {
  id: number;
  name?: string;
  email: string;
  email_verified_at?: Date | null;
  created_at: Date;
}): PublicUser => ({
  id: row.id,
  name: row.name || '',
  email: row.email,
  email_verified: Boolean(row.email_verified_at),
  created_at: row.created_at,
});

// Emails are stored lowercase; lookups compare case-insensitively so previously
// registered mixed-case addresses keep working.
export const UserModel = {
  async findByEmail(email: string): Promise<UserRow | undefined> {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE LOWER(email) = LOWER($1)',
      [normalizeEmail(email)]
    );
    return rows[0];
  },

  async findById(id: number): Promise<UserRow | undefined> {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
    return rows[0];
  },

  async create(data: {
    name: string;
    email: string;
    passwordHash: string;
  }): Promise<UserRow> {
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [data.name, normalizeEmail(data.email), data.passwordHash]
    );
    return rows[0];
  },

  async markEmailVerified(email: string): Promise<boolean> {
    const { rows } = await pool.query(
      `UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW())
       WHERE LOWER(email) = LOWER($1)
       RETURNING id`,
      [normalizeEmail(email)]
    );
    return rows.length > 0;
  },

  async updatePasswordHash(email: string, passwordHash: string): Promise<boolean> {
    const { rows } = await pool.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW()
       WHERE LOWER(email) = LOWER($2)
       RETURNING id`,
      [passwordHash, normalizeEmail(email)]
    );
    return rows.length > 0;
  },
};