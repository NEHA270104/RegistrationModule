import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config({ path: '../.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function testColumn(col) {
  const { data, error } = await supabase.from('payments').select(col).limit(1);
  if (error) {
    console.log(`Column ${col} query failed:`, error.message);
  } else {
    console.log(`Column ${col} query succeeded!`);
  }
}

async function main() {
  await testColumn('order_id');
  await testColumn('razorpay_order_id');
  await testColumn('id');
}

main();
