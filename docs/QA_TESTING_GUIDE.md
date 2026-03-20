# Comprehensive End-to-End Testing Guide
## AI Summit for MSME Business Owners 2026 - Registration & SaaS Platform

**Document Version:** 2.0
**Last Updated:** March 2026
**Author:** QA Team

---

## Table of Contents

**Part A — Functional Testing**
1. [Test Environment Setup](#1-test-environment-setup)
2. [Test Data Preparation](#2-test-data-preparation)
3. [User Registration Flow Testing](#3-user-registration-flow-testing)
4. [Payment Flow Testing (One-Time)](#4-payment-flow-testing)
5. [Payment Failure Scenarios](#5-payment-failure-scenarios)
6. [Email Notification Testing](#6-email-notification-testing)
7. [Admin Dashboard Testing (Legacy)](#7-admin-dashboard-testing)
8. [Seat Inventory Testing](#8-seat-inventory-testing)
9. [Multi-Tenant Auth & Onboarding Testing](#9-multi-tenant-auth--onboarding-testing)
10. [Tenant Dashboard Testing](#10-tenant-dashboard-testing)
11. [Subscription Management Testing](#11-subscription-management-testing)
12. [API Key Management Testing](#12-api-key-management-testing)
13. [Super Admin Panel Testing](#13-super-admin-panel-testing)
14. [Edge Cases and Negative Testing](#14-edge-cases-and-negative-testing)

**Part B — Technical Testing**
15. [Database & RLS Technical Testing](#15-database--rls-technical-testing)
16. [API Contract Testing](#16-api-contract-testing)
17. [Error Handling & Resilience Testing](#17-error-handling--resilience-testing)
18. [Audit Log & Observability Testing](#18-audit-log--observability-testing)

**Part C — Security Testing**
19. [Authentication & Authorization Security](#19-authentication--authorization-security)
20. [Tenant Isolation Security](#20-tenant-isolation-security)
21. [Input Validation & Injection Prevention](#21-input-validation--injection-prevention)
22. [Payment Security](#22-payment-security)
23. [API & Rate Limiting Security](#23-api--rate-limiting-security)
24. [Data Exposure & Privacy](#24-data-exposure--privacy)

**Part D — Performance Testing**
25. [Page Load & UI Performance](#25-page-load--ui-performance)
26. [API Response Time Benchmarks](#26-api-response-time-benchmarks)
27. [Concurrent User & Load Testing](#27-concurrent-user--load-testing)
28. [Database Performance](#28-database-performance)

**Part E — Reporting**
29. [Test Reporting Template](#29-test-reporting-template)

---

## 1. Test Environment Setup

### 1.1 Prerequisites

- [ ] Backend server running (`npm run dev` in backend folder)
- [ ] Frontend served (local server or Firebase hosting)
- [ ] Supabase database connected (check `.env` configuration)
- [ ] Razorpay test mode credentials configured
- [ ] MSG91 email service configured
- [ ] Admin API key available for authentication
- [ ] At least two test tenant accounts created (for isolation tests)
- [ ] One `super_admin` role user created in Supabase Auth

### 1.2 Environment Configuration Checklist

| Configuration | Test Value | Location |
|--------------|------------|----------|
| `RAZORPAY_KEY_ID` | Test key (rzp_test_*) | backend/.env |
| `RAZORPAY_KEY_SECRET` | Test secret | backend/.env |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook secret | backend/.env |
| `SUPABASE_URL` | Your project URL | backend/.env |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key | backend/.env |
| `SUPABASE_ANON_KEY` | Anon/public key | backend/.env |
| `MSG91_AUTH_KEY` | API key | backend/.env |
| `ADMIN_API_KEY` | Admin authentication key | backend/.env |
| `NODE_ENV` | `test` or `development` | backend/.env |
| `OPENAI_API_KEY` | OpenAI key (for AI features) | backend/.env |

> **CRITICAL:** Verify `ADMIN_API_KEY` is NOT set to the default `change-this-in-production`. Fail the test run if it is.

### 1.3 Browser Requirements

- Chrome (latest) — Primary testing
- Firefox (latest) — Cross-browser verification
- Safari (latest) — Mac users
- Mobile browsers (Chrome/Safari on mobile)

### 1.4 Test Database Reset

Before starting a fresh test cycle:

```sql
-- Clean test registrations
DELETE FROM payment_abandonments WHERE email LIKE '%@test.example.com';
DELETE FROM registrations WHERE email LIKE '%@test.example.com';
DELETE FROM waitlist WHERE email LIKE '%@test.example.com';

-- Reset seat inventory
UPDATE seat_inventory
SET sold_seats = 0, held_seats = 0
WHERE tier_name IN ('vip', 'standard', 'basic');

-- Clean test tenants (preserve brtneura default)
DELETE FROM tenants
WHERE email LIKE '%@test.example.com'
  AND id != '00000000-0000-0000-0000-000000000001';

-- Clean audit log
DELETE FROM audit_log
WHERE actor_email LIKE '%@test.example.com';
```

Or reload from seed:
```sql
-- File: backend/supabase/migrations/999_test_data.sql
```

---

## 2. Test Data Preparation

### 2.1 Test User Credentials (Registration Form)

| Test User | Email | Phone | Purpose |
|-----------|-------|-------|---------|
| New User 1 | qa.tester1@test.example.com | 9876500001 | Fresh registration |
| New User 2 | qa.tester2@test.example.com | 9876500002 | Payment failure |
| New User 3 | qa.tester3@test.example.com | 9876500003 | Duplicate check |
| Existing User | rajesh.kumar@test.example.com | 9876543001 | Already registered |

### 2.2 Test Tenant Accounts (SaaS)

| Role | Email | Password | Slug | Purpose |
|------|-------|----------|------|---------|
| Tenant Admin A | tenant.a@test.example.com | TestPass1! | test-tenant-a | Primary tenant tests |
| Tenant Admin B | tenant.b@test.example.com | TestPass1! | test-tenant-b | Cross-tenant isolation tests |
| Super Admin | superadmin@test.example.com | SuperPass1! | — | Super admin tests |

### 2.3 Razorpay Test Cards

| Card Number | Behavior | Use Case |
|-------------|----------|----------|
| 4111 1111 1111 1111 | Success | Successful payment |
| 4000 0000 0000 0002 | Declined | Card declined scenario |
| 5105 1051 0510 5100 | Success (Mastercard) | Alternative card |

**Test Card Details:**
- Expiry: Any future date (e.g., 12/26)
- CVV: Any 3 digits (e.g., 123)
- Name: Any name

### 2.4 Test UPI IDs (Razorpay Test Mode)

| UPI ID | Behavior |
|--------|----------|
| success@razorpay | Successful payment |
| failure@razorpay | Payment failure |

### 2.5 Subscription Plan Reference

| Plan | Monthly (INR) | Yearly (INR) | Registration Limit/Month |
|------|---------------|--------------|--------------------------|
| trial | Free | Free | 50 |
| launchpad | 1,999 | 1,799 | 500 |
| scaleup_pro | 4,999 | 4,499 | 10,000 |

---

## 3. User Registration Flow Testing

### 3.1 Landing Page Load

**Test ID:** REG-001 | **Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Open registration URL | Page loads within 3 seconds | |
| 2 | Verify header/branding | "AI Summit for MSME Business Owners 2026" displayed | |
| 3 | Check tier cards | All 3 tiers displayed (Executive/VIP, Business/Standard, Growth/Basic) | |
| 4 | Verify pricing | Executive: Rs.2,499, Business: Rs.1,499, Growth: Rs.999 | |
| 5 | Check seat availability | Available seats shown for each tier | |
| 6 | Verify "Register Now" buttons | All buttons visible and clickable | |

### 3.2 Registration Form — Field Validation

**Test ID:** REG-002 | **Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Click "Register Now" on any tier | Registration form modal opens | |
| 2 | Submit empty form | Validation errors for all required fields | |
| 3 | Enter invalid email (test@) | Email validation error displayed | |
| 4 | Enter invalid phone (12345) | Phone validation error (must be 10 digits) | |
| 5 | Enter valid name only | Other field errors shown | |
| 6 | Select industry from dropdown | Industry field accepts selection | |
| 7 | Select revenue range | Revenue range field accepts selection | |

### 3.3 Registration Form — Successful Submission

**Test ID:** REG-003 | **Priority:** Critical

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

**Test ID:** REG-004 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Use email of confirmed registration | "Already registered" error displayed | |
| 2 | Use phone of confirmed registration | "Already registered" error displayed | |
| 3 | Verify error message is user-friendly | Clear message with booking ID reference | |

### 3.5 Tenant-Scoped Registration Page

**Test ID:** REG-005 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Open `/t/brtneura` (default tenant) | BRTNeura branding shown | |
| 2 | Open `/t/test-tenant-a` (custom tenant) | Tenant A branding shown | |
| 3 | Open `/t/nonexistent-slug` | Error or fallback page shown | |
| 4 | Verify `GET /api/t/:slug/public/config` | Returns tenant name, colors, logo | |
| 5 | Verify branding colors applied to CSS | Custom primary/secondary colors rendered | |

---

## 4. Payment Flow Testing

### 4.1 Successful Payment — Card

**Test ID:** PAY-001 | **Priority:** Critical

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

### 4.2 Successful Payment — UPI

**Test ID:** PAY-002 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | In Razorpay modal, select "UPI" | UPI options shown | |
| 2 | Enter UPI ID: success@razorpay | UPI ID accepted | |
| 3 | Click "Pay" | Payment simulation | |
| 4 | Wait for success | Success page displayed | |
| 5 | Verify booking ID generated | Valid booking ID shown | |

### 4.3 Successful Payment — Net Banking

**Test ID:** PAY-003 | **Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Select "Netbanking" in Razorpay | Bank list shown | |
| 2 | Select any test bank | Bank selected | |
| 3 | Complete bank simulation | Payment processed | |
| 4 | Verify success page | Booking confirmation shown | |

### 4.4 Payment Verification

**Test ID:** PAY-004 | **Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | After successful payment | DB: registration status = 'confirmed' | |
| 2 | Check payment_status | Value = 'confirmed' | |
| 3 | Check razorpay_payment_id | Valid payment ID stored | |
| 4 | Check seat_inventory | sold_seats incremented by 1 | |
| 5 | Check held_seats | held_seats decremented by 1 | |
| 6 | Verify tenant_id on registration | Matches the tenant slug used | |

---

## 5. Payment Failure Scenarios

### 5.1 User Cancels Payment Modal

**Test ID:** FAIL-001 | **Priority:** Critical

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

**Test ID:** FAIL-002 | **Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Use test card: 4000 0000 0000 0002 | Card entered | |
| 2 | Complete payment flow | Payment declined error | |
| 3 | Verify error message | User-friendly decline message | |
| 4 | Check abandonment record | abandonment_type = 'failed' | |
| 5 | Check reason captured | "Card declined" or similar | |
| 6 | User can retry | Modal allows retry with different card | |

### 5.3 Payment Timeout

**Test ID:** FAIL-003 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Start payment process | Razorpay modal open | |
| 2 | Wait without completing (or close browser) | Session abandoned | |
| 3 | After 1 hour, check registration | Should be marked as expired | |
| 4 | Run "Cleanup Expired" in admin | Registration released | |
| 5 | Verify held_seats | Decremented after cleanup | |
| 6 | Verify abandonment record | abandonment_type = 'timeout' | |

### 5.4 Network Error During Payment

**Test ID:** FAIL-004 | **Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Start payment process | Razorpay modal open | |
| 2 | Disconnect network mid-payment | Error displayed | |
| 3 | Reconnect network | Able to retry | |
| 4 | Verify no duplicate charges | Only one transaction attempted | |

### 5.5 Razorpay Webhook Failure

**Test ID:** FAIL-005 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Complete payment successfully | Payment ID received | |
| 2 | Simulate webhook failure (backend down) | Frontend shows success | |
| 3 | Webhook retry (automatic) | Eventually processes | |
| 4 | Manual verification | Admin can verify via Razorpay dashboard | |

### 5.6 Double Payment Attempt

**Test ID:** FAIL-006 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | User clicks pay twice quickly | Only one payment processed | |
| 2 | Check for duplicate orders | No duplicate Razorpay orders | |
| 3 | Verify single registration | Only one registration record | |

---

## 6. Email Notification Testing

### 6.1 Registration Confirmation Email

**Test ID:** EMAIL-001 | **Priority:** Critical

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

**Test ID:** EMAIL-002 | **Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Find pending registration in admin | Registration displayed | |
| 2 | Click "Send Reminder" | Modal confirmation | |
| 3 | Confirm send | Email sent message | |
| 4 | Check user inbox | Reminder email received | |
| 5 | Verify payment link | Link allows completing payment | |

### 6.3 Recovery Email (Abandonment Follow-up)

**Test ID:** EMAIL-003 | **Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Go to Abandonments tab | Abandonment list shown | |
| 2 | Click "Send Recovery Email" | Modal confirmation | |
| 3 | Confirm send | Email sent confirmation | |
| 4 | Check user inbox | Recovery email received | |
| 5 | Click recovery link | Pre-filled registration form opens | |
| 6 | Complete payment | Registration confirmed | |

### 6.4 Custom Email Templates (Tenant)

**Test ID:** EMAIL-004 | **Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Login to Tenant A dashboard | Dashboard visible | |
| 2 | Navigate to Email Templates section | Template editor shown | |
| 3 | Edit confirmation template | Preview updates correctly | |
| 4 | Save custom template | `PUT /api/t/:slug/email-templates/:type` succeeds | |
| 5 | Trigger a registration for Tenant A | Email uses custom template | |
| 6 | Check Tenant B email | Tenant B still uses its own template | |

---

## 7. Admin Dashboard Testing

### 7.1 Admin Authentication

**Test ID:** ADMIN-001 | **Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Open admin URL without login | Login form displayed | |
| 2 | Enter incorrect API key | "Invalid credentials" error | |
| 3 | Enter correct API key | Dashboard loads | |
| 4 | Refresh page | Session maintained | |
| 5 | Click Logout | Returns to login screen | |
| 6 | Try accessing protected route | Redirected to login | |

### 7.2 Dashboard Statistics

**Test ID:** ADMIN-002 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Login to admin dashboard | Stats cards visible | |
| 2 | Verify Total Registrations | Matches database count | |
| 3 | Verify Total Revenue | Sum of confirmed payments (in INR) | |
| 4 | Verify Pending Payments | Count of pending status | |
| 5 | Verify Available Seats | Calculated correctly per tier | |
| 6 | Click Refresh button | Stats update without page reload | |

### 7.3 Registrations Tab

**Test ID:** ADMIN-003 | **Priority:** Critical

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

**Test ID:** ADMIN-004 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Click "Resend Confirmation" | Modal confirmation shown | |
| 2 | Confirm resend | Success message, email sent | |
| 3 | Click "Send Payment Reminder" (pending) | Modal confirmation shown | |
| 4 | Confirm reminder | Success message, email sent | |
| 5 | Click "Delete Registration" | Confirmation modal with warning | |
| 6 | Confirm delete | Registration removed, seats released | |

### 7.5 Manual Registration

**Test ID:** ADMIN-005 | **Priority:** Medium

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

**Test ID:** ADMIN-006 | **Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Apply filters (optional) | Filtered list shown | |
| 2 | Click "Export CSV" | Download starts | |
| 3 | Open CSV file | Valid CSV format | |
| 4 | Verify columns | All relevant data included | |
| 5 | Verify data matches filters | Only filtered records exported | |

### 7.7 Seat Inventory Management

**Test ID:** ADMIN-007 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Click "Seats" tab | Seat inventory displayed | |
| 2 | Verify tier data | Total, Sold, Held, Available for each tier | |
| 3 | Verify calculations | Available = Total - Sold - Held | |
| 4 | Click "Resync Seats" | Confirmation modal | |
| 5 | Confirm resync | Seats recalculated from registrations | |
| 6 | Verify counts match | Database counts accurate | |

### 7.8 Abandonments Tab

**Test ID:** ADMIN-008 | **Priority:** High

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

**Test ID:** ADMIN-009 | **Priority:** Medium

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

**Test ID:** ADMIN-010 | **Priority:** High

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

**Test ID:** ADMIN-011 | **Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Click "Waitlist" tab | Waitlist entries load | |
| 2 | Verify columns | Name, Email, Phone, Livestream interest | |
| 3 | Search functionality | Filters by name/email | |
| 4 | Export waitlist | CSV downloads | |

### 7.12 Settings Tab

**Test ID:** ADMIN-012 | **Priority:** Medium

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

**Test ID:** SEAT-001 | **Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | View registration page | All tiers show available seats | |
| 2 | Complete a registration | Available seats decrease by 1 | |
| 3 | Refresh page | Updated count shown | |
| 4 | Start registration (pending) | Held seats increase | |
| 5 | Complete payment | Held converts to sold | |

### 8.2 Sold Out Scenario

**Test ID:** SEAT-002 | **Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Set tier total_seats to small number (5) | Configuration updated | |
| 2 | Create registrations until full | Seats decrease | |
| 3 | When sold + held = total | "Sold Out" displayed | |
| 4 | Try to register for sold out tier | Error message shown | |
| 5 | User redirected to waitlist | Can join waitlist | |

### 8.3 Concurrent Registration Race Condition

**Test ID:** SEAT-003 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Only 1 seat available | Verified in database | |
| 2 | Two users start registration simultaneously | Both get forms | |
| 3 | First user completes payment | Success, seat taken | |
| 4 | Second user tries to complete | Seat unavailable error | |
| 5 | Second user offered waitlist | Can join waitlist | |

---

## 9. Multi-Tenant Auth & Onboarding Testing

### 9.1 Tenant Signup

**Test ID:** AUTH-001 | **Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Open `/onboarding` | Signup wizard loads | |
| 2 | Enter name, email, password (< 8 chars) | Password error shown | |
| 3 | Enter valid credentials + company name | No errors | |
| 4 | Submit `POST /api/auth/signup` | 201 response with `access_token`, `refresh_token`, tenant info | |
| 5 | Verify tenant created in DB | New row in `tenants` table with correct slug | |
| 6 | Verify Supabase Auth user created | User in `auth.users` with `user_metadata.tenant_id` set | |
| 7 | Verify referral code generated | Non-null `referral_code` in tenant row | |

### 9.2 Tenant Login

**Test ID:** AUTH-002 | **Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Submit `POST /api/auth/login` with valid creds | 200 with tokens + tenant info | |
| 2 | Submit with wrong password | 401 invalid credentials | |
| 3 | Submit with non-existent email | 401 (no user enumeration) | |
| 4 | Login for inactive tenant | 403 tenant account is not active | |
| 5 | Verify access_token is valid JWT | Decode header = `RS256` or Supabase alg | |
| 6 | Verify `user_metadata.tenant_id` in JWT | Matches tenant ID in DB | |

### 9.3 Token Refresh

**Test ID:** AUTH-003 | **Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Submit `POST /api/auth/refresh` with valid refresh_token | New access_token + refresh_token returned | |
| 2 | Submit with expired/invalid refresh_token | 401 response | |
| 3 | Use old access_token after refresh | Supabase may still accept (short window) | |
| 4 | Frontend auto-refresh (60 s before expiry) | New tokens stored in localStorage | |

### 9.4 Logout

**Test ID:** AUTH-004 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Submit `POST /api/auth/logout` | 200 response | |
| 2 | Use old access_token after logout | 401 unauthorized | |
| 3 | Verify localStorage cleared | `dashboard_access_token` etc. removed | |

### 9.5 Signup — Duplicate Company Slug

**Test ID:** AUTH-005 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Signup with company name "Test Company" | Slug `test-company` created | |
| 2 | Signup again with same company name | Unique slug generated (e.g. `test-company-2` or error) | |
| 3 | No duplicate slug in tenants table | Unique constraint satisfied | |

### 9.6 Signup via Referral Code

**Test ID:** AUTH-006 | **Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Get referral code from Tenant A | Code exists in DB | |
| 2 | Signup with `referral_code` param | Signup succeeds | |
| 3 | Verify `referred_by_tenant_id` on new tenant | Matches Tenant A's ID | |
| 4 | Check Tenant A's referral stats | Count incremented | |
| 5 | Use invalid referral code | Signup proceeds but code ignored | |

---

## 10. Tenant Dashboard Testing

### 10.1 Dashboard Auth Guard

**Test ID:** DASH-001 | **Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Open `/dashboard` without token | Redirected to login | |
| 2 | Use expired token | 401, redirected to login | |
| 3 | Login as Tenant A, open Tenant B's dashboard slug | 403 forbidden | |
| 4 | Valid token → `GET /api/t/:slug/overview` | 200 with tenant-scoped data | |

### 10.2 Dashboard Overview

**Test ID:** DASH-002 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Login as Tenant A | Dashboard loads | |
| 2 | Verify stats cards | Total registrations, revenue, seats | |
| 3 | Verify all stats are Tenant A only | No Tenant B data visible | |
| 4 | Verify subscription plan shown | Correct plan name displayed | |

### 10.3 Tenant Settings

**Test ID:** DASH-003 | **Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Navigate to settings | Settings form loads | |
| 2 | Update logo URL | Saved successfully | |
| 3 | Update primary color | Color persists on refresh | |
| 4 | Verify frontend registration page | Branding reflects new settings | |
| 5 | Access Tenant B's settings as Tenant A | 403 forbidden | |

### 10.4 Activity Log

**Test ID:** DASH-004 | **Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Perform several dashboard actions | Actions recorded | |
| 2 | Navigate to Activity Log | Actions listed | |
| 3 | Verify actor_email matches logged-in user | Correct | |
| 4 | Verify resource_type and action fields | Descriptive values | |
| 5 | Verify Tenant A log doesn't show Tenant B entries | Tenant isolation | |

### 10.5 Churn / Cancellation Flow

**Test ID:** DASH-005 | **Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Initiate cancellation via `POST /api/t/:slug/subscription/initiate-cancellation` | Churn reason captured | |
| 2 | Verify `cancellation_requested_at` set in tenants table | Timestamp stored | |
| 3 | Check churn offers returned | `GET /api/t/:slug/churn-offers` lists offers | |
| 4 | Accept a churn offer | `POST /api/t/:slug/churn-offers/:id/accept` succeeds | |
| 5 | Verify offer status = 'accepted' | DB updated | |

### 10.6 Custom Domain

**Test ID:** DASH-006 | **Priority:** Low

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Set custom domain via `POST /api/t/:slug/domain/set` | Domain saved | |
| 2 | Verify domain verification token generated | Token present | |
| 3 | Verify domain via `POST /api/t/:slug/domain/verify` | domain_verified flag set | |
| 4 | Check domain status endpoint | `GET /api/t/:slug/domain/status` returns correct state | |

---

## 11. Subscription Management Testing

### 11.1 View Current Subscription

**Test ID:** SUB-001 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Login as tenant in trial | `GET /api/t/:slug/subscription` returns trial plan | |
| 2 | Verify `trial_ends_at` is 14 days from signup | Date correct | |
| 3 | Verify usage check on registration | `checkUsage()` returns correct used/limit | |

### 11.2 Upgrade Subscription

**Test ID:** SUB-002 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | POST `/api/t/:slug/subscription/upgrade` with plan=launchpad | Razorpay subscription created | |
| 2 | Verify subscription record in DB | status = 'created', razorpay_subscription_id set | |
| 3 | Verify tenant subscription_plan updated | plan = 'launchpad' | |
| 4 | Simulate Razorpay `subscription.activated` webhook | status → 'active' | |
| 5 | Verify tenant subscription_status = 'active' | DB updated | |

### 11.3 Usage Limit Enforcement

**Test ID:** SUB-003 | **Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Set tenant to trial plan (limit = 50) | Plan confirmed | |
| 2 | Create 50 confirmed registrations for this tenant | Registrations created | |
| 3 | Attempt 51st registration | `checkUsage()` returns allowed = false | |
| 4 | Verify HTTP 403 or suitable error returned | Registration blocked | |
| 5 | Upgrade plan to launchpad | Limit = 500 | |
| 6 | Attempt registration again | Now allowed | |

### 11.4 Subscription Webhook Processing

**Test ID:** SUB-004 | **Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Simulate `subscription.activated` event | Status → active | |
| 2 | Simulate `subscription.charged` event | Status remains active | |
| 3 | Simulate `subscription.pending` event | Status → past_due | |
| 4 | Simulate `subscription.halted` event | Status → halted | |
| 5 | Simulate `subscription.cancelled` event | Status → cancelled | |
| 6 | Verify webhook signature required | Invalid signature → 400 | |
| 7 | Replay same webhook event | Should process idempotently (no duplicates) | |

### 11.5 Subscription Cancellation

**Test ID:** SUB-005 | **Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | POST `/api/t/:slug/subscription/cancel` | Razorpay cancellation called | |
| 2 | Verify local subscription status = 'cancelled' | DB updated | |
| 3 | Verify tenant subscription_status = 'cancelled' | Tenant row updated | |

---

## 12. API Key Management Testing

### 12.1 Create API Key

**Test ID:** APIKEY-001 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | POST `/api/t/:slug/api-keys` with name + scopes | 201 with raw_key in response | |
| 2 | Note: raw_key starts with `brtn_` | Format verified | |
| 3 | Verify DB stores only `key_hash` (SHA-256) and `key_prefix` | Raw key NOT stored | |
| 4 | Retrieve key list | `GET /api/t/:slug/api-keys` shows prefix only, not hash | |
| 5 | Verify raw_key NOT returned in list | Only `key_prefix`, name, scopes, created_at | |

### 12.2 Validate API Key

**Test ID:** APIKEY-002 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Use valid raw_key in request | Authenticated successfully | |
| 2 | Use invalid/modified key | 401 unauthorized | |
| 3 | Use revoked key | 401 unauthorized | |
| 4 | Use key after expiry date | 401 key expired | |
| 5 | Verify `last_used_at` updated | Timestamp changed in DB | |

### 12.3 Revoke API Key

**Test ID:** APIKEY-003 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | DELETE `/api/t/:slug/api-keys/:keyId` | Key marked is_active = false | |
| 2 | Use revoked key to authenticate | 401 unauthorized | |
| 3 | Key still appears in list (is_active = false) | UI shows revoked state | |

### 12.4 Cross-Tenant API Key Isolation

**Test ID:** APIKEY-004 | **Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Create API key for Tenant A | Key created | |
| 2 | Try to use Tenant A's key to access Tenant B | 403 or 401 — access denied | |
| 3 | Verify `validateKey()` returns Tenant A's tenant_id | Not Tenant B's ID | |

---

## 13. Super Admin Panel Testing

### 13.1 Super Admin Authentication

**Test ID:** SA-001 | **Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Open `/super-admin` | Login form shown | |
| 2 | Login with regular tenant account | 403 requires super_admin role | |
| 3 | Login with super_admin role account | Dashboard loads | |
| 4 | Verify `superAdminAuth` middleware blocks regular users | 403 returned | |

### 13.2 Tenant Management

**Test ID:** SA-002 | **Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | GET `/api/super-admin/tenants` | All tenants listed with pagination | |
| 2 | Filter by active/plan/search | Filtered results correct | |
| 3 | GET `/api/super-admin/tenants/:id` | Full tenant detail returned | |
| 4 | PATCH `/api/super-admin/tenants/:id` | Tenant fields updated | |
| 5 | POST `/api/super-admin/tenants/:id/deactivate` | is_active = false | |
| 6 | POST `/api/super-admin/tenants/:id/activate` | is_active = true | |
| 7 | Verify deactivated tenant login blocked | 403 on login | |

### 13.3 Subscription Overview

**Test ID:** SA-003 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | GET `/api/super-admin/subscriptions` | All subscriptions listed | |
| 2 | Filter by status | Results filtered | |
| 3 | Verify MRR/ARR calculations | Revenue sums correct | |

### 13.4 Rebrand Request Approval

**Test ID:** SA-004 | **Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Tenant submits rebrand request | Request in pending state | |
| 2 | GET `/api/super-admin/rebrand-requests/pending` | Request appears | |
| 3 | POST approve endpoint | is_rebranded = true on tenant | |
| 4 | POST reject endpoint | Request marked rejected | |

### 13.5 Super Admin Analytics

**Test ID:** SA-005 | **Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | GET `/api/super-admin/analytics` | Platform-wide metrics returned | |
| 2 | GET `/api/super-admin/stats` | Tenant count, revenue, subscription breakdown | |
| 3 | GET `/api/super-admin/audit-log` | Cross-tenant audit entries | |

### 13.6 Referral Payout

**Test ID:** SA-006 | **Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | GET `/api/super-admin/referrals` | Referral stats per tenant | |
| 2 | GET `/api/super-admin/referrals/payouts` | Payout history | |
| 3 | POST `/api/super-admin/referrals/payout` | Payout processed | |

---

## 14. Edge Cases and Negative Testing

### 14.1 Form Input Validation

**Test ID:** EDGE-001 | **Priority:** High

| Test Case | Input | Expected Result | Status |
|-----------|-------|-----------------|--------|
| XSS in name | `<script>alert('xss')</script>` | Sanitized/escaped | |
| SQL injection in email | `' OR '1'='1` | Rejected as invalid email | |
| Very long name | 500+ characters | Truncated or rejected | |
| Unicode characters | `टेस्ट यूज़र` | Accepted and displayed correctly | |
| Phone with country code | `+919876543210` | Handled correctly | |
| Email with subdomain | `user@sub.domain.com` | Accepted | |

### 14.2 Browser Back Button

**Test ID:** EDGE-002 | **Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Complete registration | Success page shown | |
| 2 | Click browser back | Doesn't create duplicate | |
| 3 | During payment modal | Modal closes gracefully | |
| 4 | After payment success | Can't re-submit | |

### 14.3 Session Timeout

**Test ID:** EDGE-003 | **Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Fill registration form | Form filled | |
| 2 | Wait 30+ minutes | Session may expire | |
| 3 | Submit form | Handles gracefully | |
| 4 | Dashboard session timeout | Redirected to login | |

### 14.4 Invalid Booking ID Lookup

**Test ID:** EDGE-004 | **Priority:** Low

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Search for non-existent booking ID | "Not found" message | |
| 2 | Use malformed booking ID | Validation error | |
| 3 | Use booking ID from different event | Not found | |

---

## 15. Database & RLS Technical Testing

### 15.1 RLS Tenant Isolation Enforcement

**Test ID:** TECH-001 | **Priority:** Critical

These tests use direct Supabase client calls (not the API) to verify database-level enforcement.

| Test Case | Action | Expected Result | Status |
|-----------|--------|-----------------|--------|
| Direct query with Tenant A's JWT | SELECT * FROM registrations | Only Tenant A rows returned | |
| Direct query with Tenant B's JWT | SELECT * FROM registrations | Only Tenant B rows returned | |
| INSERT with mismatched tenant_id | INSERT with wrong tenant_id | Row rejected by RLS policy | |
| UPDATE cross-tenant row | UPDATE with valid JWT but wrong tenant | Row not updated (0 rows affected) | |
| Anon user query | SELECT * FROM registrations (no JWT) | Empty result or public rows only | |
| Service role query | SELECT * FROM registrations (service key) | All rows returned (bypasses RLS) | |

### 15.2 Tenant Backfill Verification

**Test ID:** TECH-002 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Query all registrations | Every row has tenant_id set | |
| 2 | Query with tenant_id = default brtneura ID | All legacy rows matched | |
| 3 | Verify seat_inventory, waitlist, site_settings | All have tenant_id populated | |
| 4 | Check payment_abandonments | tenant_id set on all rows | |

### 15.3 Slug Uniqueness Constraint

**Test ID:** TECH-003 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Attempt to insert duplicate slug | UNIQUE constraint violation | |
| 2 | Signup with two identical company names | Second slug gets differentiated | |
| 3 | Verify referral_code uniqueness | No two tenants share a referral code | |

### 15.4 Subscription Usage Count

**Test ID:** TECH-004 | **Priority:** Critical

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Call `checkUsage()` for tenant | Counts only current calendar month | |
| 2 | Counts only 'confirmed' status | Pending/failed not counted | |
| 3 | DB error during count | Returns `{ allowed: false }` (not silently allowed) | |
| 4 | Verify tenant_id scoped query | Does not count other tenants' registrations | |

> **Note:** Current code returns `allowed: true` on DB error — this is a known bug. Test should currently FAIL until fixed.

### 15.5 Audit Log Completeness

**Test ID:** TECH-005 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Perform CRUD operations on tenant dashboard | Audit log entries created | |
| 2 | Verify all required fields | actor_id, actor_email, action, ip_address not null | |
| 3 | Verify super admin actions also logged | Super admin audit entries present | |
| 4 | Query audit_log from Tenant A as Tenant B | No cross-tenant entries returned | |

### 15.6 Migration Integrity

**Test ID:** TECH-006 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Verify all 28+ migrations applied | No missing sequence gaps | |
| 2 | Check FK constraints exist | tenant_id FKs valid on all tables | |
| 3 | Verify indexes created | `idx_tenants_slug`, `idx_subscriptions_tenant`, etc. exist | |
| 4 | Run `EXPLAIN ANALYZE` on tenant-scoped queries | Index scans, not seq scans | |

---

## 16. API Contract Testing

### 16.1 Public Endpoints (No Auth)

**Test ID:** API-001 | **Priority:** High

| Endpoint | Expected Status | Expected Body Keys | Status |
|----------|-----------------|--------------------|--------|
| GET `/api/t/:slug/public/config` | 200 | name, slug, logo_url, primary_color | |
| GET `/api/t/:slug/public/seats` | 200 | Tier seat counts | |
| GET `/api/t/:slug/public/guests` | 200 | Active guest list | |
| GET `/api/t/:slug/public/benefits` | 200 | Active MSME benefits | |
| GET `/api/t/nonexistent/public/config` | 404 | error message | |

### 16.2 Auth Endpoints

**Test ID:** API-002 | **Priority:** Critical

| Endpoint | Method | Condition | Expected Status | Status |
|----------|--------|-----------|-----------------|--------|
| `/api/auth/signup` | POST | Valid data | 201 with tokens | |
| `/api/auth/signup` | POST | Duplicate email | 409 conflict | |
| `/api/auth/login` | POST | Valid creds | 200 with tokens | |
| `/api/auth/login` | POST | Wrong password | 401 | |
| `/api/auth/refresh` | POST | Valid token | 200 new tokens | |
| `/api/auth/refresh` | POST | Invalid token | 401 | |
| `/api/auth/profile` | GET | Valid token | 200 user profile | |
| `/api/auth/logout` | POST | Valid token | 200 | |

### 16.3 Authenticated Tenant Endpoints

**Test ID:** API-003 | **Priority:** Critical

| Endpoint | Auth | Expected Status | Status |
|----------|------|-----------------|--------|
| GET `/api/t/:slug/overview` | Valid tenant token | 200 | |
| GET `/api/t/:slug/overview` | No token | 401 | |
| GET `/api/t/:slug/overview` | Wrong tenant token | 403 | |
| PATCH `/api/t/:slug/settings` | Valid token | 200 | |
| GET `/api/t/:slug/subscription` | Valid token | 200 | |

### 16.4 Super Admin Endpoints

**Test ID:** API-004 | **Priority:** Critical

| Endpoint | Auth | Expected Status | Status |
|----------|------|-----------------|--------|
| GET `/api/super-admin/tenants` | Super admin token | 200 | |
| GET `/api/super-admin/tenants` | Regular tenant token | 403 | |
| GET `/api/super-admin/tenants` | No token | 401 | |
| POST `/api/super-admin/tenants/:id/deactivate` | Super admin | 200 | |

### 16.5 Response Format Consistency

**Test ID:** API-005 | **Priority:** Medium

| Check | Expected Format | Status |
|-------|-----------------|--------|
| Success response | `{ success: true, data: {...} }` | |
| Error response | `{ success: false, error: { message, code } }` | |
| 4xx error codes | Machine-readable `code` string present | |
| Stack traces in production | NOT present in response body | |
| Stack traces in development | Present for debugging | |

---

## 17. Error Handling & Resilience Testing

### 17.1 AppError Handling

**Test ID:** ERR-001 | **Priority:** High

| Scenario | Trigger | Expected HTTP Status | Status |
|----------|---------|----------------------|--------|
| Invalid tenant slug | GET `/api/t/bad-slug/overview` | 404 | |
| Missing required field | POST with missing body param | 400 | |
| Unauthorized access | No/invalid JWT | 401 | |
| Cross-tenant access | Wrong tenant JWT | 403 | |
| Payment verification fail | Invalid Razorpay signature | 400 | |
| Database connection failure | Kill DB connection | 500 with generic message | |

### 17.2 Async Error Propagation

**Test ID:** ERR-002 | **Priority:** Medium

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Force an async service to throw | Error caught by `asyncHandler` | |
| 2 | Verify response is valid JSON | Not an HTML error page | |
| 3 | Verify `{ success: false, error: {...} }` format | Consistent | |
| 4 | Verify server does NOT crash | Process continues | |

### 17.3 Graceful Degradation

**Test ID:** ERR-003 | **Priority:** Medium

| Scenario | Expected Behavior | Status |
|----------|-------------------|--------|
| MSG91 email service down | Registration still succeeds; email failure logged | |
| Razorpay API timeout | User sees retry prompt; no corrupt state | |
| OpenAI API unavailable | AI features degrade gracefully with fallback | |
| Supabase connection lost | 503 with retry-after hint | |

---

## 18. Audit Log & Observability Testing

### 18.1 Audit Coverage

**Test ID:** OBS-001 | **Priority:** High

| Action | Audit Entry Expected | Verify Fields | Status |
|--------|---------------------|---------------|--------|
| Login | Yes | actor_email, action=login, ip_address | |
| Create registration (admin) | Yes | resource_type=registration, resource_id | |
| Update settings | Yes | action=update, resource_type=settings | |
| Delete registration | Yes | action=delete, metadata has deleted record | |
| Super admin deactivate tenant | Yes | actor_role=super_admin | |
| API key creation | Yes | resource_type=api_key | |

### 18.2 Audit Log Security

**Test ID:** OBS-002 | **Priority:** High

| Step | Action | Expected Result | Status |
|------|--------|-----------------|--------|
| 1 | Tenant A queries audit log | Only Tenant A's entries | |
| 2 | Super admin queries audit log | All tenants' entries (global view) | |
| 3 | Verify audit log not writable by tenants | No DELETE/UPDATE policy for tenant role | |
| 4 | Verify IP address captured | `ip_address` field populated | |

---

## 19. Authentication & Authorization Security

### 19.1 JWT Security

**Test ID:** SEC-001 | **Priority:** Critical

| Test Case | Action | Expected Result | Status |
|-----------|--------|-----------------|--------|
| Forged JWT (none alg) | Send JWT with `alg: "none"` | 401 rejected | |
| Modified JWT payload | Tamper with tenant_id claim | 401 rejected | |
| JWT from different Supabase project | Use token from different project | 401 rejected | |
| Expired JWT | Send expired access_token | 401 expired | |
| Missing Bearer prefix | Send token without `Bearer ` | 401 rejected | |

### 19.2 Admin Auth Security

**Test ID:** SEC-002 | **Priority:** Critical

- [ ] Legacy admin routes reject all requests without `X-API-Key` header — returns 401
- [ ] Legacy admin routes reject invalid API key — returns 401
- [ ] Rate limiting on admin auth — 5+ rapid failed attempts triggers 429
- [ ] Default `ADMIN_API_KEY` (`change-this-in-production`) must NOT work in production
- [ ] HTTPS enforced in production — HTTP requests redirected

### 19.3 Password Security

**Test ID:** SEC-003 | **Priority:** High

| Test Case | Expected Result | Status |
|-----------|-----------------|--------|
| Password < 8 chars | 400 validation error | |
| Brute force login (10 attempts in 15 min) | 429 rate limited | |
| Password visible in any log/response | Not present | |
| Passwords stored in plain text (DB check) | Not stored — Supabase manages hashing | |

### 19.4 Role Escalation Prevention

**Test ID:** SEC-004 | **Priority:** Critical

| Test Case | Action | Expected Result | Status |
|-----------|--------|-----------------|--------|
| Set role in signup body | `POST /api/auth/signup` with `role: "super_admin"` | Role ignored; assigned `user` | |
| Modify JWT role claim | Tamper with JWT to add super_admin role | Token validation fails | |
| Access super admin endpoint as tenant | 403 — role check enforced | |
| Access another tenant's slug endpoint | 403 — tenant_id mismatch enforced | |

---

## 20. Tenant Isolation Security

### 20.1 Cross-Tenant Data Access

**Test ID:** ISO-001 | **Priority:** Critical

| Test Case | Action | Expected Result | Status |
|-----------|--------|-----------------|--------|
| Tenant A reads Tenant B registrations | API call with Tenant A token + Tenant B slug | 403 forbidden | |
| Tenant A reads Tenant B settings | API call with Tenant A token + Tenant B slug | 403 forbidden | |
| Tenant A modifies Tenant B data | PATCH with Tenant A token + Tenant B resource ID | 403 or 0 rows affected | |
| Tenant A deletes Tenant B record | DELETE with Tenant A token | 403 | |
| Direct DB query bypasses API | Direct Supabase call with Tenant A JWT | RLS filters to Tenant A only | |

### 20.2 IDOR (Insecure Direct Object Reference)

**Test ID:** ISO-002 | **Priority:** Critical

| Test Case | Action | Expected Result | Status |
|-----------|--------|-----------------|--------|
| Access another tenant's registration by ID | GET `/api/t/tenant-a/registrations/{tenant_b_reg_id}` | 404 or 403 | |
| Access another tenant's API key | GET `/api/t/tenant-a/api-keys/{tenant_b_key_id}` | 404 or 403 | |
| Guess super admin tenant ID | PATCH `/api/super-admin/tenants/{id}` with tenant token | 403 | |

### 20.3 Tenant Slug Enumeration

**Test ID:** ISO-003 | **Priority:** Medium

| Test Case | Expected Result | Status |
|-----------|-----------------|--------|
| Request valid tenant slug | 200 with public config | |
| Request invalid tenant slug | 404 — no tenant info leaked | |
| Brute force common slugs | Rate limiting kicks in after threshold | |
| Timing difference between valid/invalid slugs | No significant timing difference (< 50ms variance) | |

---

## 21. Input Validation & Injection Prevention

### 21.1 XSS Prevention

**Test ID:** INJ-001 | **Priority:** Critical

| Input Field | Payload | Expected Result | Status |
|-------------|---------|-----------------|--------|
| Registration name | `<script>alert(1)</script>` | Sanitized in stored value | |
| Company name | `<img src=x onerror=alert(1)>` | Escaped on render | |
| Settings logo_url | `javascript:alert(1)` | Rejected or sanitized | |
| Email subject template | `{{constructor.constructor('alert(1)')()}}` | Not executed | |

### 21.2 SQL Injection Prevention

**Test ID:** INJ-002 | **Priority:** Critical

> Note: Supabase client uses parameterized queries. Direct SQL injection via ORM is unlikely, but test API inputs:

| Input Field | Payload | Expected Result | Status |
|-------------|---------|-----------------|--------|
| Email field | `admin'--` | Rejected as invalid email | |
| Slug parameter | `brtneura' OR '1'='1` | Slug not found / 404 | |
| Search query | `' UNION SELECT * FROM auth.users--` | No DB error leaked | |
| JSON body | `{"name": "'; DROP TABLE tenants;--"}` | Name stored as literal string | |

### 21.3 Request Size & Format

**Test ID:** INJ-003 | **Priority:** Medium

| Test Case | Expected Result | Status |
|-----------|-----------------|--------|
| POST body > 10MB | 413 Entity Too Large | |
| Malformed JSON body | 400 Invalid JSON | |
| Missing Content-Type header | 400 or graceful handling | |
| Deeply nested JSON (`{"a":{"a":{"a":...}}}`) | 400 or processing without DoS | |

---

## 22. Payment Security

### 22.1 Razorpay Signature Verification

**Test ID:** PSEC-001 | **Priority:** Critical

| Test Case | Action | Expected Result | Status |
|-----------|--------|-----------------|--------|
| Valid payment signature | Complete payment with valid sig | Payment confirmed | |
| Invalid signature (tampered) | Send payment with wrong signature | 400 signature invalid | |
| Missing signature | Send verification request without signature | 400 | |
| Replay attack (same signature twice) | Re-send verified payment request | Idempotent — no duplicate | |

### 22.2 Price Manipulation Prevention

**Test ID:** PSEC-002 | **Priority:** Critical

| Test Case | Action | Expected Result | Status |
|-----------|--------|-----------------|--------|
| Client sends lower price | Intercept and modify amount in request | Server validates against config price | |
| Client sends 0 amount | POST register with amount=0 | Rejected — amount not client-controlled | |
| Use VIP price for Basic tier | Modify tier in request | Server enforces tier-to-price mapping | |
| Payment for wrong tenant | Use payment from Tenant A for Tenant B | tenant_id validated on payment record | |

### 22.3 Webhook Security

**Test ID:** PSEC-003 | **Priority:** Critical

| Test Case | Expected Result | Status |
|-----------|-----------------|--------|
| Webhook without signature header | 400 rejected | |
| Webhook with invalid signature | 400 rejected | |
| Webhook from non-Razorpay IP | Rate limiting / no trust by IP alone | |
| Webhook replay (duplicate event) | Idempotent processing (no double-update) | |
| `RAZORPAY_WEBHOOK_SECRET` not set | Server should error on startup or reject all webhooks | |

### 22.4 Timing Attack Prevention

**Test ID:** PSEC-004 | **Priority:** Medium

| Test Case | Expected Result | Status |
|-----------|-----------------|--------|
| Signature comparison uses `===` | Known issue — should use `crypto.timingSafeEqual()` | FAIL (known) |
| Measure response time for valid vs invalid signature | Timing difference < 1ms variance | |

> **Known Bug:** `razorpay.ts` uses `===` for signature comparison. Should be `crypto.timingSafeEqual()`. Mark as FAIL until fixed.

---

## 23. API & Rate Limiting Security

### 23.1 Rate Limiting Verification

**Test ID:** RLIM-001 | **Priority:** High

| Endpoint | Limiter Type | Limit | Test Action | Expected Result | Status |
|----------|-------------|-------|-------------|-----------------|--------|
| POST `/api/auth/signup` | strictLimiter | 10/15min | Send 11 requests | 11th returns 429 | |
| POST `/api/auth/login` | strictLimiter | 10/15min | Send 11 requests | 11th returns 429 | |
| POST `/api/register` | standardLimiter | 100/15min | 101 requests | 101st returns 429 | |
| POST `/api/payment/verify` | paymentLimiter | 5/min | 6 requests/min | 6th returns 429 | |
| POST `/api/webhooks/razorpay` | webhookLimiter | 100/min | Normal volume | 200 OK | |

### 23.2 CORS Policy

**Test ID:** CORS-001 | **Priority:** High

| Test Case | Expected Result | Status |
|-----------|-----------------|--------|
| Request from allowed origin (production) | CORS headers present | |
| Request from unlisted origin (production) | CORS rejected / no Access-Control headers | |
| Request in development mode (`NODE_ENV=development`) | All origins allowed (acceptable for dev) | |
| Verify production CORS list is restricted | Only specific domains listed | |

### 23.3 Security Headers

**Test ID:** SEC-HDR-001 | **Priority:** Medium

| Header | Expected Value | Status |
|--------|---------------|--------|
| `X-Content-Type-Options` | `nosniff` | |
| `X-Frame-Options` | `SAMEORIGIN` or `DENY` | |
| `Strict-Transport-Security` | Present in production | |
| `X-XSS-Protection` | `1; mode=block` | |
| `Content-Security-Policy` | Defined (Helmet default or custom) | |
| Stack trace in error response (prod) | NOT present | |

---

## 24. Data Exposure & Privacy

### 24.1 Sensitive Data in Responses

**Test ID:** PRIV-001 | **Priority:** Critical

| Endpoint | Data That Must NOT Appear | Status |
|----------|--------------------------|--------|
| GET `/api/t/:slug/api-keys` | Raw key, full hash | |
| GET `/api/auth/profile` | Password, raw API key | |
| GET `/api/super-admin/tenants` | `api_key_hash` field | |
| Any error response | DB credentials, stack trace (prod) | |
| GET `/api/t/:slug/public/config` | Subscription details, internal IDs | |

### 24.2 PII Handling

**Test ID:** PRIV-002 | **Priority:** High

| Test Case | Expected Result | Status |
|-----------|-----------------|--------|
| Phone numbers in URLs | Not passed as URL params | |
| Email in query string | Not passed as URL params | |
| PII in server logs | Not logged in plaintext | |
| CSV export contains PII | Encrypted download or admin-only | |
| Registration data accessible after tenant deletion | Data deletion scheduled properly | |

### 24.3 Environment Variable Leakage

**Test ID:** PRIV-003 | **Priority:** Critical

| Check | Expected Result | Status |
|-------|-----------------|--------|
| Frontend JS files contain API keys | NOT present | |
| `.env` file committed to git | NOT committed (.gitignore checked) | |
| `SUPABASE_SERVICE_ROLE_KEY` in client bundle | NOT present | |
| `RAZORPAY_KEY_SECRET` in frontend | NOT present (only KEY_ID is public) | |
| Console.log output of config keys | Only key lengths/prefixes logged | |

---

## 25. Page Load & UI Performance

### 25.1 Page Load Times

| Page | Target | Actual | Status |
|------|--------|--------|--------|
| Registration page `/t/:slug` | < 3 seconds | | |
| Landing page `/` | < 3 seconds | | |
| Onboarding wizard | < 2 seconds | | |
| Tenant dashboard | < 3 seconds | | |
| Super admin panel | < 3 seconds | | |
| Admin dashboard (legacy) | < 3 seconds | | |
| Dashboard with 1000+ registrations | < 5 seconds | | |

### 25.2 Asset Optimization

| Asset | Check | Expected | Status |
|-------|-------|----------|--------|
| Images | Compressed | < 200KB each | |
| CSS files | Minified (production) | No unnecessary whitespace | |
| JS files | No blocking scripts | Deferred or async | |
| API calls on page load | Parallelized | Not sequential | |

---

## 26. API Response Time Benchmarks

### 26.1 Registration & Payment APIs

| Endpoint | Target P50 | Target P95 | Status |
|----------|-----------|-----------|--------|
| POST `/api/register` | < 500ms | < 2s | |
| POST `/api/payment/verify` | < 1s | < 3s | |
| GET `/api/t/:slug/public/config` | < 200ms | < 500ms | |
| GET `/api/t/:slug/public/seats` | < 200ms | < 500ms | |

### 26.2 Dashboard & Admin APIs

| Endpoint | Target P50 | Target P95 | Status |
|----------|-----------|-----------|--------|
| GET `/api/t/:slug/overview` | < 300ms | < 1s | |
| GET `/api/t/:slug/registrations` (100 records) | < 500ms | < 1.5s | |
| GET `/api/admin/stats` | < 300ms | < 1s | |
| GET `/api/super-admin/tenants` (50 tenants) | < 500ms | < 1.5s | |

### 26.3 Auth APIs

| Endpoint | Target P50 | Target P95 | Status |
|----------|-----------|-----------|--------|
| POST `/api/auth/login` | < 500ms | < 1.5s | |
| POST `/api/auth/signup` | < 1s | < 3s | |
| POST `/api/auth/refresh` | < 300ms | < 1s | |

---

## 27. Concurrent User & Load Testing

### 27.1 Simultaneous Registrations

| Scenario | Target | Result | Status |
|----------|--------|--------|--------|
| 10 simultaneous registrations | All succeed | | |
| 50 admin dashboard views | All load | | |
| 100 API requests/minute | Rate limiting works correctly | | |
| 2 users compete for last seat | Only 1 succeeds, other gets waitlist | | |

### 27.2 Multi-Tenant Isolation Under Load

| Scenario | Target | Status |
|----------|--------|--------|
| 5 tenants each running 20 concurrent registrations | No cross-tenant data pollution | |
| Tenant A and B read settings simultaneously | Correct data for each tenant | |
| Super admin reads all tenants while tenants write | No deadlocks | |

### 27.3 Webhook Processing

| Scenario | Target | Status |
|----------|--------|--------|
| 50 webhook events delivered within 1 second | All processed, no dropped | |
| Webhook received while DB is slow | Queued or retried successfully | |
| Duplicate webhook event sent 3 times | Processed exactly once | |

---

## 28. Database Performance

### 28.1 Query Performance

| Query | Method | Target | Status |
|-------|--------|--------|--------|
| Tenant lookup by slug | Index scan on `idx_tenants_slug` | < 10ms | |
| Registrations by tenant_id | Index scan on `idx_registrations_tenant` | < 50ms for 10K rows | |
| Subscription by tenant_id | Index scan on `idx_subscriptions_tenant` | < 10ms | |
| Audit log by tenant + date range | Composite index used | < 100ms for 50K rows | |

### 28.2 RLS Policy Overhead

| Test | Baseline (no RLS) | With RLS | Acceptable Delta | Status |
|------|-------------------|----------|-----------------|--------|
| SELECT registrations (100 rows) | Timed | Timed | < 20% overhead | |
| INSERT registration | Timed | Timed | < 10ms additional | |

### 28.3 Cleanup Job Performance

| Job | Frequency | Max Duration | Status |
|-----|-----------|--------------|--------|
| Expire pending registrations | Every 5 min | < 2s | |
| Cleanup abandoned holds | On demand (admin) | < 5s for 100 records | |

---

## 29. Test Reporting Template

### Test Execution Summary

| Category | Total Tests | Passed | Failed | Blocked | Not Run |
|----------|-------------|--------|--------|---------|---------|
| Registration Flow | | | | | |
| Payment Flow | | | | | |
| Failure Scenarios | | | | | |
| Email Notifications | | | | | |
| Admin Dashboard | | | | | |
| Seat Inventory | | | | | |
| Multi-Tenant Auth | | | | | |
| Tenant Dashboard | | | | | |
| Subscription Management | | | | | |
| API Key Management | | | | | |
| Super Admin | | | | | |
| Edge Cases | | | | | |
| Technical / DB / RLS | | | | | |
| API Contract | | | | | |
| Error Handling | | | | | |
| Audit & Observability | | | | | |
| Auth Security | | | | | |
| Tenant Isolation Security | | | | | |
| Injection Prevention | | | | | |
| Payment Security | | | | | |
| Rate Limiting | | | | | |
| Data Privacy | | | | | |
| Performance | | | | | |
| **TOTAL** | | | | | |

### Known Issues (Pre-Existing)

| ID | Issue | Severity | File | Status |
|----|-------|----------|------|--------|
| BUG-001 | `checkUsage()` returns `allowed: true` on DB error | High | `subscription.service.ts` | Open |
| BUG-002 | Signature comparison uses `===` instead of `crypto.timingSafeEqual()` | Medium | `razorpay.ts` | Open |
| BUG-003 | Webhook processing has no idempotency check | High | `subscription.service.ts` | Open |
| BUG-004 | No slug collision handling when two companies have same name | Medium | `auth.service.ts` | Open |
| BUG-005 | `ADMIN_API_KEY` defaults to `change-this-in-production` if not set | High | `config/index.ts` | Open |

### Defect Summary

| ID | Title | Severity | Status | Assigned To |
|----|-------|----------|--------|-------------|
| | | | | |

### Severity Definitions

- **Critical**: System unusable, payment failures, data loss, security breach
- **High**: Major feature not working, tenant isolation broken, security issue
- **Medium**: Feature partially working, workaround exists
- **Low**: Minor UI issue, cosmetic defect

### Test Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Lead | | | |
| Dev Lead | | | |
| Security Reviewer | | | |
| Product Owner | | | |

---

## Quick Reference: Critical Test Paths

### Happy Path (Registration)
1. User visits `/t/:slug` → Selects tier → Fills form → Pays successfully → Gets confirmation email

### Multi-Tenant Onboarding
1. Company signs up → Tenant + Auth user created → JWT returned → Dashboard accessible

### Subscription Enforcement
1. Trial tenant hits 50 registrations → 51st blocked → Upgrade plan → Registration allowed

### Tenant Isolation Check
1. Login as Tenant A → Try to access Tenant B's `/api/t/tenant-b/overview` → 403

### Payment Abandonment Recovery
1. User fills form → Opens Razorpay → Cancels → Admin sends recovery email → User completes

### Super Admin Lifecycle
1. New tenant signs up → Super admin reviews → Can deactivate/activate → Audit log captured

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

### Default Tenant Reference

| Field | Value |
|-------|-------|
| ID | `00000000-0000-0000-0000-000000000001` |
| Slug | `brtneura` |
| Plan | `scaleup_pro` |
| Registration Limit | 10,000/month |

### Key File Locations

| Component | File |
|-----------|------|
| Auth service | `backend/src/services/auth.service.ts` |
| Tenant service | `backend/src/services/tenant.service.ts` |
| Subscription service | `backend/src/services/subscription.service.ts` |
| API key service | `backend/src/services/apiKey.service.ts` |
| Tenant auth middleware | `backend/src/middleware/tenantAuth.ts` |
| Rate limiters | `backend/src/middleware/rateLimiter.ts` |
| Audit middleware | `backend/src/middleware/audit.ts` |
| Razorpay config | `backend/src/config/razorpay.ts` |
| RLS policies | `backend/supabase/migrations/017_enable_rls_policies.sql` |
| Tenant routes | `backend/src/routes/tenant.routes.ts` |
| Super admin routes | `backend/src/routes/superAdmin.routes.ts` |

---

**End of Testing Guide — Version 2.0**
