import { supabase } from './config/supabase.js';

async function main() {
  console.log("Selecting rows from platform_coupons...");
  const { data, error } = await supabase.from('platform_coupons').select('*');
  if (error) {
    console.error("Error fetching platform_coupons:", error);
  } else {
    console.log("Fetched platform_coupons successfully! Count:", data?.length);
    if (data && data.length > 0) {
      console.log("First row schema keys:", Object.keys(data[0]));
      console.log("First row data:", data[0]);
    } else {
      console.log("Table is empty.");
    }
  }
}

main().catch(console.error);
