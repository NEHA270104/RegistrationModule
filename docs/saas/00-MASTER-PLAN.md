# BRTNeura Registration Form — SaaS Transformation Master Plan

## Vision

Transform the BRTNeura Registration Form from a single-event product into a multi-tenant SaaS platform sold through **Agent Studio** (agentstudio.brtneura.com). Partners and customers can white-label, customize, and deploy registration forms for their own events — all managed through a dedicated tenant dashboard.

---

## Architecture Overview

```
+-------------------------------------------------------+
|              BRTNeura Super Admin                      |
|  (agentstudio.brtneura.com/super-admin)               |
|  - Audit all tenants         - Approve rebrands       |
|  - Manage subscriptions      - Partner analytics      |
|  - Revenue dashboard         - Churn management       |
+---------------------------+---------------------------+
                            |
         +------------------+------------------+
         |                  |                  |
    +----v----+       +-----v-----+      +-----v-----+
    |Tenant A |       | Tenant B  |      | Tenant C  |
    |Partner  |       | Direct    |      | Partner   |
    |+Referral|       | Customer  |      |           |
    +---------+       +-----------+      +-----------+
    Has sub-customers  Self-managed       Self-managed
```

### Multi-Tenancy Model

- **Single Supabase project**, shared database
- Every table gets `tenant_id UUID` column
- **Row-Level Security (RLS)** policies enforce data isolation
- BRTNeura super-admin uses `service_role` key for cross-tenant access
- Each tenant gets JWT-based auth with `tenant_id` embedded in claims

### Tech Stack (Additions to Existing)

| Layer | Current | SaaS Addition |
|-------|---------|---------------|
| Auth | API Key (X-API-Key) | Supabase Auth + JWT + tenant scoping |
| Database | Supabase (single tenant) | Supabase (multi-tenant with RLS) |
| Payments | Razorpay (one-time) | Razorpay Subscriptions API |
| Email | MSG91 | MSG91 with per-tenant templates |
| Frontend | Vanilla HTML/JS | Tenant dashboard SPA (same stack) |
| Flyers | N/A | html2canvas / server-side Sharp |
| Integration | N/A | Agent Studio SSO + marketplace |

---

## Subscription Plans

### "LaunchPad" (Starter)

| | Monthly | Yearly (20% off) |
|---|---|---|
| **Price** | INR 2,999/mo | INR 28,790/yr (~INR 2,399/mo) |

**Includes:**
- Registration form deployment
- Basic admin dashboard
- Email notifications (BRTNeura branded)
- Up to 500 registrations/month
- Standard support (email, 48hr SLA)
- BRTNeura branding on form

### "ScaleUp Pro" (Growth)

| | Monthly | Yearly (20% off) |
|---|---|---|
| **Price** | INR 7,999/mo | INR 76,790/yr (~INR 6,399/mo) |

**Includes:**
- Everything in LaunchPad
- Unlimited registrations
- Flyer generator (all templates)
- AI-powered content generation
- Custom domain support
- White-label email templates
- Referral program access
- Priority support (chat, 12hr SLA)
- API access for integrations

### Rebrand Add-On

- **One-time fee:** INR 9,999
- Requires admin approval
- Custom logo, colors, domain, removal of BRTNeura branding

---

## Referral Program — "BRTNeura Growth Partners"

| Tier | Referrals | Commission | Perks |
|------|-----------|------------|-------|
| **Silver** | 1-5 | 10% recurring | Referral dashboard |
| **Gold** | 6-15 | 12% recurring | + Co-marketing, badge |
| **Platinum** | 16+ | 15% recurring | + Featured on website, priority support |

- Commission is **recurring** for the lifetime of the referred subscription
- Minimum payout threshold: INR 1,000
- Tracked via unique referral codes per tenant

---

## Phase Breakdown

| Phase | Focus | Duration | Doc |
|-------|-------|----------|-----|
| **Phase 1** | Foundation — Multi-tenancy, Auth, Tenant Dashboard, Subscriptions | 4-6 weeks | [Phase 1](./01-PHASE-1-FOUNDATION.md) |
| **Phase 2** | Core SaaS — Rebrand flow, Referrals, Flyers, White-label emails, Rate limits | 3-4 weeks | [Phase 2](./02-PHASE-2-CORE-SAAS.md) |
| **Phase 3** | Agent Studio Integration — Marketplace, SSO, Embedded dashboard | 2-3 weeks | [Phase 3](./03-PHASE-3-AGENT-STUDIO.md) |
| **Phase 4** | Polish & Scale — Audit logs, Churn protection, Analytics, Custom domains | 2-3 weeks | [Phase 4](./04-PHASE-4-POLISH-SCALE.md) |

---

## Database Schema Reference

Full schema with all new tables, columns, RLS policies, and migrations:
[Database Schema](./05-DATABASE-SCHEMA.md)

---

## Key Decisions

1. **Single DB vs DB-per-tenant:** Single DB with RLS — simpler to manage, lower cost, Supabase-native
2. **Auth provider:** Supabase Auth (email/password + Google OAuth) — built-in, JWT-native
3. **Subscription billing:** Razorpay Subscriptions API — already integrated for payments
4. **Flyer generation:** Client-side html2canvas for MVP, server-side Sharp/Puppeteer for scale
5. **Tenant isolation:** RLS policies on every table, `tenant_id` foreign key
6. **Agent Studio integration:** OAuth2/SSO for seamless login, iframe embed for dashboard

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Data leak between tenants | RLS policies + integration tests per migration |
| Subscription payment failure | Grace period (7 days) + email reminders + auto-downgrade |
| Partner churn | Migration path: sub-customers offered direct BRTNeura subscription |
| Abuse / overuse | Rate limiting per tier + usage monitoring + alerts |
| Rebrand abuse | Approval workflow + one-time fee + legal agreement |
