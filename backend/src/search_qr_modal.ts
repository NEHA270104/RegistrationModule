import fs from 'fs';
import path from 'path';

const searchDir = 'c:/Users/NEHA CHAVAN/Desktop/Registration/bizflow-registration-main/frontend';

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
  if (file.endsWith('.js') || file.endsWith('.html')) {
    const content = fs.readFileSync(file, 'utf8');
    if (content.includes('showQrPaymentModal') || content.includes('QrPayment')) {
      console.log(`Found in: ${file}`);
      const lines = content.split('\n');
      lines.forEach((line, index) => {
        if (line.includes('showQrPaymentModal') || line.includes('QrPayment')) {
          console.log(`  Line ${index + 1}: ${line.trim().substring(0, 100)}`);
        }
      });
    }
  }
});
