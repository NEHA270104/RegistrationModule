import { Response } from 'express';
import { emailTemplateService } from '../services/emailTemplate.service.js';
import type { TenantRequest } from '../middleware/tenantAuth.js';

export async function listEmailTemplates(req: TenantRequest, res: Response): Promise<void> {
  const templates = await emailTemplateService.listTemplates(req.tenantId!);
  res.json({ success: true, data: templates });
}

export async function previewEmailTemplate(req: TenantRequest, res: Response): Promise<void> {
  const { templateType } = req.params;
  const result = await emailTemplateService.previewTemplate(req.tenantId!, templateType);
  if (!result) {
    res.status(404).json({ success: false, error: { message: 'Template not found' } });
    return;
  }
  res.json({ success: true, data: result });
}

export async function updateEmailTemplate(req: TenantRequest, res: Response): Promise<void> {
  const { templateType } = req.params;
  const { subject, html_body } = req.body;

  if (!subject || !html_body) {
    res.status(400).json({ success: false, error: { message: 'Subject and html_body are required' } });
    return;
  }

  const template = await emailTemplateService.upsertTemplate(req.tenantId!, templateType, subject, html_body);
  res.json({ success: true, data: template });
}

export async function resetEmailTemplate(req: TenantRequest, res: Response): Promise<void> {
  const { templateType } = req.params;
  await emailTemplateService.resetToDefault(req.tenantId!, templateType);
  res.json({ success: true, message: 'Template reset to default' });
}
