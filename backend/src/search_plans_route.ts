import fs from 'fs';
import path from 'path';

const srcDir = 'c:/Users/NEHA CHAVAN/Desktop/Registration/eventreg-platform/backend/src';

function walk(dir: string, callback: (file: string) => void) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filepath = path.join(dir, file);
    const stat = fs.statSync(filepath);
    if (stat.isDirectory()) {
      walk(filepath, callback);
    } else {
      callback(filepath);
    }
  }
}

async function main() {
  walk(srcDir, (file) => {
    if (!file.endsWith('.ts')) return;
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      if (line.toLowerCase().includes('plans') || line.toLowerCase().includes('subscription_plans')) {
        console.log(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
  });
}

main().catch(console.error);
