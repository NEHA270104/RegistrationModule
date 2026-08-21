import { supabase } from './config/supabase.js';

async function testVal(val: string) {
  console.log(`Testing query with tier_name = '${val}'...`);
  const { data, error } = await supabase
    .from('seat_inventory')
    .select('*')
    .eq('tier_name', val);
  
  if (error) {
    console.log(`  Result: Error - Code: ${error.code}, Message: ${error.message}`);
  } else {
    console.log(`  Result: Success - Found ${data?.length} rows`);
  }
}

async function main() {
  await testVal('general');
  await testVal('General');
  await testVal('standard');
  await testVal('Standard');
  await testVal('vip');
  await testVal('VIP');
}

main().catch(console.error);
