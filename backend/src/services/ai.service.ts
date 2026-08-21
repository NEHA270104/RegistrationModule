import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';

export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number = 500,
    public errorCode: string = 'INTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class AIService {
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.ANTHROPIC_API_KEY || config.anthropic?.apiKey || '';
    if (!this.apiKey) {
      logger.warn('Anthropic API key is not configured in environment or config');
    }
  }

  /**
   * AI-powered composition of a notification based on an admin prompt
   */
  async composeNotification(prompt: string): Promise<{ title: string; message: string }> {
    if (!this.apiKey) {
      throw new AppError('Anthropic API key not configured', 500, 'AI_NOT_CONFIGURED');
    }

    const systemPrompt = `You are an AI copywriting assistant for a SaaS event registration platform.
Generate a professional, high-converting notification title and message based on the user's prompt.
You MUST output a valid JSON object with EXACTLY the following structure:
{
  "title": "A short, catchy, action-oriented title (max 60 chars)",
  "message": "A compelling, clear, and high-converting message body (max 200 chars)"
}
Do NOT include any markdown code block formatting (like \`\`\`json). Output only the raw JSON.`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-3-5-sonnet-20241022',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [
            {
              role: 'user',
              content: `Create a notification based on this request: "${prompt}"`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        logger.error('Anthropic API request failed:', errText);
        throw new AppError(`Anthropic API error: ${response.statusText}`, 500, 'AI_API_ERROR');
      }

      const resData = (await response.json()) as any;
      const contentText = resData.content?.[0]?.text;

      if (!contentText) {
        throw new AppError('Empty response from AI Service', 500, 'AI_EMPTY_RESPONSE');
      }

      // Parse JSON from response
      const cleanContentText = contentText.trim().replace(/^```json\s*/i, '').replace(/```\s*$/, '');
      const parsed = JSON.parse(cleanContentText);
      if (!parsed.title || !parsed.message) {
        throw new AppError('Invalid response structure from AI Service', 500, 'AI_INVALID_RESPONSE');
      }

      return {
        title: String(parsed.title),
        message: String(parsed.message),
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('Error in AIService.composeNotification:', error);
      throw new AppError('Failed to compose notification using AI', 500, 'AI_COMPOSE_ERROR');
    }
  }
}
