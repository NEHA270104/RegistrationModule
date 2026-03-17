export const agentStudioConfig = {
  // SSO
  ssoSecret: process.env.AGENT_STUDIO_SSO_SECRET || '',
  ssoIssuer: 'agentstudio.brtneura.com',
  ssoAudience: 'registration-form-saas',

  // API
  apiBaseUrl: process.env.AGENT_STUDIO_API_URL || 'https://agentstudio.brtneura.com/api',
  apiKey: process.env.AGENT_STUDIO_API_KEY || '',

  // Webhook
  webhookSecret: process.env.AGENT_STUDIO_WEBHOOK_SECRET || '',

  // Allowed parent origins for iframe embedding
  allowedEmbedOrigins: [
    'https://agentstudio.brtneura.com',
    ...(process.env.AGENT_STUDIO_EMBED_ORIGINS?.split(',') || []),
  ].filter(Boolean),
};
