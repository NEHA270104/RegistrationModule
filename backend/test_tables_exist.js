import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function check(table) {
  const { data, error } = await supabase.from(table).select('*').limit(1);
  if (error) {
    console.log(`Table '${table}' check error: ${error.message} (${error.code})`);
  } else {
    console.log(`Table '${table}' exists! Data:`, data);
  }
}

async function main() {
  console.log("Checking tables via Supabase JS SDK...");
  await check('super_admins');
  await check('payments');
  await check('flyer_config');
  await check('tenants');
  await check('subscription_plans');
  await check('global_settings');
}

main();
