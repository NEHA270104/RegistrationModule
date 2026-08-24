import fs from 'fs';
import path from 'path';

// Load env from backend
import dotenv from 'dotenv';
dotenv.config({ path: 'c:/Users/NEHA CHAVAN/Desktop/Registration/eventreg-platform/backend/.env' });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

async function main() {
  const url = `${supabaseUrl}/rest/v1/?apikey=${supabaseServiceKey}`;
  console.log("Fetching OpenAPI spec...");
  const res = await fetch(url);
  const spec = (await res.json()) as any;

  let code = `export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
`;

  const definitions = spec.definitions || {};
  for (const [tableName, definition] of Object.entries(definitions)) {
    const def = definition as any;
    code += `      ${tableName}: {\n        Row: {\n`;
    
    // Rows
    for (const [colName, colDef] of Object.entries(def.properties || {})) {
      const c = colDef as any;
      let type = 'any';
      if (c.type === 'string') type = 'string';
      else if (c.type === 'integer' || c.type === 'number') type = 'number';
      else if (c.type === 'boolean') type = 'boolean';
      
      const nullable = !def.required?.includes(colName);
      code += `          ${colName}: ${type}${nullable ? ' | null' : ''};\n`;
    }
    
    // Inject ip_address and user_agent if not already in legal_acceptances
    if (tableName === 'legal_acceptances') {
      if (!def.properties?.ip_address) {
        code += `          ip_address: string | null;\n`;
      }
      if (!def.properties?.user_agent) {
        code += `          user_agent: string | null;\n`;
      }
    }

    code += `        };\n        Insert: {\n`;
    
    // Insert
    for (const [colName, colDef] of Object.entries(def.properties || {})) {
      const c = colDef as any;
      let type = 'any';
      if (c.type === 'string') type = 'string';
      else if (c.type === 'integer' || c.type === 'number') type = 'number';
      else if (c.type === 'boolean') type = 'boolean';
      
      const hasDefault = c.default !== undefined;
      const nullable = !def.required?.includes(colName);
      const optional = hasDefault || nullable;
      code += `          ${colName}${optional ? '?' : ''}: ${type}${nullable ? ' | null' : ''};\n`;
    }
    if (tableName === 'legal_acceptances') {
      code += `          ip_address?: string | null;\n`;
      code += `          user_agent?: string | null;\n`;
    }

    code += `        };\n        Update: {\n`;

    // Update
    for (const [colName, colDef] of Object.entries(def.properties || {})) {
      const c = colDef as any;
      let type = 'any';
      if (c.type === 'string') type = 'string';
      else if (c.type === 'integer' || c.type === 'number') type = 'number';
      else if (c.type === 'boolean') type = 'boolean';
      
      const nullable = !def.required?.includes(colName);
      code += `          ${colName}?: ${type}${nullable ? ' | null' : ''};\n`;
    }
    if (tableName === 'legal_acceptances') {
      code += `          ip_address?: string | null;\n`;
      code += `          user_agent?: string | null;\n`;
    }

    code += `        };\n      };\n`;
  }

  code += `    };\n    Views: {\n      [_ in never]: never;\n    };\n    Functions: {\n      [_ in never]: never;\n    };\n    Enums: {\n`;
  
  // Add public.tier_type enum
  code += `      tier_type: 'vip' | 'standard' | 'basic' | 'waitlist' | 'starter' | 'pro' | 'enterprise';\n`;
  
  code += `    };\n  };\n}\n`;

  const outputPath = 'c:/Users/NEHA CHAVAN/Desktop/Registration/eventreg-platform/backend/src/types/supabase.ts';
  fs.writeFileSync(outputPath, code);
  console.log("TypeScript types generated successfully to:", outputPath);
}

main().catch(console.error);
