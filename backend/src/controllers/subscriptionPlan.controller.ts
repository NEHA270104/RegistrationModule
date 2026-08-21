import { Request, Response } from 'express';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

/**
 * GET /api/admin/plans
 * Get all subscription plans
 */
export async function getSubscriptionPlans(req: Request, res: Response): Promise<void> {
  try {
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('price_inr', { ascending: true });

    if (error || !data || data.length === 0) {
      if (error) logger.error('Error fetching subscription plans:', error.message);
      const defaultPlans = [
        { id: 'plan_basic', name: 'Basic', price_inr: 1, price_monthly: 1, features: ['1 event', 'Up to 50 registrations', 'Basic dashboard', 'Email confirmations'] },
        { id: 'plan_standard', name: 'Standard', price_inr: 5, price_monthly: 5, features: ['1 concurrent event', 'Up to 500 registrations', 'Full analytics dashboard', 'Custom branding'] },
        { id: 'plan_premium', name: 'Premium', price_inr: 10, price_monthly: 10, features: ['Unlimited events', 'Up to 10,000 registrations', 'Advanced analytics & exports', 'Custom domain & API'] }
      ];
      res.status(200).json({
        success: true,
        data: defaultPlans
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: data
    });
  } catch (error) {
    logger.error('Unexpected error in getSubscriptionPlans:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Unexpected error occurred while fetching subscription plans' }
    });
  }
}

/**
 * POST /api/admin/plans
 * Create a new subscription plan
 */
export async function createSubscriptionPlan(req: Request, res: Response): Promise<void> {
  try {
    const { name, price_inr, price_monthly, features } = req.body;
    const priceVal = price_inr !== undefined ? price_inr : price_monthly;

    if (!name || priceVal === undefined) {
      res.status(400).json({
        success: false,
        error: { message: 'name and price_inr (or price_monthly) are required' }
      });
      return;
    }

    const { data, error } = await supabase
      .from('subscription_plans')
      .insert({
        name,
        price_inr: Number(priceVal),
        features: Array.isArray(features) ? features : []
      })
      .select()
      .single();

    if (error) {
      logger.error('Error creating subscription plan:', error.message);
      res.status(500).json({
        success: false,
        error: { message: 'Failed to create subscription plan: ' + error.message }
      });
      return;
    }

    res.status(201).json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Unexpected error in createSubscriptionPlan:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Unexpected error occurred while creating subscription plan' }
    });
  }
}

/**
 * PUT /api/admin/plans/:id
 * Update an existing subscription plan by ID
 */
export async function updateSubscriptionPlan(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { name, price_inr, price_monthly, features } = req.body;

    if (!id) {
      res.status(400).json({
        success: false,
        error: { message: 'Plan ID is required' }
      });
      return;
    }

    const isValidId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) || /^\d+$/.test(id);
    if (!isValidId) {
      res.status(400).json({
        success: false,
        error: { message: 'Invalid format for Plan ID' }
      });
      return;
    }

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    const priceVal = price_inr !== undefined ? price_inr : price_monthly;
    if (priceVal !== undefined) updateData.price_inr = Number(priceVal);
    if (features !== undefined) {
      updateData.features = Array.isArray(features) ? features : [];
    }

    const query = supabase
      .from('subscription_plans')
      .update(updateData);

    if (/^\d+$/.test(id)) {
      query.eq('id', parseInt(id));
    } else {
      query.eq('id', id);
    }

    const { data, error } = await query
      .select()
      .single();

    if (error) {
      logger.error(`Error updating subscription plan ${id}:`, error.message);
      res.status(500).json({
        success: false,
        error: { message: 'Failed to update subscription plan: ' + error.message }
      });
      return;
    }

    res.status(200).json({
      success: true,
      data
    });
  } catch (error) {
    logger.error('Unexpected error in updateSubscriptionPlan:', error);
    res.status(500).json({
      success: false,
      error: { message: 'Unexpected error occurred while updating subscription plan' }
    });
  }
}
