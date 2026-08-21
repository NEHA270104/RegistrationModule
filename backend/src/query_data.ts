import { supabase } from './config/supabase.js';

async function main() {
  console.log("Querying plans...");
  const { data: plans, error } = await supabase
    .from('plans')
    .select('*');
  console.log("plans rows:", plans || error);
}

main().catch(console.error);
