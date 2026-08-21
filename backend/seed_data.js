import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

// Load env
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("Seeding default subscription plans...");
  const plans = [
    {
      name: 'Basic',
      price_monthly: 1,
      price_inr: 1,
      features: ['1 event', 'Up to 50 registrations', 'Basic dashboard', 'Email confirmations', 'Standard support']
    },
    {
      name: 'Standard',
      price_monthly: 5,
      price_inr: 5,
      features: ['1 concurrent event', 'Up to 500 registrations', 'Full analytics dashboard', 'Email notifications', 'Custom branding', 'Standard support']
    },
    {
      name: 'Premium',
      price_monthly: 10,
      price_inr: 10,
      features: ['Unlimited events', 'Up to 10,000 registrations', 'Advanced analytics & exports', 'Custom domain support', 'Priority support & onboarding', 'API access', 'Team collaboration']
    }
  ];

  for (const plan of plans) {
    const { data, error } = await supabase
      .from('subscription_plans')
      .upsert(plan, { onConflict: 'name' })
      .select();

    if (error) {
      console.error(`Failed to seed plan ${plan.name}:`, error.message);
    } else {
      console.log(`Seeded/updated plan: ${plan.name}`, data);
    }
  }

  console.log("Seeding default global settings...");
  const settings = [
    { key: 'maintenance_mode', value: false },
    { key: 'support_email', value: 'support@eventregplatform.com' }
  ];

  for (const setting of settings) {
    const { data, error } = await supabase
      .from('global_settings')
      .upsert(setting, { onConflict: 'key' })
      .select();

    if (error) {
      console.error(`Failed to seed setting ${setting.key}:`, error.message);
    } else {
      console.log(`Seeded/updated setting: ${setting.key}`, data);
    }
  }
}

main().catch(console.error);
