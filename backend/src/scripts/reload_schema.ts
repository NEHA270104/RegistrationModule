import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: 'c:/Users/NEHA CHAVAN/Desktop/Registration/eventreg-platform/backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("Calling reload_schema_cache()...");
  const { data, error } = await supabase.rpc('reload_schema_cache');

  if (error) {
    console.error("Failed:", error);
  } else {
    console.log("Success:", data);
  }
}

main();
