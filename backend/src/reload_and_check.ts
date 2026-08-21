import { supabase } from './config/supabase.js';
import { config } from './config/index.js';

async function main() {
  console.log("Reloading schema cache...");
  const { error: reloadErr } = await supabase.rpc('reload_schema_cache');
  if (reloadErr) {
    console.error("Failed to reload schema cache:", reloadErr);
  } else {
    console.log("Schema cache reloaded successfully!");
  }

  // Wait 2 seconds for PostgREST to reload
  await new Promise(resolve => setTimeout(resolve, 2000));

  const url = `${config.supabase.url}/rest/v1/?apikey=${config.supabase.serviceKey}`;
  console.log("Fetching fresh OpenAPI spec from:", url);
  const res = await fetch(url);
  const data = (await res.json()) as any;

  console.log("legal_acceptances definition:", JSON.stringify(data.definitions?.legal_acceptances, null, 2));
  console.log("seat_inventory tier_name enum:", JSON.stringify(data.definitions?.seat_inventory?.properties?.tier_name, null, 2));
}

main().catch(console.error);
