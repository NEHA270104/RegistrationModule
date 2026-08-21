const fs = require('fs');
const path = require('path');

function searchDir(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            searchDir(fullPath);
        } else if (file.endsWith('.html') || file.endsWith('.js')) {
            const content = fs.readFileSync(fullPath, 'utf8');
            if (content.toLowerCase().includes('forgot') || content.toLowerCase().includes('otp') || content.toLowerCase().includes('identifier')) {
                console.log(`Match in: ${fullPath}`);
            }
        }
    }
}

searchDir('C:/Users/NEHA CHAVAN/Desktop/Registration/bizflow-registration-main/frontend');
