import dotenv from 'dotenv';
dotenv.config();

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) return;

  const url = `${supabaseUrl}/rest/v1/`;
  const res = await fetch(url, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });

  const spec = await res.json() as any;
  const definitions = spec.definitions || {};

  ['subscription_plans', 'global_settings'].forEach(t => {
    if (definitions[t]) {
      console.log(`=== ${t} Definition ===`);
      console.log(JSON.stringify(definitions[t], null, 2));
    }
  });
}

main().catch(console.error);
