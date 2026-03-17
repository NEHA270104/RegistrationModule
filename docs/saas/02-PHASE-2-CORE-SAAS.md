# Phase 2 — Core SaaS Features (3-4 Weeks)

Rebrand Flow, Referral Program, Flyer Generator, White-Label Emails, Rate Limiting

---

## Objectives

- Implement rebrand request and approval workflow
- Build referral/partnership program with commission tracking
- Create flyer generator using site settings data
- White-label email templates per tenant
- API rate limiting per subscription tier

---

## 2.1 Rebrand Request & Approval Flow

### Database: `rebrand_requests` table

```sql
CREATE TABLE rebrand_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),

  -- Requested branding
  requested_brand_name VARCHAR(255) NOT NULL,
  requested_logo_url TEXT,
  requested_primary_color VARCHAR(7),
  requested_secondary_color VARCHAR(7),
  requested_favicon_url TEXT,
  requested_domain VARCHAR(255),

  -- Approval workflow
  status VARCHAR(20) DEFAULT 'pending',  -- pending | approved | rejected | setup_pending | completed
  admin_notes TEXT,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,

  -- Payment
  setup_fee INTEGER DEFAULT 999900,  -- INR 9,999 in paise
  setup_fee_paid BOOLEAN DEFAULT false,
  setup_payment_id VARCHAR(255),
  paid_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rebrand_requests_tenant ON rebrand_requests(tenant_id);
CREATE INDEX idx_rebrand_requests_status ON rebrand_requests(status);

-- Enable RLS
ALTER TABLE rebrand_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_rebrand ON rebrand_requests
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
```

### Backend Implementation

#### New Files

```
backend/src/
  services/rebrand.service.ts
  controllers/rebrand.controller.ts
  routes/rebrand.routes.ts
```

#### `rebrand.service.ts` — Key Methods

```typescript
class RebrandService {
  // Tenant submits rebrand request
  async submitRequest(tenantId: string, data: RebrandRequestData): Promise<RebrandRequest> {
    // 1. Check no pending request exists
    // 2. Insert rebrand_requests record
    // 3. Send notification email to BRTNeura admin
    // 4. Create admin notification (dashboard badge)
    // 5. Return request details
  }

  // Super admin approves request
  async approveRequest(requestId: string, adminId: string, notes?: string): Promise<void> {
    // 1. Update status to 'approved'
    // 2. Send email to tenant: "Approved! Pay setup fee to proceed"
    // 3. Generate Razorpay payment link for setup fee
  }

  // Super admin rejects request
  async rejectRequest(requestId: string, adminId: string, notes: string): Promise<void> {
    // 1. Update status to 'rejected'
    // 2. Send email to tenant with rejection reason
  }

  // Handle setup fee payment
  async handleSetupPayment(requestId: string, paymentId: string): Promise<void> {
    // 1. Verify payment with Razorpay
    // 2. Update request: setup_fee_paid = true
    // 3. Update tenant: is_rebranded = true, apply branding
    // 4. Update status to 'completed'
    // 5. Send confirmation email to tenant
  }

  // Get pending requests (super admin)
  async getPendingRequests(): Promise<RebrandRequest[]> {
    // Fetch all pending requests with tenant details
  }
}
```

### Workflow Diagram

```
Tenant Dashboard                    BRTNeura Super Admin
     |                                      |
     |-- Submit Rebrand Request -->          |
     |   (brand name, logo, colors)         |
     |                                      |
     |                          <-- Email notification
     |                          <-- Dashboard badge (+1)
     |                                      |
     |                              Review Request
     |                                  |
     |                          +-------+-------+
     |                          |               |
     |                       Approve          Reject
     |                          |               |
     |   <-- "Approved! Pay     |    <-- "Rejected: reason"
     |       INR 9,999"         |
     |                          |
     |-- Pay Setup Fee -------->|
     |   (Razorpay checkout)    |
     |                          |
     |   <-- Branding Applied   |
     |   <-- "Go live!"         |
     |                          |
     v                          v
  Form shows custom branding
```

### Tenant Dashboard UI

```
Settings > Request Rebrand

+------------------------------------------+
|  Request Custom Branding                  |
|                                          |
|  Brand Name: [_______________]           |
|  Logo:       [Upload] [Preview]          |
|  Primary:    [#color picker]             |
|  Secondary:  [#color picker]             |
|  Favicon:    [Upload] [Preview]          |
|  Domain:     [custom.domain.com]         |
|                                          |
|  One-time setup fee: INR 9,999           |
|  (Charged after admin approval)          |
|                                          |
|  [Submit Request]                        |
+------------------------------------------+

Status Tracking:
  Pending    -> "Under review by BRTNeura team"
  Approved   -> "Approved! Complete payment to activate"  [Pay Now]
  Rejected   -> "Request declined: {reason}"  [Resubmit]
  Completed  -> "Custom branding is live!"
```

### Admin Notification System

```typescript
// notifications table
CREATE TABLE admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(50) NOT NULL,        -- rebrand_request | subscription_event | etc
  title VARCHAR(255) NOT NULL,
  message TEXT,
  tenant_id UUID REFERENCES tenants(id),
  reference_id UUID,                -- ID of related record
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

// Super admin header shows unread count badge
// Click opens notification dropdown
// Each notification links to relevant section
```

---

## 2.2 Referral Program — "BRTNeura Growth Partners"

### Database Tables

```sql
-- Referral tracking
CREATE TABLE referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_tenant_id UUID NOT NULL REFERENCES tenants(id),
  referred_tenant_id UUID NOT NULL REFERENCES tenants(id),
  referral_code VARCHAR(20) NOT NULL,

  -- Commission
  commission_percent DECIMAL(5,2) DEFAULT 10.00,
  total_commission_earned INTEGER DEFAULT 0,  -- in paise, lifetime
  total_commission_paid INTEGER DEFAULT 0,    -- in paise, paid out

  status VARCHAR(20) DEFAULT 'active',  -- active | churned | migrated
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_referrals_referrer ON referrals(referrer_tenant_id);
CREATE INDEX idx_referrals_referred ON referrals(referred_tenant_id);

-- Commission ledger (every subscription charge generates an entry)
CREATE TABLE commission_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id UUID NOT NULL REFERENCES referrals(id),
  referrer_tenant_id UUID NOT NULL REFERENCES tenants(id),
  subscription_payment_id VARCHAR(255),
  payment_amount INTEGER NOT NULL,       -- original payment in paise
  commission_percent DECIMAL(5,2) NOT NULL,
  commission_amount INTEGER NOT NULL,    -- commission in paise
  status VARCHAR(20) DEFAULT 'pending',  -- pending | approved | paid
  paid_at TIMESTAMPTZ,
  payout_reference VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_commission_ledger_referrer ON commission_ledger(referrer_tenant_id);

-- Referral clicks tracking
CREATE TABLE referral_clicks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_code VARCHAR(20) NOT NULL,
  referrer_tenant_id UUID NOT NULL REFERENCES tenants(id),
  ip_address INET,
  user_agent TEXT,
  converted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY referrer_access ON referrals
  USING (referrer_tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
CREATE POLICY referrer_commission ON commission_ledger
  USING (referrer_tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
```

### Backend Implementation

```
backend/src/
  services/referral.service.ts
  controllers/referral.controller.ts
  routes/referral.routes.ts
```

#### `referral.service.ts` — Key Methods

```typescript
class ReferralService {
  // Generate unique referral code for tenant
  async generateReferralCode(tenantId: string): Promise<string> {
    // Generate 8-char alphanumeric code
    // Store in tenants.referral_code
    // Return code
  }

  // Track referral click
  async trackClick(referralCode: string, ip: string, userAgent: string): Promise<void> {
    // Insert referral_clicks record
  }

  // Process referral on new signup
  async processReferral(referralCode: string, newTenantId: string): Promise<void> {
    // 1. Find referrer tenant by code
    // 2. Create referrals record
    // 3. Determine commission tier based on referrer's total referrals
    // 4. Mark click as converted
    // 5. Send notification to referrer
  }

  // Record commission on subscription payment
  async recordCommission(referredTenantId: string, paymentAmount: number): Promise<void> {
    // 1. Find active referral for this tenant
    // 2. Calculate commission based on tier
    // 3. Insert commission_ledger entry
    // 4. Update referrals.total_commission_earned
  }

  // Get referral dashboard data for tenant
  async getReferralStats(tenantId: string): Promise<ReferralDashboard> {
    // Total referrals, active, churned
    // Total earnings (lifetime, pending, paid)
    // Click-through rate
    // Recent referrals list
    // Commission tier info
  }

  // Process payout (super admin)
  async processPayout(referrerId: string, amount: number, reference: string): Promise<void> {
    // 1. Update commission_ledger entries as 'paid'
    // 2. Update referrals.total_commission_paid
    // 3. Send payout confirmation email
  }
}
```

### Commission Tier Logic

```typescript
function getCommissionTier(totalReferrals: number): { percent: number; tier: string } {
  if (totalReferrals >= 16) return { percent: 15, tier: 'Platinum' };
  if (totalReferrals >= 6)  return { percent: 12, tier: 'Gold' };
  return { percent: 10, tier: 'Silver' };
}
```

### Tenant Dashboard — Referral Section

```
Referral Program
+--------------------------------------------------+
|                                                    |
|  Your Referral Link:                               |
|  +---------------------------------------------+  |
|  | https://app.brtneura.com/signup?ref=ACME2024 |  |
|  +---------------------------------------------+  |
|  [Copy Link]  [Share on WhatsApp]  [Email]         |
|                                                    |
|  +-----------+  +-----------+  +-----------+       |
|  | Referrals |  | Earnings  |  | Tier      |       |
|  |    12     |  | INR 8,400 |  | GOLD      |       |
|  |  active   |  | lifetime  |  | 12% comm  |       |
|  +-----------+  +-----------+  +-----------+       |
|                                                    |
|  Tier Progress:                                    |
|  Silver(10%) ===== Gold(12%) ===> Platinum(15%)    |
|                    ^ You are here (12/16)          |
|                                                    |
|  Recent Referrals:                                 |
|  +------+----------+--------+---------+            |
|  | Name | Plan     | Status | Earned  |            |
|  +------+----------+--------+---------+            |
|  | Acme | ScaleUp  | Active | INR 960 |            |
|  | Beta | LaunchPad| Active | INR 360 |            |
|  +------+----------+--------+---------+            |
|                                                    |
|  Pending Payout: INR 2,400  [Request Payout]       |
|                                                    |
+--------------------------------------------------+
```

---

## 2.3 Flyer Generator

### Overview

Tenants can generate event flyers using data already configured in their site settings (event name, date, venue, speakers, pricing). Multiple templates available.

### Frontend: `frontend/dashboard/flyers/`

```
frontend/dashboard/
  js/
    flyer-generator.js    -- Flyer creation logic
```

### Templates

```
Template 1: "Professional" — Clean corporate look
  - Header: Event name + date
  - Body: Key speakers with photos
  - Footer: Pricing tiers + QR code to registration form
  - Colors: Tenant's brand colors

Template 2: "Bold" — High-impact design
  - Full-width hero with event name
  - Speaker grid (2x2)
  - Pricing comparison table
  - CTA: "Register Now" + QR code

Template 3: "Minimal" — Simple and elegant
  - Centered layout
  - Event details in clean typography
  - Single speaker highlight
  - QR code prominent

Template 4: "Social" — Optimized for social media (1080x1080)
  - Instagram/LinkedIn post format
  - Bold text, minimal details
  - Swipeable carousel (3 slides)
```

### Implementation Approach

#### Option A: Client-Side (MVP) — html2canvas

```typescript
// flyer-generator.js

class FlyerGenerator {
  constructor(tenantConfig) {
    this.config = tenantConfig;
  }

  // Render flyer in hidden div
  renderTemplate(templateId) {
    const container = document.getElementById('flyer-canvas');
    container.innerHTML = this.getTemplateHTML(templateId);
    this.applyBranding(container);
    this.populateData(container);
  }

  // Populate with site settings data
  populateData(container) {
    // Event name, date, venue from settings
    // Speaker photos and names from guests
    // Pricing from tier config
    // QR code from tenant's registration URL
  }

  // Generate image
  async generateImage(format = 'png') {
    const canvas = await html2canvas(document.getElementById('flyer-canvas'), {
      width: 1080,
      height: 1920,  // or 1080 for social
      scale: 2
    });
    return canvas.toDataURL(`image/${format}`);
  }

  // Download
  async download(templateId, format = 'png') {
    this.renderTemplate(templateId);
    const dataUrl = await this.generateImage(format);
    const link = document.createElement('a');
    link.download = `event-flyer-${templateId}.${format}`;
    link.href = dataUrl;
    link.click();
  }
}
```

#### Option B: Server-Side (Scale) — Puppeteer + Sharp

```typescript
// backend/src/services/flyer.service.ts

class FlyerService {
  async generateFlyer(tenantId: string, templateId: string): Promise<Buffer> {
    // 1. Fetch tenant config, guests, settings
    // 2. Render HTML template with data
    // 3. Use Puppeteer to screenshot as PNG
    // 4. Optimize with Sharp
    // 5. Store in Supabase Storage
    // 6. Return URL
  }
}
```

### Database

```sql
CREATE TABLE flyers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  template_id VARCHAR(50) NOT NULL,
  template_data JSONB,           -- snapshot of settings used
  generated_image_url TEXT,
  format VARCHAR(10) DEFAULT 'png',
  dimensions VARCHAR(20),        -- '1080x1920', '1080x1080'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE flyers ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_flyers ON flyers
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID);
```

### Flyer Generator UI

```
Flyer Generator
+--------------------------------------------------+
|                                                    |
|  Choose Template:                                  |
|  +--------+  +--------+  +--------+  +--------+  |
|  |  Prof  |  |  Bold  |  |  Mini  |  | Social |  |
|  | [img]  |  | [img]  |  | [img]  |  | [img]  |  |
|  +--------+  +--------+  +--------+  +--------+  |
|                                                    |
|  Format:  ( ) Portrait (1080x1920)                 |
|           ( ) Square (1080x1080)                   |
|           ( ) Landscape (1920x1080)                |
|                                                    |
|  Data Source: (auto-filled from your settings)     |
|  +---------------------------------------------+  |
|  | Event: AI for MSME Summit 2026              |  |
|  | Date: Feb 21, 2026                          |  |
|  | Venue: CPR, Pune                            |  |
|  | Speakers: Dr. Swaroop, Ms. Priya (3 more)   |  |
|  | Tiers: VIP INR 2,499 | Std INR 1,499       |  |
|  +---------------------------------------------+  |
|  [Edit Data Before Generating]                     |
|                                                    |
|  +---------------------------------------------+  |
|  |                                             |  |
|  |          [LIVE PREVIEW]                     |  |
|  |                                             |  |
|  +---------------------------------------------+  |
|                                                    |
|  [Download PNG]  [Download PDF]  [Save to Gallery] |
|                                                    |
+--------------------------------------------------+
```

---

## 2.4 White-Label Email Templates

### Overview

Replace BRTNeura branding in transactional emails with tenant's branding (for ScaleUp Pro plan).

### Email Types

| Email | Trigger | Content |
|-------|---------|---------|
| Welcome | Tenant signs up | "Welcome to {platform_name}" |
| Registration Confirmation | Attendee registers | "You're registered for {event_name}" |
| Payment Receipt | Payment verified | "Payment confirmed — {amount}" |
| Recovery Link | Abandoned payment | "Complete your registration" |
| Waitlist Confirmation | Joins waitlist | "You're on the waitlist" |
| Subscription Invoice | Monthly charge | "Invoice for {month}" |
| Trial Expiring | 3 days before trial end | "Your trial ends in 3 days" |
| Subscription Cancelled | Cancellation | "Subscription cancelled" |

### Database

```sql
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),  -- NULL = default BRTNeura template
  template_type VARCHAR(50) NOT NULL,     -- welcome | registration_confirmation | etc
  subject VARCHAR(255) NOT NULL,
  html_body TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, template_type)
);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_emails ON email_templates
  USING (tenant_id = (auth.jwt() ->> 'tenant_id')::UUID OR tenant_id IS NULL);
```

### Template Variables

```
Available in all templates:
  {{tenant_name}}         -- Tenant's company name
  {{tenant_logo_url}}     -- Tenant's logo
  {{primary_color}}       -- Brand primary color
  {{secondary_color}}     -- Brand secondary color
  {{event_name}}          -- Event name from settings
  {{event_date}}          -- Event date
  {{event_venue}}         -- Event venue
  {{support_email}}       -- Tenant's support email
  {{registration_url}}    -- Tenant's registration form URL

Per-email variables:
  {{attendee_name}}       -- Registrant's name
  {{attendee_email}}      -- Registrant's email
  {{tier_name}}           -- VIP / Standard / Basic
  {{amount}}              -- Payment amount
  {{payment_id}}          -- Razorpay payment ID
  {{recovery_link}}       -- Recovery payment URL
  {{qr_code_url}}         -- QR code image URL
```

### Service Changes

```typescript
// Update email.service.ts

class EmailService {
  async sendEmail(tenantId: string, templateType: string, to: string, variables: Record<string, string>) {
    // 1. Fetch tenant-specific template (if exists)
    // 2. Fall back to default BRTNeura template
    // 3. Replace all {{variable}} placeholders
    // 4. Inject tenant branding (logo, colors)
    // 5. Send via MSG91
  }

  // Tenant can preview template
  async previewTemplate(tenantId: string, templateType: string): Promise<string> {
    // Render with sample data
  }

  // Tenant can customize template (ScaleUp Pro only)
  async updateTemplate(tenantId: string, templateType: string, subject: string, htmlBody: string): Promise<void> {
    // Upsert email_templates record
  }
}
```

---

## 2.5 API Rate Limiting Per Tier

### Configuration

```typescript
const RATE_LIMITS = {
  trial: {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    max: 50,
    registrationsPerMonth: 50
  },
  launchpad: {
    windowMs: 15 * 60 * 1000,
    max: 100,
    registrationsPerMonth: 500
  },
  scaleup_pro: {
    windowMs: 15 * 60 * 1000,
    max: 500,
    registrationsPerMonth: -1  // unlimited
  }
};
```

### Middleware: `tenantRateLimiter.ts`

```typescript
import rateLimit from 'express-rate-limit';

export const tenantRateLimiter = async (req: TenantRequest, res: Response, next: NextFunction) => {
  const tenantId = req.tenantId;

  // Fetch tenant's subscription plan
  const tenant = await tenantService.getById(tenantId);
  const limits = RATE_LIMITS[tenant.subscription_plan] || RATE_LIMITS.trial;

  // Apply rate limit
  const limiter = rateLimit({
    windowMs: limits.windowMs,
    max: limits.max,
    keyGenerator: () => tenantId,  // Rate limit per tenant, not per IP
    message: {
      error: 'Rate limit exceeded',
      plan: tenant.subscription_plan,
      upgrade_url: `/dashboard/subscription`
    }
  });

  limiter(req, res, next);
};
```

### Registration Limit Check

```typescript
// In registration.service.ts — before creating registration

async checkRegistrationLimit(tenantId: string): Promise<void> {
  const tenant = await tenantService.getById(tenantId);
  const limits = RATE_LIMITS[tenant.subscription_plan];

  if (limits.registrationsPerMonth === -1) return; // unlimited

  const thisMonth = new Date();
  thisMonth.setDate(1);
  thisMonth.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('registrations')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', thisMonth.toISOString());

  if (count >= limits.registrationsPerMonth) {
    throw new AppError(
      `Registration limit reached (${count}/${limits.registrationsPerMonth}). Upgrade your plan for more.`,
      429,
      'REGISTRATION_LIMIT_EXCEEDED'
    );
  }
}
```

---

## 2.6 Implementation Checklist

### Week 1: Rebrand Flow

- [ ] Create `rebrand_requests` table migration
- [ ] Create `admin_notifications` table migration
- [ ] Implement `rebrand.service.ts`
- [ ] Implement rebrand controller and routes
- [ ] Build rebrand request form in tenant dashboard
- [ ] Build rebrand approval UI in super admin
- [ ] Implement notification system (email + dashboard badge)
- [ ] Implement setup fee payment flow
- [ ] Test end-to-end: request -> approve -> pay -> apply branding

### Week 2: Referral Program

- [ ] Create `referrals`, `commission_ledger`, `referral_clicks` tables
- [ ] Implement `referral.service.ts`
- [ ] Add referral code generation to tenant onboarding
- [ ] Track referral clicks on signup page
- [ ] Auto-create referral on successful signup with code
- [ ] Commission calculation on subscription payments
- [ ] Build referral dashboard in tenant panel
- [ ] Build referral management in super admin
- [ ] Payout tracking and processing

### Week 3: Flyer Generator + Emails

- [ ] Create `flyers` table migration
- [ ] Design 4 flyer templates (HTML/CSS)
- [ ] Implement client-side flyer generation (html2canvas)
- [ ] Build flyer generator UI in tenant dashboard
- [ ] QR code generation for registration URL
- [ ] Create `email_templates` table migration
- [ ] Design default email templates (6 types)
- [ ] Implement template variable replacement in email service
- [ ] Build email template preview in tenant dashboard
- [ ] Template customization UI (ScaleUp Pro only)

### Week 4: Rate Limiting + Testing

- [ ] Implement `tenantRateLimiter` middleware
- [ ] Add registration limit checks
- [ ] Usage tracking and display in dashboard
- [ ] Limit exceeded notifications
- [ ] Integration testing for all Phase 2 features
- [ ] Security testing (cross-tenant access attempts)
- [ ] Performance testing under load

---

## Dependencies

| Dependency | Purpose | Install |
|-----------|---------|---------|
| html2canvas | Client-side flyer generation | CDN link |
| qrcode | QR code for flyers | Already installed |

## Risks

| Risk | Mitigation |
|------|-----------|
| Flyer template quality | Hire designer for templates, iterate based on feedback |
| Commission calculation accuracy | Audit trail in ledger, reconciliation script |
| Email deliverability per tenant | Use shared MSG91 domain initially, custom domains later |
| Rate limit bypass | Server-side enforcement, not client-side |
