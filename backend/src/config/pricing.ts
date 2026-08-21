/**
 * Pricing Config
 * SaaS subscription plans and ticket pricing tiers
 */
export const pricing = {
  // Ticket registration tiers (in paise)
  general: 49900, // Rs. 499
  vip: 99900,     // Rs. 999

  // Business subscription tiers (in paise - Live Testing Values: ₹1, ₹5, ₹10)
  basic: 100,        // Rs. 1/mo
  starter: 100,      // Rs. 1/mo
  standard: 500,     // Rs. 5/mo
  pro: 500,          // Rs. 5/mo
  premium: 1000,     // Rs. 10/mo
  enterprise: 1000   // Rs. 10/mo
} as const;

export type FeatureType = 'analytics' | 'api' | 'collaboration';

// Subscription plan feature capabilities mapping
export const planFeatures: Record<string, Record<FeatureType, boolean>> = {
  trial: {
    analytics: false,
    api: false,
    collaboration: false,
  },
  starter: {
    analytics: true,
    api: true,
    collaboration: true,
  },
  pro: {
    analytics: false,
    api: true,
    collaboration: true,
  },
  enterprise: {
    analytics: false,
    api: false,
    collaboration: false,
  },
};

/**
 * Reusable utility to check if a plan can access a specific feature
 * @param plan - The subscription plan name (e.g., 'trial', 'starter', 'pro', 'enterprise')
 * @param feature - The feature to check access for ('analytics', 'api', 'collaboration')
 * @returns boolean
 */
export function canAccessFeature(plan: string, feature: FeatureType): boolean {
  if (!plan) return false;
  const normalizedPlan = plan.toLowerCase();
  const features = planFeatures[normalizedPlan] || planFeatures.trial;
  return !!features[feature];
}

/**
 * Helper to get the price of any tier (ticket or subscription) in Rupees
 * @param tier - The tier name
 * @returns price in INR (Rupees)
 */
export function getPriceInRupees(tier: string): number {
  const normalized = tier.toLowerCase();
  const amountInPaise = pricing[normalized as keyof typeof pricing];
  if (amountInPaise === undefined) {
    throw new Error(`Pricing not found for tier: ${tier}`);
  }
  return amountInPaise / 100;
}
