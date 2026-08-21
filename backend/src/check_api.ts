import { config } from './config/index.js';

async function main() {
  const url = `${config.supabase.url}/rest/v1/?apikey=${config.supabase.serviceKey}`;
  const res = await fetch(url);
  const data = (await res.json()) as any;
  
  console.log("seat_inventory definitions:", JSON.stringify(data.definitions?.seat_inventory, null, 2));
  console.log("registrations definitions:", JSON.stringify(data.definitions?.registrations, null, 2));
}

main().catch(console.error);
