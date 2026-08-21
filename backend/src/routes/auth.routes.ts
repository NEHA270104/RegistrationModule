import { Router } from 'express';
import {
  signup,
  login,
  refreshToken,
  getProfile,
  logout,
  sendPasswordResetOtp,
  verifyOtp,
  resetPassword,
  loginEmailOnly,
  sessionStatus,
} from '../controllers/auth.controller.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { strictLimiter, otpLimiter, standardLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/signup', strictLimiter, asyncHandler(signup));
router.post('/login', strictLimiter, asyncHandler(login));
router.post('/login-email-only', strictLimiter, asyncHandler(loginEmailOnly));
router.post('/refresh', asyncHandler(refreshToken));
router.get('/profile', asyncHandler(getProfile));
router.post('/logout', asyncHandler(logout));

// Session status — used by onboarding page to check if the user is already registered+paid
// and should be redirected directly to /dashboard/ instead of re-entering the onboarding flow.
router.get('/session-status', standardLimiter, asyncHandler(sessionStatus));

// Forgot Password Flow
router.post('/forgot-password', otpLimiter, asyncHandler(sendPasswordResetOtp));
router.post('/verify-otp', otpLimiter, asyncHandler(verifyOtp));
router.post('/reset-password', strictLimiter, asyncHandler(resetPassword));

export default router;
