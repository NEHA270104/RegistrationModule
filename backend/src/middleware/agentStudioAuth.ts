import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { agentStudioConfig } from '../config/agentStudio.js';
import { logger } from '../utils/logger.js';

/**
 * Verify that the request comes from Agent Studio using API key.
 * Used for provisioning API.
 */
export const verifyAgentStudioAuth = (req: Request, res: Response, next: NextFunction): void => {
  const apiKey = req.headers['x-agent-studio-key'] as string;

  if (!agentStudioConfig.apiKey) {
    logger.error('Agent Studio API key not configured');
    res.status(500).json({
      success: false,
      error: { message: 'Agent Studio integration not configured', code: 'NOT_CONFIGURED' },
    });
    return;
  }

  if (!apiKey || apiKey !== agentStudioConfig.apiKey) {
    res.status(401).json({
      success: false,
      error: { message: 'Invalid Agent Studio API key', code: 'UNAUTHORIZED' },
    });
    return;
  }

  next();
};

/**
 * Verify webhook signature from Agent Studio.
 * Expects X-Webhook-Secret header matching the configured secret.
 */
export const verifyAgentStudioWebhook = (req: Request, res: Response, next: NextFunction): void => {
  const signature = req.headers['x-webhook-secret'] as string;

  if (!agentStudioConfig.webhookSecret) {
    logger.error('Agent Studio webhook secret not configured');
    res.status(500).json({ error: 'Webhook verification not configured' });
    return;
  }

  if (!signature) {
    res.status(401).json({ error: 'Missing webhook signature' });
    return;
  }

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(agentStudioConfig.webhookSecret, 'utf-8');
  const received = Buffer.from(signature, 'utf-8');

  if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
    res.status(401).json({ error: 'Invalid webhook signature' });
    return;
  }

  next();
};
