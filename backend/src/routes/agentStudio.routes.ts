import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { verifyAgentStudioAuth, verifyAgentStudioWebhook } from '../middleware/agentStudioAuth.js';
import { provisionTenant, getProductInfo } from '../controllers/provision.controller.js';
import { embedDashboard } from '../controllers/embed.controller.js';
import { handleAgentStudioWebhook } from '../controllers/agentStudioWebhook.controller.js';

const router = Router();

// ============================================
// Public
// ============================================

// Product info for marketplace listing
router.get('/product/info', asyncHandler(getProductInfo));

// ============================================
// Agent Studio authenticated
// ============================================

// One-click provisioning
router.post('/provision', verifyAgentStudioAuth, asyncHandler(provisionTenant));

// Embedded dashboard (SSO token in query param)
router.get('/embed/dashboard', asyncHandler(embedDashboard));

// ============================================
// Webhooks
// ============================================

// Incoming webhooks from Agent Studio
router.post('/webhooks/agent-studio', verifyAgentStudioWebhook, asyncHandler(handleAgentStudioWebhook));

export default router;
