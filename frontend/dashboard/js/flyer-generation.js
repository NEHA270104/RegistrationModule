/**
 * AI Flyer Studio – 5-Step Progressive Quiz Engine
 * Features:
 *   • 5-step quiz wizard with animated dot progress indicators
 *   • Real-time live canvas preview (updates on every input change)
 *   • JSON schema serialization visible in Step 5
 *   • Agenda & Perks dynamic row management
 *   • Guest roster with avatar URL + role badge fields
 *   • CTA text, contact phone, format selection
 *   • PNG + PDF export and Add-to-Email integration
 */
document.addEventListener('DOMContentLoaded', () => {

    // ── 1. Auth Check ─────────────────────────────────────────────────────
    if (!DashboardAuth.isAuthenticated()) {
        window.location.href = '/dashboard';
        return;
    }

    // ── 2. Tenant Branding ────────────────────────────────────────────────
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
        if (tenant.secondary_color) root.style.setProperty('--secondary', tenant.secondary_color);
        const pColor = tenant.primary_color || '#667eea';
        const sColor = tenant.secondary_color || '#764ba2';
        root.style.setProperty('--gradient', `linear-gradient(135deg, ${pColor} 0%, ${sColor} 100%)`);
        const logoEl = document.querySelector('.sidebar-logo');
        if (logoEl && tenant.logo_url) {
            logoEl.innerHTML = `<img src="${tenant.logo_url}" alt="Logo" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
        }
        const adminNav = document.getElementById('nav-item-admin-notifications');
        if (adminNav) adminNav.style.display = DashboardAuth.isAdmin() ? 'flex' : 'none';
    }

    // ── 3. Sidebar & Misc Controls ────────────────────────────────────────
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
            if (confirm('⚠️ Clean Slate Data Reset:\n\nAre you sure you want to wipe all local test data, cached events, and sessions?')) {
                DashboardAuth.wipeAllTestData();
                alert('✓ Local test data wiped. Redirecting to onboarding...');
                window.location.href = '/onboarding';
            }
        });
    }

    // =====================================================================
    //  UTILITIES
    // =====================================================================

    function escapeHTML(str) {
        if (!str) return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function val(id) {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    }

    // =====================================================================
    //  QUIZ STATE  (structured schema matching 5-step questions)
    // =====================================================================

    const quizState = {
        // Step 1 – Event Core & Metadata
        badge_text: 'EXCLUSIVE INVITE · AI SUMMIT 2026',
        main_heading: 'CYBERPUNK NEXTGEN TECH SUMMIT 2026',
        sub_heading: 'Exclusive C-Suite gathering shaping key market moves and high-ticket opportunities.',
        vibe: 'cyberpunk',

        // Step 2 – Logistics & Timing
        event_date: 'OCTOBER 24, 2026',
        event_time: '10:00 AM – 5:00 PM IST',
        event_venue: 'Grand Hyatt Convention Center, Mumbai',
        color: '#00f5ff',

        // Step 3 – Guests & Speakers
        guests: [
            { name: '', title: '', avatar_url: '', badge: 'Keynote Speaker' }
        ],

        // Step 4 – Agenda & Perks
        agenda: [
            'AI Keynote: Next-Gen Autonomous Workflows',
            'Live Panel: Future of Enterprise AI',
            'Networking & Investor Meetups'
        ],
        perks: [
            'Free Certificate of Participation',
            'Exclusive Networking Lounge Access'
        ],
        logo_url: tenant ? tenant.logo_url || '' : '',

        // Step 5 – Call to Action
        cta_text: 'REGISTER NOW — LIMITED SEATS',
        contact_phone: '+91 98765 43210',
        format: 'square'
    };

    // =====================================================================
    //  STEP NAVIGATION (5 steps)
    // =====================================================================

    const TOTAL_STEPS = 5;
    let currentStep = 1;

    function goToStep(n) {
        // Hide all steps
        document.querySelectorAll('.quiz-step-panel').forEach(p => {
            p.style.display = 'none';
        });
        // Show target step
        const target = document.getElementById(`quiz-step-${n}`);
        if (target) {
            target.style.display = 'block';
            target.style.animation = 'none';
            void target.offsetWidth;
            target.style.animation = 'fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards';
        }
        // Update badge
        const badge = document.getElementById('quiz-step-badge');
        if (badge) badge.textContent = `STEP ${n} OF ${TOTAL_STEPS}`;
        // Update progress bar
        const bar = document.getElementById('quiz-progress-bar');
        if (bar) bar.style.width = `${(n / TOTAL_STEPS) * 100}%`;
        // Update dot indicators
        for (let i = 1; i <= TOTAL_STEPS; i++) {
            const dot = document.getElementById(`dot-${i}`);
            const line = document.getElementById(`line-${i}`);
            if (dot) {
                if (i < n) {
                    // Completed
                    dot.style.background = '#00f5ff';
                    dot.style.color = '#06060f';
                    dot.style.border = 'none';
                    dot.innerHTML = '✓';
                } else if (i === n) {
                    // Active
                    dot.style.background = '#00f5ff';
                    dot.style.color = '#06060f';
                    dot.style.border = 'none';
                    dot.textContent = i;
                } else {
                    // Future
                    dot.style.background = 'rgba(255,255,255,0.08)';
                    dot.style.color = 'rgba(255,255,255,0.35)';
                    dot.style.border = '1.5px solid rgba(255,255,255,0.15)';
                    dot.textContent = i;
                }
            }
            if (line) {
                line.style.width = i < n ? '100%' : '0%';
            }
        }
        currentStep = n;
        // On step 5, update JSON preview
        if (n === 5) updateJsonPreview();
        // Always refresh live preview
        refreshLivePreview();
    }

    // Wire navigation buttons
    const nextBtns = [
        { id: 'quiz-next-1', to: 2 },
        { id: 'quiz-next-2', to: 3 },
        { id: 'quiz-next-3', to: 4 },
        { id: 'quiz-next-4', to: 5 }
    ];
    const prevBtns = [
        { id: 'quiz-prev-2', to: 1 },
        { id: 'quiz-prev-3', to: 2 },
        { id: 'quiz-prev-4', to: 3 },
        { id: 'quiz-prev-5', to: 4 }
    ];
    nextBtns.forEach(({ id, to }) => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => { collectCurrentStepData(); goToStep(to); });
    });
    prevBtns.forEach(({ id, to }) => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', () => goToStep(to));
    });

    // Retake quiz
    const btnRetakeQuiz = document.getElementById('btn-retake-quiz');
    if (btnRetakeQuiz) {
        btnRetakeQuiz.addEventListener('click', () => {
            const actions = document.getElementById('canvas-actions');
            if (actions) actions.style.display = 'none';
            goToStep(1);
        });
    }

    // =====================================================================
    //  COLLECT DATA FROM CURRENT STEP INTO quizState
    // =====================================================================

    function collectCurrentStepData() {
        // Step 1
        quizState.badge_text = val('q-badge-text') || quizState.badge_text;
        quizState.main_heading = val('q-main-heading') || quizState.main_heading;
        const subEl = document.getElementById('q-sub-heading');
        if (subEl) quizState.sub_heading = subEl.value.trim() || quizState.sub_heading;

        // Step 2
        quizState.event_date = val('q-event-date') || quizState.event_date;
        quizState.event_time = val('q-event-time') || quizState.event_time;
        quizState.event_venue = val('q-event-venue') || quizState.event_venue;

        // Step 3
        quizState.guests = collectGuestEntries();

        // Step 4
        quizState.agenda = collectListRows('#agenda-list .agenda-input');
        quizState.perks = collectListRows('#perks-list .perk-input');

        // Step 5
        quizState.cta_text = val('q-cta-text') || quizState.cta_text;
        quizState.contact_phone = val('q-contact-phone') || quizState.contact_phone;
        const formatEl = document.getElementById('q-format');
        if (formatEl) quizState.format = formatEl.value;
    }

    function collectListRows(selector) {
        const items = [];
        document.querySelectorAll(selector).forEach(input => {
            const v = input.value.trim();
            if (v) items.push(v);
        });
        return items;
    }

    // =====================================================================
    //  GUEST ROSTER MANAGEMENT (Step 3)
    // =====================================================================

    const guestsContainer = document.getElementById('guests-list-container');
    const addGuestBtn = document.getElementById('add-guest-btn');

    function updateRemoveButtons() {
        if (!guestsContainer) return;
        const cards = guestsContainer.querySelectorAll('.guest-entry-card');
        cards.forEach((card, idx) => {
            const badge = card.querySelector('.guest-badge-num');
            if (badge) badge.textContent = `Speaker / Guest #${idx + 1}`;
            const rmBtn = card.querySelector('.remove-guest-btn');
            if (rmBtn) rmBtn.style.display = cards.length > 1 ? 'inline-block' : 'none';
        });
    }

    function addGuestEntry(name = '', title = '', avatar_url = '', badge = '') {
        if (!guestsContainer) return;
        const count = guestsContainer.children.length + 1;
        const card = document.createElement('div');
        card.className = 'guest-entry-card';
        card.style.cssText = 'background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px;position:relative;';
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <span class="guest-badge-num" style="font-size:11px;font-weight:800;color:#00f5ff;text-transform:uppercase;letter-spacing:0.08em;">Speaker / Guest #${count}</span>
                <button type="button" class="remove-guest-btn" style="background:none;border:none;color:#fda4af;cursor:pointer;" title="Remove Guest">
                    <i data-lucide="trash-2" style="width:14px;height:14px;"></i>
                </button>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px;">
                <div>
                    <label style="display:block;font-size:11px;color:var(--text-light);margin-bottom:4px;">Guest Name *</label>
                    <input type="text" class="guest-name-input" placeholder="e.g. Speaker Name" value="${escapeHTML(name)}" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-size:13px;box-sizing:border-box;">
                </div>
                <div>
                    <label style="display:block;font-size:11px;color:var(--text-light);margin-bottom:4px;">Title / Role *</label>
                    <input type="text" class="guest-title-input" placeholder="e.g. Keynote Speaker / Founder" value="${escapeHTML(title)}" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-size:13px;box-sizing:border-box;">
                </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div>
                    <label style="display:block;font-size:11px;color:var(--text-light);margin-bottom:4px;">Photo / Avatar URL</label>
                    <input type="url" class="guest-avatar-input" placeholder="https://..." value="${escapeHTML(avatar_url)}" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">
                </div>
                <div>
                    <label style="display:block;font-size:11px;color:var(--text-light);margin-bottom:4px;">Role Badge Label</label>
                    <input type="text" class="guest-badge-input" placeholder="e.g. Keynote Speaker" value="${escapeHTML(badge)}" style="width:100%;padding:10px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-size:12px;box-sizing:border-box;">
                </div>
            </div>
        `;
        guestsContainer.appendChild(card);
        updateRemoveButtons();
        if (window.lucide) window.lucide.createIcons({ node: card });
        // Bind live preview on new inputs
        card.querySelectorAll('input').forEach(inp => inp.addEventListener('input', debouncedRefresh));
    }

    if (addGuestBtn) {
        addGuestBtn.addEventListener('click', () => addGuestEntry());
    }

    if (guestsContainer) {
        guestsContainer.addEventListener('click', e => {
            const rmBtn = e.target.closest('.remove-guest-btn');
            if (rmBtn) {
                const card = rmBtn.closest('.guest-entry-card');
                if (card && guestsContainer.children.length > 1) {
                    card.remove();
                    updateRemoveButtons();
                    debouncedRefresh();
                }
            }
        });
    }

    function collectGuestEntries() {
        const guests = [];
        if (!guestsContainer) return guests;
        guestsContainer.querySelectorAll('.guest-entry-card').forEach(card => {
            const name = card.querySelector('.guest-name-input')?.value.trim() || '';
            const title = card.querySelector('.guest-title-input')?.value.trim() || '';
            const avatar_url = card.querySelector('.guest-avatar-input')?.value.trim() || '';
            const badge = card.querySelector('.guest-badge-input')?.value.trim() || '';
            if (name || title) guests.push({ name, title, avatar_url, badge });
        });
        return guests;
    }

    // =====================================================================
    //  AGENDA & PERKS DYNAMIC ROWS (Step 4)
    // =====================================================================

    function addListRow(containerId, inputClass, removeBtnClass, placeholder) {
        const container = document.getElementById(containerId);
        if (!container) return;
        const row = document.createElement('div');
        row.className = `${inputClass.replace('.','').split('-')[0]}-row`;
        row.style.cssText = 'display:flex;gap:8px;align-items:center;';
        row.innerHTML = `
            <input type="text" class="${inputClass.replace('.','')} " placeholder="${placeholder}" style="flex:1;padding:10px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#fff;font-size:12.5px;box-sizing:border-box;">
            <button type="button" class="${removeBtnClass.replace('.','')} " style="background:none;border:none;color:#fda4af;cursor:pointer;padding:4px;" title="Remove"><i data-lucide="x" style="width:14px;height:14px;"></i></button>
        `;
        container.appendChild(row);
        if (window.lucide) window.lucide.createIcons({ node: row });
        row.querySelector('input').addEventListener('input', debouncedRefresh);
    }

    const addAgendaBtn = document.getElementById('add-agenda-btn');
    if (addAgendaBtn) {
        addAgendaBtn.addEventListener('click', () => addListRow('agenda-list', 'agenda-input', 'remove-agenda-btn', 'e.g. Workshop session title'));
    }

    const addPerkBtn = document.getElementById('add-perk-btn');
    if (addPerkBtn) {
        addPerkBtn.addEventListener('click', () => addListRow('perks-list', 'perk-input', 'remove-perk-btn', 'e.g. Free lunch and swag bag'));
    }

    document.getElementById('agenda-list')?.addEventListener('click', e => {
        if (e.target.closest('.remove-agenda-btn')) {
            const row = e.target.closest('.agenda-row, div');
            if (row && row.parentElement && row.parentElement.children.length > 1) {
                row.remove(); debouncedRefresh();
            }
        }
    });

    document.getElementById('perks-list')?.addEventListener('click', e => {
        if (e.target.closest('.remove-perk-btn')) {
            const row = e.target.closest('.perk-row, div');
            if (row && row.parentElement && row.parentElement.children.length > 1) {
                row.remove(); debouncedRefresh();
            }
        }
    });

    // =====================================================================
    //  LOGO UPLOAD (Step 4)
    // =====================================================================

    const logoFileInput = document.getElementById('quiz-logo-file');
    const btnTriggerLogo = document.getElementById('btn-trigger-logo-file');
    const logoStatus = document.getElementById('quiz-logo-status');
    const logoPreviewBox = document.getElementById('quiz-logo-preview');

    if (btnTriggerLogo && logoFileInput) {
        btnTriggerLogo.addEventListener('click', () => logoFileInput.click());
        logoFileInput.addEventListener('change', e => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = evt => {
                quizState.logo_url = evt.target.result;
                if (logoStatus) logoStatus.textContent = file.name.substring(0, 20) + (file.name.length > 20 ? '…' : '');
                if (logoPreviewBox) logoPreviewBox.innerHTML = `<img src="${evt.target.result}" style="width:100%;height:100%;object-fit:cover;border-radius:6px;">`;
                debouncedRefresh();
            };
            reader.readAsDataURL(file);
        });
    }

    // =====================================================================
    //  QUIZ OPTION CARDS (vibe + color)
    // =====================================================================

    document.querySelectorAll('.quiz-option-card').forEach(btn => {
        btn.addEventListener('click', () => {
            const group = btn.dataset.quiz;
            document.querySelectorAll(`.quiz-option-card[data-quiz="${group}"]`).forEach(b => {
                b.classList.remove('active');
                b.style.background = 'rgba(255,255,255,0.03)';
                b.style.borderColor = 'rgba(255,255,255,0.08)';
            });
            btn.classList.add('active');
            btn.style.background = 'rgba(56,189,248,0.1)';
            btn.style.borderColor = '#38bdf8';
            quizState[group] = btn.dataset.val;
            debouncedRefresh();
        });
    });

    document.querySelectorAll('.quiz-color-card').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.quiz-color-card').forEach(b => {
                b.classList.remove('active');
                b.style.borderColor = 'transparent';
                b.style.boxShadow = 'none';
            });
            btn.classList.add('active');
            btn.style.borderColor = '#ffffff';
            btn.style.boxShadow = `0 0 16px ${btn.dataset.color}`;
            quizState.color = btn.dataset.color;
            debouncedRefresh();
        });
    });

    // =====================================================================
    //  REAL-TIME LIVE PREVIEW BINDING
    // =====================================================================

    let refreshTimer = null;
    function debouncedRefresh() {
        clearTimeout(refreshTimer);
        refreshTimer = setTimeout(refreshLivePreview, 120);
    }

    // Bind all text inputs / textareas / selects for live sync
    const liveBindIds = [
        'q-badge-text', 'q-main-heading', 'q-sub-heading',
        'q-event-date', 'q-event-time', 'q-event-venue',
        'q-cta-text', 'q-contact-phone', 'q-format'
    ];
    liveBindIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', debouncedRefresh);
    });
    document.querySelectorAll('.guest-name-input, .guest-title-input, .guest-avatar-input, .guest-badge-input').forEach(el => {
        el.addEventListener('input', debouncedRefresh);
    });
    document.querySelectorAll('.agenda-input, .perk-input').forEach(el => {
        el.addEventListener('input', debouncedRefresh);
    });

    const flyerPreview = document.getElementById('flyer-preview');

    function refreshLivePreview() {
        collectCurrentStepData();
        const html = renderFlyer();
        if (flyerPreview) {
            flyerPreview.innerHTML = html;
            if (window.lucide) window.lucide.createIcons({ node: flyerPreview });
        }
        if (currentStep === 5) updateJsonPreview();
    }

    function renderFlyer() {
        const s = quizState;
        if (s.vibe === 'executive') return renderExecutive(s);
        if (s.vibe === 'glass')     return renderGlass(s);
        if (s.vibe === 'creative')  return renderCreative(s);
        return renderCyberpunk(s);
    }

    // =====================================================================
    //  JSON SCHEMA SERIALIZER (Step 5)
    // =====================================================================

    function buildSchema() {
        collectCurrentStepData();
        return {
            schema_version: '2.0',
            generated_at: new Date().toISOString(),
            event: {
                badge_text: quizState.badge_text,
                main_heading: quizState.main_heading,
                sub_heading: quizState.sub_heading,
                date: quizState.event_date,
                time: quizState.event_time,
                venue: quizState.event_venue
            },
            design: {
                vibe: quizState.vibe,
                accent_color: quizState.color,
                format: quizState.format,
                logo_url: quizState.logo_url ? '[base64 or url]' : null
            },
            speakers: quizState.guests.map(g => ({
                name: g.name,
                title: g.title,
                avatar_url: g.avatar_url || null,
                badge: g.badge || null
            })),
            agenda: quizState.agenda,
            perks: quizState.perks,
            cta: {
                button_text: quizState.cta_text,
                contact_phone: quizState.contact_phone
            }
        };
    }

    function updateJsonPreview() {
        const el = document.getElementById('json-schema-preview');
        if (el) {
            el.textContent = JSON.stringify(buildSchema(), null, 2);
        }
    }

    // =====================================================================
    //  CANVAS TEMPLATE RENDERERS
    // =====================================================================

    function getLogoHtml(s) {
        if (!s.logo_url) return '';
        return `<img src="${s.logo_url}" style="height:36px;max-width:140px;object-fit:contain;margin-bottom:14px;display:block;">`;
    }

    function getQrCodeSvg(size = 46) {
        return `<svg width="${size}" height="${size}" viewBox="0 0 29 29" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;border-radius:4px;">
            <rect width="29" height="29" fill="white"/>
            <rect x="2" y="2" width="7" height="7" fill="#0f172a"/>
            <rect x="3" y="3" width="5" height="5" fill="white"/>
            <rect x="4" y="4" width="3" height="3" fill="#0f172a"/>
            <rect x="20" y="2" width="7" height="7" fill="#0f172a"/>
            <rect x="21" y="3" width="5" height="5" fill="white"/>
            <rect x="22" y="4" width="3" height="3" fill="#0f172a"/>
            <rect x="2" y="20" width="7" height="7" fill="#0f172a"/>
            <rect x="3" y="21" width="5" height="5" fill="white"/>
            <rect x="4" y="22" width="3" height="3" fill="#0f172a"/>
            <path d="M10 2h2v2h-2zM14 2h3v1h-3zM10 5h1v1h-1zM12 5h2v2h-2zM15 4h2v2h-2zM18 2h1v3h-1z M2 10h1v3h-1zM4 10h2v1h-2zM7 11h2v2h-2zM10 9h3v1h-3zM14 8h2v2h-2zM17 10h2v1h-2zM20 10h1v2h-1zM23 9h2v2h-2zM26 10h2v1h-2z M10 13h2v2h-2zM13 14h2v2h-2zM16 12h2v3h-2zM19 14h3v1h-3zM23 13h1v3h-1zM26 13h2v2h-2z M10 16h1v3h-1zM12 17h3v1h-3zM16 16h2v2h-2zM19 16h1v2h-1zM21 17h3v1h-3zM25 16h3v1h-3z M10 20h2v2h-2zM13 20h1v3h-1zM15 21h2v1h-2zM18 20h3v1h-3zM22 20h2v2h-2zM25 20h2v2h-2z M10 23h3v1h-3zM14 24h2v2h-2zM17 23h2v2h-2zM20 24h1v2h-1zM22 23h3v1h-3zM26 23h1v3h-1z M10 26h1v2h-1zM12 25h3v2h-3zM16 26h2v2h-2zM19 25h2v2h-2zM22 26h2v1h-2zM25 26h3v2h-3z" fill="#0f172a"/>
        </svg>`;
    }

    function getSpeakersHtml(guests, accent) {
        if (!guests || guests.length === 0) return '';
        const cards = guests.map(g => {
            const avatarHtml = g.avatar_url
                ? `<img src="${escapeHTML(g.avatar_url)}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;border:2px solid ${accent}40;flex-shrink:0;" onerror="this.style.display='none'">`
                : `<div style="width:36px;height:36px;border-radius:50%;background:${accent}20;border:2px solid ${accent}40;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px;">🎤</div>`;
            return `
            <div style="background:rgba(255,255,255,0.04);border:1px solid ${accent}28;border-radius:8px;padding:10px 12px;margin-bottom:8px;display:flex;align-items:center;gap:10px;">
                ${avatarHtml}
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                        <span style="font-size:12.5px;font-weight:800;color:#fff;">${escapeHTML(g.name || 'Speaker')}</span>
                        ${g.badge ? `<span style="font-size:9px;font-weight:700;color:${accent};background:${accent}15;padding:2px 7px;border-radius:4px;">${escapeHTML(g.badge)}</span>` : ''}
                    </div>
                    ${g.title ? `<div style="font-size:10.5px;color:rgba(200,220,255,0.7);margin-top:2px;">${escapeHTML(g.title)}</div>` : ''}
                </div>
            </div>`;
        }).join('');
        return `<div style="margin-bottom:16px;">
            <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:${accent};margin-bottom:8px;">Featured Speakers (${guests.length})</div>
            ${cards}
        </div>`;
    }

    function getAgendaHtml(agenda, accent) {
        if (!agenda || agenda.length === 0) return '';
        const items = agenda.map(a => `
            <div style="display:flex;align-items:flex-start;gap:7px;margin-bottom:5px;">
                <div style="width:5px;height:5px;border-radius:50%;background:${accent};margin-top:5px;flex-shrink:0;"></div>
                <span style="font-size:11px;color:rgba(200,220,255,0.8);">${escapeHTML(a)}</span>
            </div>`).join('');
        return `<div style="margin-bottom:14px;">
            <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:${accent};margin-bottom:7px;">Agenda Highlights</div>
            ${items}
        </div>`;
    }

    function getPerksHtml(perks, accent) {
        if (!perks || perks.length === 0) return '';
        const items = perks.map(p => `
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                <span style="color:${accent};font-size:11px;">✓</span>
                <span style="font-size:11px;color:rgba(200,220,255,0.8);">${escapeHTML(p)}</span>
            </div>`).join('');
        return `<div style="margin-bottom:14px;">
            <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.12em;color:${accent};margin-bottom:7px;">What's Included</div>
            ${items}
        </div>`;
    }

    // ── CYBERPUNK TEMPLATE ─────────────────────────────────────────────────
    function renderCyberpunk(s) {
        const c = s.color || '#00f5ff';
        const logo = getLogoHtml(s);
        const qr = getQrCodeSvg(44);
        const speakers = getSpeakersHtml(s.guests, c);
        const agenda = getAgendaHtml(s.agenda, c);
        const perks = getPerksHtml(s.perks, c);
        return `
        <div style="background:linear-gradient(160deg,#06060f 0%,#0c0c2a 55%,#090420 100%);border-radius:16px;overflow:hidden;position:relative;font-family:'Inter',sans-serif;box-shadow:0 0 60px rgba(0,245,255,0.12),0 24px 48px rgba(0,0,0,0.85);">
            <div style="position:absolute;inset:0;background-image:linear-gradient(rgba(0,245,255,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(0,245,255,0.03) 1px,transparent 1px);background-size:26px 26px;pointer-events:none;"></div>
            <div style="height:3px;background:linear-gradient(90deg,transparent 0%,${c} 30%,#ec4899 70%,transparent 100%);box-shadow:0 0 16px ${c}90;position:relative;"></div>
            <div style="padding:24px;position:relative;z-index:2;">
                ${logo}
                <div style="display:inline-flex;align-items:center;gap:7px;background:rgba(0,245,255,0.07);border:1px solid ${c}45;border-radius:4px;padding:4px 12px;margin-bottom:14px;">
                    <div style="width:6px;height:6px;border-radius:50%;background:${c};box-shadow:0 0 8px ${c};"></div>
                    <span style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.16em;color:${c};">${escapeHTML(s.badge_text)}</span>
                </div>
                <h3 style="font-size:22px;font-weight:900;margin:0 0 8px;line-height:1.2;color:#fff;text-shadow:0 0 24px ${c}50;letter-spacing:-0.5px;">${escapeHTML(s.main_heading)}</h3>
                <p style="font-size:12px;color:rgba(180,210,255,0.65);margin:0 0 14px;line-height:1.55;">${escapeHTML(s.sub_heading)}</p>
                ${speakers}
                ${agenda}
                ${perks}
                <div style="height:1px;background:${c}25;margin:0 0 16px;position:relative;">
                    <div style="position:absolute;left:0;top:0;width:42px;height:2px;background:${c};box-shadow:0 0 8px ${c};"></div>
                </div>
                <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:18px;">
                    <div style="display:flex;align-items:center;gap:9px;">
                        <div style="width:30px;height:30px;background:rgba(0,245,255,0.08);border:1px solid ${c}35;border-radius:7px;display:flex;align-items:center;justify-content:center;">
                            <i data-lucide="calendar" style="width:14px;height:14px;color:${c};"></i>
                        </div>
                        <span style="font-size:12.5px;font-weight:600;color:#e2eaff;">${escapeHTML(s.event_date)} · ${escapeHTML(s.event_time)}</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:9px;">
                        <div style="width:30px;height:30px;background:rgba(236,72,153,0.09);border:1px solid rgba(236,72,153,0.3);border-radius:7px;display:flex;align-items:center;justify-content:center;">
                            <i data-lucide="map-pin" style="width:14px;height:14px;color:#ec4899;"></i>
                        </div>
                        <span style="font-size:12.5px;font-weight:600;color:#e2eaff;">${escapeHTML(s.event_venue)}</span>
                    </div>
                </div>
                <div style="background:linear-gradient(135deg,${c},#ec4899);border-radius:8px;padding:11px 16px;text-align:center;margin-bottom:16px;cursor:pointer;">
                    <span style="font-size:12px;font-weight:900;color:#06060f;letter-spacing:0.08em;">${escapeHTML(s.cta_text)}</span>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;padding-top:14px;border-top:1px solid rgba(255,255,255,0.05);">
                    <div>
                        <span style="font-size:9px;font-weight:700;letter-spacing:0.14em;color:rgba(255,255,255,0.25);text-transform:uppercase;display:block;margin-bottom:3px;">SCAN TO REGISTER</span>
                        ${s.contact_phone ? `<span style="font-size:10px;color:${c};font-weight:600;">${escapeHTML(s.contact_phone)}</span>` : ''}
                    </div>
                    <div style="background:#fff;padding:4px;border-radius:6px;box-shadow:0 0 18px ${c}40;">${qr}</div>
                </div>
            </div>
            <div style="height:2px;background:linear-gradient(90deg,transparent 0%,#ec4899 40%,${c} 100%);"></div>
        </div>`;
    }

    // ── EXECUTIVE TEMPLATE ─────────────────────────────────────────────────
    function renderExecutive(s) {
        const gold = s.color || '#f59e0b';
        const logo = getLogoHtml(s);
        const qr = getQrCodeSvg(44);
        const speakers = getSpeakersHtml(s.guests, gold);
        const agenda = getAgendaHtml(s.agenda, gold);
        const perks = getPerksHtml(s.perks, gold);
        return `
        <div style="background:linear-gradient(160deg,#09101f 0%,#0e1628 50%,#070c18 100%);border-radius:16px;overflow:hidden;font-family:'Inter',sans-serif;box-shadow:0 28px 56px rgba(0,0,0,0.75),0 0 0 1px rgba(245,158,11,0.18);">
            <div style="background:linear-gradient(90deg,${gold}18,${gold}32,${gold}18);border-bottom:1px solid ${gold}35;padding:14px 24px;display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <i data-lucide="award" style="width:16px;height:16px;color:${gold};"></i>
                    <span style="font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:0.16em;color:${gold};">${escapeHTML(s.badge_text)}</span>
                </div>
            </div>
            <div style="padding:24px;">
                ${logo}
                <h3 style="font-size:22px;font-weight:900;margin:0 0 8px;line-height:1.22;color:#fff;">${escapeHTML(s.main_heading)}</h3>
                <p style="font-size:12px;color:rgba(190,205,230,0.6);margin:0 0 14px;line-height:1.6;font-style:italic;">${escapeHTML(s.sub_heading)}</p>
                ${speakers}
                ${agenda}
                ${perks}
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:18px;">
                    <div style="background:rgba(245,158,11,0.06);border:1px solid ${gold}22;border-radius:10px;padding:12px;">
                        <div style="font-size:9px;font-weight:800;text-transform:uppercase;color:${gold};margin-bottom:5px;">Date & Time</div>
                        <div style="font-size:11.5px;font-weight:600;color:#f1f5f9;">${escapeHTML(s.event_date)} · ${escapeHTML(s.event_time)}</div>
                    </div>
                    <div style="background:rgba(245,158,11,0.06);border:1px solid ${gold}22;border-radius:10px;padding:12px;">
                        <div style="font-size:9px;font-weight:800;text-transform:uppercase;color:${gold};margin-bottom:5px;">Venue</div>
                        <div style="font-size:11.5px;font-weight:600;color:#f1f5f9;">${escapeHTML(s.event_venue)}</div>
                    </div>
                </div>
                <div style="background:linear-gradient(135deg,${gold},#f97316);border-radius:8px;padding:11px 16px;text-align:center;margin-bottom:16px;">
                    <span style="font-size:12px;font-weight:900;color:#06060f;letter-spacing:0.08em;">${escapeHTML(s.cta_text)}</span>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.06);padding-top:14px;">
                    <div>
                        <div style="font-size:9px;color:${gold};font-weight:700;text-transform:uppercase;margin-bottom:5px;">Confirm Attendance</div>
                        <div style="background:#fff;padding:4px;border-radius:6px;display:inline-block;">${qr}</div>
                    </div>
                    <div style="text-align:right;">
                        <div style="font-size:11px;font-weight:900;color:${gold};letter-spacing:0.05em;">BY INVITATION ONLY</div>
                        ${s.contact_phone ? `<div style="font-size:10px;color:rgba(255,255,255,0.4);margin-top:4px;">${escapeHTML(s.contact_phone)}</div>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
    }

    // ── MINIMALIST GLASS TEMPLATE ──────────────────────────────────────────
    function renderGlass(s) {
        const c = s.color || '#38bdf8';
        const logo = getLogoHtml(s);
        const qr = getQrCodeSvg(44);
        const speakers = getSpeakersHtml(s.guests, c);
        const agenda = getAgendaHtml(s.agenda, c);
        const perks = getPerksHtml(s.perks, c);
        return `
        <div style="background:linear-gradient(145deg,#f8fafc 0%,#f1f5f9 100%);border-radius:20px;overflow:hidden;font-family:'Inter',sans-serif;box-shadow:0 24px 48px rgba(0,0,0,0.18);">
            <div style="height:4px;background:linear-gradient(90deg,${c},${c}80);"></div>
            <div style="padding:26px 24px 22px;">
                ${logo}
                <div style="display:inline-flex;align-items:center;gap:6px;border:1.5px solid ${c};border-radius:999px;padding:4px 14px;margin-bottom:16px;">
                    <span style="font-size:9.5px;font-weight:800;text-transform:uppercase;color:${c};">${escapeHTML(s.badge_text)}</span>
                </div>
                <h3 style="font-size:23px;font-weight:800;margin:0 0 8px;color:#0f172a;">${escapeHTML(s.main_heading)}</h3>
                <p style="font-size:12.5px;color:#64748b;margin:0 0 14px;line-height:1.6;">${escapeHTML(s.sub_heading)}</p>
                ${speakers}
                ${agenda}
                ${perks}
                <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">
                    <div style="font-size:12.5px;font-weight:600;color:#1e293b;">📅 ${escapeHTML(s.event_date)} · ${escapeHTML(s.event_time)}</div>
                    <div style="font-size:12.5px;font-weight:600;color:#1e293b;">📍 ${escapeHTML(s.event_venue)}</div>
                </div>
                <div style="background:${c};border-radius:8px;padding:11px 16px;text-align:center;margin-bottom:16px;">
                    <span style="font-size:12px;font-weight:900;color:#fff;letter-spacing:0.08em;">${escapeHTML(s.cta_text)}</span>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;padding-top:14px;border-top:1.5px solid #f1f5f9;">
                    <div style="background:#fff;padding:4px;border-radius:6px;">${qr}</div>
                    <div style="text-align:right;">
                        <div style="font-size:16px;font-weight:900;color:${c};">Register Pass</div>
                        ${s.contact_phone ? `<div style="font-size:10px;color:#64748b;margin-top:3px;">${escapeHTML(s.contact_phone)}</div>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
    }

    // ── CREATIVE STUDIO TEMPLATE ───────────────────────────────────────────
    function renderCreative(s) {
        const c = s.color || '#a855f7';
        const logo = getLogoHtml(s);
        const qr = getQrCodeSvg(44);
        const speakers = getSpeakersHtml(s.guests, c);
        const agenda = getAgendaHtml(s.agenda, c);
        const perks = getPerksHtml(s.perks, c);
        return `
        <div style="background:linear-gradient(135deg,#18092c 0%,#2e0854 50%,#120324 100%);border-radius:20px;overflow:hidden;font-family:'Inter',sans-serif;box-shadow:0 24px 50px rgba(168,85,247,0.25),0 0 0 1px rgba(168,85,247,0.2);">
            <div style="height:4px;background:linear-gradient(90deg,${c},#ec4899,#00f5ff);"></div>
            <div style="padding:26px 24px 22px;position:relative;">
                ${logo}
                <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(168,85,247,0.15);border:1px solid ${c};border-radius:999px;padding:4px 14px;margin-bottom:16px;">
                    <i data-lucide="palette" style="width:12px;height:12px;color:${c};"></i>
                    <span style="font-size:9.5px;font-weight:800;text-transform:uppercase;color:${c};">${escapeHTML(s.badge_text)}</span>
                </div>
                <h3 style="font-size:23px;font-weight:900;margin:0 0 8px;color:#fff;text-shadow:0 0 16px ${c}80;">${escapeHTML(s.main_heading)}</h3>
                <p style="font-size:12.5px;color:rgba(230,210,255,0.8);margin:0 0 14px;line-height:1.6;">${escapeHTML(s.sub_heading)}</p>
                ${speakers}
                ${agenda}
                ${perks}
                <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">
                    <div style="font-size:12.5px;font-weight:600;color:#f3e8ff;">🗓️ ${escapeHTML(s.event_date)} · ${escapeHTML(s.event_time)}</div>
                    <div style="font-size:12.5px;font-weight:600;color:#f3e8ff;">🏢 ${escapeHTML(s.event_venue)}</div>
                </div>
                <div style="background:linear-gradient(135deg,${c},#ec4899);border-radius:8px;padding:11px 16px;text-align:center;margin-bottom:16px;">
                    <span style="font-size:12px;font-weight:900;color:#fff;letter-spacing:0.08em;">${escapeHTML(s.cta_text)}</span>
                </div>
                <div style="display:flex;align-items:center;justify-content:space-between;padding-top:14px;border-top:1px solid rgba(255,255,255,0.1);">
                    <div style="background:#fff;padding:4px;border-radius:6px;">${qr}</div>
                    <div style="text-align:right;">
                        <div style="font-size:16px;font-weight:900;color:${c};text-shadow:0 0 12px ${c}60;">Get VIP Pass</div>
                        ${s.contact_phone ? `<div style="font-size:10px;color:rgba(230,210,255,0.5);margin-top:3px;">${escapeHTML(s.contact_phone)}</div>` : ''}
                    </div>
                </div>
            </div>
        </div>`;
    }

    // =====================================================================
    //  SYNTHESIZE BUTTON – Final Generate & Automated Event Form Hosting
    // =====================================================================

    const quizSynthesizeBtn = document.getElementById('quiz-synthesize-btn');

    if (quizSynthesizeBtn) {
        quizSynthesizeBtn.addEventListener('click', async () => {
            collectCurrentStepData();

            // Plan Gating Check for AI generation
            if (window.PlanPermissions && !window.PlanPermissions.can('aiFlyerGeneration')) {
                // If using advanced AI/creative vibe on basic plan, suggest upgrade
                if (quizState.vibe === 'cyberpunk' || quizState.vibe === 'creative') {
                    window.PlanPermissions.showUpgradeModal('aiFlyerGeneration', 'ScaleUp Pro');
                    return;
                }
            }

            const origText = quizSynthesizeBtn.innerHTML;
            quizSynthesizeBtn.disabled = true;
            quizSynthesizeBtn.innerHTML = `<span style="width:14px;height:14px;border:2px solid #000;border-top-color:transparent;border-radius:50%;display:inline-block;animation:spin 0.6s linear infinite;"></span> Publishing Event &amp; Flyer...`;

            try {
                refreshLivePreview();

                const tenant = (window.DashboardAuth && window.DashboardAuth.getTenant()) || {};
                const tenantSlug = tenant.slug || 'default';

                // Build event payload
                const eventPayload = {
                    title: quizState.main_heading || 'Upcoming Summit 2026',
                    sub_heading: quizState.sub_heading || 'Join us for an exclusive, transformative experience.',
                    badge_text: quizState.badge_text || 'EXCLUSIVE EVENT',
                    date: quizState.event_date || '2026-02-21',
                    time: quizState.event_time || '10:00 AM – 5:00 PM',
                    venue: quizState.event_venue || 'Centre For Police Research, Pashan, Pune',
                    vibe: quizState.vibe || 'cyberpunk',
                    color: quizState.color || '#00f5ff',
                    format: quizState.format || 'square',
                    speakers: quizState.guests || [],
                    agenda: quizState.agenda || [],
                    perks: quizState.perks || [],
                    cta_text: quizState.cta_text || 'REGISTER NOW — LIMITED SEATS',
                    contact_phone: quizState.contact_phone || '+91 98765 43210',
                    capacity: 500
                };

                let hostedUrl = `${window.location.origin}/register/${encodeURIComponent(eventPayload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'))}`;
                let finalSlug = eventPayload.title.toLowerCase().replace(/[^a-z0-9]+/g, '-');

                // Trigger backend automated event form generation workflow
                try {
                    const token = window.DashboardAuth ? window.DashboardAuth.getToken() : null;
                    const targetUrl = (typeof window !== 'undefined' && typeof window.resolveApiUrl === 'function')
                        ? window.resolveApiUrl(`/t/${encodeURIComponent(tenantSlug)}/events/from-flyer`)
                        : `/api/t/${encodeURIComponent(tenantSlug)}/events/from-flyer`;

                    const res = await fetch(targetUrl, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                        },
                        body: JSON.stringify(eventPayload)
                    });

                    const ct = res.headers.get('content-type') || '';
                    if (res.ok && ct.includes('application/json')) {
                        const json = await res.json();
                        if (json.success && json.data) {
                            finalSlug = json.data.form_slug || finalSlug;
                            hostedUrl = `${window.location.origin}${json.data.public_url}`;
                        }
                    }
                } catch (backendErr) {
                    console.warn('Backend event creation fallback to local store:', backendErr);
                }

                // Also sync with localStorage summit_events for instant offline/dashboard visibility
                const existingEvents = JSON.parse(localStorage.getItem('summit_events') || '[]');
                const newEventEntry = {
                    id: `event-${Date.now()}`,
                    slug: finalSlug,
                    name: eventPayload.title,
                    date: eventPayload.date,
                    venue: eventPayload.venue,
                    description: eventPayload.sub_heading,
                    capacity: eventPayload.capacity,
                    public_url: hostedUrl,
                    guests: (eventPayload.speakers || []).map(s => ({
                        name: s.name,
                        email: `${(s.name || 'speaker').toLowerCase().replace(/\s+/g, '')}@example.com`,
                        type: s.badge || 'VIP'
                    }))
                };

                // Deduplicate by name
                const filtered = existingEvents.filter(e => e.name !== eventPayload.title);
                filtered.unshift(newEventEntry);
                localStorage.setItem('summit_events', JSON.stringify(filtered));

                // Display Hosted Event Banner
                const banner = document.getElementById('hosted-event-banner');
                const urlInput = document.getElementById('hosted-event-url-input');
                const visitBtn = document.getElementById('btn-visit-hosted-form');
                const copyBtn = document.getElementById('btn-copy-hosted-url');

                if (banner && urlInput && visitBtn) {
                    urlInput.value = hostedUrl;
                    visitBtn.href = `/register/${finalSlug}`;
                    banner.style.display = 'block';

                    if (copyBtn) {
                        copyBtn.onclick = () => {
                            navigator.clipboard.writeText(hostedUrl).then(() => {
                                copyBtn.innerHTML = `<i data-lucide="check" style="width:12px;height:12px;"></i> Copied!`;
                                if (window.lucide) window.lucide.createIcons({ node: copyBtn });
                                setTimeout(() => {
                                    copyBtn.innerHTML = `<i data-lucide="copy" style="width:12px;height:12px;"></i> Copy`;
                                    if (window.lucide) window.lucide.createIcons({ node: copyBtn });
                                }, 2000);
                            });
                        };
                    }
                }

                // Show canvas action buttons
                const canvasActions = document.getElementById('canvas-actions');
                if (canvasActions) canvasActions.style.display = 'block';

                quizSynthesizeBtn.disabled = false;
                quizSynthesizeBtn.innerHTML = origText;
                if (window.lucide) window.lucide.createIcons({ node: quizSynthesizeBtn });

                // Scroll to preview
                const livePanel = document.getElementById('live-preview-panel');
                if (livePanel) livePanel.scrollIntoView({ behavior: 'smooth', block: 'start' });

                if (window.ActivityLogger) {
                    window.ActivityLogger.log('Event & Flyer Generation', `Created live event "${quizState.main_heading}" with hosted public form`, {
                        vibe: quizState.vibe,
                        public_url: hostedUrl,
                        speakers_count: (quizState.guests || []).length
                    });
                }

            } catch (err) {
                console.error('Flyer generation error:', err);
                quizSynthesizeBtn.disabled = false;
                quizSynthesizeBtn.innerHTML = origText;
            }
        });
    }

    // =====================================================================
    //  EXPORT ACTIONS
    // =====================================================================

    const addToEmailBtn   = document.getElementById('add-to-email-btn');
    const downloadPngBtn  = document.getElementById('download-png-btn');
    const downloadPdfBtn  = document.getElementById('download-pdf-btn');

    // Add to Email
    if (addToEmailBtn) {
        addToEmailBtn.addEventListener('click', () => {
            const flyerCard = flyerPreview ? flyerPreview.firstElementChild : null;
            if (!flyerCard) { alert('Please generate a flyer first.'); return; }

            localStorage.setItem('attached_flyer_preset', JSON.stringify({
                title: quizState.main_heading,
                date: quizState.event_date,
                time: quizState.event_time,
                venue: quizState.event_venue,
                guests: quizState.guests,
                vibe: quizState.vibe,
                color: quizState.color,
                cta_text: quizState.cta_text,
                attachedAt: new Date().toISOString()
            }));

            if (window.ActivityLogger) {
                window.ActivityLogger.log('Flyer Export', `Exported flyer "${quizState.main_heading}" to Email Studio`, { channel: 'Email Studio' });
            }

            addToEmailBtn.innerHTML = `<i data-lucide="check"></i> Added!`;
            if (window.lucide) window.lucide.createIcons({ node: addToEmailBtn });
            setTimeout(() => { window.location.href = '/dashboard/email-templates.html'; }, 700);
        });
    }

    // Download PNG
    if (downloadPngBtn) {
        downloadPngBtn.addEventListener('click', async () => {
            if (typeof html2canvas === 'undefined') { alert('Export library not loaded.'); return; }
            const flyerCard = flyerPreview ? flyerPreview.firstElementChild : null;
            if (!flyerCard) { alert('Please generate a flyer first.'); return; }

            const origText = downloadPngBtn.innerHTML;
            downloadPngBtn.innerHTML = 'Rendering…';
            downloadPngBtn.disabled = true;

            try {
                const canvas = await html2canvas(flyerCard, { scale: 3, useCORS: true, allowTaint: true, backgroundColor: null });
                const dataURL = canvas.toDataURL('image/png', 1.0);
                const safeName = (quizState.main_heading || 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
                const link = document.createElement('a');
                link.download = `${safeName}-flyer.png`;
                link.href = dataURL;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                downloadPngBtn.innerHTML = `<i data-lucide="check"></i> Saved!`;
                if (window.ActivityLogger) window.ActivityLogger.log('Flyer Export', `Exported PNG "${quizState.main_heading}"`, { format: 'PNG' });
                setTimeout(() => { downloadPngBtn.innerHTML = origText; downloadPngBtn.disabled = false; if (window.lucide) window.lucide.createIcons({ node: downloadPngBtn }); }, 2000);
            } catch (err) {
                console.error(err);
                downloadPngBtn.innerHTML = 'Failed';
                setTimeout(() => { downloadPngBtn.innerHTML = origText; downloadPngBtn.disabled = false; }, 2000);
            }
        });
    }

    // Download PDF
    if (downloadPdfBtn) {
        downloadPdfBtn.addEventListener('click', async () => {
            if (typeof html2canvas === 'undefined' || !window.jspdf) { alert('PDF library not loaded.'); return; }
            const flyerCard = flyerPreview ? flyerPreview.firstElementChild : null;
            if (!flyerCard) { alert('Please generate a flyer first.'); return; }

            const origText = downloadPdfBtn.innerHTML;
            downloadPdfBtn.innerHTML = 'Generating…';
            downloadPdfBtn.disabled = true;

            try {
                const canvas = await html2canvas(flyerCard, { scale: 3, useCORS: true, allowTaint: true, backgroundColor: null });
                const imgData = canvas.toDataURL('image/jpeg', 0.95);
                const widthPt  = canvas.width  * 0.75;
                const heightPt = canvas.height * 0.75;
                const { jsPDF } = window.jspdf;
                const pdf = new jsPDF({ orientation: widthPt > heightPt ? 'landscape' : 'portrait', unit: 'pt', format: [widthPt, heightPt] });
                pdf.addImage(imgData, 'JPEG', 0, 0, widthPt, heightPt);
                const safeName = (quizState.main_heading || 'event').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
                pdf.save(`${safeName}-flyer.pdf`);
                downloadPdfBtn.innerHTML = `<i data-lucide="check"></i> Saved!`;
                if (window.ActivityLogger) window.ActivityLogger.log('Flyer Export', `Exported PDF "${quizState.main_heading}"`, { format: 'PDF' });
                setTimeout(() => { downloadPdfBtn.innerHTML = origText; downloadPdfBtn.disabled = false; if (window.lucide) window.lucide.createIcons({ node: downloadPdfBtn }); }, 2000);
            } catch (err) {
                console.error(err);
                downloadPdfBtn.innerHTML = 'Failed';
                setTimeout(() => { downloadPdfBtn.innerHTML = origText; downloadPdfBtn.disabled = false; }, 2000);
            }
        });
    }

    // =====================================================================
    //  ADD PULSE KEYFRAME FOR LIVE SYNC DOT + SPIN FOR BUTTON LOADER
    // =====================================================================
    const styleTag = document.createElement('style');
    styleTag.textContent = `
        @keyframes pulse { 0%,100%{box-shadow:0 0 6px #10b981;} 50%{box-shadow:0 0 14px #10b981,0 0 4px #10b981;} }
        @keyframes spin  { to { transform: rotate(360deg); } }
        @media (max-width: 768px) {
            #flyer-studio-layout { grid-template-columns: 1fr !important; }
            #live-preview-panel { position: static !important; }
        }
    `;
    document.head.appendChild(styleTag);

    // =====================================================================
    //  INITIALISE
    // =====================================================================
    goToStep(1);
    if (window.lucide) window.lucide.createIcons();
});
