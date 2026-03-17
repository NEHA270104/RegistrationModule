import { Request, Response } from 'express';
import { authService } from '../services/auth.service.js';

/**
 * POST /api/auth/signup
 */
export async function signup(req: Request, res: Response): Promise<void> {
  const { email, password, name, company_name, phone, referral_code } = req.body;

  if (!email || !password || !name || !company_name) {
    res.status(400).json({
      success: false,
      error: { message: 'Email, password, name, and company_name are required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  if (password.length < 8) {
    res.status(400).json({
      success: false,
      error: { message: 'Password must be at least 8 characters', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const result = await authService.signup({ email, password, name, company_name, phone, referral_code });
  res.status(201).json({ success: true, data: result });
}

/**
 * POST /api/auth/login
 */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({
      success: false,
      error: { message: 'Email and password are required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const result = await authService.login({ email, password });
  res.json({ success: true, data: result });
}

/**
 * POST /api/auth/refresh
 */
export async function refreshToken(req: Request, res: Response): Promise<void> {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    res.status(400).json({
      success: false,
      error: { message: 'refresh_token is required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  const result = await authService.refreshToken(refresh_token);
  res.json({ success: true, data: result });
}

/**
 * GET /api/auth/profile
 */
export async function getProfile(req: Request, res: Response): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: { message: 'Missing authorization token', code: 'UNAUTHORIZED' },
    });
    return;
  }

  const token = authHeader.split(' ')[1];
  const profile = await authService.getProfile(token);
  res.json({ success: true, data: profile });
}

/**
 * POST /api/auth/logout
 */
export async function logout(req: Request, res: Response): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.split(' ')[1] : '';
  await authService.logout(token);
  res.json({ success: true, message: 'Logged out' });
}
