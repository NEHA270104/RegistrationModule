import { Router } from 'express';
import { signup, login, refreshToken, getProfile, logout } from '../controllers/auth.controller.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { strictLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.post('/signup', strictLimiter, asyncHandler(signup));
router.post('/login', strictLimiter, asyncHandler(login));
router.post('/refresh', asyncHandler(refreshToken));
router.get('/profile', asyncHandler(getProfile));
router.post('/logout', asyncHandler(logout));

export default router;
