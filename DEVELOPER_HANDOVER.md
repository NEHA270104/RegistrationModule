# Developer Handover Documentation

This documentation serves as a reference manual for developers maintaining, extending, or debugging the **AI for MSME Summit Registration & Multi-Tenant Management Platform**.

---

## 1. Architectural Overview

The application is structured as a multi-tenant platform where each summit partner or tenant manages their registration flows, website settings, guests, and flyer branding under a custom namespace (slug).

### Frontend Architecture
- **Tech Stack**: Vanilla HTML5, CSS3, and JavaScript (ES6+ Modules).
- **Execution Model**: Traditional static file serving.
- **Dynamic UI Customization**: Core layout structures inside `dashboard/index.html` and `admin/index.html` remain untouched. Key UI enhancements (User Profile settings, base64 photo upload elements, subscription active badges, and QR scanner overlays) are injected dynamically at runtime via JavaScript (in [dashboard.js](file:///c:/Users/NEHA%20CHAVAN/Desktop/Registration/bizflow-registration-main/frontend/dashboard/js/dashboard.js) and [onboarding.js](file:///c:/Users/NEHA%20CHAVAN/Desktop/Registration/bizflow-registration-main/frontend/onboarding/js/onboarding.js)).
- **Stylesheets**: 
  - `css/dashboard.css` and `css/admin.css` contain core dashboards layout rules.
  - [flyer.css](file:///c:/Users/NEHA%20CHAVAN/Desktop/Registration/bizflow-registration-main/frontend/css/flyer.css) contains shared template layout patterns and animations.

### Backend Architecture
- **Tech Stack**: Node.js, Express, TypeScript.
- **Transpilation**: TypeScript code is transpiled using the TypeScript Compiler (`tsc`) with the configuration defined in `tsconfig.json`. The application uses ES Modules (`type: "module"`).
- **Database Engine**: Supabase (PostgreSQL) coupled with the Supabase JS Client library (`@supabase/supabase-js`). RLS (Row Level Security) is enabled on all critical tables.

---

## 2. Centralized Functional Modules

### A. Subscription Management & QR Simulator
- **Plans & Tier Limits**: Tier thresholds are configured in [subscription.service.ts](file:///c:/Users/NEHA%20CHAVAN/Desktop/Registration/bizflow-registration-main/backend/src/services/subscription.service.ts).
  - **Basic**: 0 guest limit (₹1,499/mo)
  - **Standard**: 100 guest limit (₹2,100/mo) - *renamed from "Pro"*
  - **Enterprise**: 500 guest limit (₹2,999/mo)
- **UPI QR Payment Simulator**: Triggered dynamically when standard users click "Upgrade Plan" or select a plan in onboarding Step 2. Implemented as an overlay UI (`showQrPaymentModal`) with laser scanning visual effects. Upon successful scan simulation, the frontend calls the upgrade endpoint and advances state.

### B. Profile Settings & Avatar Upload
- **Avatar Ingestion**: Handled via the `/api/t/:slug/account/avatar` endpoint.
- **Storage Strategy**: Processes base64 image data strings and uploads the binary buffer directly to the public `flyers` bucket under the folder name `[tenant_id]/avatar_[timestamp].[ext]`.
- **Database Link**: The resulting public URL is saved under the `logo_url` column in the `tenants` table. The frontend updates the user header profile layout dynamically based on this URL.

### C. Reusable Flyer Generator Component
- **Component Entrypoint**: Bound to `window.renderFlyerGenerator(containerId, options)` inside `dashboard.js`.
- **Dual Scope Mounting**: Mounted within the User Dashboard (Site Settings tab) and the Admin Dashboard (Flyers sub-tab).
- **Features**: Includes templates grid, text customization via `contentEditable`, base64 image loading, export options (image/PDF formats via html2canvas/jsPDF), and AI text expansion using OpenAI.
- **Multi-Tenant Scoping**: Admins can view/generate flyers for any tenant slug via a selector dropdown, whereas regular users are strictly bound to their authenticated tenant.

---

## 3. Authentication, Authorization & Security Context

### Middleware Stack
- **Tenant Auth Middleware**: Configured in [tenantAuth.ts](file:///c:/Users/NEHA%20CHAVAN/Desktop/Registration/bizflow-registration-main/backend/src/middleware/tenantAuth.ts).
  - Validates JWT tokens provided in authorization headers via `Bearer <token>`.
  - Determines if the user metadata contains `role` or `is_admin` flags.
  - Matches the URL route `:slug` param to the user's `tenant_id` to prevent cross-tenant security breaches.

### Admin Overrides & Special Roles
- **Is Admin Permission**: If `is_admin: true` or role is `super_admin`, the system sets `req.isAdmin = true`.
- **Guest Limit Bypass**: When posting to `/api/t/:slug/guests`, normal users are blocked if the count exceeds their plan limit. Authorized admins can toggle the `Admin Override` button in the UI, passing `admin_override = true` to bypass the limit check and force-add the guest.
- **manual_admin_entry Flag**: Guests created via an admin override bypass are flagged in the database table `guests` under the column `manual_admin_entry` as `true` to facilitate auditing.
- **Admin API Key**: Routes can also be authenticated using the global `x-api-key` header matching `config.adminApiKey`, which automatically grants `isAdmin = true` permissions.

### Admin Notifications
- If a standard user triggers a guest addition that exceeds their plan limit, the action is blocked, and a row is inserted in the `admin_notifications` table with type `limit_exceeded`.

---

## 4. Database Schema & Migration Paths

All database definitions and migrations are stored under the [migrations/](file:///c:/Users/NEHA%20CHAVAN/Desktop/Registration/bizflow-registration-main/backend/supabase/migrations) directory.

### Key Database Tables
- **tenants**: Stores corporate identity, slug name, primary colors, active status, subscription plan details, and `logo_url` (used for user avatar display).
- **subscriptions**: Stores status, trial periods, subscription fees, billing cycles, and Razorpay links.
- **guests**: Stores event speakers/guests details. Includes the audit column `manual_admin_entry`.

- **plans**: Master configuration table for plans limits (Basic, Standard, Enterprise).
- **admin_notifications**: Table logs alerts such as subscription limit violations.

### Recent Database Migrations
- **034_update_subscription_plans.sql**: Updates plans, renames `pro` to `standard`, adjusts limits, updates existing tenant links, and appends the `manual_admin_entry` boolean column.
- **035_create_reload_schema_function.sql**: Registers `reload_schema_cache()` SQL stored procedure in the database to trigger PostgREST schema reloads programmatically.

### Resolved Runtime Issues
- **ReferenceError (Dashboard is not defined)**: Removed all inline `onclick` handler template strings inside `dashboard.js` (such as `Dashboard.triggerUpgrade`) and moved the click handlers to a centralized event delegation system listener registered inside the `init()` method of `dashboard.js`.
- **GET /benefits 404**: Mounted standard `/benefits` endpoints directly on the tenant router in `tenant.routes.ts` as aliases to mapping controllers, preventing route mismatch errors.
- **Schema Cache Error**: Structured a call to the database RPC function `reload_schema_cache()` during backend initialization (`testDatabaseConnection`) to force a PostgREST cache refresh upon server start.

---

## 5. Development & Deployment Operations

### Prerequisite Setup
- Node.js version `>= 18.0.0`
- Active Supabase workspace URL and Service Role Key configured in environment variables.

### Build and Launch
Navigate to `backend` directory:
```bash
cd backend
npm install
npm run build   # Transpiles typescript (tsc)
npm run dev     # Starts backend with tsx watcher on port 3000
```
