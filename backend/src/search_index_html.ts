import fs from 'fs';

const content = fs.readFileSync('c:/Users/NEHA CHAVAN/Desktop/Registration/bizflow-registration-main/frontend/waitlist.html', 'utf8');
const lines = content.split('\n');

lines.forEach((line, index) => {
  if (line.includes('data-tier') || line.includes('id="tier"') || line.includes('name="tier"') || line.includes('value="')) {
    console.log(`waitlist.html:${index + 1}: ${line.trim()}`);
  }
});
