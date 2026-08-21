const fs = require('fs');
const content = fs.readFileSync('C:/Users/NEHA CHAVAN/Desktop/Registration/bizflow-registration-main/frontend/dashboard/js/dashboard.js', 'utf8');
const lines = content.split('\n');

lines.forEach((line, idx) => {
    if (line.includes('login-form') || line.includes('login-btn') || line.includes('login(') || line.includes('showLoginScreen')) {
        console.log(`L${idx+1}: ${line.trim().substring(0, 120)}`);
    }
});
