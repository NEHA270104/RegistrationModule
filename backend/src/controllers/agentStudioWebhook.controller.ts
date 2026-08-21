import { Request, Response } from 'express';
import { agentStudioConfig } from '../config/agentStudio.js';
import { tenantService } from '../services/tenant.service.js';
import { subscriptionService } from '../services/subscription.service.js';
import { logger } from '../utils/logger.js';
import { supabaseAdmin } from '../config/supabaseAdmin.js';

/**
 * POST /webhooks/agent-studio
 * Handle incoming webhook events from Agent Studio.
 */
export const handleAgentStudioWebhook = async (req: Request, res: Response): Promise<void> => {
  const { event, data } = req.body;

  if (!event || !data) {
    res.status(400).json({ error: 'Missing event or data' });
    return;
  }

  logger.info('Agent Studio webhook received', { event });

  try {
    switch (event) {
      case 'org.updated': {
        // Update tenant details from Agent Studio org changes
        const { data: tenant } = await supabaseAdmin
          .from('tenants')
          .select('id')
          .eq('agent_studio_org_id', data.org_id)
          .single();

        if (tenant) {
          const updatePayload: Record<string, unknown> = {
            updated_at: new Date().toISOString(),
          };
          if (data.name) updatePayload.company_name = data.name;
          if (data.email) updatePayload.email = data.email;

          await supabaseAdmin.from('tenants').update(updatePayload).eq('id', tenant.id);
          logger.info('Tenant updated from Agent Studio', { tenantId: tenant.id });
        }
        break;
      }

      case 'org.deleted': {
        // Initiate tenant deactivation
        const { data: tenant } = await supabaseAdmin
          .from('tenants')
          .select('id')
          .eq('agent_studio_org_id', data.org_id)
          .single();

        if (tenant) {
          await tenantService.deactivate(tenant.id);
          // Cancel any active subscription
          try {
            await subscriptionService.cancel(tenant.id);
          } catch {
            // OK if no active subscription
          }
          logger.info('Tenant deactivated from Agent Studio', { tenantId: tenant.id });
        }
        break;
      }

      case 'user.role_changed': {
        // Update user role in Supabase Auth metadata
        if (data.user_email && data.new_role) {
          const { data: users } = await supabaseAdmin.auth.admin.listUsers();
          const user = users?.users?.find((u) => u.email === data.user_email);

          if (user) {
            await supabaseAdmin.auth.admin.updateUserById(user.id, {
              user_metadata: {
                ...user.user_metadata,
                role: data.new_role,
              },
            });
            logger.info('User role updated from Agent Studio', {
              userId: user.id,
              newRole: data.new_role,
            });
          }
        }
        break;
      }

      case 'billing.payment_method_updated': {
        // Log for now — actual payment method sync depends on Razorpay setup
        logger.info('Payment method updated notification from Agent Studio', {
          orgId: data.org_id,
        });
        break;
      }

      default:
        logger.warn('Unknown Agent Studio webhook event', { event });
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Agent Studio webhook processing error', {
      event,
      error: error instanceof Error ? error.message : 'Unknown',
    });
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};
