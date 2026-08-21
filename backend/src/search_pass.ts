import fs from 'fs';
import path from 'path';

const searchDir = 'c:/Users/NEHA CHAVAN/Desktop/Registration/bizflow-registration-main';

function walk(dir: string, callback: (file: string) => void) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== '.git' && file !== 'dist') {
        walk(filepath, callback);
      }
    } else {
      callback(filepath);
    }
  }
}

walk(searchDir, (file) => {
  if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.json') || file.endsWith('.yaml') || file.endsWith('.bat') || file.endsWith('.ps1')) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('postgres') || content.includes('DATABASE_URL') || content.includes('db_') || content.includes('DB_')) {
      console.log(`Found in: ${file}`);
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (line.includes('postgres') || line.includes('DATABASE_URL') || line.includes('db_') || line.includes('DB_')) {
          console.log(`  Line ${index + 1}: ${line.trim().substring(0, 100)}`);
        }
      });
    }
  }
});
