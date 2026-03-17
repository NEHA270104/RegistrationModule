# Phase 3 — Agent Studio Integration (2-3 Weeks)

Marketplace Listing, SSO, Embedded Dashboard, Webhooks

---

## Objectives

- List Registration Form as a product on Agent Studio marketplace
- Implement SSO between Agent Studio and Registration Form SaaS
- Embed tenant dashboard within Agent Studio interface
- Set up webhook events for subscription lifecycle
- Enable one-click deployment from Agent Studio

---

## 3.1 Agent Studio Marketplace Listing

### Product Card

```
+--------------------------------------------------+
|  [Registration Form Icon]                         |
|                                                    |
|  Event Registration Form                           |
|  by BRTNeura                                       |
|                                                    |
|  Create professional event registration forms      |
|  with payment processing, seat management,         |
|  flyer generation, and attendee tracking.           |
|                                                    |
|  Features:                                         |
|  - Multi-tier ticketing (VIP, Standard, Basic)    |
|  - Razorpay payment integration                   |
|  - Real-time seat counter                         |
|  - Guest speaker management                       |
|  - AI content generation                          |
|  - Flyer generator                                |
|  - Abandonment recovery                           |
|  - Export to CSV/Excel                            |
|                                                    |
|  Starting at INR 2,999/mo                          |
|  14-day free trial                                 |
|                                                    |
|  [Subscribe]  [Learn More]  [Live Demo]            |
+--------------------------------------------------+
```

### Integration Points with Agent Studio

```
agentstudio.brtneura.com
├── /marketplace
│   └── /registration-form          -- Product listing page
│       ├── [Subscribe] button      -- Redirects to onboarding
│       └── [Live Demo] button      -- Opens demo registration form
├── /dashboard
│   └── /products
│       └── /registration-form      -- Embedded tenant dashboard
└── /api/marketplace
    ├── GET  /products               -- List available products
    ├── GET  /products/:slug         -- Product details
    └── POST /products/:slug/subscribe -- Initiate subscription
```

### Agent Studio API Contract

Agent Studio needs to expose (or we need to integrate with):

```typescript
// What Agent Studio provides
interface AgentStudioAPI {
  // User info (from Agent Studio session)
  getCurrentUser(): { id: string; email: string; name: string; org_id: string };

  // Product subscription
  subscribeToProduct(productSlug: string, planId: string): SubscriptionResult;

  // Navigation
  openProductDashboard(productSlug: string): void;

  // Notifications
  sendNotification(userId: string, notification: Notification): void;
}

// What Registration Form SaaS provides to Agent Studio
interface RegistrationFormAPI {
  // Webhook: subscription events
  POST /webhooks/agent-studio
  Body: {
    event: 'subscription.created' | 'subscription.cancelled' | 'user.updated';
    data: { user_id, org_id, plan, ... };
  }

  // Embed URL for dashboard
  GET /api/embed/dashboard?token={sso_token}
  Returns: HTML page optimized for iframe embedding

  // Product info
  GET /api/product/info
  Returns: { name, description, plans, features }
}
```

---

## 3.2 Single Sign-On (SSO)

### SSO Flow: Agent Studio -> Registration Form

```
User logged in to Agent Studio
         |
         v
Clicks "Registration Form" in products menu
         |
         v
Agent Studio generates SSO token:
  POST agentstudio.brtneura.com/api/sso/token
  Body: { product: 'registration-form', user_id, org_id }
  Response: { sso_token: 'jwt...' }
         |
         v
Redirect to:
  app.brtneura.com/sso/callback?token={sso_token}&redirect=/dashboard
         |
         v
Registration Form validates SSO token:
  1. Verify JWT signature (shared secret or public key)
  2. Extract user_id, org_id, email, name
  3. Find or create tenant matching org_id
  4. Create Supabase Auth session
  5. Redirect to /dashboard with session cookie
         |
         v
User sees their tenant dashboard (no login screen)
```

### Backend Implementation

#### New Files

```
backend/src/
  services/sso.service.ts
  controllers/sso.controller.ts
  routes/sso.routes.ts
  config/agentStudio.ts
```

#### `config/agentStudio.ts`

```typescript
export const agentStudioConfig = {
  // SSO
  ssoSecret: process.env.AGENT_STUDIO_SSO_SECRET,
  ssoIssuer: 'agentstudio.brtneura.com',
  ssoAudience: 'registration-form-saas',

  // API
  apiBaseUrl: process.env.AGENT_STUDIO_API_URL || 'https://agentstudio.brtneura.com/api',
  apiKey: process.env.AGENT_STUDIO_API_KEY,

  // Webhook
  webhookSecret: process.env.AGENT_STUDIO_WEBHOOK_SECRET,
};
```

#### `sso.service.ts`

```typescript
import jwt from 'jsonwebtoken';
import { agentStudioConfig } from '../config/agentStudio';

class SSOService {
  // Validate SSO token from Agent Studio
  validateSSOToken(token: string): SSOPayload {
    const payload = jwt.verify(token, agentStudioConfig.ssoSecret, {
      issuer: agentStudioConfig.ssoIssuer,
      audience: agentStudioConfig.ssoAudience,
    });
    return payload as SSOPayload;
  }

  // Find or create tenant from Agent Studio org
  async findOrCreateTenant(ssoPayload: SSOPayload): Promise<Tenant> {
    // 1. Check if tenant exists with agent_studio_org_id
    let tenant = await tenantService.findByAgentStudioOrg(ssoPayload.org_id);

    if (!tenant) {
      // 2. Create new tenant (auto-provisioning)
      tenant = await tenantService.create({
        name: ssoPayload.org_name,
        email: ssoPayload.email,
        slug: generateSlug(ssoPayload.org_name),
        agent_studio_org_id: ssoPayload.org_id,
        subscription_plan: 'trial',
      });
    }

    return tenant;
  }

  // Create session for tenant user
  async createSession(tenant: Tenant, ssoPayload: SSOPayload): Promise<string> {
    // 1. Find or create Supabase Auth user
    // 2. Set user_metadata with tenant_id
    // 3. Generate session token
    // 4. Return token
  }
}

interface SSOPayload {
  user_id: string;
  org_id: string;
  org_name: string;
  email: string;
  name: string;
  role: string;
  exp: number;
  iss: string;
  aud: string;
}
```

#### SSO Callback Route

```typescript
// routes/sso.routes.ts
router.get('/sso/callback', async (req, res) => {
  const { token, redirect } = req.query;

  // 1. Validate SSO token
  const payload = ssoService.validateSSOToken(token as string);

  // 2. Find or create tenant
  const tenant = await ssoService.findOrCreateTenant(payload);

  // 3. Create session
  const sessionToken = await ssoService.createSession(tenant, payload);

  // 4. Set session cookie and redirect
  res.cookie('session', sessionToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  });

  res.redirect(redirect as string || '/dashboard');
});
```

### Tenant Table Addition

```sql
ALTER TABLE tenants ADD COLUMN agent_studio_org_id VARCHAR(255) UNIQUE;
ALTER TABLE tenants ADD COLUMN agent_studio_user_id VARCHAR(255);
CREATE INDEX idx_tenants_agent_studio ON tenants(agent_studio_org_id);
```

---

## 3.3 Embedded Dashboard

### Iframe Embedding in Agent Studio

```html
<!-- Agent Studio product page -->
<div class="product-container">
  <iframe
    id="reg-form-dashboard"
    src="https://app.brtneura.com/api/embed/dashboard?token={sso_token}"
    style="width: 100%; height: 100%; border: none;"
    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
  ></iframe>
</div>
```

### Embed Mode

Dashboard detects embed mode and adjusts UI:

```typescript
// dashboard.js
const isEmbedded = window.self !== window.top
  || new URLSearchParams(window.location.search).has('embed');

if (isEmbedded) {
  // Hide: top navbar, footer, logout button
  // Adjust: full-width layout, no sidebar (use top tabs instead)
  // Communication: postMessage to parent for navigation
  document.body.classList.add('embedded-mode');
}
```

### PostMessage Communication

```typescript
// Dashboard -> Agent Studio
window.parent.postMessage({
  type: 'registration-form',
  action: 'navigate',
  path: '/subscription/upgrade'
}, 'https://agentstudio.brtneura.com');

window.parent.postMessage({
  type: 'registration-form',
  action: 'notification',
  data: { title: 'New Registration', count: 5 }
}, 'https://agentstudio.brtneura.com');

// Agent Studio -> Dashboard
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://agentstudio.brtneura.com') return;
  if (event.data.action === 'refresh') location.reload();
  if (event.data.action === 'theme') applyTheme(event.data.theme);
});
```

### Embed API Endpoint

```typescript
// GET /api/embed/dashboard
router.get('/api/embed/dashboard', async (req, res) => {
  const { token } = req.query;

  // Validate SSO token
  const payload = ssoService.validateSSOToken(token as string);
  const tenant = await ssoService.findOrCreateTenant(payload);
  const sessionToken = await ssoService.createSession(tenant, payload);

  // Serve dashboard HTML with embedded session
  res.render('dashboard', {
    sessionToken,
    tenantSlug: tenant.slug,
    embedded: true,
  });
});
```

---

## 3.4 Webhook Events

### Registration Form -> Agent Studio Webhooks

Notify Agent Studio of important events:

```typescript
// services/agentStudioWebhook.service.ts

class AgentStudioWebhookService {
  private baseUrl = agentStudioConfig.apiBaseUrl;
  private apiKey = agentStudioConfig.apiKey;

  async notify(event: string, tenantId: string, data: any): Promise<void> {
    const tenant = await tenantService.getById(tenantId);

    await axios.post(`${this.baseUrl}/webhooks/products/registration-form`, {
      event,
      timestamp: new Date().toISOString(),
      tenant: {
        id: tenant.id,
        org_id: tenant.agent_studio_org_id,
        name: tenant.name,
      },
      data,
    }, {
      headers: {
        'X-Webhook-Secret': agentStudioConfig.webhookSecret,
        'Content-Type': 'application/json',
      }
    });
  }

  // Events to emit
  async onSubscriptionCreated(tenantId: string, subscription: any) {
    await this.notify('subscription.created', tenantId, subscription);
  }

  async onSubscriptionCancelled(tenantId: string, reason: string) {
    await this.notify('subscription.cancelled', tenantId, { reason });
  }

  async onRegistrationMilestone(tenantId: string, count: number) {
    await this.notify('registration.milestone', tenantId, { count });
  }

  async onTrialExpiring(tenantId: string, daysLeft: number) {
    await this.notify('trial.expiring', tenantId, { days_left: daysLeft });
  }

  async onUsageLimitApproaching(tenantId: string, usage: UsageStats) {
    await this.notify('usage.limit_approaching', tenantId, usage);
  }
}
```

### Agent Studio -> Registration Form Webhooks

Handle events from Agent Studio:

```typescript
// routes/agentStudio.routes.ts

router.post('/webhooks/agent-studio', verifyAgentStudioWebhook, async (req, res) => {
  const { event, data } = req.body;

  switch (event) {
    case 'org.updated':
      // Update tenant details (name, email)
      await tenantService.updateFromAgentStudio(data.org_id, data);
      break;

    case 'org.deleted':
      // Initiate tenant deactivation + churn flow
      await tenantService.initiateChurn(data.org_id);
      break;

    case 'user.role_changed':
      // Update user permissions
      await authService.updateUserRole(data.user_id, data.new_role);
      break;

    case 'billing.payment_method_updated':
      // Sync payment method
      await subscriptionService.syncPaymentMethod(data.org_id, data);
      break;
  }

  res.json({ received: true });
});
```

---

## 3.5 One-Click Deployment

### From Agent Studio Marketplace

```
User clicks [Subscribe] on marketplace
         |
         v
Agent Studio calls:
  POST /api/provision
  Body: { org_id, org_name, user_email, plan, billing_cycle, referral_code? }
         |
         v
Registration Form SaaS:
  1. Create tenant record
  2. Create Supabase Auth user
  3. Set up default site_settings
  4. Create default seat_inventory (3 tiers)
  5. Start trial / create subscription
  6. Return { tenant_slug, dashboard_url, registration_form_url }
         |
         v
Agent Studio:
  1. Store product activation
  2. Show "Product Activated!" with links
  3. Add to user's product sidebar
```

### Provisioning API

```typescript
// POST /api/provision
router.post('/api/provision', verifyAgentStudioAuth, async (req, res) => {
  const { org_id, org_name, user_email, user_name, plan, billing_cycle, referral_code } = req.body;

  // 1. Create tenant
  const tenant = await tenantService.create({
    name: org_name,
    email: user_email,
    slug: generateSlug(org_name),
    agent_studio_org_id: org_id,
    subscription_plan: plan || 'trial',
  });

  // 2. Create auth user
  const user = await authService.createUser({
    email: user_email,
    name: user_name,
    tenant_id: tenant.id,
    role: 'tenant_admin',
  });

  // 3. Initialize defaults
  await setupService.initializeDefaults(tenant.id);

  // 4. Process referral
  if (referral_code) {
    await referralService.processReferral(referral_code, tenant.id);
  }

  // 5. Create subscription (if not trial)
  let subscription = null;
  if (plan !== 'trial') {
    subscription = await subscriptionService.createSubscription(tenant.id, plan, billing_cycle);
  }

  res.json({
    tenant_id: tenant.id,
    tenant_slug: tenant.slug,
    dashboard_url: `https://app.brtneura.com/dashboard/${tenant.slug}`,
    registration_form_url: `https://app.brtneura.com/t/${tenant.slug}`,
    subscription,
  });
});
```

---

## 3.6 Environment Variables

```env
# Agent Studio Integration
AGENT_STUDIO_SSO_SECRET=<shared-secret-for-jwt>
AGENT_STUDIO_API_URL=https://agentstudio.brtneura.com/api
AGENT_STUDIO_API_KEY=<api-key-for-calling-agent-studio>
AGENT_STUDIO_WEBHOOK_SECRET=<webhook-signature-secret>
```

---

## 3.7 Implementation Checklist

### Week 1: SSO & Provisioning

- [ ] Define SSO token format and shared secret with Agent Studio team
- [ ] Implement `sso.service.ts` — token validation
- [ ] Implement SSO callback route
- [ ] Add `agent_studio_org_id` to tenants table
- [ ] Implement provisioning API (`POST /api/provision`)
- [ ] Implement `setupService.initializeDefaults()`
- [ ] Test SSO flow end-to-end
- [ ] Test provisioning with mock Agent Studio requests

### Week 2: Embedded Dashboard & Webhooks

- [ ] Create embed-optimized dashboard layout (`embedded-mode` class)
- [ ] Implement `/api/embed/dashboard` endpoint
- [ ] PostMessage communication protocol
- [ ] Implement `agentStudioWebhook.service.ts` — outgoing events
- [ ] Implement Agent Studio webhook handler — incoming events
- [ ] Webhook signature verification
- [ ] Test iframe embedding in Agent Studio staging
- [ ] Test webhook events both directions

### Week 3: Marketplace & Polish

- [ ] Create product listing content (description, screenshots, demo)
- [ ] Coordinate with Agent Studio team for marketplace UI
- [ ] Live demo instance for marketplace preview
- [ ] One-click deployment testing
- [ ] Error handling for all integration points
- [ ] Retry logic for webhook delivery
- [ ] Monitoring and alerting for SSO failures
- [ ] Documentation for Agent Studio integration API

---

## Dependencies

| Dependency | Purpose | Notes |
|-----------|---------|-------|
| jsonwebtoken | SSO token validation | Already may be in stack via Supabase |
| axios | Webhook HTTP calls | Already installed |
| Agent Studio API access | SSO + webhooks | Requires coordination with Agent Studio team |

## Risks

| Risk | Mitigation |
|------|-----------|
| Agent Studio API changes | Version the integration, use semver |
| SSO token replay attacks | Short expiry (5 min), nonce tracking |
| Iframe security (clickjacking) | CSP headers, X-Frame-Options for allowed origins only |
| Webhook delivery failures | Retry with exponential backoff, dead letter queue |
| Agent Studio downtime | Graceful degradation — direct login fallback |
