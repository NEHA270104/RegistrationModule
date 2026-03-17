import { Request, Response } from 'express';
import { ssoService } from '../services/sso.service.js';
import { agentStudioConfig } from '../config/agentStudio.js';
import { logger } from '../utils/logger.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * GET /api/embed/dashboard?token=...
 * Serve embedded dashboard for Agent Studio iframe.
 */
export const embedDashboard = async (req: Request, res: Response): Promise<void> => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    res.status(400).send(embedErrorPage('Missing SSO token'));
    return;
  }

  try {
    // Validate SSO token
    const payload = ssoService.validateSSOToken(token);
    const tenant = await ssoService.findOrCreateTenant(payload);
    const session = await ssoService.createSession(tenant, payload);

    // Set CSP to allow embedding only from allowed origins
    const frameAncestors = agentStudioConfig.allowedEmbedOrigins.join(' ');
    res.setHeader(
      'Content-Security-Policy',
      `frame-ancestors ${frameAncestors || "'none'"}`
    );
    res.removeHeader('X-Frame-Options');

    // Serve a bootstrap HTML that injects session into the dashboard
    res.send(embedBootstrapPage(session.access_token, session.refresh_token, tenant.slug));
  } catch (error) {
    logger.error('Embed dashboard error', {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    res.status(401).send(embedErrorPage(
      error instanceof Error ? error.message : 'Authentication failed'
    ));
  }
};

function embedBootstrapPage(accessToken: string, refreshToken: string, tenantSlug: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Registration Form Dashboard</title>
  <style>
    body { margin: 0; padding: 0; overflow: hidden; }
    iframe { width: 100%; height: 100vh; border: none; }
  </style>
</head>
<body>
  <iframe id="dashboard-frame" src="/dashboard/${tenantSlug}?embed=true"></iframe>
  <script>
    // Inject session into dashboard iframe
    const frame = document.getElementById('dashboard-frame');
    frame.addEventListener('load', function() {
      frame.contentWindow.postMessage({
        type: 'registration-form-session',
        action: 'init',
        data: {
          access_token: ${JSON.stringify(accessToken)},
          refresh_token: ${JSON.stringify(refreshToken)},
          tenant_slug: ${JSON.stringify(tenantSlug)},
          embedded: true
        }
      }, window.location.origin);
    });

    // Relay postMessages from dashboard to parent (Agent Studio)
    window.addEventListener('message', function(event) {
      if (event.source === frame.contentWindow && event.data?.type === 'registration-form') {
        window.parent.postMessage(event.data, '*');
      }
      // Relay messages from parent (Agent Studio) to dashboard
      if (event.source === window.parent && event.data?.action) {
        frame.contentWindow.postMessage(event.data, window.location.origin);
      }
    });
  </script>
</body>
</html>`;
}

function embedErrorPage(message: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Error</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8f9fa; }
    .error { text-align: center; padding: 2rem; }
    .error h2 { color: #dc3545; margin-bottom: 0.5rem; }
    .error p { color: #6c757d; }
  </style>
</head>
<body>
  <div class="error">
    <h2>Authentication Error</h2>
    <p>${message.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
  </div>
</body>
</html>`;
}
