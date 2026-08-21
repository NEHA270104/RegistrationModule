import { supabase } from './config/supabase.js';

async function main() {
  console.log("Checking database...");

  // 1. Check legal_acceptances columns
  const sql1 = `
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'legal_acceptances';
  `;
  const res1 = await supabase.rpc('run_sql_query_temp', { sql_query: sql1 });
  console.log("legal_acceptances columns:", res1.data || res1.error);

  // 2. Check enum types
  const sql2 = `
    SELECT t.typname, e.enumlabel
    FROM pg_type t 
    JOIN pg_enum e ON t.oid = e.enumtypid
    JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public';
  `;
  const res2 = await supabase.rpc('run_sql_query_temp', { sql_query: sql2 });
  console.log("Enums in database:", res2.data || res2.error);
}

main().catch(console.error);
