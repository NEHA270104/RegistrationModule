import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("Checking tables...");
  
  const tables = ['super_admins', 'payments', 'flyer_config', 'flyer_templates'];
  for (const t of tables) {
    const sql = `
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns 
      WHERE table_name = '${t}';
    `;
    const res = await supabase.rpc('run_sql_query_temp', { sql_query: sql });
    if (res.data && res.data.length > 0) {
      console.log(`Table '${t}' exists with columns:`, res.data);
    } else if (res.error) {
      console.log(`Error checking table '${t}':`, res.error);
    } else {
      console.log(`Table '${t}' does not exist.`);
    }
  }
}

main();
