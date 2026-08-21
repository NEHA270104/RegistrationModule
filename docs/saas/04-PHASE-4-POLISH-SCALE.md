# Phase 4 — Polish & Scale (2-3 Weeks)

Audit Logging, Churn Protection, Partner Analytics, Custom Domains, Legal

---

## Objectives

- Comprehensive audit logging for compliance and debugging
- Churn protection with sub-customer migration path
- Advanced analytics dashboard for partners and super admin
- Custom domain support with DNS verification
- Legal framework: ToS, DPA, Partner Agreement

---

## 4.1 Audit Logging

### Why

- BRTNeura admin must audit tenant actions for compliance
- Tenants need activity history for their own records
- Security incident investigation
- Data processing agreement compliance (who accessed what, when)

### Database

```sql
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),  -- NULL for super-admin actions

  -- Who
  actor_id UUID,                          -- User who performed action
  actor_email VARCHAR(255),
  actor_role VARCHAR(20),                 -- tenant_admin | super_admin | system

  -- What
  action VARCHAR(50) NOT NULL,            -- create | read | update | delete | login | export
  resource_type VARCHAR(50) NOT NULL,     -- registration | guest | setting | subscription | rebrand
  resource_id UUID,

  -- Context
  ip_address INET,
  user_agent TEXT,
  metadata JSONB,                         -- Additional context (old_value, new_value, etc)

  -- When
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_audit_tenant ON audit_log(tenant_id, created_at DESC);
CREATE INDEX idx_audit_action ON audit_log(action, resource_type);
CREATE INDEX idx_audit_actor ON audit_log(actor_id);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- Partition by month for performance (optional, for scale)
-- CREATE TABLE audit_log_2026_03 PARTITION OF audit_log
--   FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
```

### Audit Middleware

```typescript
// middleware/audit.ts

import { TenantRequest } from './tenantAuth';

interface AuditEntry {
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, any>;
}

export function auditLog(entry: AuditEntry) {
  return async (req: TenantRequest, res: Response, next: NextFunction) => {
    // Capture response to log after completion
    const originalJson = res.json.bind(res);
    res.json = (body: any) => {
      // Log async — don't block the response
      logAuditEntry({
        tenant_id: req.tenantId,
        actor_id: req.userId,
        actor_email: req.userEmail,
        actor_role: req.userRole,
        action: entry.action,
        resource_type: entry.resourceType,
        resource_id: entry.resourceId || body?.id || req.params.id,
        ip_address: req.ip,
        user_agent: req.get('user-agent'),
        metadata: {
          ...entry.metadata,
          status_code: res.statusCode,
          method: req.method,
          path: req.originalUrl,
        },
      }).catch(err => logger.error('Audit log failed:', err));

      return originalJson(body);
    };
    next();
  };
}

async function logAuditEntry(entry: any): Promise<void> {
  await supabaseAdmin
    .from('audit_log')
    .insert(entry);
}
```

### Usage in Routes

```typescript
// routes/tenant.routes.ts

router.post('/t/:slug/guests',
  tenantAuth,
  auditLog({ action: 'create', resourceType: 'guest' }),
  guestController.create
);

router.delete('/t/:slug/guests/:id',
  tenantAuth,
  auditLog({ action: 'delete', resourceType: 'guest' }),
  guestController.delete
);

router.post('/t/:slug/settings/:key',
  tenantAuth,
  auditLog({ action: 'update', resourceType: 'setting' }),
  settingsController.update
);
```

### Auditable Actions

| Action | Resource | Logged When |
|--------|----------|-------------|
| login | auth | User logs in |
| logout | auth | User logs out |
| create | registration | New registration created |
| update | registration | Registration status changed |
| export | registration | Data exported to CSV/Excel |
| create | guest | Guest speaker added |
| update | guest | Guest speaker modified |
| delete | guest | Guest speaker removed |
| update | setting | Site setting changed |
| create | subscription | New subscription created |
| update | subscription | Plan changed |
| cancel | subscription | Subscription cancelled |
| submit | rebrand_request | Rebrand request submitted |
| approve | rebrand_request | Super admin approved rebrand |
| reject | rebrand_request | Super admin rejected rebrand |
| generate | api_key | New API key generated |
| revoke | api_key | API key revoked |
| generate | flyer | Flyer generated |
| impersonate | tenant | Super admin impersonated tenant |

### Super Admin Audit View

```
Audit Log
+------+------------+--------+----------+----------+----------+
| Time | Tenant     | Actor  | Action   | Resource | Details  |
+------+------------+--------+----------+----------+----------+
| 2:30 | Acme Corp  | admin  | update   | setting  | {key:..} |
| 2:28 | Beta Inc   | admin  | create   | guest    | id:xyz.. |
| 2:25 | --         | super  | approve  | rebrand  | #req-123 |
| 2:20 | Acme Corp  | system | create   | registr  | email:.. |
+------+------------+--------+----------+----------+----------+

Filters: [Tenant v] [Action v] [Resource v] [Date Range] [Search]
```

---

## 4.2 Churn Protection

### Problem

When a partner (tenant) cancels their subscription, their sub-customers (registered attendees, configured events) are affected.

### Churn Flow

```
Tenant cancels subscription
         |
         v
Status: 'cancelling' (grace period: 30 days)
         |
         ├── Day 0:  Cancellation confirmation email to tenant
         ├── Day 7:  Reminder email: "Your data will be archived in 23 days"
         ├── Day 14: Reminder email: "2 weeks left — export your data"
         ├── Day 21: Final warning: "7 days left"
         |
         v
Day 30: Deactivation
         |
         ├── Registration form goes offline (shows "Event ended" page)
         ├── Dashboard becomes read-only
         ├── Data is NOT deleted (retained for 90 days)
         |
         v
If sub-customers exist:
         |
         ├── Email each registered attendee:
         |   "The event organizer's subscription has ended.
         |    Your registration data is safe.
         |    Contact [organizer email] for questions."
         |
         └── Offer direct BRTNeura subscription to tenant
             (at discounted rate for first 3 months)
```

### Database

```sql
-- Track churn lifecycle
ALTER TABLE tenants ADD COLUMN cancellation_requested_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN cancellation_effective_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN data_deletion_scheduled_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN churn_reason TEXT;
ALTER TABLE tenants ADD COLUMN churn_feedback TEXT;

-- Churn prevention offers
CREATE TABLE churn_offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  offer_type VARCHAR(50) NOT NULL,     -- discount | plan_change | pause | feature_unlock
  offer_details JSONB NOT NULL,         -- { discount_percent: 30, months: 3 }
  status VARCHAR(20) DEFAULT 'pending', -- pending | accepted | rejected | expired
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Service Implementation

```typescript
// services/churn.service.ts

class ChurnService {
  // Initiate cancellation (from tenant dashboard)
  async initiateCancellation(tenantId: string, reason: string, feedback: string): Promise<void> {
    // 1. Update tenant: cancellation_requested_at, churn_reason, churn_feedback
    // 2. Set cancellation_effective_at = now + 30 days
    // 3. Set data_deletion_scheduled_at = now + 120 days
    // 4. Send cancellation confirmation email
    // 5. Create churn prevention offer (if eligible)
    // 6. Notify super admin
    // 7. Schedule reminder emails (day 7, 14, 21)
  }

  // Generate churn prevention offer
  async createRetentionOffer(tenantId: string): Promise<ChurnOffer> {
    const tenant = await tenantService.getById(tenantId);
    const tenure = monthsBetween(tenant.created_at, new Date());

    // Long-term customers get better offers
    if (tenure >= 12) {
      return { type: 'discount', details: { percent: 50, months: 3 } };
    } else if (tenure >= 6) {
      return { type: 'discount', details: { percent: 30, months: 2 } };
    } else {
      return { type: 'pause', details: { months: 1 } }; // 1 month free pause
    }
  }

  // Tenant accepts retention offer (cancels the cancellation)
  async acceptRetentionOffer(tenantId: string, offerId: string): Promise<void> {
    // 1. Apply discount to subscription
    // 2. Clear cancellation dates
    // 3. Update offer status to 'accepted'
    // 4. Reactivate tenant
  }

  // Scheduled job: process cancellations
  async processScheduledCancellations(): Promise<void> {
    const expiredTenants = await supabaseAdmin
      .from('tenants')
      .select('*')
      .lte('cancellation_effective_at', new Date().toISOString())
      .eq('subscription_status', 'cancelling');

    for (const tenant of expiredTenants.data) {
      await this.deactivateTenant(tenant.id);
    }
  }

  // Deactivate tenant
  async deactivateTenant(tenantId: string): Promise<void> {
    // 1. Set subscription_status to 'cancelled'
    // 2. Set is_active to false
    // 3. Cancel Razorpay subscription
    // 4. Notify registered attendees
    // 5. Archive tenant data
    // 6. Log to audit
  }

  // Data deletion (90 days after deactivation)
  async processScheduledDeletions(): Promise<void> {
    const deletionCandidates = await supabaseAdmin
      .from('tenants')
      .select('*')
      .lte('data_deletion_scheduled_at', new Date().toISOString())
      .eq('is_active', false);

    for (const tenant of deletionCandidates.data) {
      // Soft delete: anonymize PII, keep aggregate stats
      await this.anonymizeTenantData(tenant.id);
    }
  }
}
```

### Cancellation UI (Tenant Dashboard)

```
Cancel Subscription
+--------------------------------------------------+
|                                                    |
|  We're sorry to see you go.                       |
|                                                    |
|  Why are you cancelling?                           |
|  ( ) Too expensive                                 |
|  ( ) Missing features I need                       |
|  ( ) Found a better alternative                    |
|  ( ) No longer organizing events                   |
|  ( ) Other: [_______________]                      |
|                                                    |
|  Any additional feedback?                          |
|  [                                    ]            |
|                                                    |
|  What happens next:                                |
|  - Your form stays live for 30 more days          |
|  - Download your data anytime during this period  |
|  - Data retained for 90 days after deactivation   |
|  - You can reactivate anytime                     |
|                                                    |
|  [Cancel Subscription]    [Keep My Subscription]  |
|                                                    |
+--------------------------------------------------+

After clicking Cancel:
+--------------------------------------------------+
|  Wait — we have an offer for you!                 |
|                                                    |
|  Get 30% off for the next 3 months.               |
|  That's just INR 2,099/mo for ScaleUp Pro.        |
|                                                    |
|  [Accept Offer]    [No thanks, cancel]            |
+--------------------------------------------------+
```

---

## 4.3 Partner Analytics Dashboard

### Super Admin Analytics

```
Global Analytics
+--------------------------------------------------+
|                                                    |
|  Revenue                                           |
|  +----------------------------------------------+ |
|  |  MRR: INR 1,45,000                           | |
|  |  ARR: INR 17,40,000                          | |
|  |  [Line chart: MRR over last 12 months]       | |
|  +----------------------------------------------+ |
|                                                    |
|  Tenants                                           |
|  +--------+  +--------+  +--------+  +--------+  |
|  | Total  |  | Active |  | Trial  |  |Churned |  |
|  |   48   |  |   32   |  |   12   |  |    4   |  |
|  +--------+  +--------+  +--------+  +--------+  |
|                                                    |
|  [Bar chart: signups per month]                   |
|  [Pie chart: plan distribution]                   |
|                                                    |
|  Top Performing Tenants:                           |
|  +------+----------+---------+--------+           |
|  | Rank | Tenant   | Regs    | Revenue|           |
|  +------+----------+---------+--------+           |
|  | 1    | Acme     | 1,200   | 7,999  |           |
|  | 2    | Beta     | 890     | 7,999  |           |
|  | 3    | Gamma    | 450     | 2,999  |           |
|  +------+----------+---------+--------+           |
|                                                    |
|  Referral Program:                                |
|  - Total referrals: 23                            |
|  - Commission paid: INR 12,400                    |
|  - Top referrer: Acme Corp (8 referrals)          |
|                                                    |
+--------------------------------------------------+
```

### Tenant Analytics (Their Own Dashboard)

```
My Analytics
+--------------------------------------------------+
|                                                    |
|  This Month:                                       |
|  +--------+  +--------+  +--------+  +--------+  |
|  | Regs   |  |Revenue |  |Convert |  |Recovery|  |
|  |  145   |  |2.1L    |  | 68%    |  |  23%   |  |
|  +--------+  +--------+  +--------+  +--------+  |
|                                                    |
|  Registration Trend:                               |
|  [Line chart: daily registrations, last 30 days]  |
|                                                    |
|  Tier Breakdown:                                   |
|  [Horizontal bar: VIP 20%, Standard 55%, Basic 25%]|
|                                                    |
|  Payment Analytics:                                |
|  - Success rate: 92%                              |
|  - Avg. completion time: 4 min 23 sec             |
|  - Abandonment rate: 8%                           |
|  - Recovery rate: 23% of abandoned                |
|                                                    |
|  Usage:                                            |
|  Registrations: 145 / 500 (29% used)              |
|  [===============-------] 29%                     |
|                                                    |
+--------------------------------------------------+
```

### Implementation

```typescript
// services/analytics.service.ts

class AnalyticsService {
  // Tenant-level analytics
  async getTenantAnalytics(tenantId: string, period: string): Promise<TenantAnalytics> {
    // Registrations: count, by tier, by day
    // Revenue: total, by tier
    // Conversion: orders created vs payments confirmed
    // Recovery: abandoned vs recovered
    // Usage: registrations vs plan limit
  }

  // Super admin global analytics
  async getGlobalAnalytics(period: string): Promise<GlobalAnalytics> {
    // MRR/ARR calculation from active subscriptions
    // Tenant counts: total, active, trial, churned
    // Signup trend: new tenants per month
    // Plan distribution: launchpad vs scaleup_pro
    // Top tenants by registrations and revenue
    // Referral program stats
    // Churn rate
  }

  // Cohort analysis (super admin)
  async getCohortAnalysis(): Promise<CohortData> {
    // Group tenants by signup month
    // Track retention over months
    // Identify at-risk tenants (low usage)
  }
}
```

---

## 4.4 Custom Domain Support

### Flow

```
Tenant (ScaleUp Pro) requests custom domain
         |
         v
Dashboard: Settings > Custom Domain
  Enter: events.acmecorp.com
         |
         v
System shows DNS instructions:
  "Add a CNAME record pointing to app.brtneura.com"
  Type: CNAME
  Name: events
  Value: app.brtneura.com
         |
         v
[Verify DNS] button
         |
         ├── Success: domain_verified = true
         │   - SSL certificate provisioned (Let's Encrypt)
         │   - Form accessible at events.acmecorp.com
         │
         └── Failure: "DNS not yet propagated. Try again in a few minutes."
```

### Database

```sql
ALTER TABLE tenants ADD COLUMN domain_verification_token VARCHAR(64);
ALTER TABLE tenants ADD COLUMN domain_verified_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN ssl_provisioned BOOLEAN DEFAULT false;
```

### Implementation

```typescript
// services/domain.service.ts

class DomainService {
  // Set custom domain
  async setCustomDomain(tenantId: string, domain: string): Promise<DomainSetupInfo> {
    // 1. Validate domain format
    // 2. Check domain not already in use by another tenant
    // 3. Generate verification token
    // 4. Update tenant record
    // 5. Return DNS instructions
  }

  // Verify domain DNS
  async verifyDomain(tenantId: string): Promise<boolean> {
    const tenant = await tenantService.getById(tenantId);
    const domain = tenant.custom_domain;

    // Option 1: CNAME check
    const resolved = await dns.resolveCname(domain);
    const isValid = resolved.includes('app.brtneura.com');

    // Option 2: TXT record check (more secure)
    // const txtRecords = await dns.resolveTxt(`_brtneura.${domain}`);
    // const isValid = txtRecords.flat().includes(tenant.domain_verification_token);

    if (isValid) {
      await supabaseAdmin
        .from('tenants')
        .update({
          domain_verified: true,
          domain_verified_at: new Date().toISOString(),
        })
        .eq('id', tenantId);

      // Trigger SSL provisioning (via Cloud Run domain mapping or Cloudflare)
      await this.provisionSSL(domain);
    }

    return isValid;
  }

  // SSL provisioning
  async provisionSSL(domain: string): Promise<void> {
    // If using Cloud Run: gcloud run domain-mappings create
    // If using Cloudflare: API call to add custom hostname
    // If using Nginx: certbot --nginx -d domain
  }
}
```

### Server-Side Domain Routing

```typescript
// middleware/domainRouter.ts

export const domainRouter = async (req: Request, res: Response, next: NextFunction) => {
  const host = req.hostname;

  // Skip for known domains
  if (host === 'app.brtneura.com' || host === 'localhost') {
    return next();
  }

  // Look up tenant by custom domain
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('slug, domain_verified')
    .eq('custom_domain', host)
    .eq('domain_verified', true)
    .single();

  if (tenant) {
    // Rewrite request to serve tenant's registration form
    req.params.slug = tenant.slug;
    req.url = `/t/${tenant.slug}${req.url}`;
  }

  next();
};
```

---

## 4.5 Legal Framework

### Documents Needed

#### 1. Terms of Service (ToS)

```
Location: /legal/terms-of-service
Display: Onboarding Step 3 (checkbox)
Covers:
  - Service description
  - Acceptable use policy
  - Payment terms
  - Cancellation and refund policy
  - Intellectual property
  - Limitation of liability
  - Governing law (India)
```

#### 2. Data Processing Agreement (DPA)

```
Location: /legal/data-processing-agreement
Display: Onboarding Step 3 (checkbox)
Covers:
  - Data controller vs data processor roles
  - Types of personal data processed
  - Purpose of processing
  - Sub-processors (Supabase, Razorpay, MSG91)
  - Data retention periods
  - Data subject rights
  - Breach notification procedures
  - Data transfer safeguards
  - Audit rights
```

#### 3. Partner Agreement

```
Location: /legal/partner-agreement
Display: When tenant enables referral program
Covers:
  - Partnership scope
  - Commission structure and payment terms
  - Minimum payout threshold
  - Tax obligations (partner's responsibility)
  - Branding guidelines
  - Non-compete clause (limited scope)
  - Termination conditions
  - Commission clawback (if referred customer refunds within 30 days)
```

### Database: Legal Acceptance Tracking

```sql
CREATE TABLE legal_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  document_type VARCHAR(50) NOT NULL,   -- tos | dpa | partner_agreement
  document_version VARCHAR(10) NOT NULL, -- v1.0, v1.1, etc.
  accepted_by_email VARCHAR(255) NOT NULL,
  accepted_at TIMESTAMPTZ DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX idx_legal_tenant ON legal_acceptances(tenant_id);
```

---

## 4.6 Scheduled Jobs

### Cron Jobs to Add

```typescript
// backend/src/jobs/index.ts

import cron from 'node-cron';

// Every hour: Check trial expirations
cron.schedule('0 * * * *', async () => {
  await subscriptionService.processTrialExpirations();
});

// Every 6 hours: Process scheduled cancellations
cron.schedule('0 */6 * * *', async () => {
  await churnService.processScheduledCancellations();
});

// Daily at midnight: Send churn reminder emails
cron.schedule('0 0 * * *', async () => {
  await churnService.sendChurnReminders();
});

// Daily at midnight: Process data deletions
cron.schedule('0 0 * * *', async () => {
  await churnService.processScheduledDeletions();
});

// Weekly: Generate analytics reports
cron.schedule('0 0 * * 1', async () => {
  await analyticsService.generateWeeklyReports();
});

// Daily: Check usage limits and send warnings
cron.schedule('0 9 * * *', async () => {
  await subscriptionService.checkUsageLimits();
});
```

---

## 4.7 Implementation Checklist

### Week 1: Audit Logging & Legal

- [ ] Create `audit_log` table migration
- [ ] Implement audit middleware
- [ ] Add audit logging to all tenant routes
- [ ] Add audit logging to all super admin routes
- [ ] Build audit log viewer in super admin dashboard
- [ ] Build activity log in tenant dashboard
- [ ] Create `legal_acceptances` table migration
- [ ] Draft Terms of Service document
- [ ] Draft Data Processing Agreement
- [ ] Draft Partner Agreement
- [ ] Implement legal acceptance tracking
- [ ] Add legal checkboxes to onboarding

### Week 2: Churn Protection & Analytics

- [ ] Add churn columns to tenants table
- [ ] Create `churn_offers` table migration
- [ ] Implement `churn.service.ts`
- [ ] Build cancellation UI with feedback form
- [ ] Implement retention offer flow
- [ ] Schedule churn processing jobs
- [ ] Sub-customer notification on tenant churn
- [ ] Implement `analytics.service.ts`
- [ ] Build tenant analytics dashboard
- [ ] Build super admin global analytics
- [ ] Revenue charts (MRR, ARR)
- [ ] Tenant leaderboard

### Week 3: Custom Domains & Final Polish

- [ ] Implement `domain.service.ts`
- [ ] Build custom domain setup UI
- [ ] DNS verification endpoint
- [ ] Domain routing middleware
- [ ] SSL provisioning integration
- [ ] Set up scheduled cron jobs
- [ ] End-to-end regression testing
- [ ] Security audit (all phases)
- [ ] Performance testing (50+ tenants)
- [ ] Documentation: API reference
- [ ] Documentation: Tenant user guide
- [ ] Documentation: Super admin guide

---

## Dependencies

| Dependency | Purpose | Install |
|-----------|---------|---------|
| node-cron | Scheduled jobs | `npm install node-cron @types/node-cron` |
| dns (node built-in) | Domain verification | Built-in |

## Risks

| Risk | Mitigation |
|------|-----------|
| Audit log volume | Index optimization, partition by month, retention policy |
| Custom domain SSL delays | Use Cloudflare for instant SSL, or pre-provision |
| Legal document compliance | Consult legal professional for India-specific requirements |
| Churn rate | Monitor metrics, iterate on retention offers |
| Analytics query performance | Materialized views for expensive aggregations |
