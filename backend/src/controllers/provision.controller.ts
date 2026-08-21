import { Request, Response } from 'express';
import { provisionService } from '../services/provision.service.js';
import { logger } from '../utils/logger.js';

/**
 * POST /api/provision
 * One-click deployment from Agent Studio.
 */
export const provisionTenant = async (req: Request, res: Response): Promise<void> => {
  const { org_id, org_name, user_email, user_name, plan, billing_cycle, referral_code } = req.body;

  if (!org_id || !org_name || !user_email || !user_name) {
    res.status(400).json({
      success: false,
      error: {
        message: 'Missing required fields: org_id, org_name, user_email, user_name',
        code: 'VALIDATION_ERROR',
      },
    });
    return;
  }

  try {
    const result = await provisionService.provision({
      org_id,
      org_name,
      user_email,
      user_name,
      plan,
      billing_cycle,
      referral_code,
    });

    logger.info('Tenant provisioned via API', {
      tenantId: result.tenant_id,
      orgId: org_id,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    const statusCode = (error as { statusCode?: number })?.statusCode || 500;
    const code = (error as { code?: string })?.code || 'PROVISION_ERROR';
    res.status(statusCode).json({
      success: false,
      error: {
        message: error instanceof Error ? error.message : 'Provisioning failed',
        code,
      },
    });
  }
};

/**
 * GET /api/product/info
 * Public product information for Agent Studio marketplace.
 */
export const getProductInfo = async (_req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    data: {
      name: 'Event Registration Form',
      slug: 'registration-form',
      description:
        'Create professional event registration forms with payment processing, seat management, flyer generation, and attendee tracking.',
      features: [
        'Multi-tier ticketing (VIP, Standard, Basic)',
        'Razorpay payment integration',
        'Real-time seat counter',
        'Guest speaker management',
        'AI content generation',
        'Flyer generator',
        'Abandonment recovery',
        'Export to CSV/Excel',
      ],
      plans: [
        {
          name: 'trial',
          display_name: 'Free Trial',
          price: 0,
          billing: null,
          registrations_limit: 50,
          trial_days: 14,
        },
        {
          name: 'launchpad',
          display_name: 'Launchpad',
          price_monthly: 1999,
          price_yearly: 1799,
          currency: 'INR',
          registrations_limit: 500,
        },
        {
          name: 'scaleup_pro',
          display_name: 'ScaleUp Pro',
          price_monthly: 4999,
          price_yearly: 4499,
          currency: 'INR',
          registrations_limit: 10000,
        },
      ],
    },
  });
};
