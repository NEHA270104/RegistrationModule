# Comprehensive End-to-End Testing Guide
## AI Summit for MSME Business Owners 2026 - Registration System

**Document Version:** 1.0
**Last Updated:** January 2026
**Author:** QA Team

---

## Table of Contents

1. [Test Environment Setup](#1-test-environment-setup)
2. [Test Data Preparation](#2-test-data-preparation)
3. [User Registration Flow Testing](#3-user-registration-flow-testing)
4. [Payment Flow Testing](#4-payment-flow-testing)
5. [Payment Failure Scenarios](#5-payment-failure-scenarios)
6. [Email Notification Testing](#6-email-notification-testing)
7. [Admin Dashboard Testing](#7-admin-dashboard-testing)
8. [Seat Inventory Testing](#8-seat-inventory-testing)
9. [Edge Cases and Negative Testing](#9-edge-cases-and-negative-testing)
10. [Performance Testing](#10-performance-testing)
11. [Security Testing Checklist](#11-security-testing-checklist)
12. [Test Reporting Template](#12-test-reporting-template)

---

## 1. Test Environment Setup

### 1.1 Prerequisites

- [ ] Backend server running (`npm run dev` in backend folder)
- [ ] Frontend served (local server or Firebase hosting)
- [ ] Supabase database connected (check `.env` configuration)
- [ ] Razorpay test mode credentials configured
- [ ] MSG91 email service configured
- [ ] Admin API key available for authentication

### 1.2 Environment Configuration Checklist

| Configuration | Test Value | Location |
|--------------|------------|----------|
| `RAZORPAY_KEY_ID` | Test key (rzp_test_*) | backend/.env |
| `RAZORPAY_KEY_SECRET` | Test secret | backend/.env |
| `SUPABASE_URL` | Your project URL | backend/.env |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | backend/.env |
| `MSG91_AUTH_KEY` | API key | backend/.env |
| `ADMIN_API_KEY` | Admin authentication key | backend/.env |

### 1.3 Browser Requirements

- Chrome (latest) - Primary testing
- Firefox (latest) - Cross-browser verification
- Safari (latest) - Mac users
- Mobile browsers (Chrome/Safari on mobile)

### 1.4 Test Database Reset

Before starting a fresh test cycle, run the test data script:

```sql
-- Run in Supabase SQL Editor
-- File: backend/supabase/migrations/999_test_data.sql
```

Or reset to clean state:
```sql
DELETE FROM payment_abandonments WHERE email LIKE '%@test.example.com';
DELETE FROM registrations WHERE email LIKE '%@test.example.com';
DELETE FROM waitlist WHERE email LIKE '%@test.example.com';

UPDATE seat_inventory SET sold_seats = 0, held_seats = 0 WHERE tier_name IN ('vip', 'standard', 'basic');
```

---

## 2. Test Data Preparation

### 2.1 Test User Credentials

| Test User | Email | Phone | Purpose |
|-----------|-------|-------|---------|
| New User 1 | qa.tester1@test.example.com | 9876500001 | Fresh registration |
| New User 2 | qa.tester2@test.example.com | 9876500002 | Payment failure |
| New User 3 | qa.tester3@test.example.com | 9876500003 | Duplicate check |
| Existing User | rajesh.kumar@test.example.com | 9876543001 | Already registered |

### 2.2 Razorpay Test Cards

| Card Number | Behavior | Use Case |
|-------------|----------|----------|
| 4111 1111 1111 1111 | Success | Successful payment |
| 4000 0000 0000 0002 | Declined | Card declined scenario |
| 5105 1051 0510 5100 | Success (Mastercard) | Alternative card |

**Test Card Details:**
- Expiry: Any future date (e.g., 12/26)
- CVV: Any 3 digits (e.g., 123)
- Name: Any name

### 2.3 Test UPI IDs (Razorpay Test Mode)

| UPI ID | Behavior |
|--------|----------|
| success@razorpay | Successful payment |
| failure@razorpay | Payment failure |

---

## 3. User Registration Flow Testing

### 3.1 Landing Page Load

**Test ID:** REG-001
**Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Open registration URL | Page loads within 3 seconds | |
| 2 | Verify header/branding | "AI Summit for MSME Business Owners 2026" displayed | |
| 3 | Check tier cards | All 3 tiers displayed (Executive/VIP, Business/Standard, Growth/Basic) | |
| 4 | Verify pricing | Executive: Rs.2,499, Business: Rs.1,499, Growth: Rs.999 | |
| 5 | Check seat availability | Available seats shown for each tier | |
| 6 | Verify "Register Now" buttons | All buttons visible and clickable | |

### 3.2 Registration Form - Field Validation

**Test ID:** REG-002
**Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Click "Register Now" on any tier | Registration form modal opens | |
| 2 | Submit empty form | Validation errors for all required fields | |
| 3 | Enter invalid email (test@) | Email validation error displayed | |
| 4 | Enter invalid phone (12345) | Phone validation error (must be 10 digits) | |
| 5 | Enter valid name only | Other field errors shown | |
| 6 | Select industry from dropdown | Industry field accepts selection | |
| 7 | Select revenue range | Revenue range field accepts selection | |

### 3.3 Registration Form - Successful Submission

**Test ID:** REG-003
**Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Fill all required fields with valid data | No validation errors | |
| 2 | Click "Proceed to Payment" | Loading state shown | |
| 3 | Wait for Razorpay to load | Razorpay checkout modal appears | |
| 4 | Verify pre-filled details | Name, email, phone pre-filled in Razorpay | |
| 5 | Verify amount | Correct tier amount shown | |

**Test Data:**
```
Name: QA Test User
Email: qa.tester1@test.example.com
Phone: 9876500001
Business Name: QA Testing Company
Industry: IT Services
Revenue Range: 10L - 50L
Tier: Business (Rs.1,499)
```

### 3.4 Duplicate Registration Check

**Test ID:** REG-004
**Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Use email of confirmed registration | "Already registered" error displayed | |
| 2 | Use phone of confirmed registration | "Already registered" error displayed | |
| 3 | Verify error message is user-friendly | Clear message with booking ID reference | |

---

## 4. Payment Flow Testing

### 4.1 Successful Payment - Card

**Test ID:** PAY-001
**Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Complete registration form | Razorpay modal opens | |
| 2 | Select "Card" payment method | Card input fields shown | |
| 3 | Enter test card: 4111 1111 1111 1111 | Card accepted | |
| 4 | Enter expiry: 12/26, CVV: 123 | Fields accepted | |
| 5 | Click "Pay" | OTP/3DS simulation page | |
| 6 | Complete OTP (auto in test mode) | Payment processing | |
| 7 | Wait for success | Success page displayed | |
| 8 | Verify booking ID | Booking ID in format BF-2026-XXXXX shown | |
| 9 | Verify confirmation email | Email received within 2 minutes | |

### 4.2 Successful Payment - UPI

**Test ID:** PAY-002
**Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | In Razorpay modal, select "UPI" | UPI options shown | |
| 2 | Enter UPI ID: success@razorpay | UPI ID accepted | |
| 3 | Click "Pay" | Payment simulation | |
| 4 | Wait for success | Success page displayed | |
| 5 | Verify booking ID generated | Valid booking ID shown | |

### 4.3 Successful Payment - Net Banking

**Test ID:** PAY-003
**Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Select "Netbanking" in Razorpay | Bank list shown | |
| 2 | Select any test bank | Bank selected | |
| 3 | Complete bank simulation | Payment processed | |
| 4 | Verify success page | Booking confirmation shown | |

### 4.4 Payment Verification

**Test ID:** PAY-004
**Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | After successful payment | Database: registration status = 'confirmed' | |
| 2 | Check payment_status | Value = 'confirmed' | |
| 3 | Check razorpay_payment_id | Valid payment ID stored | |
| 4 | Check seat_inventory | sold_seats incremented by 1 | |
| 5 | Check held_seats | held_seats decremented by 1 | |

---

## 5. Payment Failure Scenarios

### 5.1 User Cancels Payment Modal

**Test ID:** FAIL-001
**Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Open Razorpay modal | Modal displayed | |
| 2 | Click X or Cancel button | Modal closes | |
| 3 | Verify abandonment tracked | payment_abandonments record created | |
| 4 | Check abandonment_type | Value = 'cancelled' | |
| 5 | Check registration status | payment_status remains 'pending' | |
| 6 | Verify seat still held | held_seats unchanged | |
| 7 | User can retry payment | Able to click "Register Now" again | |

### 5.2 Card Declined

**Test ID:** FAIL-002
**Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Use test card: 4000 0000 0000 0002 | Card entered | |
| 2 | Complete payment flow | Payment declined error | |
| 3 | Verify error message | User-friendly decline message | |
| 4 | Check abandonment record | abandonment_type = 'failed' | |
| 5 | Check reason captured | "Card declined" or similar | |
| 6 | User can retry | Modal allows retry with different card | |

### 5.3 Payment Timeout

**Test ID:** FAIL-003
**Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Start payment process | Razorpay modal open | |
| 2 | Wait without completing (or close browser) | Session abandoned | |
| 3 | After 1 hour, check registration | Should be marked as expired | |
| 4 | Run "Cleanup Expired" in admin | Registration released | |
| 5 | Verify held_seats | Decremented after cleanup | |
| 6 | Verify abandonment record | abandonment_type = 'timeout' | |

### 5.4 Network Error During Payment

**Test ID:** FAIL-004
**Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Start payment process | Razorpay modal open | |
| 2 | Disconnect network mid-payment | Error displayed | |
| 3 | Reconnect network | Able to retry | |
| 4 | Verify no duplicate charges | Only one transaction attempted | |

### 5.5 Razorpay Webhook Failure

**Test ID:** FAIL-005
**Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Complete payment successfully | Payment ID received | |
| 2 | Simulate webhook failure (backend down) | Frontend shows success | |
| 3 | Webhook retry (automatic) | Eventually processes | |
| 4 | Manual verification | Admin can verify via Razorpay dashboard | |

### 5.6 Double Payment Attempt

**Test ID:** FAIL-006
**Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | User clicks pay twice quickly | Only one payment processed | |
| 2 | Check for duplicate orders | No duplicate Razorpay orders | |
| 3 | Verify single registration | Only one registration record | |

---

## 6. Email Notification Testing

### 6.1 Registration Confirmation Email

**Test ID:** EMAIL-001
**Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Complete successful payment | Email triggered | |
| 2 | Check inbox within 2 minutes | Email received | |
| 3 | Verify sender | From configured sender address | |
| 4 | Verify subject | Contains booking ID | |
| 5 | Verify content: Name | Correct name displayed | |
| 6 | Verify content: Booking ID | Matches database record | |
| 7 | Verify content: Tier | Correct tier name | |
| 8 | Verify content: Amount | Correct amount paid | |
| 9 | Verify QR code | QR code image visible | |
| 10 | Scan QR code | Links to valid booking verification | |

### 6.2 Payment Reminder Email (Admin Triggered)

**Test ID:** EMAIL-002
**Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Find pending registration in admin | Registration displayed | |
| 2 | Click "Send Reminder" | Modal confirmation | |
| 3 | Confirm send | Email sent message | |
| 4 | Check user inbox | Reminder email received | |
| 5 | Verify payment link | Link allows completing payment | |

### 6.3 Recovery Email (Abandonment Follow-up)

**Test ID:** EMAIL-003
**Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Go to Abandonments tab | Abandonment list shown | |
| 2 | Click "Send Recovery Email" | Modal confirmation | |
| 3 | Confirm send | Email sent confirmation | |
| 4 | Check user inbox | Recovery email received | |
| 5 | Click recovery link | Pre-filled registration form opens | |
| 6 | Complete payment | Registration confirmed | |

---

## 7. Admin Dashboard Testing

### 7.1 Admin Authentication

**Test ID:** ADMIN-001
**Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Open admin URL without login | Login form displayed | |
| 2 | Enter incorrect API key | "Invalid credentials" error | |
| 3 | Enter correct API key | Dashboard loads | |
| 4 | Refresh page | Session maintained | |
| 5 | Click Logout | Returns to login screen | |
| 6 | Try accessing protected route | Redirected to login | |

### 7.2 Dashboard Statistics

**Test ID:** ADMIN-002
**Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Login to admin dashboard | Stats cards visible | |
| 2 | Verify Total Registrations | Matches database count | |
| 3 | Verify Total Revenue | Sum of confirmed payments (in INR) | |
| 4 | Verify Pending Payments | Count of pending status | |
| 5 | Verify Available Seats | Calculated correctly per tier | |
| 6 | Click Refresh button | Stats update without page reload | |

### 7.3 Registrations Tab

**Test ID:** ADMIN-003
**Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Click "Registrations" tab | Registration list loads | |
| 2 | Verify table columns | Name, Email, Tier, Status, Amount, Date visible | |
| 3 | Use search box | Filters by name/email/booking ID | |
| 4 | Filter by status | Shows only selected status | |
| 5 | Filter by tier | Shows only selected tier | |
| 6 | Sort by date | Newest/oldest first | |
| 7 | Click on registration row | Details modal opens | |
| 8 | Verify all details | All registration data shown | |

### 7.4 Registration Actions

**Test ID:** ADMIN-004
**Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Click "Resend Confirmation" | Modal confirmation shown | |
| 2 | Confirm resend | Success message, email sent | |
| 3 | Click "Send Payment Reminder" (pending) | Modal confirmation shown | |
| 4 | Confirm reminder | Success message, email sent | |
| 5 | Click "Delete Registration" | Confirmation modal with warning | |
| 6 | Confirm delete | Registration removed, seats released | |

### 7.5 Manual Registration

**Test ID:** ADMIN-005
**Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Click "Add Manual Registration" | Form modal opens | |
| 2 | Fill required fields | No validation errors | |
| 3 | Select tier | Tier selected | |
| 4 | Mark as confirmed | Payment confirmed checkbox | |
| 5 | Submit | Registration created | |
| 6 | Verify in list | New registration appears | |
| 7 | Verify seat count | sold_seats incremented | |

### 7.6 Export Registrations

**Test ID:** ADMIN-006
**Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Apply filters (optional) | Filtered list shown | |
| 2 | Click "Export CSV" | Download starts | |
| 3 | Open CSV file | Valid CSV format | |
| 4 | Verify columns | All relevant data included | |
| 5 | Verify data matches filters | Only filtered records exported | |

### 7.7 Seat Inventory Management

**Test ID:** ADMIN-007
**Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Click "Seats" tab | Seat inventory displayed | |
| 2 | Verify tier data | Total, Sold, Held, Available for each tier | |
| 3 | Verify calculations | Available = Total - Sold - Held | |
| 4 | Click "Resync Seats" | Confirmation modal | |
| 5 | Confirm resync | Seats recalculated from registrations | |
| 6 | Verify counts match | Database counts accurate | |

### 7.8 Abandonments Tab

**Test ID:** ADMIN-008
**Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Click "Abandonments" tab | Abandonment list loads | |
| 2 | Verify statistics cards | Total, Pending Follow-up, Lost Revenue | |
| 3 | Filter by type | cancelled/failed/timeout filter works | |
| 4 | Filter by follow-up status | pending/contacted/recovered/lost | |
| 5 | Click on abandonment | Details shown | |
| 6 | Update follow-up status | Status updates successfully | |
| 7 | Add follow-up notes | Notes saved | |

### 7.9 Recovery Link Generation

**Test ID:** ADMIN-009
**Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Select an abandonment | Abandonment selected | |
| 2 | Click "Generate Recovery Link" | Link and QR generated | |
| 3 | Copy link | Link copied to clipboard | |
| 4 | Open link in new tab | Pre-filled form loads | |
| 5 | Verify pre-filled data | Name, email, phone, tier correct | |
| 6 | Complete registration | Can complete payment | |
| 7 | Verify QR code | Scannable, leads to same URL | |

### 7.10 Cleanup Expired Registrations

**Test ID:** ADMIN-010
**Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Ensure pending registrations > 1 hour old exist | Test data has expired pending | |
| 2 | Note current held_seats count | Record values | |
| 3 | Click "Cleanup Expired" | Confirmation modal | |
| 4 | Confirm cleanup | Process runs | |
| 5 | Verify result message | "Released X registration(s)" | |
| 6 | Check held_seats | Decremented appropriately | |
| 7 | Check released registrations | Status changed or deleted | |

### 7.11 Waitlist Tab

**Test ID:** ADMIN-011
**Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Click "Waitlist" tab | Waitlist entries load | |
| 2 | Verify columns | Name, Email, Phone, Livestream interest | |
| 3 | Search functionality | Filters by name/email | |
| 4 | Export waitlist | CSV downloads | |

### 7.12 Settings Tab

**Test ID:** ADMIN-012
**Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Click "Settings" tab | Settings form loads | |
| 2 | Update seat limits | New values accepted | |
| 3 | Update tier discounts | Discount percentages saved | |
| 4 | Save settings | Success confirmation | |
| 5 | Refresh page | Settings persisted | |
| 6 | Verify on frontend | New seat limits reflected | |

---

## 8. Seat Inventory Testing

### 8.1 Seat Availability Display

**Test ID:** SEAT-001
**Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | View registration page | All tiers show available seats | |
| 2 | Complete a registration | Available seats decrease by 1 | |
| 3 | Refresh page | Updated count shown | |
| 4 | Start registration (pending) | Held seats increase | |
| 5 | Complete payment | Held converts to sold | |

### 8.2 Sold Out Scenario

**Test ID:** SEAT-002
**Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Set tier total_seats to small number (5) | Configuration updated | |
| 2 | Create registrations until full | Seats decrease | |
| 3 | When sold + held = total | "Sold Out" displayed | |
| 4 | Try to register for sold out tier | Error message shown | |
| 5 | User redirected to waitlist | Can join waitlist | |

### 8.3 Concurrent Registration Race Condition

**Test ID:** SEAT-003
**Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Only 1 seat available | Verified in database | |
| 2 | Two users start registration simultaneously | Both get forms | |
| 3 | First user completes payment | Success, seat taken | |
| 4 | Second user tries to complete | Seat unavailable error | |
| 5 | Second user offered waitlist | Can join waitlist | |

---

## 9. Edge Cases and Negative Testing

### 9.1 Form Input Validation

**Test ID:** EDGE-001
**Priority:** High

| Test Case | Input | Expected Result | Status |
|-----------|-------|-----------------|--------|
| XSS in name | `<script>alert('xss')</script>` | Sanitized/escaped | |
| SQL injection in email | `' OR '1'='1` | Rejected as invalid email | |
| Very long name | 500+ characters | Truncated or rejected | |
| Unicode characters | `टेस्ट यूज़र` | Accepted and displayed correctly | |
| Phone with country code | `+919876543210` | Handled correctly | |
| Email with subdomain | `user@sub.domain.com` | Accepted | |

### 9.2 Browser Back Button

**Test ID:** EDGE-002
**Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Complete registration | Success page shown | |
| 2 | Click browser back | Doesn't create duplicate | |
| 3 | During payment modal | Modal closes gracefully | |
| 4 | After payment success | Can't re-submit | |

### 9.3 Session Timeout

**Test ID:** EDGE-003
**Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Fill registration form | Form filled | |
| 2 | Wait 30+ minutes | Session may expire | |
| 3 | Submit form | Handles gracefully | |
| 4 | Admin session timeout | Redirected to login | |

### 9.4 Invalid Booking ID Lookup

**Test ID:** EDGE-004
**Priority:** Low

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Search for non-existent booking ID | "Not found" message | |
| 2 | Use malformed booking ID | Validation error | |
| 3 | Use booking ID from different event | Not found | |

---

## 10. Performance Testing

### 10.1 Page Load Times

| Page | Target | Actual | Status |
|------|--------|--------|--------|
| Registration page | < 3 seconds | | |
| Admin dashboard | < 3 seconds | | |
| Registration list (100+ records) | < 5 seconds | | |
| Export CSV (500+ records) | < 10 seconds | | |

### 10.2 API Response Times

| Endpoint | Target | Actual | Status |
|----------|--------|--------|--------|
| POST /api/register | < 2 seconds | | |
| GET /api/admin/registrations | < 1 second | | |
| GET /api/admin/stats | < 1 second | | |
| POST /api/payment/verify | < 3 seconds | | |

### 10.3 Concurrent Users

| Scenario | Target | Result | Status |
|----------|--------|--------|--------|
| 10 simultaneous registrations | All succeed | | |
| 50 admin dashboard views | All load | | |
| 100 API requests/minute | Rate limiting works | | |

---

## 11. Security Testing Checklist

### 11.1 Authentication & Authorization

- [ ] Admin routes require valid API key
- [ ] Invalid API key returns 401
- [ ] Rate limiting active on all endpoints
- [ ] No sensitive data in error messages
- [ ] Session tokens properly invalidated on logout

### 11.2 Data Protection

- [ ] Passwords/keys not logged
- [ ] PII not exposed in URLs
- [ ] HTTPS enforced (production)
- [ ] Razorpay credentials secured
- [ ] Database credentials not in client code

### 11.3 Input Validation

- [ ] All user inputs sanitized
- [ ] SQL injection prevented
- [ ] XSS attacks prevented
- [ ] File upload restrictions (if any)
- [ ] Request size limits enforced

### 11.4 Payment Security

- [ ] Razorpay signature verified
- [ ] Payment amounts validated server-side
- [ ] No price manipulation possible
- [ ] Webhook endpoint secured
- [ ] Idempotent payment processing

---

## 12. Test Reporting Template

### Test Execution Summary

| Category | Total Tests | Passed | Failed | Blocked | Not Run |
|----------|-------------|--------|--------|---------|---------|
| Registration Flow | | | | | |
| Payment Flow | | | | | |
| Failure Scenarios | | | | | |
| Email Notifications | | | | | |
| Admin Dashboard | | | | | |
| Seat Inventory | | | | | |
| Edge Cases | | | | | |
| **TOTAL** | | | | | |

### Defect Summary

| ID | Title | Severity | Status | Assigned To |
|----|-------|----------|--------|-------------|
| | | | | |

### Severity Definitions

- **Critical**: System unusable, payment failures, data loss
- **High**: Major feature not working, security issue
- **Medium**: Feature partially working, workaround exists
- **Low**: Minor UI issue, cosmetic defect

### Test Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Lead | | | |
| Dev Lead | | | |
| Product Owner | | | |

---

## Quick Reference: Common Test Scenarios

### Happy Path (Critical)
1. User visits site -> Selects tier -> Fills form -> Pays successfully -> Gets confirmation

### Payment Abandonment
1. User fills form -> Opens Razorpay -> Cancels -> Tracked as abandonment

### Admin Recovery
1. Admin sees abandonment -> Sends recovery email -> User completes registration

### Expired Registration Cleanup
1. Pending registration > 1 hour old -> Admin runs cleanup -> Seat released

---

## Appendix: Test Data Reference

### Pre-loaded Test Registrations (from 999_test_data.sql)

| Booking ID | Name | Status | Tier | Purpose |
|------------|------|--------|------|---------|
| BF-2026-T00001 | Rajesh Kumar | Confirmed | VIP | Successful registration |
| BF-2026-T00002 | Priya Sharma | Confirmed | VIP | Successful registration |
| BF-2026-T00003 | Amit Patel | Confirmed | Standard | Successful registration |
| BF-2026-T00008 | Kiran Desai | Pending (active) | VIP | Fresh pending |
| BF-2026-T00011 | Sanjay Verma | Pending (expired) | VIP | For cleanup testing |
| BF-2026-T00013 | Nitin Agarwal | Failed | VIP | Payment failure |

---

**End of Testing Guide**
