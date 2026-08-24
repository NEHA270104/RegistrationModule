/**
 * Events Hub & Live Attendee Database Controller
 */
document.addEventListener('DOMContentLoaded', () => {
    // 1. Authentication check
    if (!DashboardAuth.isAuthenticated()) {
        window.location.href = '/dashboard';
        return;
    }

    // 2. Load tenant data & setup dynamic branding/logo
    const tenant = DashboardAuth.getTenant();
    const tenantSlug = (tenant && tenant.slug) || 'default';

    if (tenant) {
        const sidebarTenantName = document.getElementById('sidebar-tenant-name');
        if (sidebarTenantName) {
            sidebarTenantName.textContent = tenant.company_name || tenant.name || 'Dashboard';
        }
        const headerUserName = document.getElementById('header-user-name');
        if (headerUserName) {
            headerUserName.innerHTML = `<i data-lucide="circle-user"></i> <span>${tenant.name || tenant.company_name || 'User'}</span>`;
        }

        // Apply brand colors
        const root = document.documentElement;
        if (tenant.primary_color) {
            root.style.setProperty('--primary', tenant.primary_color);
            root.style.setProperty('--primary-dark', tenant.primary_color);
        }
        if (tenant.secondary_color) {
            root.style.setProperty('--secondary', tenant.secondary_color);
        }
        const pColor = tenant.primary_color || '#667eea';
        const sColor = tenant.secondary_color || '#764ba2';
        root.style.setProperty('--gradient', `linear-gradient(135deg, ${pColor} 0%, ${sColor} 100%)`);

        // Inject logo image if exists
        const logoEl = document.querySelector('.sidebar-logo');
        if (logoEl && tenant.logo_url) {
            logoEl.innerHTML = `<img src="${tenant.logo_url}" alt="Logo" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        }

        // Toggle Admin Alerts tab visibility
        const adminNav = document.getElementById('nav-item-admin-notifications');
        if (adminNav) {
            adminNav.style.display = DashboardAuth.isAdmin() ? 'flex' : 'none';
        }
    }

    // 3. Sidebar toggle action
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            const isMobile = window.innerWidth < 768;
            if (isMobile) {
                sidebar.classList.toggle('open');
            } else {
                sidebar.classList.toggle('collapsed');
            }
        });
    }

    // Collapsible sidebar groups
    const groupHeaders = document.querySelectorAll('.nav-group-header');
    groupHeaders.forEach((header) => {
        header.addEventListener('click', () => {
            const group = header.closest('.nav-group');
            if (group) {
                group.classList.toggle('open');
            }
        });
    });

    // 4. Logout action
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            DashboardAuth.logout();
            window.location.href = '/dashboard';
        });
    }

    // ===================================================================
    //  TAB NAVIGATION (Events Hub vs Attendee Database)
    // ===================================================================

    const tabBtnEvents = document.getElementById('tab-btn-events');
    const tabBtnAttendees = document.getElementById('tab-btn-attendees');
    const viewEventsHub = document.getElementById('view-events-hub');
    const viewAttendeeDatabase = document.getElementById('view-attendee-database');

    function switchTab(activeTab) {
        if (activeTab === 'events') {
            if (tabBtnEvents) {
                tabBtnEvents.style.background = 'var(--primary)';
                tabBtnEvents.style.color = '#fff';
            }
            if (tabBtnAttendees) {
                tabBtnAttendees.style.background = 'transparent';
                tabBtnAttendees.style.color = 'var(--text-light)';
            }
            if (viewEventsHub) viewEventsHub.style.display = 'block';
            if (viewAttendeeDatabase) viewAttendeeDatabase.style.display = 'none';
            renderEvents();
        } else {
            if (tabBtnEvents) {
                tabBtnEvents.style.background = 'transparent';
                tabBtnEvents.style.color = 'var(--text-light)';
            }
            if (tabBtnAttendees) {
                tabBtnAttendees.style.background = 'var(--primary)';
                tabBtnAttendees.style.color = '#fff';
            }
            if (viewEventsHub) viewEventsHub.style.display = 'none';
            if (viewAttendeeDatabase) viewAttendeeDatabase.style.display = 'block';
            loadAndRenderAttendees();
        }
        if (window.lucide) window.lucide.createIcons();
    }

    if (tabBtnEvents) tabBtnEvents.addEventListener('click', () => switchTab('events'));
    if (tabBtnAttendees) tabBtnAttendees.addEventListener('click', () => switchTab('attendees'));

    // ===================================================================
    //  EVENT DATA & EVENTS HUB RENDERING
    // ===================================================================

    let activeEventIdForGuests = null;
    let cachedAttendees = [];

    function escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function generateUUID() {
        return 'event-' + Math.random().toString(36).substr(2, 9) + '-' + Date.now().toString(36);
    }

    function getEvents() {
        const stored = localStorage.getItem('summit_events');
        if (!stored) {
            const defaultEvents = [
                {
                    id: 'event-default-1',
                    slug: 'ai-msme-business-summit-2026',
                    name: 'AI for MSME Business Summit 2026',
                    date: '2026-02-21',
                    venue: 'Centre For Police Research, Pashan, Pune',
                    description: 'Empowering small businesses with AI tools, automated solutions, and strategic workflows.',
                    capacity: 500,
                    public_url: `${window.location.origin}/register/ai-msme-business-summit-2026`,
                    guests: [
                        { name: 'Dr. Rajesh Sharma', email: 'rajesh@example.com', type: 'Keynote Speaker' },
                        { name: 'Priya Mehta', email: 'priya@example.com', type: 'Panelist' }
                    ]
                }
            ];
            localStorage.setItem('summit_events', JSON.stringify(defaultEvents));
            return defaultEvents;
        }
        return JSON.parse(stored);
    }

    function saveEvents(events) {
        localStorage.setItem('summit_events', JSON.stringify(events));
    }

    // Render Events Hub cards
    function renderEvents() {
        const events = getEvents();
        const container = document.getElementById('events-container');
        const countBadge = document.getElementById('events-count-badge');
        if (!container) return;

        if (countBadge) countBadge.textContent = `Showing ${events.length} events`;

        if (events.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="text-align: center; padding: 40px; color: var(--text-muted);">
                    <i data-lucide="calendar" style="width: 48px; height: 48px; margin-bottom: 12px; opacity: 0.5;"></i>
                    <p>No events created yet. Use the form on the left to add your first event.</p>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        container.innerHTML = events.map(event => {
            const guestCount = event.guests ? event.guests.length : 0;
            const remaining = (event.capacity || 500) - guestCount;
            const eventSlug = event.slug || (event.name || 'event').toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const publicFormUrl = event.public_url || `${window.location.origin}/register/${eventSlug}`;

            return `
                <div class="card" style="background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-light); border-radius: var(--radius); padding: 20px; transition: all 0.3s ease;">
                    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
                        <div>
                            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                                <h3 style="font-size: 18px; font-weight: 700; color: var(--text); margin: 0;">${escapeHTML(event.name)}</h3>
                                <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: 10px; padding: 2px 7px;">LIVE FORM</span>
                            </div>
                            <div style="display: flex; gap: 15px; font-size: 12.5px; color: var(--text-light);">
                                <span><i data-lucide="calendar" style="width: 13px; height: 13px; vertical-align: middle; margin-right: 4px; color: var(--primary);"></i>${event.date}</span>
                                <span><i data-lucide="map-pin" style="width: 13px; height: 13px; vertical-align: middle; margin-right: 4px; color: var(--secondary);"></i>${escapeHTML(event.venue)}</span>
                            </div>
                        </div>
                        <span class="badge" style="background: linear-gradient(135deg, rgba(217, 70, 239, 0.15) 0%, rgba(59, 130, 246, 0.15) 100%); color: var(--primary); border: 1px solid rgba(217, 70, 239, 0.3); font-size: 11px; font-weight: 700;">
                            ${guestCount} / ${event.capacity || 500} Attendees
                        </span>
                    </div>

                    <!-- Hosted Public Registration URL Bar -->
                    <div style="background: rgba(0, 0, 0, 0.35); border: 1px dashed rgba(56, 189, 248, 0.3); border-radius: 8px; padding: 8px 12px; margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
                        <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex: 1;">
                            <i data-lucide="link" style="width: 14px; height: 14px; color: #38bdf8; flex-shrink: 0;"></i>
                            <span style="font-size: 11.5px; color: #cbd5e1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                ${publicFormUrl}
                            </span>
                        </div>
                        <div style="display: flex; gap: 6px;">
                            <button class="btn btn-sm btn-outline btn-copy-event-link" data-url="${publicFormUrl}" style="padding: 4px 8px; font-size: 11px; gap: 4px;">
                                <i data-lucide="copy" style="width: 11px; height: 11px;"></i> Copy Link
                            </button>
                            <a href="/register/${eventSlug}" target="_blank" class="btn btn-sm btn-primary" style="padding: 4px 10px; font-size: 11px; text-decoration: none; display: inline-flex; align-items: center; gap: 4px; font-weight: 700;">
                                <i data-lucide="external-link" style="width: 11px; height: 11px;"></i> Open Form
                            </a>
                        </div>
                    </div>

                    <!-- Dynamic stats dashboard -->
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 14px; font-size: 13px;">
                        <div style="background: rgba(217, 70, 239, 0.05); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(217, 70, 239, 0.15); display: flex; align-items: center; gap: 8px;">
                            <i data-lucide="users-round" style="width: 16px; height: 16px; color: var(--primary);"></i>
                            <div>
                                <span style="font-size: 10px; color: var(--text-muted); display: block; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Registered Guests</span>
                                <strong style="color: var(--text); font-size: 14px;">${guestCount}</strong>
                            </div>
                        </div>
                        <div style="background: rgba(59, 130, 246, 0.05); padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.15); display: flex; align-items: center; gap: 8px;">
                            <i data-lucide="gauge" style="width: 16px; height: 16px; color: var(--secondary);"></i>
                            <div>
                                <span style="font-size: 10px; color: var(--text-muted); display: block; text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Seats Left</span>
                                <strong style="color: var(--text); font-size: 14px;">${remaining}</strong>
                            </div>
                        </div>
                    </div>

                    <p style="font-size: 12.5px; color: var(--text-light); margin-bottom: 16px; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
                        ${escapeHTML(event.description)}
                    </p>

                    <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap;">
                        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                            <button class="btn btn-sm btn-primary btn-manage-guests" data-id="${event.id}">
                                <i data-lucide="users" style="width: 13px; height: 13px; margin-right: 4px;"></i> Manage Guests
                            </button>
                            <a href="/dashboard/flyer-generation.html?event_id=${event.id}" class="btn btn-sm btn-outline" style="border: 1px solid var(--border-light); padding: 6px 12px; border-radius: 6px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; text-decoration: none; color: var(--text-light);">
                                <i data-lucide="image" style="width: 13px; height: 13px; color: var(--primary);"></i> Flyer Studio
                            </a>
                            <a href="/dashboard/email-templates.html?event_id=${event.id}" class="btn btn-sm btn-outline" style="border: 1px solid var(--border-light); padding: 6px 12px; border-radius: 6px; font-size: 12px; display: inline-flex; align-items: center; gap: 6px; text-decoration: none; color: var(--text-light);">
                                <i data-lucide="mail" style="width: 13px; height: 13px; color: var(--secondary);"></i> Email Studio
                            </a>
                        </div>
                        <button class="btn btn-sm btn-danger btn-delete-event" data-id="${event.id}" style="padding: 7px 11px; background: rgba(220, 53, 69, 0.1); color: var(--danger); border: 1px solid rgba(220, 53, 69, 0.2); border-radius: 6px; cursor: pointer;">
                            <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        if (window.lucide) window.lucide.createIcons();

        // Bind copy buttons
        document.querySelectorAll('.btn-copy-event-link').forEach(btn => {
            btn.addEventListener('click', () => {
                const url = btn.dataset.url;
                navigator.clipboard.writeText(url).then(() => {
                    const orig = btn.innerHTML;
                    btn.innerHTML = `<i data-lucide="check" style="width:11px;height:11px;"></i> Copied!`;
                    if (window.lucide) window.lucide.createIcons({ node: btn });
                    setTimeout(() => {
                        btn.innerHTML = orig;
                        if (window.lucide) window.lucide.createIcons({ node: btn });
                    }, 2000);
                });
            });
        });

        // Bind manage guests
        document.querySelectorAll('.btn-manage-guests').forEach(btn => {
            btn.addEventListener('click', () => {
                openGuestModal(btn.dataset.id);
            });
        });

        // Bind delete event
        document.querySelectorAll('.btn-delete-event').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('Are you sure you want to delete this event? This will remove all associated guests.')) {
                    deleteEvent(btn.dataset.id);
                }
            });
        });
    }

    function deleteEvent(id) {
        let events = getEvents();
        events = events.filter(e => e.id !== id);
        saveEvents(events);
        renderEvents();
        updateAttendeeBadge();
    }

    // Create Event Form Submission
    const createEventForm = document.getElementById('create-event-form');
    if (createEventForm) {
        createEventForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const name = document.getElementById('event-name').value.trim();
            const date = document.getElementById('event-date').value;
            const venue = document.getElementById('event-venue').value.trim();
            const description = document.getElementById('event-desc').value.trim();
            const capacity = parseInt(document.getElementById('event-capacity').value) || 500;

            const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
            const newEvent = {
                id: generateUUID(),
                slug,
                name,
                date,
                venue,
                description,
                capacity,
                public_url: `${window.location.origin}/register/${slug}`,
                guests: []
            };

            const events = getEvents();
            events.unshift(newEvent);
            saveEvents(events);

            if (window.ActivityLogger) {
                window.ActivityLogger.log('Event Creation', `Successfully created new event "${name}"`, { date, venue, capacity });
            }

            createEventForm.reset();
            renderEvents();
            updateAttendeeBadge();
        });
    }

    // ===================================================================
    //  ATTENDEE DATABASE SYNC & RENDERING
    // ===================================================================

    const attendeeSearchInput = document.getElementById('attendee-search-input');
    const attendeeFilterEvent = document.getElementById('attendee-filter-event');
    const btnSyncAttendees = document.getElementById('btn-sync-attendees');
    const btnExportCsv = document.getElementById('btn-export-csv');
    const attendeesTableBody = document.getElementById('attendees-table-body');
    const attendeesTotalBadge = document.getElementById('attendees-total-badge');

    async function fetchAttendeesFromCloud() {
        try {
            const token = DashboardAuth.getToken();
            const targetUrl = (typeof window !== 'undefined' && typeof window.resolveApiUrl === 'function')
                ? window.resolveApiUrl(`/t/${encodeURIComponent(tenantSlug)}/events/attendees`)
                : `/api/t/${encodeURIComponent(tenantSlug)}/events/attendees`;
            const res = await fetch(targetUrl, {
                headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
            });
            const ct = res.headers.get('content-type') || '';
            if (res.ok && ct.includes('application/json')) {
                const json = await res.json();
                if (json.success && Array.isArray(json.data?.attendees)) {
                    return json.data.attendees;
                }
            }
        } catch (err) {
            console.warn('Could not sync attendees from cloud DB, using local store:', err);
        }

        // Fallback: build from local summit_events
        const events = getEvents();
        const localList = [];
        events.forEach(e => {
            (e.guests || []).forEach((g, idx) => {
                localList.push({
                    id: `local-att-${e.id}-${idx}`,
                    ticket_code: `REG-${e.date.slice(0,4)}-${Math.floor(1000 + Math.random() * 9000)}`,
                    name: g.name,
                    email: g.email || 'attendee@example.com',
                    phone: '+91 98765 00000',
                    event_title: e.name,
                    pass_type: g.type || 'Standard',
                    registered_at: new Date().toISOString(),
                    status: 'confirmed'
                });
            });
        });
        return localList;
    }

    async function loadAndRenderAttendees() {
        if (!attendeesTableBody) return;
        attendeesTableBody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 30px; color: var(--text-muted);">
                    <i data-lucide="refresh-cw" style="width: 20px; height: 20px; animation: spin 1s linear infinite; margin-bottom: 8px;"></i>
                    <div>Syncing real-time registrations from Supabase...</div>
                </td>
            </tr>
        `;
        if (window.lucide) window.lucide.createIcons();

        cachedAttendees = await fetchAttendeesFromCloud();
        populateEventFilterDropdown();
        renderAttendeeTable();
        updateAttendeeBadge();
    }

    function populateEventFilterDropdown() {
        if (!attendeeFilterEvent) return;
        const events = getEvents();
        const curVal = attendeeFilterEvent.value;
        attendeeFilterEvent.innerHTML = '<option value="all">All Events</option>' + events.map(e => `
            <option value="${escapeHTML(e.name)}">${escapeHTML(e.name)}</option>
        `).join('');
        attendeeFilterEvent.value = curVal || 'all';
    }

    function updateAttendeeBadge() {
        const total = cachedAttendees.length || getEvents().reduce((acc, e) => acc + (e.guests?.length || 0), 0);
        if (attendeesTotalBadge) attendeesTotalBadge.textContent = total;
    }

    function renderAttendeeTable() {
        if (!attendeesTableBody) return;
        const query = (attendeeSearchInput ? attendeeSearchInput.value.toLowerCase().trim() : '');
        const eventFilter = (attendeeFilterEvent ? attendeeFilterEvent.value : 'all');

        let filtered = cachedAttendees.filter(a => {
            const matchesQuery = !query ||
                (a.name && a.name.toLowerCase().includes(query)) ||
                (a.email && a.email.toLowerCase().includes(query)) ||
                (a.phone && a.phone.toLowerCase().includes(query)) ||
                (a.ticket_code && a.ticket_code.toLowerCase().includes(query));

            const matchesEvent = eventFilter === 'all' || (a.event_title === eventFilter);

            return matchesQuery && matchesEvent;
        });

        if (filtered.length === 0) {
            attendeesTableBody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 40px; color: var(--text-muted);">
                        <i data-lucide="users" style="width: 36px; height: 36px; margin-bottom: 8px; opacity: 0.5;"></i>
                        <p style="margin: 0;">No attendee records found matching your filters.</p>
                    </td>
                </tr>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        attendeesTableBody.innerHTML = filtered.map(a => {
            const dateStr = a.registered_at ? new Date(a.registered_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Today';
            return `
                <tr style="border-bottom: 1px solid rgba(255, 255, 255, 0.05); transition: background 0.15s;">
                    <td style="padding: 12px 14px; font-family: monospace; font-weight: 700; color: #38bdf8;">${escapeHTML(a.ticket_code || 'REG-2026')}</td>
                    <td style="padding: 12px 14px; font-weight: 600; color: #fff;">${escapeHTML(a.name)}</td>
                    <td style="padding: 12px 14px; color: var(--text-light);">${escapeHTML(a.email)}</td>
                    <td style="padding: 12px 14px; color: var(--text-light);">${escapeHTML(a.phone || '—')}</td>
                    <td style="padding: 12px 14px; color: #cbd5e1; max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHTML(a.event_title || 'MSME Summit')}</td>
                    <td style="padding: 12px 14px;">
                        <span class="badge" style="background: rgba(56, 189, 248, 0.15); color: #38bdf8; font-size: 11px;">
                            ${escapeHTML(a.pass_type || 'Standard')}
                        </span>
                    </td>
                    <td style="padding: 12px 14px; color: var(--text-muted); font-size: 12px;">${dateStr}</td>
                    <td style="padding: 12px 14px;">
                        <span class="badge" style="background: rgba(16, 185, 129, 0.15); color: #10b981; font-size: 10px;">
                            ${escapeHTML(a.status || 'Confirmed')}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');

        if (window.lucide) window.lucide.createIcons();
    }

    if (attendeeSearchInput) attendeeSearchInput.addEventListener('input', renderAttendeeTable);
    if (attendeeFilterEvent) attendeeFilterEvent.addEventListener('change', renderAttendeeTable);

    if (btnSyncAttendees) {
        btnSyncAttendees.addEventListener('click', async () => {
            btnSyncAttendees.disabled = true;
            btnSyncAttendees.innerHTML = `<i data-lucide="refresh-cw" style="width:13px;height:13px;animation:spin 1s linear infinite;"></i> Syncing…`;
            await loadAndRenderAttendees();
            btnSyncAttendees.disabled = false;
            btnSyncAttendees.innerHTML = `<i data-lucide="check" style="width:13px;height:13px;"></i> Synced!`;
            if (window.lucide) window.lucide.createIcons({ node: btnSyncAttendees });
            setTimeout(() => {
                btnSyncAttendees.innerHTML = `<i data-lucide="refresh-cw" style="width:13px;height:13px;"></i> Sync Cloud DB`;
                if (window.lucide) window.lucide.createIcons({ node: btnSyncAttendees });
            }, 2000);
        });
    }

    // CSV Export with Subscription Feature Gating Check
    if (btnExportCsv) {
        btnExportCsv.addEventListener('click', () => {
            if (window.PlanPermissions && !window.PlanPermissions.can('csvExport')) {
                window.PlanPermissions.showUpgradeModal('csvExport', 'ScaleUp Pro');
                return;
            }

            if (cachedAttendees.length === 0) {
                alert('No attendee records to export.');
                return;
            }

            const headers = ['Ticket Code', 'Attendee Name', 'Email', 'Phone', 'Event', 'Pass Type', 'Registered At', 'Status'];
            const rows = cachedAttendees.map(a => [
                `"${a.ticket_code || ''}"`,
                `"${a.name || ''}"`,
                `"${a.email || ''}"`,
                `"${a.phone || ''}"`,
                `"${a.event_title || ''}"`,
                `"${a.pass_type || ''}"`,
                `"${a.registered_at || ''}"`,
                `"${a.status || ''}"`
            ]);

            const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
            const encodedUri = encodeURI(csvContent);
            const link = document.createElement('a');
            link.setAttribute('href', encodedUri);
            link.setAttribute('download', `attendees-database-${Date.now()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            if (window.ActivityLogger) {
                window.ActivityLogger.log('Export Activity', `Exported ${cachedAttendees.length} attendee records to CSV`, { count: cachedAttendees.length });
            }
        });
    }

    // ===================================================================
    //  GUEST MANAGEMENT MODAL
    // ===================================================================

    const modalOverlay = document.getElementById('guest-modal-overlay');
    const modalCloseBtn = document.getElementById('guest-modal-close-btn');

    if (modalCloseBtn && modalOverlay) {
        modalCloseBtn.addEventListener('click', closeGuestModal);
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) closeGuestModal();
        });
    }

    function openGuestModal(eventId) {
        activeEventIdForGuests = eventId;
        const events = getEvents();
        const event = events.find(e => e.id === eventId);
        if (!event) return;

        document.getElementById('guest-modal-title').textContent = `Manage Guest Speakers - ${event.name}`;
        renderModalGuestList(event);
        if (modalOverlay) modalOverlay.style.display = 'flex';
        if (window.lucide) window.lucide.createIcons();
    }

    function closeGuestModal() {
        if (modalOverlay) modalOverlay.style.display = 'none';
        activeEventIdForGuests = null;
        renderEvents();
        updateAttendeeBadge();
    }

    function renderModalGuestList(event) {
        const container = document.getElementById('guests-list-container');
        if (!container) return;

        if (!event.guests || event.guests.length === 0) {
            container.innerHTML = `<p style="color: var(--text-muted); font-size: 13px; text-align: center; padding: 20px 0;">No guest speakers added yet.</p>`;
            return;
        }

        container.innerHTML = event.guests.map((guest, index) => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 14px; background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border-light); border-radius: 8px; margin-bottom: 8px;">
                <div>
                    <strong style="color: var(--text); font-size: 13px;">${escapeHTML(guest.name)}</strong>
                    <span style="color: var(--text-muted); font-size: 12px; margin-left: 8px;">${escapeHTML(guest.email)}</span>
                    <span class="badge" style="margin-left: 8px; font-size: 10px; background: rgba(56, 189, 248, 0.15); color: #38bdf8;">${escapeHTML(guest.type)}</span>
                </div>
                <button class="btn btn-sm btn-danger btn-remove-guest" data-index="${index}" style="padding: 4px 8px; background: rgba(220, 53, 69, 0.1); color: var(--danger); border: 1px solid rgba(220, 53, 69, 0.2); border-radius: 4px; cursor: pointer;">
                    <i data-lucide="x" style="width: 12px; height: 12px;"></i>
                </button>
            </div>
        `).join('');

        if (window.lucide) window.lucide.createIcons();

        container.querySelectorAll('.btn-remove-guest').forEach(btn => {
            btn.addEventListener('click', () => {
                removeGuest(parseInt(btn.dataset.index));
            });
        });
    }

    const addGuestForm = document.getElementById('add-guest-form');
    if (addGuestForm) {
        addGuestForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (!activeEventIdForGuests) return;

            const name = document.getElementById('guest-name').value.trim();
            const email = document.getElementById('guest-email').value.trim();
            const type = document.getElementById('guest-type').value;

            const events = getEvents();
            const event = events.find(ev => ev.id === activeEventIdForGuests);
            if (!event) return;

            if (!event.guests) event.guests = [];
            event.guests.push({ name, email, type });
            saveEvents(events);

            addGuestForm.reset();
            renderModalGuestList(event);
            updateAttendeeBadge();
        });
    }

    function removeGuest(index) {
        if (!activeEventIdForGuests) return;
        const events = getEvents();
        const event = events.find(ev => ev.id === activeEventIdForGuests);
        if (!event || !event.guests) return;

        event.guests.splice(index, 1);
        saveEvents(events);
        renderModalGuestList(event);
        updateAttendeeBadge();
    }

    // Initial render
    renderEvents();
    fetchAttendeesFromCloud().then(res => {
        cachedAttendees = res;
        updateAttendeeBadge();
    });
});
