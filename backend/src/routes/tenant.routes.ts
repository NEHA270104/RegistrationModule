import { Router } from 'express';
import { tenantAuth } from '../middleware/tenantAuth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { standardLimiter } from '../middleware/rateLimiter.js';
import { tenantRateLimiter } from '../middleware/tenantRateLimiter.js';
import { auditMiddleware } from '../middleware/audit.js';
import {
  getPublicConfig,
  getPublicSeats,
  getPublicGuests,
  getPublicBenefits,
  getOverview,
  getRegistrations,
  getRegistrationDetail,
  getTenantSettings,
  updateTenantSetting,
  getTenantGuests,
  createTenantGuest,
  updateTenantGuest,
  deleteTenantGuest,
  getTenantBenefits,
  createTenantBenefit,
  updateTenantBenefit,
  deleteTenantBenefit,
  getTenantSeats,
  updateTenantSeats,
  setupTenant,
  getAvailableFlyerTemplates,
  getAccount,
  updateAccount,
  updateEventSettings,
  activateTenantSelf,
  uploadProfilePicture,
} from '../controllers/tenant.controller.js';
import {
  getSubscription,
  upgradeSubscription,
  cancelSubscription,
} from '../controllers/subscription.controller.js';
import {
  submitRebrandRequest,
  getMyRebrandRequests,
  payRebrandSetupFee,
} from '../controllers/rebrand.controller.js';
import {
  getReferralStats,
  generateReferralCode,
  requestPayout,
  trackReferralClick,
} from '../controllers/referral.controller.js';
import {
  listEmailTemplates,
  previewEmailTemplate,
  updateEmailTemplate,
  resetEmailTemplate,
  generateAiEmailTemplate,
} from '../controllers/emailTemplate.controller.js';
import { getTenantActivityLog } from '../controllers/audit.controller.js';
import { acceptLegalDocument, getLegalStatus } from '../controllers/legal.controller.js';
import { initiateCancellation, acceptRetentionOffer, getChurnOffers } from '../controllers/churn.controller.js';
import { getTenantAnalytics } from '../controllers/analytics.controller.js';
import { setCustomDomain, verifyDomain, getDomainStatus } from '../controllers/domain.controller.js';
import { createApiKey, listApiKeys, revokeApiKey } from '../controllers/apiKey.controller.js';
import { getFlyers, createFlyer, deleteFlyer, generateAiFlyerContent, getFlyerConfig, updateFlyerConfig } from '../controllers/flyer.controller.js';
import {
  createEventFromFlyer,
  getTenantEvents,
  getTenantAttendees,
  getEventAttendees,
  getTenantFeaturePermissions,
} from '../controllers/event.controller.js';

const router = Router();

// ============================================
// Public endpoints (no auth required)
// ============================================
router.get('/:slug/public/config', standardLimiter, asyncHandler(getPublicConfig));
router.get('/:slug/public/seats', standardLimiter, asyncHandler(getPublicSeats));
router.get('/:slug/public/guests', standardLimiter, asyncHandler(getPublicGuests));
router.get('/:slug/public/benefits', standardLimiter, asyncHandler(getPublicBenefits));

// ============================================
// Authenticated tenant dashboard endpoints
// (auditMiddleware logs all authenticated actions)
// ============================================
router.get('/:slug/overview', tenantAuth, auditMiddleware, asyncHandler(getOverview));

// Registrations
router.get('/:slug/registrations', tenantAuth, auditMiddleware, asyncHandler(getRegistrations));
router.get('/:slug/registrations/:id', tenantAuth, auditMiddleware, asyncHandler(getRegistrationDetail));

// Settings
router.get('/:slug/settings', tenantAuth, auditMiddleware, asyncHandler(getTenantSettings));
router.post('/:slug/settings/:key', tenantAuth, auditMiddleware, asyncHandler(updateTenantSetting));
router.put('/:slug/settings', tenantAuth, auditMiddleware, asyncHandler(updateEventSettings));

// Setup
router.post('/:slug/setup', tenantAuth, auditMiddleware, asyncHandler(setupTenant));
router.post('/:slug/activate', tenantAuth, auditMiddleware, asyncHandler(activateTenantSelf));

// Account branding settings
router.get('/:slug/account', tenantAuth, auditMiddleware, asyncHandler(getAccount));
router.put('/:slug/account', tenantAuth, auditMiddleware, asyncHandler(updateAccount));
router.post('/:slug/account/avatar', tenantAuth, auditMiddleware, asyncHandler(uploadProfilePicture));

// Guests
router.get('/:slug/guests', tenantAuth, auditMiddleware, asyncHandler(getTenantGuests));
router.post('/:slug/guests', tenantAuth, auditMiddleware, asyncHandler(createTenantGuest));
router.put('/:slug/guests/:id', tenantAuth, auditMiddleware, asyncHandler(updateTenantGuest));
router.delete('/:slug/guests/:id', tenantAuth, auditMiddleware, asyncHandler(deleteTenantGuest));

// MSME Benefits
router.get('/:slug/msme-benefits', tenantAuth, auditMiddleware, asyncHandler(getTenantBenefits));
router.post('/:slug/msme-benefits', tenantAuth, auditMiddleware, asyncHandler(createTenantBenefit));
router.put('/:slug/msme-benefits/:id', tenantAuth, auditMiddleware, asyncHandler(updateTenantBenefit));
router.delete('/:slug/msme-benefits/:id', tenantAuth, auditMiddleware, asyncHandler(deleteTenantBenefit));

// Benefits (alias for msme-benefits)
router.get('/:slug/benefits', tenantAuth, auditMiddleware, asyncHandler(getTenantBenefits));
router.post('/:slug/benefits', tenantAuth, auditMiddleware, asyncHandler(createTenantBenefit));
router.put('/:slug/benefits/:id', tenantAuth, auditMiddleware, asyncHandler(updateTenantBenefit));
router.delete('/:slug/benefits/:id', tenantAuth, auditMiddleware, asyncHandler(deleteTenantBenefit));

// Seats
router.get('/:slug/seats', tenantAuth, auditMiddleware, asyncHandler(getTenantSeats));
router.post('/:slug/seats', tenantAuth, auditMiddleware, asyncHandler(updateTenantSeats));



// Subscription
router.get('/:slug/subscription', tenantAuth, auditMiddleware, asyncHandler(getSubscription));
router.post('/:slug/subscription/upgrade', tenantAuth, auditMiddleware, asyncHandler(upgradeSubscription));
router.post('/:slug/subscription/cancel', tenantAuth, auditMiddleware, asyncHandler(cancelSubscription));

// Rebrand Requests
router.get('/:slug/rebrand', tenantAuth, auditMiddleware, asyncHandler(getMyRebrandRequests));
router.post('/:slug/rebrand', tenantAuth, auditMiddleware, asyncHandler(submitRebrandRequest));
router.post('/:slug/rebrand/:requestId/pay', tenantAuth, auditMiddleware, asyncHandler(payRebrandSetupFee));

// Referral Program
router.get('/:slug/referral/stats', tenantAuth, auditMiddleware, asyncHandler(getReferralStats));
router.post('/:slug/referral/generate-code', tenantAuth, auditMiddleware, asyncHandler(generateReferralCode));
router.post('/:slug/referral/payout', tenantAuth, auditMiddleware, asyncHandler(requestPayout));

// Referral click tracking (public)
router.post('/referral/click/:code', standardLimiter, asyncHandler(trackReferralClick));

// Email Templates
router.get('/:slug/email-templates', tenantAuth, auditMiddleware, asyncHandler(listEmailTemplates));
router.get('/:slug/email-templates/:templateType/preview', tenantAuth, auditMiddleware, asyncHandler(previewEmailTemplate));
router.put('/:slug/email-templates/:templateType', tenantAuth, auditMiddleware, asyncHandler(updateEmailTemplate));
router.delete('/:slug/email-templates/:templateType', tenantAuth, auditMiddleware, asyncHandler(resetEmailTemplate));
router.post('/:slug/email-templates/:templateType/generate-ai', tenantAuth, auditMiddleware, asyncHandler(generateAiEmailTemplate));

// ============================================
// Phase 4: Activity Log, Legal, Churn, Analytics, Domain
// ============================================

// Activity Log
router.get('/:slug/activity-log', tenantAuth, asyncHandler(getTenantActivityLog));
router.get('/:slug/activity', tenantAuth, asyncHandler(getTenantActivityLog));

// Flyer Templates
router.get('/:slug/flyer-templates', tenantAuth, asyncHandler(getAvailableFlyerTemplates));
router.get('/:slug/flyers', tenantAuth, asyncHandler(getFlyers));
router.post('/:slug/flyers', tenantAuth, asyncHandler(createFlyer));
router.delete('/:slug/flyers/:id', tenantAuth, asyncHandler(deleteFlyer));
router.post('/:slug/flyers/generate-ai', tenantAuth, asyncHandler(generateAiFlyerContent));
router.get('/:slug/flyer-config', tenantAuth, asyncHandler(getFlyerConfig));
router.post('/:slug/flyer-config', tenantAuth, asyncHandler(updateFlyerConfig));

// Legal
router.post('/:slug/legal/accept', tenantAuth, auditMiddleware, asyncHandler(acceptLegalDocument));
router.get('/:slug/legal/status', tenantAuth, asyncHandler(getLegalStatus));

// Churn Protection
router.post('/:slug/subscription/initiate-cancellation', tenantAuth, auditMiddleware, asyncHandler(initiateCancellation));
router.post('/:slug/churn-offers/:offerId/accept', tenantAuth, auditMiddleware, asyncHandler(acceptRetentionOffer));
router.get('/:slug/churn-offers', tenantAuth, asyncHandler(getChurnOffers));

// Analytics
router.get('/:slug/analytics', tenantAuth, asyncHandler(getTenantAnalytics));

// Custom Domain
router.post('/:slug/domain/set', tenantAuth, auditMiddleware, asyncHandler(setCustomDomain));
router.post('/:slug/domain/verify', tenantAuth, auditMiddleware, asyncHandler(verifyDomain));
router.get('/:slug/domain/status', tenantAuth, asyncHandler(getDomainStatus));

// API Keys
router.get('/:slug/api-keys', tenantAuth, asyncHandler(listApiKeys));
router.post('/:slug/api-keys', tenantAuth, auditMiddleware, asyncHandler(createApiKey));
router.delete('/:slug/api-keys/:keyId', tenantAuth, auditMiddleware, asyncHandler(revokeApiKey));

// ============================================
// Events Hub & Attendee Sync
// ============================================
router.post('/:slug/events/from-flyer', tenantAuth, auditMiddleware, asyncHandler(createEventFromFlyer));
router.get('/:slug/events', tenantAuth, auditMiddleware, asyncHandler(getTenantEvents));
router.get('/:slug/events/attendees', tenantAuth, auditMiddleware, asyncHandler(getTenantAttendees));
router.get('/:slug/events/:eventId/attendees', tenantAuth, auditMiddleware, asyncHandler(getEventAttendees));

// Feature Permissions
router.get('/:slug/features', tenantAuth, asyncHandler(getTenantFeaturePermissions));

export default router;
