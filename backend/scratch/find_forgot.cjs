const fs = require('fs');

const indexHtml = fs.readFileSync('C:/Users/NEHA CHAVAN/Desktop/Registration/eventreg-platform/frontend/index.html', 'utf8');
const appJs = fs.readFileSync('C:/Users/NEHA CHAVAN/Desktop/Registration/eventreg-platform/frontend/js/app.js', 'utf8');

function findOccurrences(content, name) {
    const lines = content.split('\n');
    console.log(`\n--- Occurrences in ${name} ---`);
    lines.forEach((line, idx) => {
        if (line.toLowerCase().includes('forgot') || line.toLowerCase().includes('otp') || line.toLowerCase().includes('identifier')) {
            console.log(`  L${idx+1}: ${line.trim().substring(0, 100)}`);
        }
    });
}

findOccurrences(indexHtml, 'index.html');
findOccurrences(appJs, 'app.js');
