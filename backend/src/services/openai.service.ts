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
  /**
   * Generate promotional content suggestions for hero promo section
   */
  async generatePromoSuggestions(
    occasion: string,
    eventName: string = 'AI Summit for MSME Business Owners'
  ): Promise<{ valueProp: string; whatsappKeyword: string; urgencyText: string }[]> {
    const client = this.getClient();

    const prompt = `You are a high-conversion marketing copywriter for a business event in India.

Event: "${eventName}"
Occasion/Theme: "${occasion}"

Generate 3 different promotional content variations for a hero banner on the event registration page. Each variation should be compelling, urgent, and drive registrations.

Return a JSON object with a "variations" array where each item has:
- "valueProp": A bold value proposition (1-2 sentences, max 150 chars). Focus on what attendees GET — tools, value, transformation. Use INR currency symbol if mentioning amounts.
- "whatsappKeyword": A single short keyword (ALL CAPS, no spaces) for WhatsApp CTA, related to the occasion (e.g., VALENTINE, AILOVE, LAUNCH72)
- "urgencyText": A short urgency/scarcity line (max 80 chars) with deadline and seat limit

Example:
{
  "variations": [
    {
      "valueProp": "Every attendee gets ₹72,998 worth of FREE AI tools — including a Voice AI Agent for YOUR business",
      "whatsappKeyword": "VALENTINE",
      "urgencyText": "Offer expires: Feb 14, 11:59 PM | Only 150 seats total"
    }
  ]
}`;

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.8,
        max_tokens: 800,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new AppError('Empty response from OpenAI', 500, 'OPENAI_EMPTY_RESPONSE');
      }

      const parsed = JSON.parse(content);
      const variations = Array.isArray(parsed) ? parsed : (parsed.variations || []);

      if (!Array.isArray(variations) || variations.length === 0) {
        throw new AppError('Invalid response format from OpenAI', 500, 'OPENAI_INVALID_FORMAT');
      }

      return variations.map((v: Record<string, unknown>) => ({
        valueProp: String(v.valueProp || '').substring(0, 250),
        whatsappKeyword: String(v.whatsappKeyword || '').substring(0, 30).toUpperCase().replace(/\s/g, ''),
        urgencyText: String(v.urgencyText || '').substring(0, 120),
      }));
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('OpenAI API error (promo)', {
        error: error instanceof Error ? error.message : 'Unknown error',
        occasion,
      });
      throw new AppError('Failed to generate promo suggestions', 500, 'OPENAI_API_ERROR');
    }
  }

  /**
   * Enhance guest/speaker field text (shorten or expand)
   */
  async enhanceGuestText(
    fieldType: 'title' | 'bio' | 'session_point',
    fieldValue: string,
    action: 'shorten' | 'expand',
    context: { name?: string; title?: string; bio?: string; sessionPoints?: string[] },
    lineTarget?: number
  ): Promise<string> {
    const client = this.getClient();

    const fieldGuidelines: Record<string, string> = {
      title: 'This is the speaker\'s professional title/credentials. Keep it in a concise credentials format (e.g., "AI & Digital Transformation Expert | Former CTO, TechCorp").',
      bio: 'This is the speaker\'s biography. Write in third person, focusing on achievements, expertise, and relevance to MSME business owners.',
      session_point: 'This is a bullet point describing what attendees will learn. Make it action-oriented and focused on a clear, specific learning outcome for MSME business owners.',
    };

    // Map line targets to approximate word counts (a visual "line" in admin UI ≈ 10-12 words)
    const lineToWords: Record<number, number> = { 1: 10, 2: 20, 4: 45, 5: 55, 8: 90 };

    let actionInstructions: string;
    if (lineTarget && lineToWords[lineTarget]) {
      const wordCount = lineToWords[lineTarget];
      actionInstructions = action === 'shorten'
        ? `SHORTEN the text to approximately ${wordCount} words (roughly ${lineTarget} short lines). Be ruthlessly concise — cut all filler, keep only the most essential information. STRICT LIMIT: do NOT exceed ${wordCount + 5} words.`
        : `EXPAND the text to approximately ${wordCount} words (roughly ${lineTarget} short lines). Add professional detail, make it more compelling and informative. Maintain authenticity and relevance. Target around ${wordCount} words.`;
    } else {
      actionInstructions = action === 'shorten'
        ? 'SHORTEN the text: Make it more concise and impactful. Remove filler words and redundancy while preserving all key information. Target roughly 30-50% shorter.'
        : 'EXPAND the text: Add professional detail, make it more compelling and informative. Maintain authenticity and relevance. Target roughly 30-50% longer.';
    }

    const contextLines = [];
    if (context.name) contextLines.push(`Speaker Name: ${context.name}`);
    if (context.title) contextLines.push(`Title/Credentials: ${context.title}`);
    if (context.bio) contextLines.push(`Bio: ${context.bio}`);
    if (context.sessionPoints?.length) contextLines.push(`Session Points:\n${context.sessionPoints.map((p, i) => `  ${i + 1}. ${p}`).join('\n')}`);

    const prompt = `You are a professional content editor for "AI Summit for MSME Business Owners 2026" — a business event in India.

Speaker context:
${contextLines.join('\n')}

Field being edited: ${fieldType.replace('_', ' ')}
${fieldGuidelines[fieldType]}

Current text: "${fieldValue}"

${actionInstructions}

Return ONLY the enhanced text — no quotes, no explanation, no prefixes. Just the improved text.`;

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.6,
        max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content?.trim();
      if (!content) {
        throw new AppError('Empty response from OpenAI', 500, 'OPENAI_EMPTY_RESPONSE');
      }

      return content;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('OpenAI API error (guest enhance)', {
        error: error instanceof Error ? error.message : 'Unknown error',
        fieldType,
        action,
      });
      throw new AppError('Failed to enhance text', 500, 'OPENAI_API_ERROR');
    }
  }

  /**
   * Generate flyer content copy using OpenAI
   */
  async generateFlyerAiContent(
    templateId: string,
    category: string,
    context: Record<string, any>
  ): Promise<Record<string, any>> {
    const client = this.getClient();

    const prompt = `You are a high-conversion marketing copywriter for an event promotion flyer.
Theme Category: "${category}"
Template Theme Style: "${templateId}"
Event Name: "${context.eventName || ''}"
Event Venue: "${context.eventVenue || ''}"
Event Date: "${context.eventDate || ''}"
Event Time: "${context.eventTime || ''}"
Event Platform: "${context.eventPlatform || ''}"

Based on the layout of the "${templateId}" template:
1. If the template starts with "summit" (e.g. summit-classic, summit-neon, summit-light), return a JSON object with:
   - "title": A catchy, professional event title suited for the category (max 80 chars)
   - "subtitle": A compelling event description or value prop (max 150 chars)
   - "badgeText": An uppercase category tag (e.g., "AI FOR MSME BUSINESS SUMMIT" or similar)
   - "branding": A short hosting brand tag
   - "link": A registration URL string

2. If the template starts with "speaker" (e.g. speaker-spotlight, speaker-academic, speaker-warm), return a JSON object with:
   - "badgeText": An uppercase tag
   - "name": Speaker's name (keep original "${context.speakerName || ''}" if provided)
   - "titleText": Speaker's professional title (keep original "${context.speakerTitle || ''}" if provided)
   - "bio": A concise biography (max 200 chars)
   - "sessionHeading": A line like "In this session, you'll learn:"
   - "points": An array of exactly 3 action-oriented session bullet points (max 80 chars each)
   - "dateVenue": Short date and venue string

3. If the template starts with "pricing" (e.g. pricing-emerald, pricing-corporate, pricing-gradient), return a JSON object with:
   - "badgeText": Pricing card badge (e.g., "Early Bird Passes Active")
   - "title": Compelling pricing section title
   - "subtitle": Pricing section subtitle
   - "basicName": Name for growth/basic tier (default "Growth (Basic)")
   - "basicOriginal": Original price number (default 1999)
   - "basicPrice": Current discounted price number (default 999)
   - "stdName": Name for standard tier (default "Business (Std)")
   - "stdOriginal": Original price number (default 2999)
   - "stdPrice": Current discounted price number (default 1999)
   - "vipName": Name for VIP/executive tier (default "Executive (VIP)")
   - "vipOriginal": Original price number (default 4999)
   - "vipPrice": Current discounted price number (default 3999)
   - "timerText": Booking closes message with date

4. If the template is "minimal-clean", return a JSON object with:
   - "badgeText": Uppercase tag
   - "title": Minimalist event title
   - "desc": Short event description
   - "dateTime": Date/time details
   - "location": Venue/platform details

Ensure the response is a single JSON object matching the template type requested. Do not return markdown wrapping. Return only valid raw JSON matching the keys above.`;

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

      return JSON.parse(content);
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error('OpenAI flyer generation error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        templateId,
      });
      throw new AppError('Failed to generate flyer AI content', 500, 'OPENAI_API_ERROR');
    }
  }
}

export const openAIService = new OpenAIService();
