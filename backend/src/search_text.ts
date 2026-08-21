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

const pattern = /general/i;

walk(searchDir, (file) => {
  if (file.endsWith('.ts') || file.endsWith('.js') || file.endsWith('.html') || file.endsWith('.json')) {
    const content = fs.readFileSync(file, 'utf8');
    if (pattern.test(content)) {
      console.log(`Found in: ${file}`);
      // Print lines matching
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (pattern.test(line)) {
          console.log(`  Line ${index + 1}: ${line.trim().substring(0, 100)}`);
        }
      });
    }
  }
});
