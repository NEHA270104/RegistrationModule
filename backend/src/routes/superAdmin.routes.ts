import { Router } from 'express';
import { superAdminAuth } from '../middleware/tenantAuth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { auditMiddleware } from '../middleware/audit.js';
import {
  listAllTenants,
  getTenantDetail,
  updateTenant,
  activateTenant,
  deactivateTenant,
  getGlobalStats,
} from '../controllers/tenant.controller.js';
import { listAllSubscriptions } from '../controllers/subscription.controller.js';
import {
  getPendingRebrandRequests,
  getAllRebrandRequests,
  approveRebrandRequest,
  rejectRebrandRequest,
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '../controllers/rebrand.controller.js';
import {
  listAllReferrals,
  listPendingPayouts,
  processPayout,
} from '../controllers/referral.controller.js';
import { getGlobalAuditLog } from '../controllers/audit.controller.js';
import { getGlobalAnalytics } from '../controllers/analytics.controller.js';

const router = Router();

// All routes require super admin auth + audit logging
router.use(superAdminAuth);
router.use(auditMiddleware);

// Global stats
router.get('/stats', asyncHandler(getGlobalStats));

// Tenant management
router.get('/tenants', asyncHandler(listAllTenants));
router.get('/tenants/:id', asyncHandler(getTenantDetail));
router.patch('/tenants/:id', asyncHandler(updateTenant));
router.post('/tenants/:id/activate', asyncHandler(activateTenant));
router.post('/tenants/:id/deactivate', asyncHandler(deactivateTenant));

// Subscriptions
router.get('/subscriptions', asyncHandler(listAllSubscriptions));

// Rebrand Requests
router.get('/rebrand-requests', asyncHandler(getAllRebrandRequests));
router.get('/rebrand-requests/pending', asyncHandler(getPendingRebrandRequests));
router.post('/rebrand-requests/:requestId/approve', asyncHandler(approveRebrandRequest));
router.post('/rebrand-requests/:requestId/reject', asyncHandler(rejectRebrandRequest));

// Notifications
router.get('/notifications', asyncHandler(getNotifications));
router.post('/notifications/:notificationId/read', asyncHandler(markNotificationRead));
router.post('/notifications/read-all', asyncHandler(markAllNotificationsRead));

// Referrals
router.get('/referrals', asyncHandler(listAllReferrals));
router.get('/referrals/payouts', asyncHandler(listPendingPayouts));
router.post('/referrals/payout', asyncHandler(processPayout));

// Phase 4: Audit Log + Analytics
router.get('/audit-log', asyncHandler(getGlobalAuditLog));
router.get('/analytics', asyncHandler(getGlobalAnalytics));

export default router;
