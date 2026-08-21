import fs from 'fs';

const content = fs.readFileSync('c:/Users/NEHA CHAVAN/Desktop/Registration/bizflow-registration-main/frontend/onboarding/index.html', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('plan-card') || line.includes('Basic') || line.includes('Standard') || line.includes('Launch') || line.includes('Scale')) {
    console.log(`onboarding/index.html:${index + 1}: ${line.trim()}`);
  }
});
