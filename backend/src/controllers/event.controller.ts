import { Request, Response } from 'express';
import { eventService } from '../services/event.service.js';
import { isFeatureAllowed } from '../utils/planPermissions.js';
import { tenantService } from '../services/tenant.service.js';
import { logger } from '../utils/logger.js';

/**
 * POST /api/t/:slug/events/from-flyer
 * Automatically generates a public event registration page and unique slug from the flyer schema
 */
export async function createEventFromFlyer(req: Request, res: Response): Promise<void> {
  const tenantId = (req as any).tenantId as string;
  const slug = req.params.slug;

  if (!tenantId) {
    res.status(401).json({ success: false, error: { message: 'Authentication required', code: 'UNAUTHORIZED' } });
    return;
  }

  const { title, sub_heading, badge_text, date, time, venue, vibe, color, format, speakers, agenda, perks, cta_text, contact_phone, flyer_image_url, capacity } = req.body;

  if (!title || !date || !venue) {
    res.status(400).json({
      success: false,
      error: { message: 'Title, date, and venue are required to generate the event form', code: 'VALIDATION_ERROR' }
    });
    return;
  }

  const result = await eventService.createEventFromFlyer(tenantId, slug, {
    title,
    sub_heading,
    badge_text,
    date,
    time,
    venue,
    vibe,
    color,
    format,
    speakers,
    agenda,
    perks,
    cta_text,
    contact_phone,
    flyer_image_url,
    capacity
  });

  res.status(201).json({
    success: true,
    data: result
  });
}

/**
 * GET /api/t/:slug/events
 * Get all events for the tenant with live attendee counts
 */
export async function getTenantEvents(req: Request, res: Response): Promise<void> {
  const tenantId = (req as any).tenantId as string;
  if (!tenantId) {
    res.status(401).json({ success: false, error: { message: 'Authentication required', code: 'UNAUTHORIZED' } });
    return;
  }

  const events = await eventService.getTenantEvents(tenantId);
  res.json({ success: true, data: { events } });
}

/**
 * GET /api/t/:slug/events/attendees
 * Get all attendee registrations across all events for the tenant (Live Attendee Database)
 */
export async function getTenantAttendees(req: Request, res: Response): Promise<void> {
  const tenantId = (req as any).tenantId as string;
  if (!tenantId) {
    res.status(401).json({ success: false, error: { message: 'Authentication required', code: 'UNAUTHORIZED' } });
    return;
  }

  const attendees = await eventService.getAllTenantAttendees(tenantId);
  res.json({ success: true, data: { attendees } });
}

/**
 * GET /api/t/:slug/events/:eventId/attendees
 * Get attendee roster for a specific event
 */
export async function getEventAttendees(req: Request, res: Response): Promise<void> {
  const tenantId = (req as any).tenantId as string;
  const { eventId } = req.params;

  if (!tenantId) {
    res.status(401).json({ success: false, error: { message: 'Authentication required', code: 'UNAUTHORIZED' } });
    return;
  }

  const attendees = await eventService.getEventAttendees(tenantId, eventId);
  res.json({ success: true, data: { attendees } });
}

/**
 * GET /api/public/events/:eventSlug
 * Public endpoint to fetch event metadata for the hosted registration page
 */
export async function getPublicEvent(req: Request, res: Response): Promise<void> {
  const { eventSlug } = req.params;
  const data = await eventService.getEventBySlug(eventSlug);
  res.json({ success: true, data });
}

/**
 * POST /api/public/events/:eventSlug/register
 * Public attendee registration form submission
 */
export async function registerPublicAttendee(req: Request, res: Response): Promise<void> {
  const { eventSlug } = req.params;
  const { name, email, phone, business_name, pass_type, notes } = req.body;

  const metadata = {
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.get('user-agent')
  };

  const result = await eventService.registerAttendee(eventSlug, {
    name,
    email,
    phone,
    business_name,
    pass_type,
    notes
  }, metadata);

  res.status(201).json(result);
}

/**
 * GET /api/t/:slug/features
 * Return active tenant's plan feature permissions
 */
export async function getTenantFeaturePermissions(req: Request, res: Response): Promise<void> {
  const tenantId = (req as any).tenantId as string;
  if (!tenantId) {
    res.status(401).json({ success: false, error: { message: 'Authentication required', code: 'UNAUTHORIZED' } });
    return;
  }

  const tenant = await tenantService.getById(tenantId);
  const plan = tenant?.subscription_plan || 'basic';
  const { getPlanPermissions } = await import('../utils/planPermissions.js');
  const permissions = getPlanPermissions(plan);

  res.json({
    success: true,
    data: {
      plan,
      subscription_status: tenant?.subscription_status || 'active',
      permissions
    }
  });
}
