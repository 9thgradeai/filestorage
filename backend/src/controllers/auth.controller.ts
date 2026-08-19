import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { pool } from '../config/database';
import { validateRegistration } from '../services/validation';
import { logger } from '../config/logger';
import { RefreshTokenModel } from '../models/refreshToken.model';
import {
  signAccessToken,
  setAuthCookies,
  clearAuthCookies,
  REFRESH_TOKEN_DAYS,
} from '../services/auth.service';

interface IUser {
  id: number;
  email: string;
  password_hash: string;
  created_at: Date;
}

const getPublicUser = (row: { id: number; email: string; created_at: Date }) => ({
  id: row.id,
  email: row.email,
  created_at: row.created_at,
});

// @desc Register new user
export const register = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const { error } = validateRegistration({ email, password });
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ message: 'User already exists' });
  }

  const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
  const hashedPassword = await bcrypt.hash(password, rounds);

  try {
    const insertResult = await pool.query(
      'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, created_at',
      [email, hashedPassword]
    );
    const user = insertResult.rows[0];

    const accessToken = signAccessToken(user.id);
    const refreshToken = await RefreshTokenModel.create(user.id, REFRESH_TOKEN_DAYS);
    const csrfToken = setAuthCookies(res, accessToken, refreshToken);

    res.status(201).json({ user: getPublicUser(user), csrf_token: csrfToken });
  } catch (err) {
    logger.error({ err: err }, 'Registration error:');
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc Authenticate user & get tokens
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const { error } = validateRegistration({ email, password });
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    const user: IUser | undefined = result.rows[0];

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const accessToken = signAccessToken(user.id);
    const refreshToken = await RefreshTokenModel.create(user.id, REFRESH_TOKEN_DAYS);
    const csrfToken = setAuthCookies(res, accessToken, refreshToken);

    res.json({
      user: getPublicUser(user),
      csrf_token: csrfToken,
    });
  } catch (err) {
    logger.error({ err: err }, 'Login error:');
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc Rotate the refresh token and reissue an access token
export const refresh = async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken as string | undefined;
  if (!refreshToken) {
    return res.status(401).json({ message: 'Missing refresh token' });
  }

  try {
    const rotated = await RefreshTokenModel.rotate(refreshToken, REFRESH_TOKEN_DAYS);
    if (!rotated) {
      return res.status(401).json({ message: 'Refresh token is invalid or expired' });
    }

    const userResult = await pool.query(
      'SELECT id, email, created_at FROM users WHERE id = $1',
      [rotated.userId]
    );
    if (!userResult.rows[0]) {
      return res.status(401).json({ message: 'User no longer exists' });
    }

    const accessToken = signAccessToken(rotated.userId);
    const csrfToken = setAuthCookies(res, accessToken, rotated.token);

    res.json({ user: getPublicUser(userResult.rows[0]), csrf_token: csrfToken });
  } catch (err) {
    logger.error({ err: err }, 'Refresh error:');
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc Logout — revoke the refresh token server-side and clear cookies
export const logout = async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken as string | undefined;
  if (refreshToken) {
    try {
      await RefreshTokenModel.revoke(refreshToken);
    } catch (err) {
      // best-effort revocation; do not fail the logout
      logger.error({ err: err }, 'Logout revocation error:');
    }
  }
  clearAuthCookies(res);
  res.status(200).json({ message: 'Logged out successfully' });
};

// @desc Return the currently authenticated user (from access token)
export const me = async (req: Request, res: Response) => {
  const userId = req.user?.id;
  if (!userId) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const result = await pool.query(
      'SELECT id, email, created_at FROM users WHERE id = $1',
      [userId]
    );
    if (!result.rows[0]) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    res.json({ user: getPublicUser(result.rows[0]) });
  } catch (err) {
    logger.error({ err: err }, 'Me error:');
    res.status(500).json({ message: 'Server error' });
  }
};