import dotenv from 'dotenv';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("Checking all table columns in database public schema...");
  
  // SQL to get table name, column name, and data type
  const sql = `
    SELECT table_name, column_name, data_type, udt_name 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
    ORDER BY table_name, column_name;
  `;
  
  const { data, error } = await supabase.rpc('run_sql_query_temp', { sql_query: sql });
  if (error) {
    console.error("RPC failed, attempting custom query...");
    // If RPC is missing, query some other way, or check tables one by one.
    // Let's check some likely candidates
  } else {
    console.log("Columns list:");
    const columns = data || [];
    columns.forEach(col => {
      if (col.column_name.includes('tier') || col.udt_name.includes('tier') || col.data_type.includes('USER-DEFINED')) {
        console.log(`Table: ${col.table_name} | Column: ${col.column_name} | Type: ${col.data_type} | UDT Name: ${col.udt_name}`);
      }
    });
  }
}

main();
