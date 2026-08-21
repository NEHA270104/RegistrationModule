import dotenv from 'dotenv';
dotenv.config();

console.log("Database related Env keys:", Object.keys(process.env).filter(k => 
  k.toLowerCase().includes('db') || 
  k.toLowerCase().includes('postgres') || 
  k.toLowerCase().includes('sql') || 
  k.toLowerCase().includes('url')
));
