import { agentStudioConfig } from '../config/agentStudio.js';
import { tenantService } from './tenant.service.js';
import { logger } from '../utils/logger.js';

class AgentStudioWebhookService {
  /**
   * Send a webhook event to Agent Studio.
   */
  async notify(event: string, tenantId: string, data: Record<string, unknown>): Promise<void> {
    if (!agentStudioConfig.apiBaseUrl || !agentStudioConfig.webhookSecret) {
      logger.warn('Agent Studio webhook not configured, skipping', { event });
      return;
    }

    const tenant = await tenantService.getById(tenantId);
    if (!tenant) {
      logger.warn('Tenant not found for webhook', { tenantId, event });
      return;
    }

    const payload = {
      event,
      timestamp: new Date().toISOString(),
      tenant: {
        id: tenant.id,
        org_id: (tenant as unknown as Record<string, unknown>).agent_studio_org_id || null,
        name: tenant.name,
        slug: tenant.slug,
      },
      data,
    };

    const url = `${agentStudioConfig.apiBaseUrl}/webhooks/products/registration-form`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': agentStudioConfig.webhookSecret,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        logger.warn('Agent Studio webhook delivery failed', {
          event,
          status: response.status,
          tenantId,
        });
        // Retry with exponential backoff (fire-and-forget)
        this.retryWithBackoff(url, payload, 1);
      } else {
        logger.info('Agent Studio webhook delivered', { event, tenantId });
      }
    } catch (error) {
      logger.error('Agent Studio webhook error', {
        event,
        tenantId,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      this.retryWithBackoff(url, payload, 1);
    }
  }

  private async retryWithBackoff(
    url: string,
    payload: Record<string, unknown>,
    attempt: number,
    maxAttempts = 3
  ): Promise<void> {
    if (attempt > maxAttempts) {
      logger.error('Agent Studio webhook max retries reached', {
        event: payload.event,
        tenant: (payload.tenant as Record<string, unknown>)?.id,
      });
      return;
    }

    const delayMs = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
    setTimeout(async () => {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Secret': agentStudioConfig.webhookSecret,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          this.retryWithBackoff(url, payload, attempt + 1, maxAttempts);
        } else {
          logger.info('Agent Studio webhook delivered on retry', {
            event: payload.event,
            attempt,
          });
        }
      } catch {
        this.retryWithBackoff(url, payload, attempt + 1, maxAttempts);
      }
    }, delayMs);
  }

  // ============================================
  // Outgoing events
  // ============================================

  async onSubscriptionCreated(tenantId: string, subscription: Record<string, unknown>): Promise<void> {
    await this.notify('subscription.created', tenantId, subscription);
  }

  async onSubscriptionCancelled(tenantId: string, reason: string): Promise<void> {
    await this.notify('subscription.cancelled', tenantId, { reason });
  }

  async onRegistrationMilestone(tenantId: string, count: number): Promise<void> {
    await this.notify('registration.milestone', tenantId, { count });
  }

  async onTrialExpiring(tenantId: string, daysLeft: number): Promise<void> {
    await this.notify('trial.expiring', tenantId, { days_left: daysLeft });
  }

  async onUsageLimitApproaching(tenantId: string, usage: { used: number; limit: number; plan: string }): Promise<void> {
    await this.notify('usage.limit_approaching', tenantId, usage);
  }
}

export const agentStudioWebhookService = new AgentStudioWebhookService();
