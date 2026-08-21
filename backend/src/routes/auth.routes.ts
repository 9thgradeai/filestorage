import { Router } from 'express';
import {
  register,
  verifyEmail,
  resendOtp,
  forgotPassword,
  resetPassword,
  login,
  refresh,
  logout,
  me,
  updateProfile,
  changePassword,
  changeEmail,
  deleteAccount,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/authenticate';
import { csrfProtect } from '../middleware/csrf';

const router = Router();

// Public, rate-limited (see index.ts) account-lifecycle endpoints.
router.post('/register', register);
router.post('/verify-email', verifyEmail);
router.post('/resend-otp', resendOtp);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.post('/login', login);
router.post('/refresh', refresh);

// Cookie-authenticated endpoints.
router.post('/logout', csrfProtect, logout);
router.get('/me', authenticate, me);

// Profile / settings endpoints (all require auth + CSRF).
router.put('/profile', authenticate, csrfProtect, updateProfile);
router.put('/password', authenticate, csrfProtect, changePassword);
router.put('/email', authenticate, csrfProtect, changeEmail);
router.put('/delete-account', authenticate, csrfProtect, deleteAccount);

export default router;