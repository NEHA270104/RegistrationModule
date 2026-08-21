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
  console.log('Received Payload:', req.body);
  const { templateType } = req.params;

  if (!req.body || !req.body.subject || !req.body.html_body) {
    res.status(400).json({
      success: false,
      error: { message: 'Subject and html_body are required' }
    });
    return;
  }

  const { subject, html_body } = req.body;
  const template = await emailTemplateService.upsertTemplate(req.tenantId!, templateType, subject, html_body);
  res.json({ success: true, data: template });
}

export async function resetEmailTemplate(req: TenantRequest, res: Response): Promise<void> {
  const { templateType } = req.params;
  await emailTemplateService.resetToDefault(req.tenantId!, templateType);
  res.json({ success: true, message: 'Template reset to default' });
}

export async function generateAiEmailTemplate(req: TenantRequest, res: Response): Promise<void> {
  const { templateType } = req.params;
  const { industry } = req.query;
  
  const ind = (industry as string || '').toLowerCase();
  let generatedSubject = 'Welcome to our Event';
  let generatedHtml = '';

  if (ind === 'school' || ind === 'education') {
    generatedSubject = 'Welcome to the School Annual Event & Expo';
    generatedHtml = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Outfit', sans-serif; background-color: #f0fdf4; color: #1e293b; margin: 0; padding: 20px; }
        .card { background: #ffffff; max-width: 600px; margin: 0 auto; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden; border: 1px solid #dcfce7; }
        .header { background: linear-gradient(135deg, #10b981, #059669); color: #ffffff; padding: 35px; text-align: center; }
        .body { padding: 35px; line-height: 1.7; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #f1f5f9; }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <h2>School Admissions & Expo: Welcome!</h2>
        </div>
        <div class="body">
            <p>Dear {{attendee_name}},</p>
            <p>We are delighted to welcome you to the upcoming <strong>{{event_name}}</strong>! This event is designed to give parents, students, and educators a comprehensive view of school activities, curriculums, and admissions.</p>
            <p><strong>Event Date:</strong> {{event_date}}<br><strong>Venue:</strong> {{event_venue}}</p>
            <p>Please keep this welcome email handy. We will send your entry pass and scan code soon.</p>
            <p>Sincerely yours,<br>The {{tenant_name}} Administration</p>
        </div>
        <div class="footer">
            Sent by {{tenant_name}} School Relations • Support: {{support_email}}
        </div>
    </div>
</body>
</html>`;
  } else if (ind === 'hospital' || ind === 'healthcare') {
    generatedSubject = 'Registration Confirmed: Healthcare & Wellness Seminar';
    generatedHtml = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Outfit', sans-serif; background-color: #ecfeff; color: #0f172a; margin: 0; padding: 20px; }
        .card { background: #ffffff; max-width: 600px; margin: 0 auto; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden; border: 1px solid #cffafe; }
        .header { background: linear-gradient(135deg, #06b6d4, #0891b2); color: #ffffff; padding: 35px; text-align: center; }
        .body { padding: 35px; line-height: 1.7; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #f1f5f9; }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <h2>Health & Wellness Summit Registration</h2>
        </div>
        <div class="body">
            <p>Hello {{attendee_name}},</p>
            <p>Thank you for registering for the <strong>{{event_name}}</strong>. Our medical professionals and wellness experts look forward to sharing vital health insights with you.</p>
            <p><strong>Seminar Schedule:</strong> {{event_date}}<br><strong>Hospital Venue:</strong> {{event_venue}}</p>
            <p>Your attendee confirmation has been successfully recorded in our visitor management portal.</p>
            <p>Warm regards,<br>The {{tenant_name}} Care Team</p>
        </div>
        <div class="footer">
            Sent by {{tenant_name}} Healthcare Relations • Support: {{support_email}}
        </div>
    </div>
</body>
</html>`;
  } else {
    generatedSubject = `Welcome to the ${ind ? ind.toUpperCase().replace('_', ' ') : 'Business'} Summit & Event`;
    generatedHtml = `<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: 'Outfit', sans-serif; background-color: #f5f3ff; color: #1e1b4b; margin: 0; padding: 20px; }
        .card { background: #ffffff; max-width: 600px; margin: 0 auto; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.08); overflow: hidden; border: 1px solid #ddd6fe; }
        .header { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #ffffff; padding: 35px; text-align: center; }
        .body { padding: 35px; line-height: 1.7; }
        .footer { background: #f8fafc; padding: 20px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #f1f5f9; }
    </style>
</head>
<body>
    <div class="card">
        <div class="header">
            <h2>Welcome to {{event_name}}!</h2>
        </div>
        <div class="body">
            <p>Hi {{attendee_name}},</p>
            <p>We are excited to welcome you to the <strong>{{event_name}}</strong>! This event is tailored to accelerate growth in the ${ind ? ind.replace('_', ' ') : 'industry'} space.</p>
            <p><strong>Date & Time:</strong> {{event_date}}<br><strong>Location:</strong> {{event_venue}}</p>
            <p>Your registration is complete. Keep this email handy for admission.</p>
            <p>Cheers,<br>The {{tenant_name}} Team</p>
        </div>
        <div class="footer">
            Sent by {{tenant_name}} • Support: {{support_email}}
        </div>
    </div>
</body>
</html>`;
  }

  res.json({
    success: true,
    data: {
      subject: generatedSubject,
      html_body: generatedHtml
    }
  });
}
