/**
 * Centralized Subscription Plan Feature Gating & Permissions Engine
 */

export type SubscriptionTier = 'basic' | 'standard' | 'premium' | 'enterprise' | 'launchpad' | 'scaleup' | 'trial';

export interface PlanLimits {
  eventsLimit: number;
  attendeesLimit: number;
  aiFlyerGeneration: boolean;
  emailTemplatesCustomization: boolean;
  advancedAnalytics: boolean;
  csvExport: boolean;
  customDomain: boolean;
  apiAccess: boolean;
  prioritySupport: boolean;
}

export const TIER_PERMISSIONS: Record<string, PlanLimits> = {
  basic: {
    eventsLimit: 3,
    attendeesLimit: 500,
    aiFlyerGeneration: false,
    emailTemplatesCustomization: true,
    advancedAnalytics: false,
    csvExport: false,
    customDomain: false,
    apiAccess: false,
    prioritySupport: false,
  },
  launchpad: {
    eventsLimit: 3,
    attendeesLimit: 500,
    aiFlyerGeneration: false,
    emailTemplatesCustomization: true,
    advancedAnalytics: false,
    csvExport: false,
    customDomain: false,
    apiAccess: false,
    prioritySupport: false,
  },
  starter: {
    eventsLimit: 3,
    attendeesLimit: 500,
    aiFlyerGeneration: false,
    emailTemplatesCustomization: true,
    advancedAnalytics: false,
    csvExport: false,
    customDomain: false,
    apiAccess: false,
    prioritySupport: false,
  },
  standard: {
    eventsLimit: 10,
    attendeesLimit: 5000,
    aiFlyerGeneration: false,
    emailTemplatesCustomization: true,
    advancedAnalytics: true,
    csvExport: true,
    customDomain: false,
    apiAccess: false,
    prioritySupport: false,
  },
  scaleup: {
    eventsLimit: 10,
    attendeesLimit: 5000,
    aiFlyerGeneration: false,
    emailTemplatesCustomization: true,
    advancedAnalytics: true,
    csvExport: true,
    customDomain: false,
    apiAccess: false,
    prioritySupport: false,
  },
  pro: {
    eventsLimit: 10,
    attendeesLimit: 5000,
    aiFlyerGeneration: false,
    emailTemplatesCustomization: true,
    advancedAnalytics: true,
    csvExport: true,
    customDomain: false,
    apiAccess: false,
    prioritySupport: false,
  },
  premium: {
    eventsLimit: 50,
    attendeesLimit: 25000,
    aiFlyerGeneration: true,
    emailTemplatesCustomization: true,
    advancedAnalytics: true,
    csvExport: true,
    customDomain: true,
    apiAccess: true,
    prioritySupport: true,
  },
  enterprise: {
    eventsLimit: 50,
    attendeesLimit: 25000,
    aiFlyerGeneration: true,
    emailTemplatesCustomization: true,
    advancedAnalytics: true,
    csvExport: true,
    customDomain: true,
    apiAccess: true,
    prioritySupport: true,
  },
  trial: {
    eventsLimit: 1,
    attendeesLimit: 100,
    aiFlyerGeneration: false,
    emailTemplatesCustomization: false,
    advancedAnalytics: false,
    csvExport: false,
    customDomain: false,
    apiAccess: false,
    prioritySupport: false,
  },
};

/**
 * Normalise any plan name string to a canonical permission set
 */
export function getPlanPermissions(planName?: string | null): PlanLimits {
  if (!planName) return TIER_PERMISSIONS.basic;
  const key = planName.toLowerCase().trim();
  return TIER_PERMISSIONS[key] || TIER_PERMISSIONS.basic;
}

/**
 * Check if a specific feature is allowed for the given plan
 */
export function isFeatureAllowed(planName: string | null | undefined, feature: keyof PlanLimits): boolean {
  const permissions = getPlanPermissions(planName);
  const val = permissions[feature];
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val > 0;
  return false;
}
