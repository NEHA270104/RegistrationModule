import { supabaseAdmin } from '../config/supabaseAdmin.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';

export interface LegalAcceptance {
  id: string;
  tenant_id: string;
  document_type: string;
  document_version: string;
  accepted_by_email: string;
  accepted_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

// Current document versions
const CURRENT_VERSIONS: Record<string, string> = {
  tos: '1.0',
  dpa: '1.0',
  partner_agreement: '1.0',
};

export class LegalService {
  /**
   * Record a legal document acceptance
   */
  async recordAcceptance(
    tenantId: string,
    acceptedByEmail: string,
    documentType: string,
    version: string,
    ip?: string,
    userAgent?: string
  ): Promise<LegalAcceptance> {
    const validTypes = Object.keys(CURRENT_VERSIONS);
    if (!validTypes.includes(documentType)) {
      throw new AppError(`Invalid document type. Must be one of: ${validTypes.join(', ')}`, 400, 'INVALID_DOCUMENT_TYPE');
    }

    const { data, error } = await supabaseAdmin
      .from('legal_acceptances')
      .insert({
        tenant_id: tenantId,
        document_type: documentType,
        document_version: version || CURRENT_VERSIONS[documentType],
        accepted_by_email: acceptedByEmail,
        ip_address: ip || null,
        user_agent: userAgent || null,
      })
      .select()
      .single();

    if (error) {
      logger.error('Error recording legal acceptance', { error: error.message });
      throw new AppError('Failed to record legal acceptance', 500, 'LEGAL_ACCEPT_ERROR');
    }

    return data as LegalAcceptance;
  }

  /**
   * Get all legal acceptances for a user within a tenant
   */
  async getAcceptances(tenantId: string): Promise<LegalAcceptance[]> {
    const { data, error } = await supabaseAdmin
      .from('legal_acceptances')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('accepted_at', { ascending: false });

    if (error) {
      logger.error('Error fetching legal acceptances', { error: error.message });
      return [];
    }

    return (data || []) as LegalAcceptance[];
  }

  /**
   * Check if a user has accepted a specific document version
   */
  async hasAccepted(tenantId: string, documentType: string, requiredVersion?: string): Promise<boolean> {
    const version = requiredVersion || CURRENT_VERSIONS[documentType];
    if (!version) return false;

    const { count } = await supabaseAdmin
      .from('legal_acceptances')
      .select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('document_type', documentType)
      .eq('document_version', version);

    return (count || 0) > 0;
  }

  /**
   * Get legal status for a user — which documents they've accepted
   */
  async getLegalStatus(tenantId: string): Promise<{
    documents: { type: string; current_version: string; accepted: boolean; accepted_at?: string }[];
  }> {
    const acceptances = await this.getAcceptances(tenantId);

    const documents = Object.entries(CURRENT_VERSIONS).map(([type, currentVersion]) => {
      const acceptance = acceptances.find(
        (a) => a.document_type === type && a.document_version === currentVersion
      );
      return {
        type,
        current_version: currentVersion,
        accepted: !!acceptance,
        accepted_at: acceptance?.accepted_at,
      };
    });

    return { documents };
  }
}

export const legalService = new LegalService();
