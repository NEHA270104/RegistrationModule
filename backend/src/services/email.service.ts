import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { settingsService } from './settings.service.js';
import type { EmailConfirmationData, TierType } from '../types/index.js';

/**
 * Dynamic settings cache for email templates
 */
interface EmailSettings {
  eventDate: string;
  eventTime: string;
  eventVenue: string;
  supportEmail: string;
  supportPhone: string;
  supportWhatsapp: string;
}

/**
 * MSG91 Email Service
 * Uses pre-approved templates with template IDs
 * API: https://control.msg91.com/api/v5/email/send
 */
export class EmailService {
  private authKey: string;
  private baseUrl = 'https://control.msg91.com/api/v5/email/send';
  private settingsCache: EmailSettings | null = null;
  private settingsCacheTime: number = 0;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

  constructor() {
    this.authKey = config.msg91.authKey;
  }

  /**
   * Get dynamic email settings from database (cached)
   */
  private async getEmailSettings(): Promise<EmailSettings> {
    const now = Date.now();

    // Return cached settings if still valid
    if (this.settingsCache && (now - this.settingsCacheTime) < this.CACHE_TTL_MS) {
      return this.settingsCache;
    }

    try {
      const settings = await settingsService.getPublicSettings();

      this.settingsCache = {
        eventDate: (settings.event_date as string) || config.event.date,
        eventTime: (settings.event_time as string) || config.event.time,
        eventVenue: (settings.event_venue as string) || config.event.venue,
        supportEmail: (settings.support_email as string) || config.event.supportEmail,
        supportPhone: (settings.support_phone as string) || config.event.supportPhone,
        supportWhatsapp: (settings.support_whatsapp as string) || '918188050895',
      };
      this.settingsCacheTime = now;

      return this.settingsCache;
    } catch (error) {
      logger.warn('Failed to fetch email settings from database, using defaults', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Return defaults from config
      return {
        eventDate: config.event.date,
        eventTime: config.event.time,
        eventVenue: config.event.venue,
        supportEmail: config.event.supportEmail,
        supportPhone: config.event.supportPhone,
        supportWhatsapp: '918188050895',
      };
    }
  }

  /**
   * Send email via MSG91
   * Payload structure based on MSG91 API documentation
   */
  private async sendEmail(
    toEmail: string,
    toName: string,
    templateId: string,
    variables: Record<string, string>
  ): Promise<boolean> {
    if (!this.authKey) {
      logger.warn('MSG91 auth key not configured - skipping email send');
      return false;
    }

    if (!templateId) {
      logger.warn('MSG91 template ID not provided - skipping email send');
      return false;
    }

    if (!config.msg91.domain) {
      logger.warn('MSG91 domain not configured - skipping email send');
      return false;
    }

    try {
      // MSG91 API payload structure
      const payload = {
        recipients: [
          {
            to: [
              {
                email: toEmail,
                name: toName,
              },
            ],
            variables: variables,
          },
        ],
        from: {
          email: config.msg91.fromEmail,
        },
        domain: config.msg91.domain,
        template_id: templateId,
      };

      logger.debug('Sending email via MSG91', {
        to: toEmail,
        templateId,
        domain: config.msg91.domain,
      });

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          authkey: this.authKey,
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json() as { type?: string };

      if (!response.ok || data.type === 'error') {
        logger.error('MSG91 email error', {
          to: toEmail,
          templateId,
          status: response.status,
          error: data,
        });
        return false;
      }

      logger.info('Email sent via MSG91', {
        to: toEmail,
        templateId,
        response: data,
      });
      return true;
    } catch (error) {
      logger.error('MSG91 email exception', {
        to: toEmail,
        templateId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Send registration confirmation email
   */
  async sendConfirmationEmail(data: EmailConfirmationData): Promise<boolean> {
    const templateId = config.msg91.templates.registrationConfirmation;

    if (!templateId) {
      logger.warn('Registration confirmation template ID not configured');
      logger.info('Registration confirmed (email not sent)', {
        to: data.to,
        bookingId: data.booking_id,
        tier: data.tier,
      });
      return false;
    }

    // Get dynamic settings from database
    const emailSettings = await this.getEmailSettings();

    // Variables to replace in MSG91 template
    // Template placeholders: {{name}}, {{booking_id}}, {{tier}}, etc.
    const variables = {
      name: data.name,
      booking_id: data.booking_id,
      tier: data.tier_display,
      amount: this.formatPrice(data.amount),
      event_date: data.event_date || emailSettings.eventDate,
      event_time: data.event_time || emailSettings.eventTime,
      venue: data.venue || emailSettings.eventVenue,
      company_name: 'AI for MSME Summit',
      support_email: emailSettings.supportEmail,
      support_phone: emailSettings.supportPhone,
    };

    return this.sendEmail(data.to, data.name, templateId, variables);
  }

  /**
   * Send waitlist confirmation email
   */
  async sendWaitlistEmail(
    to: string,
    name: string,
    position: number,
    hasLivestream: boolean
  ): Promise<boolean> {
    const templateId = config.msg91.templates.waitlistConfirmation;

    if (!templateId) {
      logger.warn('Waitlist template ID not configured');
      return false;
    }

    const variables = {
      name: name,
      position: position.toString(),
      has_livestream: hasLivestream ? 'Yes' : 'No',
      company_name: 'AI for MSME Summit',
    };

    return this.sendEmail(to, name, templateId, variables);
  }

  /**
   * Send payment reminder email
   */
  async sendPaymentReminder(
    to: string,
    name: string,
    orderId: string,
    tier: TierType
  ): Promise<boolean> {
    const templateId = config.msg91.templates.paymentReminder;

    if (!templateId) {
      logger.warn('Payment reminder template ID not configured');
      return false;
    }

    const tierNames: Record<TierType, string> = {
      vip: 'VIP Pass',
      standard: 'Standard Pass',
      basic: 'Basic Pass',
      waitlist: 'Waitlist - Live Stream',
    };

    const variables = {
      name: name,
      order_id: orderId,
      tier: tierNames[tier] || tier,
      company_name: 'AI for MSME Summit',
    };

    return this.sendEmail(to, name, templateId, variables);
  }

  /**
   * Send OTP email (using MSG91's pre-approved OTP template)
   */
  async sendOtpEmail(to: string, otp: string, name?: string): Promise<boolean> {
    const templateId = config.msg91.templates.otp;

    if (!templateId) {
      logger.warn('OTP template ID not configured');
      return false;
    }

    const variables = {
      otp: otp,
      name: name || 'User',
      company_name: 'AI for MSME Summit',
    };

    return this.sendEmail(to, name || 'User', templateId, variables);
  }

  /**
   * Send payment recovery email with QR code
   */
  async sendRecoveryEmail(
    to: string,
    name: string,
    tier: string,
    amountInPaise: number,
    recoveryLink: string,
    qrCodeDataUrl: string
  ): Promise<boolean> {
    const templateId = config.msg91.templates.paymentRecovery;

    if (!templateId) {
      logger.warn('Payment recovery template ID not configured');
      logger.info('Recovery email not sent (template not configured)', {
        to,
        tier,
      });
      return false;
    }

    // Get dynamic settings from database
    const emailSettings = await this.getEmailSettings();

    const variables = {
      name: name,
      tier: tier,
      amount: this.formatPrice(amountInPaise),
      recovery_link: recoveryLink,
      qr_code_url: qrCodeDataUrl,
      event_date: emailSettings.eventDate,
      event_time: emailSettings.eventTime,
      venue: emailSettings.eventVenue,
      company_name: 'AI for MSME Summit',
      support_email: emailSettings.supportEmail,
      support_phone: emailSettings.supportPhone,
      whatsapp_link: `https://wa.me/${emailSettings.supportWhatsapp}?text=Hi,%20I%20need%20help%20completing%20my%20registration`,
    };

    return this.sendEmail(to, name, templateId, variables);
  }

  /**
   * Format price for display
   * Note: Database stores amounts in RUPEES (INR) directly
   */
  private formatPrice(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  }
}

export const emailService = new EmailService();
