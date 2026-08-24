import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: 'c:/Users/NEHA CHAVAN/Desktop/Registration/eventreg-platform/backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  const sql = `
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS job_title TEXT;
    ALTER TABLE tenants ADD COLUMN IF NOT EXISTS bio TEXT;
  `;

  console.log("Executing SQL...");
  const { data, error } = await supabase.rpc('run_sql_query_temp', { sql_query: sql });

  if (error) {
    console.error("Failed:", error);
  } else {
    console.log("Success:", data);
  }
}

main();
