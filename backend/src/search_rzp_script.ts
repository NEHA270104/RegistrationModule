import fs from 'fs';

const content = fs.readFileSync('c:/Users/NEHA CHAVAN/Desktop/Registration/bizflow-registration-main/frontend/dashboard/index.html', 'utf8');
if (content.includes('checkout.razorpay.com')) {
  console.log("Razorpay script found in dashboard/index.html");
} else {
  console.log("Razorpay script NOT found in dashboard/index.html");
}
