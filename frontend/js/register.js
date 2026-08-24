/**
 * Hosted Public Event Registration Page Controller
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Determine eventSlug from URL
    function getEventSlug() {
        const pathSegments = window.location.pathname.split('/').filter(Boolean);
        // /register/:eventSlug
        if (pathSegments.length > 1 && pathSegments[0] === 'register') {
            return pathSegments[1];
        }
        // Fallback to query param (?event=slug or ?slug=slug)
        const params = new URLSearchParams(window.location.search);
        return params.get('event') || params.get('slug') || 'ai-msme-business-summit-2026';
    }

    const eventSlug = getEventSlug();

    // 2. DOM Elements
    const eventBadge = document.getElementById('event-badge');
    const eventTitle = document.getElementById('event-title');
    const eventSubheading = document.getElementById('event-subheading');
    const eventDate = document.getElementById('event-date');
    const eventTime = document.getElementById('event-time');
    const eventVenue = document.getElementById('event-venue');
    const orgName = document.getElementById('org-name');
    const orgLogo = document.getElementById('org-logo');
    const speakersList = document.getElementById('speakers-list');
    const agendaList = document.getElementById('agenda-list');
    const perksList = document.getElementById('perks-list');
    const formErrorAlert = document.getElementById('form-error-alert');
    const registrationForm = document.getElementById('public-registration-form');
    const registrationFormBox = document.getElementById('registration-form-box');
    const registrationSuccessBox = document.getElementById('registration-success-box');
    const submitBtn = document.getElementById('btn-submit-registration');
    const submitBtnText = document.getElementById('submit-btn-text');

    // Pass selector logic
    const passOptions = document.querySelectorAll('.pass-option');
    const selectedPassInput = document.getElementById('selected-pass-type');
    
    // Auto-select initial pass from URL (?tier=vip / ?pass=general)
    const initialPassParam = (params.get('tier') || params.get('pass') || '').toLowerCase();
    if (initialPassParam && passOptions.length > 0) {
        passOptions.forEach(opt => {
            const optVal = (opt.dataset.pass || '').toLowerCase();
            if (optVal === initialPassParam || optVal.includes(initialPassParam)) {
                passOptions.forEach(p => p.classList.remove('active'));
                opt.classList.add('active');
                if (selectedPassInput) selectedPassInput.value = opt.dataset.pass;
            }
        });
    }

    passOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            passOptions.forEach(p => p.classList.remove('active'));
            opt.classList.add('active');
            if (selectedPassInput) selectedPassInput.value = opt.dataset.pass;
        });
    });

    // 3. Fetch Event Metadata
    try {
        let json = null;
        if (typeof window !== 'undefined' && typeof window.safeApiFetch === 'function') {
            json = await window.safeApiFetch(`/public/events/${encodeURIComponent(eventSlug)}`);
        } else {
            const url = (typeof window !== 'undefined' && typeof window.resolveApiUrl === 'function')
                ? window.resolveApiUrl(`/public/events/${encodeURIComponent(eventSlug)}`)
                : `https://bizflow-registration.onrender.com/api/public/events/${encodeURIComponent(eventSlug)}`;
            const res = await fetch(url);
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
                json = await res.json();
            } else {
                const text = await res.text().catch(() => '');
                try { json = JSON.parse(text); } catch (_) {}
            }
        }

        if (!json || !json.success || !json.data || !json.data.event) {
            throw new Error(json?.error?.message || json?.message || 'Event details not found');
        }

        const { event, tenant } = json.data;

        // Apply accent color
        if (event.accent_color) {
            document.documentElement.style.setProperty('--event-accent', event.accent_color);
        }

        // Title and meta
        document.title = `${event.title} - Official Registration`;
        if (eventTitle) eventTitle.textContent = event.title;
        if (eventSubheading) eventSubheading.textContent = event.sub_heading || '';
        if (eventBadge) eventBadge.textContent = event.badge_text || 'EXCLUSIVE EVENT';
        if (eventDate) eventDate.textContent = event.date || 'TBD';
        if (eventTime) eventTime.textContent = event.time || '10:00 AM – 5:00 PM';
        if (eventVenue) eventVenue.textContent = event.venue || 'Virtual / Online';

        // Tenant Branding
        if (tenant) {
            if (orgName) orgName.textContent = tenant.company_name || tenant.name || 'Event Organizer';
            if (orgLogo && tenant.logo_url) {
                orgLogo.innerHTML = `<img src="${tenant.logo_url}" alt="Logo" style="width:100%;height:100%;object-fit:cover;">`;
            }
        }

        // Render Speakers
        if (speakersList) {
            if (event.speakers && event.speakers.length > 0) {
                speakersList.innerHTML = event.speakers.map(s => {
                    const avatarHtml = s.avatar_url
                        ? `<img src="${s.avatar_url}" alt="${s.name}" class="speaker-avatar" onerror="this.outerHTML='<div class=\\'speaker-avatar\\'>🎤</div>'">`
                        : `<div class="speaker-avatar">🎤</div>`;
                    return `
                        <div class="speaker-card">
                            ${avatarHtml}
                            <div style="flex: 1; min-width: 0;">
                                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                    <strong style="font-size: 14px; color: #fff;">${s.name}</strong>
                                    ${s.badge ? `<span class="badge" style="background: rgba(56, 189, 248, 0.15); color: var(--event-accent); font-size: 10px; padding: 2px 7px;">${s.badge}</span>` : ''}
                                </div>
                                <span style="font-size: 12.5px; color: #94a3b8;">${s.title || 'Speaker'}</span>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                document.getElementById('speakers-section')?.remove();
            }
        }

        // Render Agenda
        if (agendaList) {
            if (event.agenda && event.agenda.length > 0) {
                agendaList.innerHTML = event.agenda.map((item, idx) => `
                    <div style="display: flex; align-items: flex-start; gap: 12px; font-size: 13.5px; color: #cbd5e1;">
                        <span style="display: flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: rgba(56,189,248,0.15); color: var(--event-accent); font-size: 11px; font-weight: 800; flex-shrink: 0; margin-top: 1px;">
                            ${idx + 1}
                        </span>
                        <span style="line-height: 1.5;">${item}</span>
                    </div>
                `).join('');
            } else {
                document.getElementById('agenda-section')?.remove();
            }
        }

        // Render Perks
        if (perksList) {
            if (event.perks && event.perks.length > 0) {
                perksList.innerHTML = event.perks.map(perk => `
                    <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 12px 14px; display: flex; align-items: center; gap: 10px; font-size: 12.5px; color: #cbd5e1;">
                        <i data-lucide="check-circle-2" style="width: 16px; height: 16px; color: #10b981; flex-shrink: 0;"></i>
                        <span>${perk}</span>
                    </div>
                `).join('');
            } else {
                document.getElementById('perks-section')?.remove();
            }
        }

        if (window.lucide) window.lucide.createIcons();

    } catch (err) {
        console.error('Failed to fetch event:', err);
        if (eventTitle) eventTitle.textContent = 'Event Registration';
        if (eventSubheading) eventSubheading.textContent = 'Please fill in your details below to register for this upcoming session.';
    }

    // 4. Handle Form Submission & Attendee DB Sync
    if (registrationForm) {
        registrationForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (formErrorAlert) formErrorAlert.style.display = 'none';

            const name = document.getElementById('reg-name').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const phone = document.getElementById('reg-phone').value.trim();
            const business_name = document.getElementById('reg-company').value.trim();
            const pass_type = selectedPassInput ? selectedPassInput.value : 'Standard';

            if (!name || !email || !phone) {
                if (formErrorAlert) {
                    formErrorAlert.textContent = 'Please provide your full name, email address, and contact number.';
                    formErrorAlert.style.display = 'block';
                }
                return;
            }

            if (submitBtn) {
                submitBtn.disabled = true;
                if (submitBtnText) submitBtnText.textContent = 'Securing Pass & Syncing…';
            }

            try {
                let json = null;
                if (typeof window !== 'undefined' && typeof window.safeApiFetch === 'function') {
                    json = await window.safeApiFetch(`/public/events/${encodeURIComponent(eventSlug)}/register`, {
                        method: 'POST',
                        body: JSON.stringify({
                            name,
                            email,
                            phone,
                            business_name,
                            pass_type
                        })
                    });
                } else {
                    const url = (typeof window !== 'undefined' && typeof window.resolveApiUrl === 'function')
                        ? window.resolveApiUrl(`/public/events/${encodeURIComponent(eventSlug)}/register`)
                        : `https://bizflow-registration.onrender.com/api/public/events/${encodeURIComponent(eventSlug)}/register`;
                    const res = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name,
                            email,
                            phone,
                            business_name,
                            pass_type
                        })
                    });
                    const contentType = res.headers.get('content-type') || '';
                    if (contentType.includes('application/json')) {
                        json = await res.json().catch(() => ({}));
                    } else {
                        const text = await res.text().catch(() => '');
                        try { json = JSON.parse(text); } catch (_) { json = { message: text }; }
                    }
                    if (!res.ok || !json?.success) {
                        throw new Error(json?.error?.message || json?.message || 'Failed to complete registration');
                    }
                }

                if (!json || !json.success) {
                    throw new Error(json?.error?.message || json?.message || 'Failed to complete registration');
                }

                // Render success pass
                if (registrationFormBox) registrationFormBox.style.display = 'none';
                if (registrationSuccessBox) {
                    registrationSuccessBox.style.display = 'block';
                    const confirmedTicket = document.getElementById('confirmed-ticket-code');
                    const confirmedName = document.getElementById('confirmed-attendee-name');
                    const confirmedPass = document.getElementById('confirmed-pass-tier');

                    if (confirmedTicket) confirmedTicket.textContent = json.ticket_code || json.booking_id || 'CONFIRMED';
                    if (confirmedName) confirmedName.textContent = name;
                    if (confirmedPass) confirmedPass.textContent = `${pass_type} Pass`;
                }

                if (window.lucide) window.lucide.createIcons();

            } catch (err) {
                console.error(err);
                if (formErrorAlert) {
                    formErrorAlert.textContent = err.message || 'Registration failed. Please try again.';
                    formErrorAlert.style.display = 'block';
                }
                if (submitBtn) {
                    submitBtn.disabled = false;
                    if (submitBtnText) submitBtnText.textContent = 'Confirm & Claim Ticket';
                }
            }
        });
    }

    if (window.lucide) window.lucide.createIcons();
});
