import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response } from 'express';
import { pool } from '../config/database';
import {
  validateRegistration,
  validateLogin,
  validateVerifyEmail,
  validateResendOtp,
  validateForgotPassword,
  validateResetPassword,
} from '../services/validation';
import { logger } from '../config/logger';
import { RefreshTokenModel } from '../models/refreshToken.model';
import { UserModel, toPublicUser } from '../models/user.model';
import { sendOtpEmailAsync } from '../services/email.service';
import {
  issueOtp,
  verifyOtp,
  secondsUntilResendAllowed,
  normalizeEmail,
  OTP_TTL_MINUTES,
} from '../services/otp.service';
import {
  signAccessToken,
  setAuthCookies,
  clearAuthCookies,
  REFRESH_TOKEN_DAYS,
} from '../services/auth.service';

const getPublicUser = toPublicUser;

// @desc Register a new user — account is created in an "unverified" state and
//       an OTP is emailed to confirm ownership of the address before login.
export const register = async (req: Request, res: Response) => {
  const { name, email, password, confirmPassword } = req.body;

  const { error } = validateRegistration({ name, email, password, confirmPassword });
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  try {
    const existing = await UserModel.findByEmail(email);
    if (existing) {
      return res.status(409).json({ message: 'An account with this email already exists' });
    }

    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
    const hashedPassword = await bcrypt.hash(password, rounds);
    const user = await UserModel.create({ name, email, passwordHash: hashedPassword });

    const code = await issueOtp(user.email, 'email_verification');
    sendOtpEmailAsync(user.email, 'email_verification', code, OTP_TTL_MINUTES);

    res.status(201).json({
      message:
        'Account created. We sent a 6-digit verification code to your email — enter it to activate your account.',
      email: user.email,
    });
  } catch (err) {
    logger.error({ err: err }, 'Registration error:');
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc Verify the email OTP and activate the account (also signs the user in).
export const verifyEmail = async (req: Request, res: Response) => {
  const { email, otp } = req.body;

  const { error } = validateVerifyEmail({ email, otp });
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  try {
    const ok = await verifyOtp(email, 'email_verification', otp);
    if (!ok) {
      return res
        .status(400)
        .json({ message: 'Invalid or expired verification code' });
    }

    const updated = await UserModel.markEmailVerified(email);
    if (!updated) {
      return res.status(400).json({ message: 'Account not found for this email' });
    }

    const user = await UserModel.findByEmail(email);
    if (!user) {
      return res.status(400).json({ message: 'Account not found for this email' });
    }

    const accessToken = signAccessToken(user.id);
    const refreshToken = await RefreshTokenModel.create(user.id, REFRESH_TOKEN_DAYS);
    const csrfToken = setAuthCookies(res, accessToken, refreshToken);

    res.json({ user: getPublicUser(user), csrf_token: csrfToken });
  } catch (err) {
    logger.error({ err: err }, 'Email verification error:');
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc Re-send the OTP for an existing (unverified) registration or a reset.
export const resendOtp = async (req: Request, res: Response) => {
  const { email, purpose } = req.body;

  const { error } = validateResendOtp({ email, purpose });
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  try {
    const cooldown = await secondsUntilResendAllowed(email, purpose);
    if (cooldown > 0) {
      return res
        .status(429)
        .json({ message: `Please wait ${cooldown} seconds before requesting another code` });
    }

    const code = await issueOtp(email, purpose);
    sendOtpEmailAsync(email, purpose, code, OTP_TTL_MINUTES);

    res.json({ message: 'A new verification code has been sent to your email.' });
  } catch (err) {
    logger.error({ err: err }, 'Resend OTP error:');
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc Request a password reset — sends an OTP to the verified account email.
//       Always responds identically to avoid leaking which addresses are registered.
export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;

  const { error } = validateForgotPassword({ email });
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  try {
    const user = await UserModel.findByEmail(email);
    if (user && user.email_verified_at) {
      const code = await issueOtp(user.email, 'password_reset');
      sendOtpEmailAsync(user.email, 'password_reset', code, OTP_TTL_MINUTES);
    }
    // Identical response regardless of whether the account exists.
    res.json({
      message:
        'If an account exists for that email, a password reset code has been sent.',
    });
  } catch (err) {
    logger.error({ err: err }, 'Forgot password error:');
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc Reset the password after OTP verification. Invalidates all sessions.
export const resetPassword = async (req: Request, res: Response) => {
  const { email, otp, password, confirmPassword } = req.body;

  const { error } = validateResetPassword({ email, otp, password, confirmPassword });
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  try {
    const ok = await verifyOtp(email, 'password_reset', otp);
    if (!ok) {
      return res
        .status(400)
        .json({ message: 'Invalid or expired reset code' });
    }

    const rounds = parseInt(process.env.BCRYPT_ROUNDS || '12', 10);
    const hashedPassword = await bcrypt.hash(password, rounds);

    const updated = await UserModel.updatePasswordHash(email, hashedPassword);
    if (!updated) {
      return res.status(400).json({ message: 'Account not found for this email' });
    }

    // Account becomes verified on reset (proves email ownership) and every
    // existing session is revoked so old passwords/tokens are worthless.
    await UserModel.markEmailVerified(email);
    const user = await UserModel.findByEmail(email);
    if (user) {
      await RefreshTokenModel.revokeAllForUser(user.id);
    }

    res.json({ message: 'Password reset successful. You can now sign in.' });
  } catch (err) {
    logger.error({ err: err }, 'Reset password error:');
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc Authenticate user & get tokens (verified accounts only).
export const login = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const { error } = validateLogin({ email, password });
  if (error) {
    return res.status(400).json({ message: error.details[0].message });
  }

  try {
    const user = await UserModel.findByEmail(email);

    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    if (!user.email_verified_at) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email before signing in. Check your inbox for the code.',
      });
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

    const user = await UserModel.findById(rotated.userId);
    if (!user) {
      return res.status(401).json({ message: 'User no longer exists' });
    }
    if (!user.email_verified_at) {
      return res.status(403).json({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email before signing in.',
      });
    }

    const accessToken = signAccessToken(rotated.userId);
    const csrfToken = setAuthCookies(res, accessToken, rotated.token);

    res.json({ user: getPublicUser(user), csrf_token: csrfToken });
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
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    res.json({ user: getPublicUser(user) });
  } catch (err) {
    logger.error({ err: err }, 'Me error:');
    res.status(500).json({ message: 'Server error' });
  }
};