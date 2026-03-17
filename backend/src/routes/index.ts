import { Router } from 'express';
import seatsRouter from './seats.routes.js';
import paymentRouter from './payment.routes.js';
import registrationRouter from './registration.routes.js';
import waitlistRouter from './waitlist.routes.js';
import adminRouter from './admin.routes.js';
import settingsRouter from './settings.routes.js';
import guestRouter from './guest.routes.js';
import msmeBenefitRouter from './msmeBenefit.routes.js';
import authRouter from './auth.routes.js';
import tenantRouter from './tenant.routes.js';
import superAdminRouter from './superAdmin.routes.js';
import ssoRouter from './sso.routes.js';
import agentStudioRouter from './agentStudio.routes.js';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
  });
});

// ============================================
// Legacy single-tenant API routes (backward compatible)
// ============================================
router.use('/seats', seatsRouter);
router.use('/', paymentRouter);
router.use('/registration', registrationRouter);
router.use('/waitlist', waitlistRouter);
router.use('/admin', adminRouter);
router.use('/settings', settingsRouter);
router.use('/guests', guestRouter);
router.use('/msme-benefits', msmeBenefitRouter);

// ============================================
// Multi-tenant API routes
// ============================================
router.use('/auth', authRouter);
router.use('/t', tenantRouter);
router.use('/super-admin', superAdminRouter);

// ============================================
// Agent Studio integration routes
// ============================================
router.use('/sso', ssoRouter);
router.use('/', agentStudioRouter);

export default router;
