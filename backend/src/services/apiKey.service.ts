import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';

export interface TenantApiKey {
  id: string;
  tenant_id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
}

export interface CreateApiKeyResult {
  key: TenantApiKey;
  raw_key: string; // Only returned once at creation
}

/**
 * Hash a key using SHA-256 (deterministic, fast — suitable for API key comparison).
 */
function hashKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

export class ApiKeyService {
  /**
   * Generate a new API key for a tenant.
   * Returns the raw key only once — it's stored as a SHA-256 hash.
   */
  async createKey(
    tenantId: string,
    name: string,
    scopes: string[] = ['read'],
    expiresInDays?: number
  ): Promise<CreateApiKeyResult> {
    // Generate a random API key: brtn_<32 random hex chars>
    const rawKey = `brtn_${crypto.randomBytes(24).toString('hex')}`;
    const keyPrefix = rawKey.substring(0, 12); // "brtn_" + 7 chars
    const keyHash = hashKey(rawKey);

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const { data, error } = await supabaseAdmin
      .from('tenant_api_keys')
      .insert({
        tenant_id: tenantId,
        name,
        key_prefix: keyPrefix,
        key_hash: keyHash,
        scopes,
        expires_at: expiresAt,
        is_active: true,
      })
      .select('id, tenant_id, name, key_prefix, scopes, last_used_at, expires_at, is_active, created_at')
      .single();

    if (error) {
      logger.error('Error creating API key', { error: error.message });
      throw new AppError('Failed to create API key', 500, 'API_KEY_CREATE_ERROR');
    }

    logger.info('API key created', { tenantId, name, keyPrefix });

    return {
      key: data as TenantApiKey,
      raw_key: rawKey,
    };
  }

  /**
   * List all API keys for a tenant (without key_hash).
   */
  async listKeys(tenantId: string): Promise<TenantApiKey[]> {
    const { data, error } = await supabaseAdmin
      .from('tenant_api_keys')
      .select('id, tenant_id, name, key_prefix, scopes, last_used_at, expires_at, is_active, created_at')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error('Error listing API keys', { error: error.message });
      throw new AppError('Failed to list API keys', 500, 'API_KEY_LIST_ERROR');
    }

    return (data || []) as TenantApiKey[];
  }

  /**
   * Revoke (deactivate) an API key.
   */
  async revokeKey(tenantId: string, keyId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('tenant_api_keys')
      .update({ is_active: false })
      .eq('id', keyId)
      .eq('tenant_id', tenantId);

    if (error) {
      logger.error('Error revoking API key', { error: error.message });
      throw new AppError('Failed to revoke API key', 500, 'API_KEY_REVOKE_ERROR');
    }

    logger.info('API key revoked', { tenantId, keyId });
  }

  /**
   * Validate an API key — returns the tenant_id and scopes if valid.
   */
  async validateKey(rawKey: string): Promise<{ tenantId: string; scopes: string[] } | null> {
    const keyPrefix = rawKey.substring(0, 12);
    const keyHash = hashKey(rawKey);

    // Find key by prefix + hash
    const { data: candidate } = await supabaseAdmin
      .from('tenant_api_keys')
      .select('id, tenant_id, scopes, expires_at')
      .eq('key_prefix', keyPrefix)
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .single();

    if (!candidate) return null;

    // Check expiration
    if (candidate.expires_at && new Date(candidate.expires_at) < new Date()) {
      return null;
    }

    // Update last_used_at (fire-and-forget)
    supabaseAdmin
      .from('tenant_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', candidate.id)
      .then(() => {});

    return {
      tenantId: candidate.tenant_id,
      scopes: candidate.scopes as string[],
    };
  }
}

export const apiKeyService = new ApiKeyService();
