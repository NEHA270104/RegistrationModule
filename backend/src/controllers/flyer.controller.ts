import { Request, Response } from 'express';
import { flyerService } from '../services/flyer.service.js';
import { openAIService } from '../services/openai.service.js';
import { AIService } from '../services/ai.service.js';
import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

const aiService = new AIService();

/**
 * GET /api/admin/flyers or /api/t/:slug/flyers
 * Get all generated flyers
 */
export async function getFlyers(req: Request, res: Response): Promise<void> {
  let tenantId = (req as any).tenantId as string | undefined;
  const isAdmin = (req as any).isAdmin || req.baseUrl.startsWith('/api/admin');

  if (isAdmin) {
    // Admin can query flyers for a specific tenant_id via query params
    const queryTenantId = req.query.tenant_id as string;
    if (queryTenantId) {
      tenantId = queryTenantId;
    }
  }

  const flyers = await flyerService.getAllFlyers(tenantId);
  res.json({ success: true, data: { flyers } });
}

/**
 * POST /api/admin/flyers or /api/t/:slug/flyers
 * Generate a new flyer and upload to Supabase Storage
 */
export async function createFlyer(req: Request, res: Response): Promise<void> {
  const { name, template_id, template_data, image_base64, format, dimensions, tenant_id } = req.body;
  let targetTenantId = (req as any).tenantId as string | undefined;
  const isAdmin = (req as any).isAdmin || req.baseUrl.startsWith('/api/admin');

  if (isAdmin) {
    if (tenant_id) {
      targetTenantId = tenant_id;
    }
  } else {
    // Strict multi-tenant validation: if user passes tenant_id, it must match auth tenantId
    if (tenant_id && tenant_id !== targetTenantId) {
      res.status(403).json({
        success: false,
        error: { message: 'Forbidden: Cannot generate flyers for other tenants', code: 'FORBIDDEN' }
      });
      return;
    }
  }

  // Validation
  if (!name || !template_id || !image_base64) {
    res.status(400).json({
      success: false,
      error: { message: 'Name, template_id, and image_base64 are required', code: 'VALIDATION_ERROR' },
    });
    return;
  }

  logger.info('Processing flyer generation and upload request', { name, template_id, tenantId: targetTenantId });
  
  const flyer = await flyerService.createFlyer({
    name,
    template_id,
    template_data: template_data || {},
    image_base64,
    format,
    dimensions,
    tenant_id: targetTenantId,
  });

  res.status(201).json({ success: true, data: { flyer } });
}

/**
 * DELETE /api/admin/flyers/:id or /api/t/:slug/flyers/:id
 * Delete a generated flyer and its storage file
 */
export async function deleteFlyer(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  let targetTenantId = (req as any).tenantId as string | undefined;
  const isAdmin = (req as any).isAdmin || req.baseUrl.startsWith('/api/admin');

  if (isAdmin) {
    // Admin can specify tenant_id via query or body to bypass scoping
    const queryTenantId = (req.query.tenant_id as string) || req.body.tenant_id;
    if (queryTenantId) {
      targetTenantId = queryTenantId;
    }
  }

  logger.info('Deleting flyer request', { id, tenantId: targetTenantId });
  await flyerService.deleteFlyer(id, targetTenantId);
  
  res.json({ success: true, message: 'Flyer deleted successfully' });
}

/**
 * POST /api/admin/flyers/generate
 * Generate AI-optimised marketing copy for a flyer template.
 * Accepts: { templateId, eventDetails: { eventName, date, venue, description, highlights[] } }
 * Returns: { image_url, copy: { headline, subheadline, body, cta } }
 */
export async function generateFlyer(req: Request, res: Response): Promise<void> {
  const { templateId, eventDetails } = req.body;

  if (!templateId || !eventDetails) {
    res.status(400).json({
      success: false,
      error: { message: 'templateId and eventDetails are required', code: 'VALIDATION_ERROR' }
    });
    return;
  }

  try {
    // 1. Fetch the template record from flyer_templates
    const { data: template, error: tmplErr } = await supabase
      .from('flyer_templates')
      .select('id, name, image_url, category')
      .eq('id', templateId)
      .maybeSingle();

    if (tmplErr) {
      logger.error('Error fetching flyer template', { templateId, error: tmplErr.message });
    }

    const imageUrl = template?.image_url || null;
    const templateName = template?.name || templateId;

    // 2. Build a rich prompt for Claude
    const promptPayload = JSON.stringify({
      template: templateName,
      event: eventDetails
    }, null, 2);

    const systemPrompt = `You are an expert marketing copywriter specialising in professional event flyers.
Given the template name and event details, generate compelling, high-converting flyer copy.
You MUST return a valid JSON object with EXACTLY this structure (no markdown, no code fences):
{
  "headline": "A punchy, attention-grabbing event title (max 60 chars)",
  "subheadline": "A supporting tagline that adds urgency or value (max 100 chars)",
  "body": "2-3 sentences of persuasive event description (max 250 chars)",
  "cta": "Action-oriented button text (max 30 chars, e.g. 'Register Now – Seats Limited')"
}`;

    const apiKey = process.env.ANTHROPIC_API_KEY || '';
    let copy: { headline: string; subheadline: string; body: string; cta: string };

    if (!apiKey) {
      logger.warn('generateFlyer: ANTHROPIC_API_KEY not set, returning placeholder copy');
      copy = {
        headline: eventDetails.eventName || 'Exciting Upcoming Event',
        subheadline: 'Join us for an unforgettable experience',
        body: `Don't miss ${eventDetails.eventName || 'this event'} on ${eventDetails.date || 'an upcoming date'} at ${eventDetails.venue || 'our venue'}.`,
        cta: 'Register Now'
      };
    } else {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 512,
          system: systemPrompt,
          messages: [{ role: 'user', content: `Generate flyer copy for this event:\n${promptPayload}` }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error('Anthropic API error in generateFlyer', { status: response.status, body: errText });
        throw new Error(`Anthropic API error: ${response.statusText}`);
      }

      const resData = (await response.json()) as any;
      const rawText = (resData.content?.[0]?.text || '').trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      copy = JSON.parse(rawText);

      if (!copy.headline || !copy.body) {
        throw new Error('Invalid copy structure returned from Claude');
      }
    }

    logger.info('generateFlyer: AI copy generated successfully', { templateId });

    res.json({
      success: true,
      data: {
        image_url: imageUrl,
        copy
      }
    });
  } catch (error) {
    logger.error('generateFlyer error', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json({
      success: false,
      error: { message: 'Failed to generate flyer copy', code: 'FLYER_GENERATE_ERROR' }
    });
  }
}

/**
 * POST /api/t/:slug/flyers/generate-ai or /api/admin/flyers/generate-ai
 * Generate flyer copy content with OpenAI
 */
export async function generateAiFlyerContent(req: Request, res: Response): Promise<void> {
  const { template_id, category, context } = req.body;

  if (!template_id || !category) {
    res.status(400).json({
      success: false,
      error: { message: 'template_id and category are required', code: 'VALIDATION_ERROR' }
    });
    return;
  }

  try {
    const aiContent = await openAIService.generateFlyerAiContent(template_id, category, context || {});
    res.json({ success: true, data: aiContent });
  } catch (error) {
    logger.error('Error generating AI flyer content', { error: error instanceof Error ? error.message : 'Unknown' });
    res.status(500).json({
      success: false,
      error: { message: 'Failed to generate flyer content', code: 'AI_GENERATION_FAILED' }
    });
  }
}

/**
 * GET /api/t/:slug/flyer-config
 * Fetch the flyer schema config for a tenant
 */
export async function getFlyerConfig(req: Request, res: Response): Promise<void> {
  const tenantId = (req as any).tenantId as string;
  if (!tenantId) {
    res.status(400).json({ success: false, error: { message: 'Tenant ID required', code: 'VALIDATION_ERROR' } });
    return;
  }

  const config = await flyerService.getFlyerConfig(tenantId);
  res.json({ success: true, data: config });
}

/**
 * POST /api/t/:slug/flyer-config
 * Update flyer schema config for a tenant
 */
export async function updateFlyerConfig(req: Request, res: Response): Promise<void> {
  const tenantId = (req as any).tenantId as string;
  if (!tenantId) {
    res.status(400).json({ success: false, error: { message: 'Tenant ID required', code: 'VALIDATION_ERROR' } });
    return;
  }

  const config = await flyerService.saveFlyerConfig(tenantId, req.body);
  res.json({ success: true, data: config });
}
