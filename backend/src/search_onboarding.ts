import fs from 'fs';

const content = fs.readFileSync('c:/Users/NEHA CHAVAN/Desktop/Registration/bizflow-registration-main/frontend/onboarding/js/onboarding.js', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('ticket_tiers') || line.includes('api') || line.includes('fetch') || line.includes('POST')) {
    console.log(`onboarding.js:${index + 1}: ${line.trim().substring(0, 100)}`);
  }
});
