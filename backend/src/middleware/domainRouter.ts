import { Request, Response, NextFunction } from 'express';
import { domainService } from '../services/domain.service.js';
import { logger } from '../utils/logger.js';

// Cache domain-to-slug mappings (5-minute TTL)
const domainCache = new Map<string, { slug: string; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000;

// Known platform domains to skip
const PLATFORM_DOMAINS = new Set([
  'localhost',
  '127.0.0.1',
  'app.brtneura.com',
  'brtneura.com',
  'registration-form-backend.onrender.com',
]);

function isPlatformDomain(hostname: string): boolean {
  if (PLATFORM_DOMAINS.has(hostname)) return true;
  // Firebase hosting domains
  if (hostname.endsWith('.web.app') || hostname.endsWith('.firebaseapp.com')) return true;
  // Cloud Run domains
  if (hostname.endsWith('.run.app')) return true;
  return false;
}

/**
 * Domain routing middleware — resolves custom domains to tenant slugs.
 * Runs early in the pipeline, before static file serving and API routes.
 */
export async function domainRouter(req: Request, res: Response, next: NextFunction): Promise<void> {
  const hostname = req.hostname;

  // Skip for known platform domains
  if (isPlatformDomain(hostname)) {
    next();
    return;
  }

  // Check cache first
  const cached = domainCache.get(hostname);
  if (cached && cached.expiry > Date.now()) {
    req.url = rewriteUrl(req.url, cached.slug);
    next();
    return;
  }

  // Lookup tenant by custom domain
  try {
    const tenant = await domainService.getByDomain(hostname);
    if (tenant) {
      domainCache.set(hostname, { slug: tenant.slug, expiry: Date.now() + CACHE_TTL });
      req.url = rewriteUrl(req.url, tenant.slug);
    }
  } catch (err) {
    logger.error('Domain routing error', { hostname, error: (err as Error).message });
  }

  next();
}

/**
 * Rewrite URL to include tenant slug path
 */
function rewriteUrl(url: string, slug: string): string {
  // API requests: prefix with /api/t/:slug
  if (url.startsWith('/api/')) {
    return url.replace('/api/', `/api/t/${slug}/`);
  }
  // Static form requests: serve tenant form
  if (url === '/' || url === '') {
    return `/t/${slug}`;
  }
  return url;
}
