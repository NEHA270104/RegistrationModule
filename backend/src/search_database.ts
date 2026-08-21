import fs from 'fs';
import path from 'path';

const searchDir = 'c:/Users/NEHA CHAVAN/Desktop/Registration/bizflow-registration-main/backend/src';

function walk(dir: string, callback: (file: string) => void) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'dist') {
        walk(filepath, callback);
      }
    } else {
      callback(filepath);
    }
  }
}

walk(searchDir, (file) => {
  if (file.endsWith('.ts')) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('Database') || content.includes('supabase.ts')) {
      console.log(`Found in: ${file}`);
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (line.includes('Database') || line.includes('supabase.ts')) {
          console.log(`  Line ${index + 1}: ${line.trim()}`);
        }
      });
    }
  }
});
