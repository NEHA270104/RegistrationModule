/**
 * Professional Email Templates Engine
 * Features: Category Selector · Real-Time Live Browser Preview · Variable Substitution Chips
 */
document.addEventListener('DOMContentLoaded', () => {
    // ── 1. Auth check ────────────────────────────────────────────────
    if (!DashboardAuth.isAuthenticated()) {
        window.location.href = '/dashboard';
        return;
    }

    // ── 2. Tenant branding ───────────────────────────────────────────
    const tenant = DashboardAuth.getTenant();
    if (tenant) {
        const sidebarTenantName = document.getElementById('sidebar-tenant-name');
        if (sidebarTenantName) {
            sidebarTenantName.textContent = tenant.company_name || tenant.name || 'Dashboard';
        }
        const headerUserName = document.getElementById('header-user-name');
        if (headerUserName) {
            headerUserName.innerHTML = `<i data-lucide="circle-user"></i> <span>${tenant.name || tenant.company_name || 'User'}</span>`;
        }

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

        const logoEl = document.querySelector('.sidebar-logo');
        if (logoEl && tenant.logo_url) {
            logoEl.innerHTML = `<img src="${tenant.logo_url}" alt="Logo" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
        }

        if (headerUserName) {
            let avatarImg = headerUserName.querySelector('#header-user-avatar');
            if (!avatarImg) {
                avatarImg = document.createElement('img');
                avatarImg.id = 'header-user-avatar';
                avatarImg.style.cssText = 'width: 28px; height: 28px; border-radius: 50%; object-fit: cover; margin-right: 8px; display: none; vertical-align: middle;';
                headerUserName.insertBefore(avatarImg, headerUserName.firstChild);
            }
            const userIcon = headerUserName.querySelector('[data-lucide="circle-user"], .lucide-circle-user');
            if (tenant.logo_url) {
                avatarImg.src = tenant.logo_url;
                avatarImg.style.display = 'inline-block';
                if (userIcon) userIcon.style.display = 'none';
            }
        }

        const adminNav = document.getElementById('nav-item-admin-notifications');
        if (adminNav) {
            adminNav.style.display = DashboardAuth.isAdmin() ? 'flex' : 'none';
        }
    }

    // ── 3. Sidebar toggle ────────────────────────────────────────────
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.getElementById('sidebar');
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            const isMobile = window.innerWidth < 768;
            sidebar.classList.toggle(isMobile ? 'open' : 'collapsed');
        });
    }

    document.querySelectorAll('.nav-group-header').forEach(header => {
        header.addEventListener('click', () => {
            const group = header.closest('.nav-group');
            if (group) group.classList.toggle('open');
        });
    });

    // ── 4. Logout & Clean Slate Reset ─────────────────────────────────
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            DashboardAuth.logout();
            window.location.href = '/dashboard';
        });
    }

    const cleanSlateBtn = document.getElementById('clean-slate-btn');
    if (cleanSlateBtn) {
        cleanSlateBtn.addEventListener('click', () => {
            if (confirm('⚠️ Clean Slate Data Reset:\n\nAre you sure you want to wipe all local test data, cached events, and sessions? You will be redirected to restart onboarding.')) {
                DashboardAuth.wipeAllTestData();
                alert('✓ Local test data and sessions wiped cleanly. Redirecting to onboarding...');
                window.location.href = '/onboarding';
            }
        });
    }

    // =====================================================================
    //  PRESET EMAIL TEMPLATES DEFINITION
    // =====================================================================

    const DEFAULT_TEMPLATES = {
        vip: {
            subject: '👔 Official VIP Invitation: Tech Innovation Summit 2026',
            body: `Dear [Guest Name],

You are cordially invited as a VIP Executive Guest to {{event_name}}.

📅 Event Date: [Event Date]
📍 Location & Venue: [Venue]
💼 Organization: {{company_name}}
🎫 Access Pass Code: {{ticket_code}}

This executive dossier grants you priority access to C-Suite keynotes, private networking lounges, and VIP strategy sessions.

Please confirm your attendance at your earliest convenience.

Warm regards,
The {{company_name}} Executive Committee`
        },
        reminder: {
            subject: '⏰ 24-Hour Final Notice: {{event_name}} Starts Tomorrow!',
            body: `Hi [Guest Name],

This is your 24-hour reminder that {{event_name}} takes place tomorrow!

📅 Date & Time: [Event Date]
📍 Venue: [Venue]
🎫 Fast-Track Ticket Code: {{ticket_code}}

Please present your fast-track badge code at the reception desk for instant check-in.

We look forward to welcoming you!

Best regards,
{{company_name}} Event Team`
        },
        thanks: {
            subject: '💬 Thank You for Joining Us at {{event_name}}!',
            body: `Dear [Guest Name],

Thank you for attending {{event_name}} hosted by {{company_name}} at [Venue].

We hope you found the keynotes and networking sessions invaluable. We would love to hear your feedback to help us craft even better enterprise experiences in the future.

Access your presentation slides and recordings here: https://eventreg.io/recap/{{ticket_code}}

Warm regards,
{{company_name}} Organizing Team`
        }
    };

    // =====================================================================
    //  DOM ELEMENTS & STATE
    // =====================================================================

    const eventSelect = document.getElementById('template-event-select');
    const typeSelect = document.getElementById('template-type-select');
    const subjectInput = document.getElementById('template-subject');
    const bodyInput = document.getElementById('template-body');
    const templateForm = document.getElementById('template-form');

    const previewHeader = document.getElementById('email-preview-header');
    const previewFrom = document.getElementById('email-preview-from');
    const previewSubject = document.getElementById('email-preview-subject');
    const previewBody = document.getElementById('email-preview-body');

    function getEvents() {
        let events = [];
        try {
            const raw = localStorage.getItem('summit_events');
            if (raw) events = JSON.parse(raw);
        } catch (e) {
            console.error('[Email Engine] Error parsing events:', e);
        }

        if (!events || events.length === 0) {
            events = [
                {
                    id: 'default-event-1',
                    name: 'Tech Innovation Summit 2026',
                    date: 'OCTOBER 24, 2026 · 10:00 AM IST',
                    venue: 'GRAND HYATT CONVENTION CENTER, MUMBAI'
                }
            ];
        }
        return events;
    }

    // Populate Event Select Box
    function initEventSelect() {
        const events = getEvents();
        if (!eventSelect) return;

        eventSelect.innerHTML = '';
        events.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.textContent = e.name;
            eventSelect.appendChild(opt);
        });
    }

    // Load active preset into form
    function loadPresetTemplate(type) {
        const tpl = DEFAULT_TEMPLATES[type] || DEFAULT_TEMPLATES.vip;
        if (subjectInput) subjectInput.value = tpl.subject;
        if (bodyInput) bodyInput.value = tpl.body;
        updateEmailPreview();
    }

    // Real-Time Dynamic Live Browser Preview Rendering
    function updateEmailPreview() {
        const events = getEvents();
        const selectedId = eventSelect ? eventSelect.value : '';
        const event = events.find(e => e.id === selectedId) || events[0] || {
            name: 'Tech Innovation Summit 2026',
            date: 'OCTOBER 24, 2026 · 10:00 AM IST',
            venue: 'GRAND HYATT CONVENTION CENTER, MUMBAI'
        };

        const subjectVal = subjectInput ? subjectInput.value : '';
        const bodyVal = bodyInput ? bodyInput.value : '';
        const companyName = tenant ? (tenant.company_name || tenant.name || 'Event Organization') : 'Event Organization';
        const senderEmail = tenant ? (tenant.email || 'events@eventreg.com') : 'events@eventreg.com';

        const mockGuest = {
            name: 'Alex Johnson',
            email: 'attendee@example.com',
            ticket: 'VIP-8492-X'
        };

        let renderedSubject = subjectVal
            .replace(/\{\{guest_name\}\}|\[Guest Name\]/gi, mockGuest.name)
            .replace(/\{\{event_name\}\}|\[Event Name\]/gi, event.name)
            .replace(/\{\{event_date\}\}|\[Event Date\]/gi, event.date)
            .replace(/\{\{event_venue\}\}|\[Venue\]/gi, event.venue)
            .replace(/\{\{company_name\}\}|\[Company Name\]/gi, companyName)
            .replace(/\{\{ticket_code\}\}|\[Ticket Code\]/gi, mockGuest.ticket);

        let renderedBody = bodyVal
            .replace(/\{\{guest_name\}\}|\[Guest Name\]/gi, mockGuest.name)
            .replace(/\{\{event_name\}\}|\[Event Name\]/gi, event.name)
            .replace(/\{\{event_date\}\}|\[Event Date\]/gi, event.date)
            .replace(/\{\{event_venue\}\}|\[Venue\]/gi, event.venue)
            .replace(/\{\{company_name\}\}|\[Company Name\]/gi, companyName)
            .replace(/\{\{ticket_code\}\}|\[Ticket Code\]/gi, mockGuest.ticket);

        if (previewHeader) previewHeader.style.display = 'block';
        if (previewFrom) previewFrom.textContent = `${companyName} <${senderEmail}>`;
        if (previewSubject) previewSubject.textContent = renderedSubject || 'No Subject';
        if (previewBody) {
            const companyLogo = tenant && tenant.logo_url ? `<img src="${tenant.logo_url}" style="height: 32px; border-radius: 4px; object-fit: contain; margin-bottom: 4px; display: block;">` : '';
            const primaryColor = tenant && tenant.primary_color ? tenant.primary_color : '#667eea';

            const formattedBodyParagraphs = (renderedBody || '')
                .split('\n\n')
                .map(p => `<p style="margin: 0 0 14px 0; line-height: 1.65; color: #334155; font-size: 13.5px;">${p.replace(/\n/g, '<br>')}</p>`)
                .join('');

            previewBody.innerHTML = `
                <div style="background: #ffffff; border-radius: 12px; padding: 24px; color: #1e293b; font-family: 'Inter', system-ui, -apple-system, sans-serif; box-shadow: 0 10px 30px rgba(0,0,0,0.12); border-top: 4px solid ${primaryColor}; max-width: 580px; margin: 0 auto; border: 1px solid #e2e8f0; text-align: left;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; padding-bottom: 14px; margin-bottom: 18px;">
                        <div>
                            ${companyLogo}
                            <div style="font-size: 14px; font-weight: 800; color: #0f172a; letter-spacing: -0.2px;">${companyName}</div>
                        </div>
                        <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; color: ${primaryColor}; background: rgba(102,126,234,0.1); padding: 4px 10px; border-radius: 999px;">OFFICIAL INVITATION</span>
                    </div>
                    
                    <div style="padding: 4px 0;">
                        ${formattedBodyParagraphs}
                    </div>

                    <div style="text-align: center; margin: 22px 0 16px;">
                        <a href="#" style="display: inline-block; background: ${primaryColor}; color: #ffffff; text-decoration: none; padding: 11px 26px; border-radius: 8px; font-weight: 700; font-size: 13.5px; box-shadow: 0 4px 14px rgba(102,126,234,0.35);">Confirm Attendance & Access Pass</a>
                    </div>

                    <div style="border-top: 1px solid #f1f5f9; padding-top: 14px; margin-top: 20px; font-size: 11.5px; color: #94a3b8; text-align: center;">
                        Sent by <strong>${companyName}</strong> · Enterprise Attendee Management System
                    </div>
                </div>
            `;
        }
    }

    // ── Variable Insertion Chips ──────────────────────────────────────
    let lastActiveField = bodyInput;
    if (subjectInput) subjectInput.addEventListener('focus', () => lastActiveField = subjectInput);
    if (bodyInput) bodyInput.addEventListener('focus', () => lastActiveField = bodyInput);

    document.querySelectorAll('.var-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const varTag = chip.dataset.var;
            if (!varTag || !lastActiveField) return;

            const startPos = lastActiveField.selectionStart || lastActiveField.value.length;
            const endPos = lastActiveField.selectionEnd || lastActiveField.value.length;

            lastActiveField.value = lastActiveField.value.substring(0, startPos) + varTag + lastActiveField.value.substring(endPos);
            lastActiveField.focus();
            lastActiveField.selectionStart = lastActiveField.selectionEnd = startPos + varTag.length;
            updateEmailPreview();
        });
    });

    // ── Event Listeners for Instant Live Typing Preview ───────────────
    if (subjectInput) subjectInput.addEventListener('input', updateEmailPreview);
    if (bodyInput) bodyInput.addEventListener('input', updateEmailPreview);

    if (typeSelect) {
        typeSelect.addEventListener('change', (e) => {
            loadPresetTemplate(e.target.value);
        });
    }

    if (eventSelect) {
        eventSelect.addEventListener('change', updateEmailPreview);
    }

    // Form submission
    if (templateForm) {
        templateForm.addEventListener('submit', (e) => {
            e.preventDefault();
            alert('✓ Email template saved successfully for this event context!');
        });
    }

    const btnSendTest = document.getElementById('btn-send-test-email');
    if (btnSendTest) {
        btnSendTest.addEventListener('click', () => {
            alert('📧 Simulated Test Email sent to: attendee@example.com');
        });
    }

    // ── INITIALIZATION (NO empty state) ──────────────────────────────
    initEventSelect();
    loadPresetTemplate(typeSelect ? typeSelect.value : 'vip');

    if (window.lucide) window.lucide.createIcons();
});
