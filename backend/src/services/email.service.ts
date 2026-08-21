import axios from 'axios';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { settingsService } from './settings.service.js';
import type { EmailConfirmationData, TierType } from '../types/index.js';

export async function sendOTP(emailOrPhone: string, otp: string, name?: string) {
  const isEmail = emailOrPhone.includes('@');
  if (isEmail) {
    const url = 'https://control.msg91.com/api/v5/email/send';
    logger.info(`Sending OTP email via MSG91 to: ${emailOrPhone}`);
    
    const payload = {
      template_id: process.env.MSG91_TEMPLATE_OTP || config.msg91.templates.otp,
      from: {
        email: process.env.MSG91_FROM_EMAIL || config.msg91.fromEmail || 'noreply@yourdomain.com',
        name: process.env.MSG91_FROM_NAME || config.msg91.fromName || 'AI for MSME Summit'
      },
      domain: process.env.MSG91_DOMAIN || config.msg91.domain || '',
      recipients: [
        {
          to: [
            {
              email: emailOrPhone
            }
          ],
          variables: {
            otp: otp,
            name: name || 'User',
            company_name: 'AI for MSME Summit'
          }
        }
      ]
    };

    try {
      const response = await axios.post(url, payload, {
        headers: {
          'authkey': process.env.MSG91_AUTH_KEY || config.msg91.authKey,
          'content-type': 'application/json'
        }
      });

      if (response.status !== 200) {
        logger.error('MSG91 Email API returned non-200 status code', {
          status: response.status,
          data: response.data
        });
        throw new Error(`MSG91 Email API failed with status ${response.status}`);
      }

      logger.info('OTP email sent successfully via MSG91', { email: emailOrPhone, response: response.data });
      return response.data;
    } catch (error: any) {
      if (error.response) {
        logger.error('MSG91 API Validation Error (422)', { 
          data: error.response.data, 
          status: error.response.status,
          payloadSent: payload
        });
      } else {
        logger.error('MSG91 email sending error', {
          message: error.message
        });
      }
      throw new Error('Failed to send OTP');
    }
  } else {
    // Mobile number
    const authKey = process.env.MSG91_AUTH_KEY || config.msg91.authKey;
    const templateId = process.env.MSG91_TEMPLATE_OTP || config.msg91.templates.otp;
    const cleanMobile = emailOrPhone.replace(/\D/g, '');
    const url = 'https://control.msg91.com/api/v5/otp';
    logger.info(`Sending OTP SMS via MSG91 to: ${cleanMobile}`);

    try {
      const response = await axios.post(url, null, {
        params: {
          template_id: templateId,
          mobile: cleanMobile,
          authkey: authKey,
          otp: otp
        },
        headers: {
          'content-type': 'application/json'
        }
      });

      if (response.status !== 200 || response.data?.type === 'error') {
        logger.error('MSG91 OTP SMS API returned non-200 status or error type', {
          status: response.status,
          data: response.data
        });
        throw new Error(`MSG91 OTP SMS API failed with status ${response.status}: ${JSON.stringify(response.data)}`);
      }

      logger.info('OTP SMS sent successfully via MSG91', { mobile: cleanMobile, response: response.data });
      return response.data;
    } catch (error: any) {
      if (error.response) {
        logger.error('MSG91 OTP SMS API Validation Error', { 
          data: error.response.data, 
          status: error.response.status,
          payloadSent: { template_id: templateId, mobile: cleanMobile, otp }
        });
      } else {
        logger.error('MSG91 SMS sending error', {
          message: error.message
        });
      }
      throw new Error('Failed to send OTP');
    }
  }
}

/**
 * Dynamic settings cache for email templates
 */
interface EmailSettings {
  eventDate: string;
  eventTime: string;
  eventVenue: string;
  eventVenueMapLink: string;
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
        eventVenueMapLink: (settings.event_venue_map_link as string) || '',
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
        eventVenueMapLink: '',
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
          name: config.msg91.fromName,
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
    const venue = data.venue || emailSettings.eventVenue;
    const venueMapLink = this.getVenueMapLink(venue, emailSettings.eventVenueMapLink || undefined);

    const variables: Record<string, string> = {
      name: data.name,
      booking_id: data.booking_id,
      tier: data.tier_display,
      amount: this.formatPrice(data.amount),
      event_date: data.event_date || emailSettings.eventDate,
      event_time: data.event_time || emailSettings.eventTime,
      venue: venue,
      company_name: 'AI for MSME Summit',
      support_email: emailSettings.supportEmail,
      support_phone: emailSettings.supportPhone,
    };

    if (venueMapLink) {
      variables.venue_map_link = venueMapLink;
    }

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
    tier: TierType,
    recoveryLink?: string,
    amount?: number
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
      starter: 'Starter Plan',
      pro: 'Pro Plan',
      enterprise: 'Enterprise Plan',
    };

    const variables: Record<string, string> = {
      name: name,
      order_id: orderId,
      tier: tierNames[tier] || tier,
      company_name: 'AI for MSME Summit',
    };

    if (recoveryLink) {
      variables.recovery_link = recoveryLink;
    }

    if (amount) {
      variables.amount = this.formatPrice(amount);
    }

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

    const venueMapLink = this.getVenueMapLink(emailSettings.eventVenue, emailSettings.eventVenueMapLink || undefined);

    const variables: Record<string, string> = {
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

    if (venueMapLink) {
      variables.venue_map_link = venueMapLink;
    }

    return this.sendEmail(to, name, templateId, variables);
  }

  /**
   * Generate a Google Maps search URL from a venue address.
   * If a manual override link is provided, use that instead.
   */
  private getVenueMapLink(venue: string, manualLink?: string): string {
    if (manualLink) {
      return manualLink;
    }
    if (!venue || venue.toLowerCase() === 'tbd soon') {
      return '';
    }
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venue)}`;
  }

  /**
   * Format price for display
   * Note: Database stores amounts in RUPEES (INR) directly
   * Returns number with Indian formatting (e.g., "2,499") without currency symbol
   * since MSG91 templates already include the ₹ symbol
   */
  private formatPrice(amount: number): string {
    return new Intl.NumberFormat('en-IN', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  async sendOTP(emailOrPhone: string, otp: string, name?: string) {
    return sendOTP(emailOrPhone, otp, name);
  }
}

export const emailService = new EmailService();
