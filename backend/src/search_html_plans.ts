import fs from 'fs';
import path from 'path';

const frontendDir = 'c:/Users/NEHA CHAVAN/Desktop/Registration/bizflow-registration-main/frontend';

function walk(dir: string, callback: (file: string) => void) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);
    if (stat.isDirectory()) {
      if (file !== 'node_modules' && file !== 'super-admin' && file !== 'admin' && file !== 'dashboard') {
        walk(filepath, callback);
      }
    } else {
      callback(filepath);
    }
  }
}

async function main() {
  walk(frontendDir, (file) => {
    if (!file.endsWith('.html') && !file.endsWith('.js')) return;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      if (line.toLowerCase().includes('plan') || line.toLowerCase().includes('price') || line.toLowerCase().includes('api/public') || line.toLowerCase().includes('api/plans')) {
        console.log(`${file}:${index + 1}: ${line.trim().substring(0, 120)}`);
      }
    });
  });
}

main().catch(console.error);
