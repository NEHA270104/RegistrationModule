import cron from 'node-cron';
import { logger } from '../utils/logger.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';

// Services will be imported once they exist
let churnService: any = null;
let subscriptionService: any = null;
let analyticsService: any = null;

async function loadServices() {
  try {
    const churnMod = await import('../services/churn.service.js');
    churnService = churnMod.churnService;
  } catch { /* will be available after churn service is created */ }

  try {
    const subMod = await import('../services/subscription.service.js');
    subscriptionService = subMod.subscriptionService;
  } catch { /* already exists */ }

  try {
    const analyticsMod = await import('../services/analytics.service.js');
    analyticsService = analyticsMod.analyticsService;
  } catch { /* will be available after analytics service is created */ }
}

/**
 * Initialize all scheduled jobs
 */
export function initializeJobs(): void {
  logger.info('Initializing scheduled jobs');

  // Load services on startup
  loadServices();

  // Every hour at :05 — Check trial expirations
  cron.schedule('5 * * * *', async () => {
    try {
      const { data } = await supabaseAdmin
        .from('tenants')
        .select('id, slug, email')
        .eq('subscription_status', 'trialing')
        .lte('trial_ends_at', new Date().toISOString())
        .eq('is_active', true);

      if (!data || data.length === 0) return;

      for (const tenant of data) {
        await supabaseAdmin
          .from('tenants')
          .update({
            subscription_status: 'expired',
            updated_at: new Date().toISOString(),
          })
          .eq('id', tenant.id);
      }

      logger.info('Trial expiration job completed', { processed: data.length });
    } catch (err) {
      logger.error('Trial expiration job failed', { error: (err as Error).message });
    }
  });

  // Every 6 hours — Process scheduled cancellations
  cron.schedule('0 */6 * * *', async () => {
    try {
      if (!churnService) await loadServices();
      if (churnService) {
        const count = await churnService.processScheduledCancellations();
        logger.info('Scheduled cancellation job completed', { processed: count });
      }
    } catch (err) {
      logger.error('Scheduled cancellation job failed', { error: (err as Error).message });
    }
  });

  // Daily at 9am IST (3:30 UTC) — Send churn reminder emails
  cron.schedule('30 3 * * *', async () => {
    try {
      if (!churnService) await loadServices();
      if (churnService) {
        await churnService.sendChurnReminders();
        logger.info('Churn reminder job completed');
      }
    } catch (err) {
      logger.error('Churn reminder job failed', { error: (err as Error).message });
    }
  });

  // Daily at 2am IST (20:30 UTC previous day) — Process data deletions
  cron.schedule('30 20 * * *', async () => {
    try {
      if (!churnService) await loadServices();
      if (churnService) {
        const count = await churnService.processScheduledDeletions();
        logger.info('Data deletion job completed', { processed: count });
      }
    } catch (err) {
      logger.error('Data deletion job failed', { error: (err as Error).message });
    }
  });

  // Weekly on Monday at 9am IST — Generate analytics reports
  cron.schedule('30 3 * * 1', async () => {
    try {
      if (!analyticsService) await loadServices();
      if (analyticsService) {
        const analytics = await analyticsService.getGlobalAnalytics('week');
        logger.info('Weekly analytics digest', {
          mrr: analytics.mrr,
          active_tenants: analytics.tenant_counts?.active,
        });
      }
    } catch (err) {
      logger.error('Weekly analytics job failed', { error: (err as Error).message });
    }
  });

  // Daily at 10am IST (4:30 UTC) — Check usage limits and send warnings
  cron.schedule('30 4 * * *', async () => {
    try {
      if (!subscriptionService) await loadServices();
      const { data: activeTenants } = await supabaseAdmin
        .from('tenants')
        .select('id, slug, email, subscription_plan')
        .eq('is_active', true);

      if (!activeTenants) return;

      let warned = 0;
      for (const tenant of activeTenants) {
        if (subscriptionService) {
          const usage = await subscriptionService.checkUsage(tenant.id);
          const usagePercent = usage.limit > 0 ? (usage.used / usage.limit) * 100 : 0;
          if (usagePercent >= 80) {
            logger.warn('Tenant approaching usage limit', {
              tenantId: tenant.id,
              slug: tenant.slug,
              used: usage.used,
              limit: usage.limit,
              percent: Math.round(usagePercent),
            });
            warned++;
          }
        }
      }

      logger.info('Usage limit check completed', { tenantsChecked: activeTenants.length, warned });
    } catch (err) {
      logger.error('Usage limit check failed', { error: (err as Error).message });
    }
  });

  logger.info('Scheduled jobs initialized');
}
