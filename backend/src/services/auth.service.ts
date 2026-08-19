import jwt from 'jsonwebtoken';
import { Response } from 'express';
import { randomToken } from '../utils/crypto';

const REFRESH_TOKEN_DAYS = parseInt(process.env.REFRESH_TOKEN_DAYS || '7', 10);
const ACCESS_TOKEN_TTL = (process.env.JWT_EXPIRES_IN || '15m') as jwt.SignOptions['expiresIn'];

const isProduction = process.env.NODE_ENV === 'production';

// Cookies are HttpOnly and SameSite=Lax so scripts cannot read tokens and the
// browser will not attach them to cross-site requests.
const baseCookie = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax' as const,
  path: '/',
};

export const signAccessToken = (userId: number): string =>
  jwt.sign({ id: userId }, process.env.JWT_SECRET!, { expiresIn: ACCESS_TOKEN_TTL });

// Set access + refresh tokens as HttpOnly cookies and return the CSRF token,
// which the client echoes back via the X-CSRF-Token header on mutations.
export const setAuthCookies = (
  res: Response,
  accessToken: string,
  refreshToken: string
): string => {
  res.cookie('token', accessToken, baseCookie);
  res.cookie('refreshToken', refreshToken, {
    ...baseCookie,
    maxAge: REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000,
  });

  const csrf = randomToken(32);
  res.cookie('csrf_token', csrf, {
    httpOnly: false,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
  return csrf;
};

export const clearAuthCookies = (res: Response): void => {
  res.clearCookie('token', baseCookie);
  res.clearCookie('refreshToken', baseCookie);
  res.clearCookie('csrf_token', { ...baseCookie, httpOnly: false });
};

export { REFRESH_TOKEN_DAYS };