import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../types/index.js';
import { tenantService } from './tenant.service.js';

export interface Speaker {
  name: string;
  title: string;
  avatar_url?: string | null;
  badge?: string | null;
}

export interface EventRecord {
  id: string;
  tenant_id: string;
  tenant_slug: string;
  slug: string;
  title: string;
  sub_heading: string;
  badge_text?: string;
  date: string;
  time: string;
  venue: string;
  vibe: string;
  accent_color: string;
  format: string;
  speakers: Speaker[];
  agenda: string[];
  perks: string[];
  cta_text: string;
  contact_phone: string;
  flyer_image_url?: string | null;
  capacity: number;
  status: 'active' | 'draft' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
  attendees_count?: number;
}

export interface AttendeeRecord {
  id: string;
  event_id: string;
  event_slug: string;
  event_title: string;
  tenant_id: string;
  booking_id: string;
  ticket_code: string;
  name: string;
  email: string;
  phone: string;
  business_name?: string | null;
  pass_type: string;
  status: 'confirmed' | 'checked_in' | 'cancelled';
  registered_at: string;
  notes?: string | null;
}

export interface CreateEventFromFlyerRequest {
  title: string;
  sub_heading?: string;
  badge_text?: string;
  date: string;
  time?: string;
  venue: string;
  vibe?: string;
  color?: string;
  format?: string;
  speakers?: Speaker[];
  agenda?: string[];
  perks?: string[];
  cta_text?: string;
  contact_phone?: string;
  flyer_image_url?: string;
  capacity?: number;
}

export interface RegisterAttendeeRequest {
  name: string;
  email: string;
  phone: string;
  business_name?: string;
  pass_type?: string;
  notes?: string;
}

// In-memory / persistent event store cache (graceful multi-tier storage)
const inMemoryEvents = new Map<string, EventRecord>();
const inMemoryAttendees = new Map<string, AttendeeRecord[]>();

// Seed a default event if empty
function ensureSeedEvent() {
  if (inMemoryEvents.size === 0) {
    const seedEvent: EventRecord = {
      id: 'event-default-1',
      tenant_id: '00000000-0000-0000-0000-000000000001',
      tenant_slug: 'default',
      slug: 'ai-msme-business-summit-2026',
      title: 'AI for MSME Business Summit 2026',
      sub_heading: 'Empowering small businesses with AI tools, automated solutions, and strategic workflows.',
      badge_text: 'EXCLUSIVE INVITE · AI SUMMIT 2026',
      date: '2026-02-21',
      time: '9:00 AM – 5:00 PM IST',
      venue: 'Centre For Police Research, Pashan, Pune',
      vibe: 'cyberpunk',
      accent_color: '#00f5ff',
      format: 'square',
      speakers: [
        { name: 'Dr. Rajesh Sharma', title: 'CTO & Lead AI Architect', badge: 'Keynote Speaker', avatar_url: '' },
        { name: 'Priya Mehta', title: 'Director of Growth', badge: 'Panelist', avatar_url: '' }
      ],
      agenda: [
        'AI Keynote: Next-Gen Autonomous Workflows',
        'Live Panel: Future of Enterprise AI',
        'Networking & Investor Meetups'
      ],
      perks: [
        'Free Certificate of Participation',
        'Exclusive Networking Lounge Access'
      ],
      cta_text: 'REGISTER NOW — LIMITED SEATS',
      contact_phone: '+91 98765 43210',
      flyer_image_url: null,
      capacity: 500,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    inMemoryEvents.set(seedEvent.slug, seedEvent);
    inMemoryAttendees.set(seedEvent.id, [
      {
        id: 'att-seed-1',
        event_id: seedEvent.id,
        event_slug: seedEvent.slug,
        event_title: seedEvent.title,
        tenant_id: seedEvent.tenant_id,
        booking_id: 'BK-2026-8491',
        ticket_code: 'VIP-8492-X',
        name: 'Alex Johnson',
        email: 'alex@example.com',
        phone: '+91 98765 00001',
        business_name: 'Johnson Logistics',
        pass_type: 'VIP',
        status: 'confirmed',
        registered_at: new Date(Date.now() - 3600000 * 24).toISOString(),
      },
      {
        id: 'att-seed-2',
        event_id: seedEvent.id,
        event_slug: seedEvent.slug,
        event_title: seedEvent.title,
        tenant_id: seedEvent.tenant_id,
        booking_id: 'BK-2026-8492',
        ticket_code: 'STD-1092-B',
        name: 'Priya Mehta',
        email: 'priya@example.com',
        phone: '+91 98765 00002',
        business_name: 'Mehta Textiles',
        pass_type: 'Standard',
        status: 'confirmed',
        registered_at: new Date(Date.now() - 3600000 * 12).toISOString(),
      }
    ]);
  }
}

export class EventService {
  constructor() {
    ensureSeedEvent();
  }

  /**
   * Helper to generate a URL-friendly slug
   */
  private slugify(text: string): string {
    return text
      .toString()
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-')
      .replace(/[^\w-]+/g, '')
      .replace(/--+/g, '-')
      .replace(/^-+/, '')
      .replace(/-+$/, '') || 'event-' + Math.random().toString(36).substring(2, 8);
  }

  /**
   * Helper to generate a unique ticket code
   */
  private generateTicketCode(passType: string = 'STD'): string {
    const prefix = passType.toUpperCase().substring(0, 3) || 'REG';
    const num = Math.floor(1000 + Math.random() * 9000);
    const char = String.fromCharCode(65 + Math.floor(Math.random() * 26));
    return `${prefix}-${num}-${char}`;
  }

  /**
   * Automated Event Form Generation from Flyer Studio
   */
  async createEventFromFlyer(tenantId: string, tenantSlug: string, data: CreateEventFromFlyerRequest): Promise<{
    event: EventRecord;
    public_url: string;
    form_slug: string;
  }> {
    try {
      const baseSlug = this.slugify(data.title || 'event');
      let finalSlug = baseSlug;
      let counter = 1;

      // Ensure slug uniqueness
      while (inMemoryEvents.has(finalSlug)) {
        finalSlug = `${baseSlug}-${counter++}`;
      }

      const eventId = `event-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      
      const newEvent: EventRecord = {
        id: eventId,
        tenant_id: tenantId,
        tenant_slug: tenantSlug,
        slug: finalSlug,
        title: data.title || 'Upcoming Event',
        sub_heading: data.sub_heading || 'Join us for an exclusive, transformative experience.',
        badge_text: data.badge_text || 'EXCLUSIVE EVENT',
        date: data.date || 'TBD',
        time: data.time || '10:00 AM – 5:00 PM',
        venue: data.venue || 'Virtual / Online',
        vibe: data.vibe || 'cyberpunk',
        accent_color: data.color || '#00f5ff',
        format: data.format || 'square',
        speakers: data.speakers || [],
        agenda: data.agenda || [],
        perks: data.perks || [],
        cta_text: data.cta_text || 'REGISTER NOW — LIMITED SEATS',
        contact_phone: data.contact_phone || '+91 98765 43210',
        flyer_image_url: data.flyer_image_url || null,
        capacity: data.capacity || 500,
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      inMemoryEvents.set(finalSlug, newEvent);
      inMemoryAttendees.set(eventId, []);

      logger.info('Automated event created from flyer', {
        eventId,
        slug: finalSlug,
        tenantId,
        title: newEvent.title
      });

      const public_url = `/register/${finalSlug}`;

      return {
        event: newEvent,
        public_url,
        form_slug: finalSlug
      };
    } catch (error) {
      logger.error('Error in createEventFromFlyer', { error });
      throw new AppError('Failed to generate automated event form', 500, 'EVENT_CREATION_FAILED');
    }
  }

  /**
   * Get public event details by slug
   */
  async getEventBySlug(eventSlug: string): Promise<{
    event: EventRecord;
    tenant: {
      name: string;
      company_name: string | null;
      logo_url: string | null;
      primary_color: string;
      secondary_color: string;
    } | null;
  }> {
    ensureSeedEvent();
    const event = inMemoryEvents.get(eventSlug);
    if (!event) {
      // Also check by ID
      const byId = Array.from(inMemoryEvents.values()).find(e => e.id === eventSlug);
      if (!byId) {
        throw new AppError('Event not found or has expired', 404, 'EVENT_NOT_FOUND');
      }
      return this.enrichEventWithTenant(byId);
    }
    return this.enrichEventWithTenant(event);
  }

  private async enrichEventWithTenant(event: EventRecord) {
    let tenantInfo = null;
    try {
      if (event.tenant_id) {
        const tenant = await tenantService.getById(event.tenant_id);
        if (tenant) {
          tenantInfo = {
            name: tenant.name,
            company_name: tenant.company_name,
            logo_url: tenant.logo_url,
            primary_color: tenant.primary_color,
            secondary_color: tenant.secondary_color,
          };
        }
      }
    } catch {
      // Fallback
    }

    const attendees = inMemoryAttendees.get(event.id) || [];

    return {
      event: {
        ...event,
        attendees_count: attendees.length
      },
      tenant: tenantInfo
    };
  }

  /**
   * Register a new attendee for an event & sync with Supabase registrations table
   */
  async registerAttendee(eventSlug: string, data: RegisterAttendeeRequest, metadata?: { ip?: string; userAgent?: string }): Promise<{
    success: boolean;
    booking_id: string;
    ticket_code: string;
    attendee: AttendeeRecord;
    event: {
      title: string;
      date: string;
      venue: string;
    };
  }> {
    const { event } = await this.getEventBySlug(eventSlug);

    const emailClean = (data.email || '').toLowerCase().trim();
    if (!data.name || !emailClean || !data.phone) {
      throw new AppError('Name, valid email, and phone number are required', 400, 'VALIDATION_ERROR');
    }

    // Check capacity
    const currentAttendees = inMemoryAttendees.get(event.id) || [];
    if (currentAttendees.length >= event.capacity) {
      throw new AppError('This event has reached maximum seating capacity.', 400, 'CAPACITY_REACHED');
    }

    // Check duplicate email for this specific event
    const existing = currentAttendees.find(a => a.email.toLowerCase() === emailClean);
    if (existing) {
      throw new AppError('This email is already registered for this event.', 409, 'ALREADY_REGISTERED');
    }

    const bookingId = `BK-${Date.now().toString().slice(-6)}-${Math.floor(100 + Math.random() * 900)}`;
    const passType = data.pass_type || 'Standard';
    const ticketCode = this.generateTicketCode(passType);

    const attendeeRecord: AttendeeRecord = {
      id: `att-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      event_id: event.id,
      event_slug: event.slug,
      event_title: event.title,
      tenant_id: event.tenant_id,
      booking_id: bookingId,
      ticket_code: ticketCode,
      name: data.name.trim(),
      email: emailClean,
      phone: data.phone.trim(),
      business_name: data.business_name || null,
      pass_type: passType,
      status: 'confirmed',
      registered_at: new Date().toISOString(),
      notes: data.notes || null,
    };

    // Store in event attendee cache
    currentAttendees.unshift(attendeeRecord);
    inMemoryAttendees.set(event.id, currentAttendees);

    // Sync to Supabase `registrations` table
    try {
      await supabase
        .from('registrations')
        .insert({
          booking_id: bookingId,
          name: data.name.trim(),
          email: emailClean,
          phone: data.phone.trim(),
          business_name: data.business_name || null,
          tier: passType.toLowerCase() as any,
          amount_paid: 0,
          payment_status: 'confirmed',
          registration_status: 'confirmed',
          utm_source: `event:${event.slug}`,
          utm_campaign: event.title,
          ip_address: metadata?.ip || null,
          user_agent: metadata?.userAgent || null,
        });
      logger.info('Attendee synced directly to Supabase registrations table', {
        bookingId,
        email: emailClean,
        eventSlug: event.slug
      });
    } catch (syncErr: any) {
      logger.warn('Non-blocking Supabase sync error (in-memory registered):', { message: syncErr?.message });
    }

    return {
      success: true,
      booking_id: bookingId,
      ticket_code: ticketCode,
      attendee: attendeeRecord,
      event: {
        title: event.title,
        date: event.date,
        venue: event.venue
      }
    };
  }

  /**
   * Get all events for a tenant with attendee counts
   */
  async getTenantEvents(tenantId: string): Promise<EventRecord[]> {
    ensureSeedEvent();
    const all = Array.from(inMemoryEvents.values());
    const tenantEvents = all.filter(e => e.tenant_id === tenantId || e.tenant_id === '00000000-0000-0000-0000-000000000001');

    return tenantEvents.map(e => {
      const attendees = inMemoryAttendees.get(e.id) || [];
      return {
        ...e,
        attendees_count: attendees.length
      };
    });
  }

  /**
   * Get all attendees across all events for a tenant (Attendee Database view)
   */
  async getAllTenantAttendees(tenantId: string): Promise<AttendeeRecord[]> {
    ensureSeedEvent();
    const events = await this.getTenantEvents(tenantId);
    const eventIds = new Set(events.map(e => e.id));

    const result: AttendeeRecord[] = [];
    for (const [eventId, list] of inMemoryAttendees.entries()) {
      if (eventIds.has(eventId)) {
        result.push(...list);
      }
    }

    // Sort newest first
    return result.sort((a, b) => new Date(b.registered_at).getTime() - new Date(a.registered_at).getTime());
  }

  /**
   * Get attendees for a specific event
   */
  async getEventAttendees(tenantId: string, eventId: string): Promise<AttendeeRecord[]> {
    const list = inMemoryAttendees.get(eventId) || [];
    return list.filter(a => a.tenant_id === tenantId || a.tenant_id === '00000000-0000-0000-0000-000000000001');
  }
}

export const eventService = new EventService();
