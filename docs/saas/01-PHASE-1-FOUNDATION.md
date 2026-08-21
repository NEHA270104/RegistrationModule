# Phase 1 — Foundation (4-6 Weeks)

Multi-tenancy, Authentication, Tenant Dashboard, Subscription Management

---

## Objectives

- Convert single-tenant database to multi-tenant with RLS
- Implement Supabase Auth with JWT-based tenant scoping
- Build tenant onboarding wizard
- Create tenant-specific admin dashboard
- Set up subscription billing with Razorpay Subscriptions
- Build BRTNeura super-admin panel

---

## 1.1 Database Multi-Tenancy

### Migration: `015_create_tenants_table.sql`

```sql
-- Core tenants table
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  company_name VARCHAR(255),

  -- Branding (default BRTNeura)
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#667eea',
  secondary_color VARCHAR(7) DEFAULT '#764ba2',
  favicon_url TEXT,

  -- Subscription
  subscription_plan VARCHAR(20) DEFAULT 'trial',  -- trial | launchpad | scaleup_pro
  subscription_status VARCHAR(20) DEFAULT 'trialing', -- trialing | active | past_due | cancelled
  trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '14 days'),

  -- Rebrand
  is_rebranded BOOLEAN DEFAULT false,
  rebrand_approved_at TIMESTAMPTZ,
  rebrand_fee_paid BOOLEAN DEFAULT false,

  -- Referral
  referral_code VARCHAR(20) UNIQUE,
  referred_by_tenant_id UUID REFERENCES tenants(id),

  -- API Access
  api_key_hash TEXT,

  -- Domain
  custom_domain VARCHAR(255),
  domain_verified BOOLEAN DEFAULT false,

  -- Status
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_referral_code ON tenants(referral_code);
CREATE INDEX idx_tenants_subscription ON tenants(subscription_plan, subscription_status);
```

### Migration: `016_add_tenant_id_to_existing_tables.sql`

Add `tenant_id` to all existing tables:

```sql
-- Add tenant_id to every existing table
ALTER TABLE registrations ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE seat_inventory ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE waitlist ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE payment_abandonments ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE payment_webhook_logs ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE site_settings ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE guests ADD COLUMN tenant_id UUID REFERENCES tenants(id);
ALTER TABLE msme_benefits ADD COLUMN tenant_id UUID REFERENCES tenants(id);

-- Create indexes
CREATE INDEX idx_registrations_tenant ON registrations(tenant_id);
CREATE INDEX idx_seat_inventory_tenant ON seat_inventory(tenant_id);
CREATE INDEX idx_waitlist_tenant ON waitlist(tenant_id);
CREATE INDEX idx_site_settings_tenant ON site_settings(tenant_id);
CREATE INDEX idx_guests_tenant ON guests(tenant_id);
CREATE INDEX idx_msme_benefits_tenant ON msme_benefits(tenant_id);
```

### Migration: `017_enable_rls_policies.sql`

```sql
-- Enable RLS on all tables
ALTER TABLE registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE seat_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE msme_benefits ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_abandonments ENABLE ROW LEVEL SECURITY;

-- Policy: Tenants can only see their own data
CREATE POLICY tenant_isolation_registrations ON registrations
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY tenant_isolation_seats ON seat_inventory
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY tenant_isolation_waitlist ON waitlist
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY tenant_isolation_settings ON site_settings
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY tenant_isolation_guests ON guests
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY tenant_isolation_benefits ON msme_benefits
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

CREATE POLICY tenant_isolation_abandonments ON payment_abandonments
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);

-- Public read policy for registration form pages (no auth needed for public site)
CREATE POLICY public_read_settings ON site_settings
  FOR SELECT USING (true);

CREATE POLICY public_read_seats ON seat_inventory
  FOR SELECT USING (true);

CREATE POLICY public_read_guests ON guests
  FOR SELECT USING (is_active = true);

CREATE POLICY public_read_benefits ON msme_benefits
  FOR SELECT USING (is_active = true);
```

### Implementation Steps

1. Create migration files in `backend/supabase/migrations/`
2. Run migrations against Supabase
3. Create a default tenant for existing data (BRTNeura's own event)
4. Backfill `tenant_id` on all existing rows
5. Test RLS policies with different JWT tokens

---

## 1.2 Authentication System

### New Files

```
backend/src/
  config/
    supabaseAdmin.ts        -- Service-role client (super-admin)
  middleware/
    tenantAuth.ts           -- JWT extraction + tenant scoping
    superAdminAuth.ts       -- BRTNeura super-admin middleware
  services/
    tenant.service.ts       -- Tenant CRUD operations
    auth.service.ts         -- Login, signup, token management
  controllers/
    tenant.controller.ts    -- Tenant API endpoints
    auth.controller.ts      -- Auth endpoints
  routes/
    tenant.routes.ts        -- /api/tenant/*
    auth.routes.ts          -- /api/auth/*
```

### `tenantAuth.ts` — Middleware

```typescript
import { Request, Response, NextFunction } from 'express';
import { supabase } from '../config/supabase';

export interface TenantRequest extends Request {
  tenantId?: string;
  userId?: string;
  userRole?: string;
}

export const tenantAuth = async (req: TenantRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' });
  }

  const token = authHeader.split(' ')[1];

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Extract tenant_id from user metadata
  const tenantId = user.user_metadata?.tenant_id;
  if (!tenantId) {
    return res.status(403).json({ error: 'No tenant associated with this account' });
  }

  req.tenantId = tenantId;
  req.userId = user.id;
  req.userRole = user.user_metadata?.role || 'tenant_admin';

  next();
};
```

### `superAdminAuth.ts` — BRTNeura Admin Middleware

```typescript
export const superAdminAuth = async (req: TenantRequest, res: Response, next: NextFunction) => {
  // First verify JWT
  await tenantAuth(req, res, () => {});

  // Then check super-admin role
  if (req.userRole !== 'super_admin') {
    return res.status(403).json({ error: 'Super admin access required' });
  }

  next();
};
```

### Auth Flow

```
1. Tenant signs up:
   POST /api/auth/signup
   Body: { email, password, name, company_name }
   -> Creates Supabase Auth user
   -> Creates tenant record
   -> Sets user_metadata: { tenant_id, role: 'tenant_admin' }
   -> Returns JWT token

2. Tenant logs in:
   POST /api/auth/login
   Body: { email, password }
   -> Supabase Auth signInWithPassword
   -> Returns JWT with tenant_id in claims

3. Tenant API calls:
   GET /api/t/:slug/settings
   Headers: { Authorization: Bearer <jwt> }
   -> tenantAuth middleware extracts tenant_id
   -> Service queries with tenant_id filter
   -> RLS enforces isolation at DB level

4. Super Admin:
   GET /api/super-admin/tenants
   Headers: { Authorization: Bearer <jwt> }
   -> superAdminAuth checks role
   -> Uses service_role client (bypasses RLS)
```

---

## 1.3 Tenant Onboarding Wizard

### Frontend: `frontend/onboarding/`

```
frontend/onboarding/
  index.html          -- Onboarding wizard page
  css/onboarding.css  -- Wizard styles
  js/onboarding.js    -- Wizard logic
```

### Wizard Steps

```
Step 1: Company Details
  - Company name (required)
  - Contact name (required)
  - Email (required)
  - Phone (required)
  - Website (optional)

Step 2: Choose Plan
  - LaunchPad card (features, price)
  - ScaleUp Pro card (features, price)
  - Monthly / Yearly toggle
  - Referral code input (optional)
  - "Start 14-day free trial" CTA

Step 3: Create Account
  - Email (pre-filled)
  - Password
  - Confirm password
  - Accept Terms of Service checkbox
  - Accept Data Processing Agreement checkbox

Step 4: Configure First Event
  - Event name
  - Event date
  - Venue / Platform
  - Ticket tiers (VIP/Standard/Basic with prices)
  - Number of seats per tier

Step 5: Go Live
  - Preview registration form
  - Your URL: app.brtneura.com/t/{slug}
  - "Launch" button
  - Share links (copy URL, WhatsApp, email)
```

### API Endpoints

```
POST /api/auth/signup              -- Step 3 (creates user + tenant)
POST /api/t/:slug/setup            -- Step 4 (initial event config)
POST /api/t/:slug/activate         -- Step 5 (set tenant active)
```

---

## 1.4 Tenant Dashboard

### Frontend: `frontend/dashboard/`

```
frontend/dashboard/
  index.html              -- Dashboard shell (login + main layout)
  css/dashboard.css       -- Dashboard styles
  js/
    dashboard.js          -- Main dashboard logic
    dashboard-api.js      -- Tenant-scoped API calls
    dashboard-auth.js     -- Login/logout/token management
```

### Dashboard Sections

```
Sidebar Navigation:
├── Overview
│   - Total registrations (chart)
│   - Revenue summary
│   - Seat availability
│   - Recent activity feed
│
├── Registration Form
│   ├── Event Settings
│   │   - Event name, date, venue, platform
│   │   - Tier pricing & seat limits
│   ├── Content
│   │   - Guest speakers (CRUD)
│   │   - MSME benefits / features (CRUD)
│   │   - Offer banner settings
│   │   - Promo section settings
│   └── Preview
│       - Live preview of registration form
│
├── Registrations
│   - List with filters (status, tier, date)
│   - Export CSV/Excel
│   - Search by name/email
│   - View individual registration detail
│
├── Payment Recovery
│   - Abandoned payments list
│   - Generate recovery links
│   - Follow-up status tracking
│
├── Flyer Generator (Phase 2)
│   - [Greyed out / "Coming Soon" badge]
│
├── Referral Program (Phase 2)
│   - [Greyed out / "Coming Soon" badge]
│
├── Subscription & Billing
│   - Current plan display
│   - Usage stats (registrations this month)
│   - Upgrade / Downgrade buttons
│   - Payment history
│   - Next billing date
│
└── Settings
    ├── Profile & Company Details
    ├── API Keys (generate, revoke, list)
    ├── Branding (logo, colors — if rebranded)
    └── Request Rebrand (submit request form)
```

### Tenant-Scoped API Routes

```
New route namespace: /api/t/:slug/

GET    /api/t/:slug/overview          -- Dashboard stats
GET    /api/t/:slug/registrations     -- List registrations
GET    /api/t/:slug/registrations/:id -- Single registration
GET    /api/t/:slug/settings          -- Get all settings
POST   /api/t/:slug/settings/:key    -- Update setting
GET    /api/t/:slug/guests           -- List guests
POST   /api/t/:slug/guests           -- Create guest
PUT    /api/t/:slug/guests/:id       -- Update guest
DELETE /api/t/:slug/guests/:id       -- Delete guest
GET    /api/t/:slug/msme-benefits    -- List benefits
POST   /api/t/:slug/msme-benefits    -- Create benefit
PUT    /api/t/:slug/msme-benefits/:id
DELETE /api/t/:slug/msme-benefits/:id
GET    /api/t/:slug/seats            -- Seat availability
POST   /api/t/:slug/seats            -- Update seats
GET    /api/t/:slug/abandonments     -- Abandoned payments
POST   /api/t/:slug/abandonment/:id/recovery
GET    /api/t/:slug/subscription     -- Current subscription
POST   /api/t/:slug/subscription/upgrade
POST   /api/t/:slug/subscription/cancel
GET    /api/t/:slug/api-keys         -- List API keys
POST   /api/t/:slug/api-keys         -- Generate new key
DELETE /api/t/:slug/api-keys/:id     -- Revoke key
```

---

## 1.5 Subscription Management

### Razorpay Subscriptions Integration

#### New Files

```
backend/src/
  services/
    subscription.service.ts    -- Subscription CRUD + Razorpay
  controllers/
    subscription.controller.ts
  routes/
    subscription.routes.ts
```

#### `subscription.service.ts` — Key Methods

```typescript
class SubscriptionService {
  // Create Razorpay plan (done once at setup)
  async createPlans() {
    // LaunchPad Monthly, LaunchPad Yearly
    // ScaleUp Pro Monthly, ScaleUp Pro Yearly
  }

  // Create subscription for tenant
  async createSubscription(tenantId: string, planId: string) {
    // 1. Create Razorpay subscription
    // 2. Store in subscriptions table
    // 3. Return checkout URL
  }

  // Handle Razorpay subscription webhook
  async handleWebhook(event: string, payload: any) {
    // subscription.activated -> update tenant status
    // subscription.charged -> record payment
    // subscription.pending -> send reminder email
    // subscription.halted -> grace period, then deactivate
    // subscription.cancelled -> handle cancellation
  }

  // Check subscription limits
  async checkUsage(tenantId: string): Promise<UsageStatus> {
    // Count registrations this month
    // Compare against plan limit
    // Return { allowed: boolean, used: number, limit: number }
  }

  // Upgrade/downgrade plan
  async changePlan(tenantId: string, newPlan: string) {
    // Razorpay subscription update
    // Prorate if upgrading
  }
}
```

### Database: `subscriptions` table

```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  plan_name VARCHAR(20) NOT NULL,       -- launchpad | scaleup_pro
  billing_cycle VARCHAR(10) NOT NULL,   -- monthly | yearly
  amount INTEGER NOT NULL,              -- in paise
  currency VARCHAR(3) DEFAULT 'INR',
  status VARCHAR(20) DEFAULT 'created', -- created | authenticated | active | past_due | halted | cancelled
  razorpay_subscription_id VARCHAR(255),
  razorpay_plan_id VARCHAR(255),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  trial_ends_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
```

---

## 1.6 BRTNeura Super Admin Panel

### Frontend: `frontend/super-admin/`

```
frontend/super-admin/
  index.html
  css/super-admin.css
  js/
    super-admin.js
    super-admin-api.js
```

### Super Admin Dashboard

```
Sections:
├── Overview
│   - Total tenants (active, trial, churned)
│   - MRR (Monthly Recurring Revenue)
│   - Total registrations across all tenants
│   - New signups this month
│
├── Tenant Management
│   - List all tenants (searchable, filterable)
│   - View tenant details (subscription, usage, branding)
│   - Activate / Deactivate tenant
│   - Impersonate tenant (view their dashboard as them)
│   - Usage breakdown per tenant
│
├── Rebrand Requests
│   - Pending requests queue
│   - Approve / Reject with notes
│   - Setup fee tracking
│   - Notification badge for pending items
│
├── Subscriptions
│   - All active subscriptions
│   - Payment history
│   - Failed payments / past-due
│   - Revenue analytics
│
├── Referral Program
│   - All referrals
│   - Commission tracking
│   - Payout management
│   - Partner tier status
│
├── Audit Log
│   - Cross-tenant activity log
│   - Filterable by tenant, action, date
│
└── System Settings
    - Razorpay plan IDs
    - Default branding
    - Email templates
    - Rate limit configs
```

### Super Admin API Routes

```
GET    /api/super-admin/tenants              -- List all tenants
GET    /api/super-admin/tenants/:id          -- Tenant detail
PATCH  /api/super-admin/tenants/:id          -- Update tenant
POST   /api/super-admin/tenants/:id/activate
POST   /api/super-admin/tenants/:id/deactivate
GET    /api/super-admin/rebrand-requests     -- Pending rebrands
PATCH  /api/super-admin/rebrand-requests/:id -- Approve/reject
GET    /api/super-admin/subscriptions        -- All subscriptions
GET    /api/super-admin/referrals            -- All referrals
POST   /api/super-admin/referrals/:id/payout -- Mark paid
GET    /api/super-admin/audit-log            -- Audit trail
GET    /api/super-admin/stats                -- Global stats
```

---

## 1.7 Public Registration Form — Tenant Scoping

### URL Structure

```
Public form:  app.brtneura.com/t/{tenant-slug}
              OR {custom-domain} (if verified)

Example:      app.brtneura.com/t/acme-corp
```

### Changes to Existing Frontend

1. **`frontend/index.html`** — Add tenant detection:
   ```javascript
   // Extract tenant slug from URL
   const pathParts = window.location.pathname.split('/');
   const tenantSlug = pathParts[2]; // /t/{slug}

   // Load tenant branding
   const config = await fetch(`/api/t/${tenantSlug}/public/config`);
   // Apply logo, colors, event details
   ```

2. **`frontend/js/api.js`** — Prefix all API calls with tenant slug:
   ```javascript
   const API_BASE = `/api/t/${tenantSlug}`;
   ```

3. **`frontend/js/app.js`** — Apply tenant branding on load:
   ```javascript
   function applyBranding(config) {
     document.documentElement.style.setProperty('--primary', config.primary_color);
     document.documentElement.style.setProperty('--secondary', config.secondary_color);
     document.querySelector('.logo').src = config.logo_url;
     document.title = config.event_name;
   }
   ```

### New Public API (No Auth Required)

```
GET /api/t/:slug/public/config    -- Tenant branding + event details
GET /api/t/:slug/public/seats     -- Seat availability
GET /api/t/:slug/public/guests    -- Active guest speakers
GET /api/t/:slug/public/benefits  -- Active benefits list
POST /api/t/:slug/public/register -- Create registration
POST /api/t/:slug/public/order    -- Create payment order
POST /api/t/:slug/public/verify   -- Verify payment
```

---

## 1.8 Implementation Checklist

### Week 1-2: Database & Auth

- [ ] Create `tenants` table migration
- [ ] Create `subscriptions` table migration
- [ ] Add `tenant_id` to all existing tables
- [ ] Create RLS policies
- [ ] Backfill existing data with default tenant
- [ ] Implement `tenant.service.ts`
- [ ] Implement `auth.service.ts` and `auth.controller.ts`
- [ ] Implement `tenantAuth` middleware
- [ ] Implement `superAdminAuth` middleware
- [ ] Write integration tests for RLS policies

### Week 3-4: Tenant Dashboard

- [ ] Create `frontend/dashboard/` structure
- [ ] Build login/auth flow (dashboard-auth.js)
- [ ] Build dashboard shell (sidebar, header, routing)
- [ ] Port existing admin functionality to tenant-scoped dashboard
- [ ] Build Overview page with charts
- [ ] Build Registration Form Settings section
- [ ] Build Registrations list with filters/export
- [ ] Build Subscription & Billing section

### Week 5: Subscriptions & Onboarding

- [ ] Create Razorpay subscription plans
- [ ] Implement `subscription.service.ts`
- [ ] Handle subscription webhooks
- [ ] Build onboarding wizard (`frontend/onboarding/`)
- [ ] Implement usage limit checks
- [ ] Build plan upgrade/downgrade flow

### Week 6: Super Admin & Testing

- [ ] Create `frontend/super-admin/` structure
- [ ] Build tenant management UI
- [ ] Build subscription overview
- [ ] Build global stats dashboard
- [ ] End-to-end testing (signup -> configure -> register -> pay)
- [ ] Security audit (RLS, auth, API access)
- [ ] Performance testing with multiple tenants

---

## Dependencies

- Supabase Auth (already available in Supabase project)
- Razorpay Subscriptions API (requires business account activation)
- No new npm packages needed beyond existing stack

## Risks

| Risk | Mitigation |
|------|-----------|
| Existing data migration | Create default tenant, backfill with script, test thoroughly |
| RLS policy gaps | Write policy tests, security audit before launch |
| Razorpay subscription limits | Verify plan limits with Razorpay team |
| Auth token management | Use Supabase Auth refresh tokens, handle expiry gracefully |
