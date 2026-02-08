import OpenAI from 'openai';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';
import type { CreateMsmeBenefitRequest } from '../types/index.js';

export class OpenAIService {
  private client: OpenAI | null = null;

  private getClient(): OpenAI {
    if (!this.client) {
      if (!config.openai.apiKey) {
        throw new AppError('OpenAI API key not configured', 500, 'OPENAI_NOT_CONFIGURED');
      }
      this.client = new OpenAI({ apiKey: config.openai.apiKey });
    }
    return this.client;
  }

  /**
   * Generate MSME benefit suggestions based on a theme/topic
   */
  async generateBenefitSuggestions(
    theme: string,
    count: number = 6
  ): Promise<CreateMsmeBenefitRequest[]> {
    const client = this.getClient();

    const prompt = `You are a business event content strategist for an AI summit aimed at MSME (Micro, Small & Medium Enterprise) business owners in India.

Given the theme: "${theme}"

Generate exactly ${count} benefit items that attendees would receive from this summit. Each benefit should be compelling and actionable for MSME owners.

Return a JSON object with an "items" array where each item has:
- "title": A concise, bold benefit headline (5-10 words)
- "description": A 1-2 sentence explanation of this benefit (20-40 words)
- "icon": A single relevant emoji

Example:
{
  "items": [
    {
      "title": "AI Readiness Toolkit",
      "description": "Get a personalized assessment of your business's AI readiness with a step-by-step implementation roadmap.",
      "icon": "🧰"
    }
  ]
}`;

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 1500,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new AppError('Empty response from OpenAI', 500, 'OPENAI_EMPTY_RESPONSE');
      }

      const parsed = JSON.parse(content);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rawItems: any[] = Array.isArray(parsed)
        ? parsed
        : (parsed.items || parsed.benefits || []);

      if (!Array.isArray(rawItems) || rawItems.length === 0) {
        throw new AppError('Invalid response format from OpenAI', 500, 'OPENAI_INVALID_FORMAT');
      }

      return rawItems.map((item, index) => ({
        title: String(item.title || '').substring(0, 200),
        description: String(item.description || '').substring(0, 500),
        icon: String(item.icon || '').substring(0, 10),
        sort_order: index,
        is_active: true,
      }));
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('OpenAI API error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        theme,
      });
      throw new AppError('Failed to generate AI suggestions', 500, 'OPENAI_API_ERROR');
    }
  }
}

export const openAIService = new OpenAIService();
