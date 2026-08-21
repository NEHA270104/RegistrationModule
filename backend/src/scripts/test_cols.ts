import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: 'c:/Users/NEHA CHAVAN/Desktop/Registration/bizflow-registration-main/backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log("Checking if profiles table exists...");
  const { data, error } = await supabase.from('profiles').select('*').limit(1).maybeSingle();
  if (error) {
    console.error("Profiles Table Query Error:", error);
  } else {
    console.log("Profiles Table Query Data:", data);
  }
}

main();
