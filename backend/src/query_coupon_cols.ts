import { supabase } from './config/supabase.js';

async function main() {
  console.log("Querying platform_coupons columns...");
  const sql = `
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns 
    WHERE table_name = 'platform_coupons';
  `;
  const res = await supabase.rpc('run_sql_query_temp', { sql_query: sql });
  console.log("platform_coupons columns:", res.data || res.error);
}

main().catch(console.error);
