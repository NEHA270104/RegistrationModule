/**
 * Main Dashboard Application
 */
const Dashboard = (() => {
    // ---- State ----
    let currentSection = 'overview';
    let registrationPage = 1;
    const PAGE_SIZE = 20;

    // ---- DOM refs ----
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const els = {
        loginScreen: () => $('#login-screen'),
        dashboardShell: () => $('#dashboard-shell'),
        loginForm: () => $('#login-form'),
        loginError: () => $('#login-error'),
        loginBtn: () => $('#login-btn'),
        sidebar: () => $('#sidebar'),
        sidebarToggle: () => $('#sidebar-toggle'),
        sidebarTenantName: () => $('#sidebar-tenant-name'),
        headerUserName: () => $('#header-user-name span'),
        logoutBtn: () => $('#logout-btn'),
        mainContent: () => $('#main-content'),
        modalOverlay: () => $('#modal-overlay'),
        modalTitle: () => $('#modal-title'),
        modalBody: () => $('#modal-body'),
        modalFooter: () => $('#modal-footer'),
        modalCloseBtn: () => $('#modal-close-btn'),
        loadingOverlay: () => $('#loading-overlay'),
        toastContainer: () => $('#toast-container'),
    };

    // ---- Helpers ----

    function getSlug() {
        const tenant = DashboardAuth.getTenant();
        return tenant ? tenant.slug : '';
    }

    async function apiCall(method, path, body) {
        const headers = { 'Content-Type': 'application/json' };
        const token = DashboardAuth.getToken();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const opts = { method, headers };
        if (body && method !== 'GET') {
            opts.body = JSON.stringify(body);
        }

        const res = await fetch(path, opts);

        if (res.status === 401) {
            // Try refresh once
            try {
                await DashboardAuth.refreshToken();
                headers['Authorization'] = `Bearer ${DashboardAuth.getToken()}`;
                const retry = await fetch(path, { ...opts, headers });
                if (!retry.ok) {
                    const d = await retry.json().catch(() => ({}));
                    throw new Error(d.message || d.error || `Request failed (${retry.status})`);
                }
                return retry.json().catch(() => ({}));
            } catch {
                DashboardAuth.logout();
                showLoginScreen();
                throw new Error('Session expired. Please log in again.');
            }
        }

        if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.message || d.error || `Request failed (${res.status})`);
        }

        return res.json().catch(() => ({}));
    }

    // ---- Loading ----

    function showLoading() {
        els.loadingOverlay().style.display = 'flex';
    }

    function hideLoading() {
        els.loadingOverlay().style.display = 'none';
    }

    // ---- Toast ----

    function showToast(message, type = 'info') {
        const container = els.toastContainer();
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icons = { success: 'check-circle', error: 'exclamation-circle', warning: 'exclamation-triangle', info: 'info-circle' };
        toast.innerHTML = `<i class="fas fa-${icons[type] || 'info-circle'}"></i> ${escapeHtml(message)}`;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'toastOut 0.3s ease forwards';
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ---- Modal ----

    function showModal(title, bodyHtml, footerHtml) {
        els.modalTitle().textContent = title;
        els.modalBody().innerHTML = bodyHtml;
        els.modalFooter().innerHTML = footerHtml || '';
        els.modalOverlay().style.display = 'flex';
    }

    function hideModal() {
        els.modalOverlay().style.display = 'none';
        els.modalBody().innerHTML = '';
        els.modalFooter().innerHTML = '';
    }

    // ---- Screen management ----

    function showLoginScreen() {
        els.loginScreen().style.display = 'flex';
        els.dashboardShell().style.display = 'none';
    }

    function showDashboard() {
        els.loginScreen().style.display = 'none';
        els.dashboardShell().style.display = 'flex';

        const tenant = DashboardAuth.getTenant();
        if (tenant) {
            els.sidebarTenantName().textContent = tenant.name || 'Dashboard';
            els.headerUserName().textContent = tenant.name || '';
        }

        navigateTo('overview');
    }

    // ---- Navigation ----

    function navigateTo(section) {
        currentSection = section;

        $$('.nav-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.section === section);
        });

        // Close sidebar on mobile
        els.sidebar().classList.remove('open');

        const loaders = {
            overview: loadOverview,
            registrations: loadRegistrations,
            'event-settings': loadEventSettings,
            guests: loadGuests,
            benefits: loadBenefits,
            abandonments: loadAbandonments,
            subscription: loadSubscription,
            settings: loadSettings,
            rebrand: loadRebrand,
            referral: loadReferral,
            flyers: loadFlyers,
            'email-templates': loadEmailTemplates,
            analytics: loadAnalytics,
            'activity-log': loadActivityLog,
        };

        const loader = loaders[section];
        if (loader) {
            loader();
        } else {
            els.mainContent().innerHTML = `<div class="empty-state"><i class="fas fa-tools"></i><p>Section "${escapeHtml(section)}" coming soon.</p></div>`;
        }
    }

    // ===================================================================
    //  OVERVIEW
    // ===================================================================

    async function loadOverview() {
        const mc = els.mainContent();
        mc.innerHTML = `<div class="section-header"><h2>Overview</h2></div><div class="inline-loader"><div class="spinner"></div> Loading...</div>`;

        try {
            const data = await apiCall('GET', `/api/t/${getSlug()}/overview`);

            const stats = data.stats || data;
            mc.innerHTML = `
                <div class="section-header"><h2>Overview</h2></div>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon blue"><i class="fas fa-users"></i></div>
                        <div class="stat-info"><h3>${stats.total_registrations ?? 0}</h3><p>Total Registrations</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon green"><i class="fas fa-check-circle"></i></div>
                        <div class="stat-info"><h3>${stats.confirmed ?? 0}</h3><p>Confirmed</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon orange"><i class="fas fa-clock"></i></div>
                        <div class="stat-info"><h3>${stats.pending ?? 0}</h3><p>Pending</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon red"><i class="fas fa-times-circle"></i></div>
                        <div class="stat-info"><h3>${stats.failed ?? 0}</h3><p>Failed / Abandoned</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon purple"><i class="fas fa-rupee-sign"></i></div>
                        <div class="stat-info"><h3>${formatCurrency(stats.total_revenue ?? 0)}</h3><p>Total Revenue</p></div>
                    </div>
                </div>
                <div class="card">
                    <div class="card-header"><h3>Recent Registrations</h3></div>
                    <div class="card-body" id="overview-recent">
                        ${stats.recent && stats.recent.length ? renderRegistrationTable(stats.recent, false) : '<div class="empty-state"><i class="fas fa-inbox"></i><p>No recent registrations.</p></div>'}
                    </div>
                </div>
            `;
        } catch (err) {
            mc.innerHTML = `<div class="section-header"><h2>Overview</h2></div><div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>${escapeHtml(err.message)}</p></div>`;
        }
    }

    function formatCurrency(amount) {
        return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
    }

    // ===================================================================
    //  REGISTRATIONS
    // ===================================================================

    async function loadRegistrations() {
        const mc = els.mainContent();
        mc.innerHTML = `
            <div class="section-header">
                <h2>Registrations</h2>
            </div>
            <div class="card">
                <div class="card-body">
                    <div class="table-toolbar">
                        <div class="search-input">
                            <i class="fas fa-search"></i>
                            <input type="text" id="reg-search" placeholder="Search by name, email, phone...">
                        </div>
                        <div class="filter-group">
                            <select id="reg-status-filter">
                                <option value="">All Statuses</option>
                                <option value="confirmed">Confirmed</option>
                                <option value="pending">Pending</option>
                                <option value="failed">Failed</option>
                            </select>
                        </div>
                    </div>
                    <div id="reg-table-area"><div class="inline-loader"><div class="spinner"></div> Loading...</div></div>
                    <div id="reg-pagination"></div>
                </div>
            </div>
        `;

        // Bind search / filter
        const searchInput = $('#reg-search');
        const statusFilter = $('#reg-status-filter');
        let searchTimeout;

        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => { registrationPage = 1; fetchRegistrations(); }, 400);
        });

        statusFilter.addEventListener('change', () => { registrationPage = 1; fetchRegistrations(); });

        registrationPage = 1;
        fetchRegistrations();
    }

    async function fetchRegistrations() {
        const area = $('#reg-table-area');
        const pagArea = $('#reg-pagination');
        if (!area) return;

        area.innerHTML = `<div class="inline-loader"><div class="spinner"></div> Loading...</div>`;

        try {
            const search = ($('#reg-search') || {}).value || '';
            const status = ($('#reg-status-filter') || {}).value || '';
            const params = new URLSearchParams({ page: registrationPage, limit: PAGE_SIZE });
            if (search) params.set('search', search);
            if (status) params.set('status', status);

            const data = await apiCall('GET', `/api/t/${getSlug()}/registrations?${params}`);
            const rows = data.registrations || data.data || [];
            const total = data.total || rows.length;

            area.innerHTML = rows.length
                ? renderRegistrationTable(rows, true)
                : '<div class="empty-state"><i class="fas fa-inbox"></i><p>No registrations found.</p></div>';

            // Pagination
            const totalPages = Math.ceil(total / PAGE_SIZE);
            if (totalPages > 1 && pagArea) {
                let html = '';
                html += `<button ${registrationPage <= 1 ? 'disabled' : ''} data-page="${registrationPage - 1}"><i class="fas fa-chevron-left"></i></button>`;
                for (let p = 1; p <= totalPages; p++) {
                    if (totalPages > 7 && Math.abs(p - registrationPage) > 2 && p !== 1 && p !== totalPages) {
                        if (p === 2 || p === totalPages - 1) html += `<button disabled>...</button>`;
                        continue;
                    }
                    html += `<button class="${p === registrationPage ? 'active' : ''}" data-page="${p}">${p}</button>`;
                }
                html += `<button ${registrationPage >= totalPages ? 'disabled' : ''} data-page="${registrationPage + 1}"><i class="fas fa-chevron-right"></i></button>`;
                pagArea.innerHTML = `<div class="pagination">${html}</div>`;
                pagArea.querySelectorAll('button[data-page]').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        if (btn.disabled) return;
                        registrationPage = parseInt(btn.dataset.page);
                        fetchRegistrations();
                    });
                });
            } else if (pagArea) {
                pagArea.innerHTML = '';
            }
        } catch (err) {
            area.innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>${escapeHtml(err.message)}</p></div>`;
        }
    }

    function renderRegistrationTable(rows, showActions) {
        const statusBadge = (s) => {
            const map = { confirmed: 'success', pending: 'warning', failed: 'danger' };
            return `<span class="badge badge-${map[s] || 'secondary'}">${escapeHtml(s || 'unknown')}</span>`;
        };

        let html = `<div class="table-wrapper"><table class="data-table">
            <thead><tr>
                <th>Name</th><th>Email</th><th>Phone</th><th>Status</th><th>Date</th>
                ${showActions ? '<th>Actions</th>' : ''}
            </tr></thead><tbody>`;

        rows.forEach((r) => {
            const name = escapeHtml(r.name || `${r.first_name || ''} ${r.last_name || ''}`.trim() || '-');
            const date = r.created_at ? new Date(r.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
            html += `<tr>
                <td>${name}</td>
                <td>${escapeHtml(r.email || '-')}</td>
                <td>${escapeHtml(r.phone || r.mobile || '-')}</td>
                <td>${statusBadge(r.payment_status || r.status)}</td>
                <td>${date}</td>
                ${showActions ? `<td class="action-btns">
                    <button class="action-btn view" title="View" onclick="Dashboard.viewRegistration('${r.id}')"><i class="fas fa-eye"></i></button>
                </td>` : ''}
            </tr>`;
        });

        html += '</tbody></table></div>';
        return html;
    }

    function viewRegistration(id) {
        apiCall('GET', `/api/t/${getSlug()}/registrations/${id}`)
            .then((data) => {
                const r = data.registration || data;
                let body = '<div class="settings-section">';
                const fields = [
                    ['Name', r.name || `${r.first_name || ''} ${r.last_name || ''}`.trim()],
                    ['Email', r.email],
                    ['Phone', r.phone || r.mobile],
                    ['Organization', r.organization || r.company],
                    ['Payment Status', r.payment_status || r.status],
                    ['Payment ID', r.payment_id || r.razorpay_payment_id],
                    ['Amount', r.amount],
                    ['Registered', r.created_at ? new Date(r.created_at).toLocaleString('en-IN') : '-'],
                ];
                fields.forEach(([label, val]) => {
                    body += `<div class="form-group"><label>${label}</label><input type="text" value="${escapeHtml(String(val || '-'))}" readonly></div>`;
                });
                body += '</div>';
                showModal('Registration Details', body, '<button class="btn btn-outline" onclick="Dashboard.hideModal()">Close</button>');
            })
            .catch((err) => showToast(err.message, 'error'));
    }

    // ===================================================================
    //  EVENT SETTINGS
    // ===================================================================

    async function loadEventSettings() {
        const mc = els.mainContent();
        mc.innerHTML = `<div class="section-header"><h2>Event Settings</h2></div><div class="inline-loader"><div class="spinner"></div> Loading...</div>`;

        try {
            const data = await apiCall('GET', `/api/t/${getSlug()}/settings`);
            const s = data.settings || data;

            mc.innerHTML = `
                <div class="section-header"><h2>Event Settings</h2></div>
                <div class="card"><div class="card-body">
                    <form id="event-settings-form">
                        <div class="settings-section">
                            <h4>General</h4>
                            <div class="form-group">
                                <label>Event Title</label>
                                <input type="text" name="event_title" value="${escapeHtml(s.event_title || '')}">
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Event Date</label>
                                    <input type="date" name="event_date" value="${s.event_date || ''}">
                                </div>
                                <div class="form-group">
                                    <label>Event Venue</label>
                                    <input type="text" name="event_venue" value="${escapeHtml(s.event_venue || '')}">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Event Description</label>
                                <textarea name="event_description" rows="4">${escapeHtml(s.event_description || '')}</textarea>
                            </div>
                        </div>
                        <div class="settings-section">
                            <h4>Registration</h4>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Registration Fee</label>
                                    <input type="number" name="registration_fee" value="${s.registration_fee || 0}" min="0">
                                </div>
                                <div class="form-group">
                                    <label>Max Registrations</label>
                                    <input type="number" name="max_registrations" value="${s.max_registrations || ''}" min="0" placeholder="Unlimited">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Registration Status</label>
                                <select name="registration_open">
                                    <option value="true" ${s.registration_open !== false ? 'selected' : ''}>Open</option>
                                    <option value="false" ${s.registration_open === false ? 'selected' : ''}>Closed</option>
                                </select>
                            </div>
                        </div>
                        <button type="submit" class="btn btn-primary">Save Settings</button>
                    </form>
                </div></div>
            `;

            $('#event-settings-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const body = Object.fromEntries(fd.entries());
                body.registration_open = body.registration_open === 'true';
                body.registration_fee = Number(body.registration_fee);
                if (body.max_registrations) body.max_registrations = Number(body.max_registrations);

                try {
                    showLoading();
                    await apiCall('PUT', `/api/t/${getSlug()}/settings`, body);
                    showToast('Settings saved successfully.', 'success');
                } catch (err) {
                    showToast(err.message, 'error');
                } finally {
                    hideLoading();
                }
            });
        } catch (err) {
            mc.innerHTML = `<div class="section-header"><h2>Event Settings</h2></div><div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>${escapeHtml(err.message)}</p></div>`;
        }
    }

    // ===================================================================
    //  GUESTS
    // ===================================================================

    async function loadGuests() {
        const mc = els.mainContent();
        mc.innerHTML = `
            <div class="section-header">
                <h2>Guests</h2>
                <button class="btn btn-primary" onclick="Dashboard.showGuestForm()"><i class="fas fa-plus"></i> Add Guest</button>
            </div>
            <div class="card"><div class="card-body" id="guests-area">
                <div class="inline-loader"><div class="spinner"></div> Loading...</div>
            </div></div>
        `;

        try {
            const data = await apiCall('GET', `/api/t/${getSlug()}/guests`);
            const guests = data.guests || data.data || data || [];
            const area = $('#guests-area');

            if (!guests.length) {
                area.innerHTML = '<div class="empty-state"><i class="fas fa-user-tie"></i><p>No guests added yet.</p></div>';
                return;
            }

            let html = `<div class="table-wrapper"><table class="data-table">
                <thead><tr><th>Name</th><th>Title / Designation</th><th>Organization</th><th>Actions</th></tr></thead><tbody>`;

            guests.forEach((g) => {
                html += `<tr>
                    <td>${escapeHtml(g.name || '-')}</td>
                    <td>${escapeHtml(g.title || g.designation || '-')}</td>
                    <td>${escapeHtml(g.organization || '-')}</td>
                    <td class="action-btns">
                        <button class="action-btn edit" title="Edit" onclick="Dashboard.showGuestForm('${g.id}')"><i class="fas fa-pen"></i></button>
                        <button class="action-btn delete" title="Delete" onclick="Dashboard.deleteGuest('${g.id}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            });

            html += '</tbody></table></div>';
            area.innerHTML = html;
        } catch (err) {
            $('#guests-area').innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>${escapeHtml(err.message)}</p></div>`;
        }
    }

    async function showGuestForm(id) {
        let guest = {};
        if (id) {
            try {
                const data = await apiCall('GET', `/api/t/${getSlug()}/guests/${id}`);
                guest = data.guest || data;
            } catch (err) {
                showToast(err.message, 'error');
                return;
            }
        }

        const body = `
            <form id="guest-form">
                <div class="form-group"><label>Name</label><input type="text" name="name" value="${escapeHtml(guest.name || '')}" required></div>
                <div class="form-group"><label>Title / Designation</label><input type="text" name="title" value="${escapeHtml(guest.title || guest.designation || '')}"></div>
                <div class="form-group"><label>Organization</label><input type="text" name="organization" value="${escapeHtml(guest.organization || '')}"></div>
                <div class="form-group"><label>Bio</label><textarea name="bio" rows="3">${escapeHtml(guest.bio || '')}</textarea></div>
                <div class="form-group"><label>Image URL</label><input type="url" name="image_url" value="${escapeHtml(guest.image_url || '')}"></div>
                <div class="form-group"><label>Sort Order</label><input type="number" name="sort_order" value="${guest.sort_order ?? 0}" min="0"></div>
            </form>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="Dashboard.hideModal()">Cancel</button>
            <button class="btn btn-primary" id="save-guest-btn">${id ? 'Update' : 'Create'} Guest</button>
        `;

        showModal(id ? 'Edit Guest' : 'Add Guest', body, footer);

        $('#save-guest-btn').addEventListener('click', async () => {
            const form = $('#guest-form');
            if (!form.reportValidity()) return;

            const fd = new FormData(form);
            const payload = Object.fromEntries(fd.entries());
            payload.sort_order = Number(payload.sort_order);

            try {
                showLoading();
                if (id) {
                    await apiCall('PUT', `/api/t/${getSlug()}/guests/${id}`, payload);
                } else {
                    await apiCall('POST', `/api/t/${getSlug()}/guests`, payload);
                }
                hideModal();
                showToast(`Guest ${id ? 'updated' : 'created'} successfully.`, 'success');
                loadGuests();
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                hideLoading();
            }
        });
    }

    async function deleteGuest(id) {
        if (!confirm('Are you sure you want to delete this guest?')) return;

        try {
            showLoading();
            await apiCall('DELETE', `/api/t/${getSlug()}/guests/${id}`);
            showToast('Guest deleted.', 'success');
            loadGuests();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoading();
        }
    }

    // ===================================================================
    //  BENEFITS
    // ===================================================================

    async function loadBenefits() {
        const mc = els.mainContent();
        mc.innerHTML = `
            <div class="section-header">
                <h2>Benefits</h2>
                <button class="btn btn-primary" onclick="Dashboard.showBenefitForm()"><i class="fas fa-plus"></i> Add Benefit</button>
            </div>
            <div class="card"><div class="card-body" id="benefits-area">
                <div class="inline-loader"><div class="spinner"></div> Loading...</div>
            </div></div>
        `;

        try {
            const data = await apiCall('GET', `/api/t/${getSlug()}/benefits`);
            const benefits = data.benefits || data.data || data || [];
            const area = $('#benefits-area');

            if (!benefits.length) {
                area.innerHTML = '<div class="empty-state"><i class="fas fa-gift"></i><p>No benefits added yet.</p></div>';
                return;
            }

            let html = `<div class="table-wrapper"><table class="data-table">
                <thead><tr><th>Title</th><th>Description</th><th>Actions</th></tr></thead><tbody>`;

            benefits.forEach((b) => {
                html += `<tr>
                    <td>${escapeHtml(b.title || b.name || '-')}</td>
                    <td>${escapeHtml((b.description || '').substring(0, 80))}${(b.description || '').length > 80 ? '...' : ''}</td>
                    <td class="action-btns">
                        <button class="action-btn edit" title="Edit" onclick="Dashboard.showBenefitForm('${b.id}')"><i class="fas fa-pen"></i></button>
                        <button class="action-btn delete" title="Delete" onclick="Dashboard.deleteBenefit('${b.id}')"><i class="fas fa-trash"></i></button>
                    </td>
                </tr>`;
            });

            html += '</tbody></table></div>';
            area.innerHTML = html;
        } catch (err) {
            $('#benefits-area').innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>${escapeHtml(err.message)}</p></div>`;
        }
    }

    async function showBenefitForm(id) {
        let benefit = {};
        if (id) {
            try {
                const data = await apiCall('GET', `/api/t/${getSlug()}/benefits/${id}`);
                benefit = data.benefit || data;
            } catch (err) {
                showToast(err.message, 'error');
                return;
            }
        }

        const body = `
            <form id="benefit-form">
                <div class="form-group"><label>Title</label><input type="text" name="title" value="${escapeHtml(benefit.title || benefit.name || '')}" required></div>
                <div class="form-group"><label>Description</label><textarea name="description" rows="4">${escapeHtml(benefit.description || '')}</textarea></div>
                <div class="form-group"><label>Icon (FontAwesome class)</label><input type="text" name="icon" value="${escapeHtml(benefit.icon || '')}" placeholder="e.g. fas fa-star"></div>
                <div class="form-group"><label>Sort Order</label><input type="number" name="sort_order" value="${benefit.sort_order ?? 0}" min="0"></div>
            </form>
        `;

        const footer = `
            <button class="btn btn-outline" onclick="Dashboard.hideModal()">Cancel</button>
            <button class="btn btn-primary" id="save-benefit-btn">${id ? 'Update' : 'Create'} Benefit</button>
        `;

        showModal(id ? 'Edit Benefit' : 'Add Benefit', body, footer);

        $('#save-benefit-btn').addEventListener('click', async () => {
            const form = $('#benefit-form');
            if (!form.reportValidity()) return;

            const fd = new FormData(form);
            const payload = Object.fromEntries(fd.entries());
            payload.sort_order = Number(payload.sort_order);

            try {
                showLoading();
                if (id) {
                    await apiCall('PUT', `/api/t/${getSlug()}/benefits/${id}`, payload);
                } else {
                    await apiCall('POST', `/api/t/${getSlug()}/benefits`, payload);
                }
                hideModal();
                showToast(`Benefit ${id ? 'updated' : 'created'} successfully.`, 'success');
                loadBenefits();
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                hideLoading();
            }
        });
    }

    async function deleteBenefit(id) {
        if (!confirm('Are you sure you want to delete this benefit?')) return;

        try {
            showLoading();
            await apiCall('DELETE', `/api/t/${getSlug()}/benefits/${id}`);
            showToast('Benefit deleted.', 'success');
            loadBenefits();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoading();
        }
    }

    // ===================================================================
    //  ABANDONMENTS (Payment Recovery)
    // ===================================================================

    async function loadAbandonments() {
        const mc = els.mainContent();
        mc.innerHTML = `
            <div class="section-header"><h2>Payment Recovery</h2></div>
            <div class="card"><div class="card-body" id="abandonments-area">
                <div class="inline-loader"><div class="spinner"></div> Loading...</div>
            </div></div>
        `;

        try {
            const data = await apiCall('GET', `/api/t/${getSlug()}/abandonments`);
            const items = data.abandonments || data.data || data || [];
            const area = $('#abandonments-area');

            if (!items.length) {
                area.innerHTML = '<div class="empty-state"><i class="fas fa-check-circle"></i><p>No abandoned payments found.</p></div>';
                return;
            }

            let html = `<div class="table-wrapper"><table class="data-table">
                <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Amount</th><th>Status</th><th>Date</th><th>Actions</th></tr></thead><tbody>`;

            items.forEach((a) => {
                const name = escapeHtml(a.name || `${a.first_name || ''} ${a.last_name || ''}`.trim() || '-');
                const date = a.created_at ? new Date(a.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
                const statusClass = a.status === 'recovered' ? 'success' : a.status === 'pending' ? 'warning' : 'danger';

                html += `<tr>
                    <td>${name}</td>
                    <td>${escapeHtml(a.email || '-')}</td>
                    <td>${escapeHtml(a.phone || a.mobile || '-')}</td>
                    <td>${a.amount ? formatCurrency(a.amount) : '-'}</td>
                    <td><span class="badge badge-${statusClass}">${escapeHtml(a.status || 'abandoned')}</span></td>
                    <td>${date}</td>
                    <td class="action-btns">
                        <button class="action-btn view" title="Send Recovery Link" onclick="Dashboard.sendRecovery('${a.id}')"><i class="fas fa-paper-plane"></i></button>
                    </td>
                </tr>`;
            });

            html += '</tbody></table></div>';
            area.innerHTML = html;
        } catch (err) {
            $('#abandonments-area').innerHTML = `<div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>${escapeHtml(err.message)}</p></div>`;
        }
    }

    async function sendRecovery(id) {
        if (!confirm('Send a recovery payment link to this user?')) return;

        try {
            showLoading();
            await apiCall('POST', `/api/t/${getSlug()}/abandonments/${id}/recover`);
            showToast('Recovery link sent successfully.', 'success');
            loadAbandonments();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoading();
        }
    }

    // ===================================================================
    //  SUBSCRIPTION
    // ===================================================================

    async function loadSubscription() {
        const mc = els.mainContent();
        mc.innerHTML = `<div class="section-header"><h2>Subscription</h2></div><div class="inline-loader"><div class="spinner"></div> Loading...</div>`;

        try {
            const data = await apiCall('GET', `/api/t/${getSlug()}/subscription`);
            const sub = data.subscription || data;
            const usagePct = sub.max_registrations ? Math.min(100, Math.round((sub.used_registrations || 0) / sub.max_registrations * 100)) : 0;

            mc.innerHTML = `
                <div class="section-header"><h2>Subscription</h2></div>
                <div class="plan-card">
                    <h3>${escapeHtml(sub.plan_name || 'Free Plan')}</h3>
                    <div class="plan-price">${sub.price ? formatCurrency(sub.price) : 'Free'} <span>/ ${escapeHtml(sub.billing_cycle || 'month')}</span></div>
                    <p>Status: <strong>${escapeHtml(sub.status || 'active')}</strong></p>
                    ${sub.max_registrations ? `
                        <p style="margin-top:12px;">${sub.used_registrations || 0} / ${sub.max_registrations} registrations used</p>
                        <div class="usage-bar"><div class="usage-bar-fill" style="width:${usagePct}%"></div></div>
                    ` : ''}
                </div>

                <div class="card"><div class="card-header"><h3>Plan Details</h3></div><div class="card-body">
                    <div class="form-group"><label>Plan</label><input type="text" value="${escapeHtml(sub.plan_name || 'Free')}" readonly></div>
                    <div class="form-row">
                        <div class="form-group"><label>Start Date</label><input type="text" value="${sub.start_date ? new Date(sub.start_date).toLocaleDateString('en-IN') : '-'}" readonly></div>
                        <div class="form-group"><label>Next Billing</label><input type="text" value="${sub.next_billing_date ? new Date(sub.next_billing_date).toLocaleDateString('en-IN') : '-'}" readonly></div>
                    </div>
                    <div style="margin-top:16px; display:flex; gap:8px;">
                        <button class="btn btn-primary" onclick="Dashboard.showToast('Please contact support to upgrade your plan.', 'info')">Upgrade Plan</button>
                        <button class="btn btn-outline" onclick="Dashboard.showCancelModal()">Cancel Subscription</button>
                    </div>
                </div></div>
            `;
        } catch (err) {
            mc.innerHTML = `<div class="section-header"><h2>Subscription</h2></div><div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>${escapeHtml(err.message)}</p></div>`;
        }
    }

    // ===================================================================
    //  SETTINGS (Tenant / Account)
    // ===================================================================

    async function loadSettings() {
        const mc = els.mainContent();
        mc.innerHTML = `<div class="section-header"><h2>Account Settings</h2></div><div class="inline-loader"><div class="spinner"></div> Loading...</div>`;

        try {
            const data = await apiCall('GET', `/api/t/${getSlug()}/account`);
            const acct = data.account || data.tenant || data;

            mc.innerHTML = `
                <div class="section-header"><h2>Account Settings</h2></div>
                <div class="card"><div class="card-body">
                    <form id="account-settings-form">
                        <div class="settings-section">
                            <h4>Tenant Info</h4>
                            <div class="form-group"><label>Organization Name</label><input type="text" name="name" value="${escapeHtml(acct.name || '')}" required></div>
                            <div class="form-group"><label>Slug</label><input type="text" value="${escapeHtml(acct.slug || '')}" readonly></div>
                            <div class="form-row">
                                <div class="form-group"><label>Contact Email</label><input type="email" name="contact_email" value="${escapeHtml(acct.contact_email || '')}"></div>
                                <div class="form-group"><label>Contact Phone</label><input type="tel" name="contact_phone" value="${escapeHtml(acct.contact_phone || '')}"></div>
                            </div>
                            <div class="form-group"><label>Website</label><input type="url" name="website" value="${escapeHtml(acct.website || '')}" placeholder="https://..."></div>
                        </div>
                        <div class="settings-section">
                            <h4>Branding</h4>
                            <div class="form-row">
                                <div class="form-group"><label>Primary Color</label><input type="color" name="primary_color" value="${acct.primary_color || '#667eea'}"></div>
                                <div class="form-group"><label>Secondary Color</label><input type="color" name="secondary_color" value="${acct.secondary_color || '#764ba2'}"></div>
                            </div>
                            <div class="form-group"><label>Logo URL</label><input type="url" name="logo_url" value="${escapeHtml(acct.logo_url || '')}" placeholder="https://..."></div>
                        </div>
                        <button type="submit" class="btn btn-primary">Save Account Settings</button>
                    </form>
                </div></div>
            `;

            $('#account-settings-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                const fd = new FormData(e.target);
                const body = Object.fromEntries(fd.entries());

                try {
                    showLoading();
                    await apiCall('PUT', `/api/t/${getSlug()}/account`, body);
                    showToast('Account settings saved.', 'success');

                    // Update sidebar name if changed
                    if (body.name) {
                        const tenant = DashboardAuth.getTenant();
                        if (tenant) {
                            tenant.name = body.name;
                            DashboardAuth.setTenant(tenant);
                            els.sidebarTenantName().textContent = body.name;
                            els.headerUserName().textContent = body.name;
                        }
                    }
                } catch (err) {
                    showToast(err.message, 'error');
                } finally {
                    hideLoading();
                }
            });
        } catch (err) {
            mc.innerHTML = `<div class="section-header"><h2>Account Settings</h2></div><div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>${escapeHtml(err.message)}</p></div>`;
        }
    }

    // ===================================================================
    //  REBRAND REQUEST
    // ===================================================================

    async function loadRebrand() {
        const mc = els.mainContent();
        mc.innerHTML = `<div class="section-header"><h2>Custom Branding</h2></div><div class="inline-loader"><div class="spinner"></div> Loading...</div>`;

        try {
            const data = await apiCall('GET', `/api/t/${getSlug()}/rebrand`);
            const requests = data.data || data || [];
            const latest = requests[0];

            let statusHtml = '';
            if (latest) {
                const statusLabels = {
                    pending: '<span class="badge badge-warning">Under review by BRTNeura team</span>',
                    approved: '<span class="badge badge-success">Approved! Complete payment to activate</span>',
                    rejected: `<span class="badge badge-danger">Declined: ${escapeHtml(latest.admin_notes || '')}</span>`,
                    completed: '<span class="badge badge-success">Custom branding is live!</span>',
                };
                statusHtml = `
                    <div class="card" style="margin-bottom:20px;">
                        <div class="card-header"><h3>Current Request Status</h3></div>
                        <div class="card-body">
                            <p><strong>Brand Name:</strong> ${escapeHtml(latest.requested_brand_name)}</p>
                            <p><strong>Status:</strong> ${statusLabels[latest.status] || latest.status}</p>
                            ${latest.status === 'approved' ? `
                                <button class="btn btn-primary" style="margin-top:12px;" onclick="Dashboard.payRebrandFee('${latest.id}')">
                                    <i class="fas fa-credit-card"></i> Pay Setup Fee (INR 9,999)
                                </button>
                            ` : ''}
                            ${latest.status === 'rejected' ? `
                                <button class="btn btn-primary" style="margin-top:12px;" onclick="Dashboard.showRebrandForm()">
                                    <i class="fas fa-redo"></i> Resubmit Request
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `;
            }

            const showForm = !latest || latest.status === 'rejected' || latest.status === 'completed';

            mc.innerHTML = `
                <div class="section-header"><h2>Custom Branding</h2></div>
                ${statusHtml}
                ${showForm ? `
                <div class="card" id="rebrand-form-card">
                    <div class="card-header"><h3>Request Custom Branding</h3></div>
                    <div class="card-body">
                        <form id="rebrand-form">
                            <div class="form-group">
                                <label>Brand Name *</label>
                                <input type="text" name="requested_brand_name" required placeholder="Your brand name">
                            </div>
                            <div class="form-group">
                                <label>Logo URL</label>
                                <input type="url" name="requested_logo_url" placeholder="https://your-logo.png">
                            </div>
                            <div class="form-row">
                                <div class="form-group">
                                    <label>Primary Color</label>
                                    <input type="color" name="requested_primary_color" value="#6366F1">
                                </div>
                                <div class="form-group">
                                    <label>Secondary Color</label>
                                    <input type="color" name="requested_secondary_color" value="#8B5CF6">
                                </div>
                            </div>
                            <div class="form-group">
                                <label>Favicon URL</label>
                                <input type="url" name="requested_favicon_url" placeholder="https://your-favicon.ico">
                            </div>
                            <div class="form-group">
                                <label>Custom Domain</label>
                                <input type="text" name="requested_domain" placeholder="events.yourdomain.com">
                            </div>
                            <p style="color:#666; margin:12px 0;">One-time setup fee: <strong>INR 9,999</strong> (charged after admin approval)</p>
                            <button type="submit" class="btn btn-primary"><i class="fas fa-paper-plane"></i> Submit Request</button>
                        </form>
                    </div>
                </div>` : ''}
            `;

            const form = $('#rebrand-form');
            if (form) {
                form.addEventListener('submit', async (e) => {
                    e.preventDefault();
                    const fd = new FormData(e.target);
                    const body = Object.fromEntries(fd.entries());
                    try {
                        showLoading();
                        await apiCall('POST', `/api/t/${getSlug()}/rebrand`, body);
                        showToast('Rebrand request submitted successfully!', 'success');
                        loadRebrand();
                    } catch (err) {
                        showToast(err.message, 'error');
                    } finally {
                        hideLoading();
                    }
                });
            }
        } catch (err) {
            mc.innerHTML = `<div class="section-header"><h2>Custom Branding</h2></div><div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>${escapeHtml(err.message)}</p></div>`;
        }
    }

    async function payRebrandFee(requestId) {
        showToast('Redirecting to payment...', 'info');
        try {
            showLoading();
            // Simulate payment completion for now — in production integrate Razorpay checkout
            const paymentId = 'pay_rebrand_' + Date.now();
            await apiCall('POST', `/api/t/${getSlug()}/rebrand/${requestId}/pay`, { payment_id: paymentId });
            showToast('Payment successful! Branding applied.', 'success');
            loadRebrand();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoading();
        }
    }

    // ===================================================================
    //  REFERRAL PROGRAM
    // ===================================================================

    async function loadReferral() {
        const mc = els.mainContent();
        mc.innerHTML = `<div class="section-header"><h2>Referral Program</h2></div><div class="inline-loader"><div class="spinner"></div> Loading...</div>`;

        try {
            const data = await apiCall('GET', `/api/t/${getSlug()}/referral/stats`);
            const stats = data.data || data;

            const tierProgress = stats.current_tier || { tier: 'Silver', percent: 10 };
            const tiers = [
                { name: 'Silver', min: 0, percent: 10 },
                { name: 'Gold', min: 6, percent: 12 },
                { name: 'Platinum', min: 16, percent: 15 },
            ];
            const currentTierIdx = tiers.findIndex(t => t.name === tierProgress.tier);
            const nextTier = tiers[currentTierIdx + 1];

            mc.innerHTML = `
                <div class="section-header"><h2>Referral Program</h2></div>

                <div class="card" style="margin-bottom:20px;">
                    <div class="card-body">
                        <p style="font-weight:600; margin-bottom:8px;">Your Referral Link:</p>
                        <div style="display:flex; gap:8px; align-items:center;">
                            <input type="text" id="referral-link" value="${escapeHtml(stats.referral_link || '')}" readonly style="flex:1;">
                            <button class="btn btn-primary btn-sm" onclick="Dashboard.copyReferralLink()"><i class="fas fa-copy"></i> Copy</button>
                        </div>
                        ${!stats.referral_code ? '<button class="btn btn-primary" style="margin-top:10px;" onclick="Dashboard.genRefCode()"><i class="fas fa-key"></i> Generate Referral Code</button>' : ''}
                    </div>
                </div>

                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon blue"><i class="fas fa-users"></i></div>
                        <div class="stat-info"><h3>${stats.total_referrals || 0}</h3><p>Total Referrals</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon green"><i class="fas fa-rupee-sign"></i></div>
                        <div class="stat-info"><h3>${formatCurrency((stats.total_earned || 0) / 100)}</h3><p>Lifetime Earnings</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon purple"><i class="fas fa-trophy"></i></div>
                        <div class="stat-info"><h3>${tierProgress.tier}</h3><p>${tierProgress.percent}% Commission</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon orange"><i class="fas fa-hand-holding-usd"></i></div>
                        <div class="stat-info"><h3>${formatCurrency((stats.pending_payout || 0) / 100)}</h3><p>Pending Payout</p></div>
                    </div>
                </div>

                <div class="card" style="margin-top:20px;">
                    <div class="card-header"><h3>Tier Progress</h3></div>
                    <div class="card-body">
                        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
                            ${tiers.map(t => `<span style="font-weight:${t.name === tierProgress.tier ? '700' : '400'}; color:${t.name === tierProgress.tier ? 'var(--primary)' : '#888'}">${t.name} (${t.percent}%)</span>`).join('')}
                        </div>
                        <div class="usage-bar"><div class="usage-bar-fill" style="width:${nextTier ? Math.min(100, (stats.total_referrals / nextTier.min) * 100) : 100}%"></div></div>
                        <p style="color:#666; margin-top:8px;">${nextTier ? `${stats.total_referrals}/${nextTier.min} referrals to ${nextTier.name}` : 'Maximum tier reached!'}</p>
                    </div>
                </div>

                ${stats.pending_payout > 0 ? `
                <div style="margin-top:16px;">
                    <button class="btn btn-primary" onclick="Dashboard.reqPayout(${stats.pending_payout})">
                        <i class="fas fa-wallet"></i> Request Payout (${formatCurrency(stats.pending_payout / 100)})
                    </button>
                </div>` : ''}

                <div class="card" style="margin-top:20px;">
                    <div class="card-header"><h3>Recent Referrals</h3></div>
                    <div class="card-body">
                        ${stats.recent_referrals && stats.recent_referrals.length ? `
                        <div class="table-responsive"><table class="data-table">
                            <thead><tr><th>Name</th><th>Plan</th><th>Commission</th><th>Earned</th><th>Status</th><th>Date</th></tr></thead>
                            <tbody>
                                ${stats.recent_referrals.map(r => `
                                    <tr>
                                        <td>${escapeHtml(r.referred_name || '--')}</td>
                                        <td>${escapeHtml(r.plan || 'trial')}</td>
                                        <td>${r.commission_percent}%</td>
                                        <td>${formatCurrency((r.earned || 0) / 100)}</td>
                                        <td><span class="badge badge-${r.status === 'active' ? 'success' : 'warning'}">${r.status}</span></td>
                                        <td>${new Date(r.created_at).toLocaleDateString('en-IN')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table></div>
                        ` : '<div class="empty-state"><i class="fas fa-users"></i><p>No referrals yet. Share your link to start earning!</p></div>'}
                    </div>
                </div>
            `;
        } catch (err) {
            mc.innerHTML = `<div class="section-header"><h2>Referral Program</h2></div><div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>${escapeHtml(err.message)}</p></div>`;
        }
    }

    function copyReferralLink() {
        const input = $('#referral-link');
        if (input) {
            navigator.clipboard.writeText(input.value).then(() => showToast('Link copied!', 'success'));
        }
    }

    async function genRefCode() {
        try {
            showLoading();
            await apiCall('POST', `/api/t/${getSlug()}/referral/generate-code`);
            showToast('Referral code generated!', 'success');
            loadReferral();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoading();
        }
    }

    async function reqPayout(amount) {
        if (!confirm(`Request payout of ${formatCurrency(amount / 100)}?`)) return;
        try {
            showLoading();
            await apiCall('POST', `/api/t/${getSlug()}/referral/payout`, { amount });
            showToast('Payout request submitted!', 'success');
            loadReferral();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoading();
        }
    }

    // ===================================================================
    //  FLYER GENERATOR
    // ===================================================================

    async function loadFlyers() {
        const mc = els.mainContent();
        mc.innerHTML = `
            <div class="section-header"><h2>Flyer Generator</h2></div>

            <div class="card" style="margin-bottom:20px;">
                <div class="card-header"><h3>Choose Template</h3></div>
                <div class="card-body">
                    <div class="template-grid">
                        <div class="template-card selected" data-template="professional" onclick="Dashboard.selectTemplate('professional')">
                            <div class="template-preview" style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;padding:20px;text-align:center;">
                                <h4 style="margin:0;">Professional</h4><p style="font-size:12px;margin:4px 0 0;">Clean corporate look</p>
                            </div>
                        </div>
                        <div class="template-card" data-template="bold" onclick="Dashboard.selectTemplate('bold')">
                            <div class="template-preview" style="background:linear-gradient(135deg,#f093fb,#f5576c);color:#fff;padding:20px;text-align:center;">
                                <h4 style="margin:0;">Bold</h4><p style="font-size:12px;margin:4px 0 0;">High-impact design</p>
                            </div>
                        </div>
                        <div class="template-card" data-template="minimal" onclick="Dashboard.selectTemplate('minimal')">
                            <div class="template-preview" style="background:#fff;border:2px solid #eee;padding:20px;text-align:center;">
                                <h4 style="margin:0;color:#333;">Minimal</h4><p style="font-size:12px;margin:4px 0 0;color:#666;">Simple & elegant</p>
                            </div>
                        </div>
                        <div class="template-card" data-template="social" onclick="Dashboard.selectTemplate('social')">
                            <div class="template-preview" style="background:linear-gradient(135deg,#4facfe,#00f2fe);color:#fff;padding:20px;text-align:center;">
                                <h4 style="margin:0;">Social</h4><p style="font-size:12px;margin:4px 0 0;">1080x1080 format</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="card" style="margin-bottom:20px;">
                <div class="card-header"><h3>Format</h3></div>
                <div class="card-body">
                    <label style="margin-right:20px;"><input type="radio" name="flyer-format" value="portrait" checked> Portrait (1080x1920)</label>
                    <label style="margin-right:20px;"><input type="radio" name="flyer-format" value="square"> Square (1080x1080)</label>
                    <label><input type="radio" name="flyer-format" value="landscape"> Landscape (1920x1080)</label>
                </div>
            </div>

            <div class="card" style="margin-bottom:20px;">
                <div class="card-header"><h3>Preview</h3></div>
                <div class="card-body" style="text-align:center;">
                    <div id="flyer-preview" style="display:inline-block; border:1px solid #ddd; border-radius:8px; overflow:hidden; max-width:100%;">
                        <div id="flyer-canvas" style="width:540px; background:#fff;"></div>
                    </div>
                </div>
            </div>

            <div style="display:flex; gap:8px;">
                <button class="btn btn-primary" onclick="Dashboard.downloadFlyer('png')"><i class="fas fa-download"></i> Download PNG</button>
                <button class="btn btn-outline" onclick="Dashboard.downloadFlyer('jpeg')"><i class="fas fa-download"></i> Download JPEG</button>
            </div>
        `;

        selectedTemplate = 'professional';
        renderFlyerPreview();
    }

    let selectedTemplate = 'professional';

    function selectTemplate(templateId) {
        selectedTemplate = templateId;
        $$('.template-card').forEach(c => c.classList.toggle('selected', c.dataset.template === templateId));
        renderFlyerPreview();
    }

    function renderFlyerPreview() {
        const canvas = $('#flyer-canvas');
        if (!canvas) return;

        const tenant = DashboardAuth.getTenant() || {};
        const primaryColor = tenant.primary_color || '#6366F1';
        const secondaryColor = tenant.secondary_color || '#8B5CF6';
        const eventName = tenant.name || 'Your Event';

        const templates = {
            professional: `
                <div style="background:linear-gradient(135deg,${primaryColor},${secondaryColor});color:#fff;padding:40px;text-align:center;">
                    ${tenant.logo_url ? `<img src="${escapeHtml(tenant.logo_url)}" alt="Logo" style="max-height:60px;margin-bottom:16px;">` : ''}
                    <h1 style="font-size:28px;margin:0 0 8px;">${escapeHtml(eventName)}</h1>
                    <p style="font-size:16px;opacity:0.9;">Join us for an extraordinary experience</p>
                </div>
                <div style="padding:30px;text-align:center;">
                    <p style="font-size:14px;color:#666;margin:0 0 20px;">Event details auto-filled from your settings</p>
                    <div style="border:2px dashed #ddd;padding:20px;border-radius:8px;margin-bottom:20px;">
                        <p style="color:#999;margin:0;"><i class="fas fa-qrcode" style="font-size:48px;"></i></p>
                        <p style="color:#999;margin:8px 0 0;">QR Code</p>
                    </div>
                    <p style="color:${primaryColor};font-weight:600;">Register Now!</p>
                </div>
            `,
            bold: `
                <div style="background:${primaryColor};color:#fff;padding:60px 30px;text-align:center;">
                    <h1 style="font-size:36px;margin:0;text-transform:uppercase;letter-spacing:2px;">${escapeHtml(eventName)}</h1>
                    <div style="width:60px;height:3px;background:#fff;margin:16px auto;"></div>
                    <p style="font-size:18px;margin:0;">Don't Miss Out!</p>
                </div>
                <div style="padding:30px;background:${secondaryColor};color:#fff;text-align:center;">
                    <p style="font-size:20px;margin:0;">Register Today</p>
                </div>
            `,
            minimal: `
                <div style="padding:60px 40px;text-align:center;background:#fafafa;">
                    ${tenant.logo_url ? `<img src="${escapeHtml(tenant.logo_url)}" alt="Logo" style="max-height:40px;margin-bottom:24px;">` : ''}
                    <h1 style="font-size:24px;color:#333;font-weight:300;margin:0 0 16px;">${escapeHtml(eventName)}</h1>
                    <div style="width:40px;height:1px;background:#ccc;margin:0 auto 16px;"></div>
                    <p style="color:#888;font-size:14px;margin:0;">Scan to register</p>
                </div>
            `,
            social: `
                <div style="background:linear-gradient(135deg,${primaryColor},${secondaryColor});color:#fff;padding:40px;text-align:center;aspect-ratio:1;">
                    <div style="display:flex;flex-direction:column;justify-content:center;height:100%;">
                        <h1 style="font-size:24px;margin:0 0 12px;">${escapeHtml(eventName)}</h1>
                        <p style="font-size:14px;opacity:0.9;margin:0;">Swipe for details &rarr;</p>
                    </div>
                </div>
            `,
        };

        canvas.innerHTML = templates[selectedTemplate] || templates.professional;
    }

    async function downloadFlyer(format) {
        const canvas = $('#flyer-canvas');
        if (!canvas) return;

        if (typeof html2canvas === 'undefined') {
            showToast('Loading image generator...', 'info');
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
            script.onload = () => doFlyerDownload(format);
            document.head.appendChild(script);
            return;
        }

        doFlyerDownload(format);
    }

    async function doFlyerDownload(format) {
        try {
            showLoading();
            const canvas = await html2canvas($('#flyer-canvas'), { scale: 2, useCORS: true });
            const link = document.createElement('a');
            link.download = `flyer-${selectedTemplate}.${format}`;
            link.href = canvas.toDataURL(`image/${format}`, 0.95);
            link.click();
            showToast('Flyer downloaded!', 'success');
        } catch (err) {
            showToast('Failed to generate flyer: ' + err.message, 'error');
        } finally {
            hideLoading();
        }
    }

    // ===================================================================
    //  EMAIL TEMPLATES
    // ===================================================================

    async function loadEmailTemplates() {
        const mc = els.mainContent();
        mc.innerHTML = `<div class="section-header"><h2>Email Templates</h2></div><div class="inline-loader"><div class="spinner"></div> Loading...</div>`;

        try {
            const data = await apiCall('GET', `/api/t/${getSlug()}/email-templates`);
            const templates = data.data || data || [];

            const typeLabels = {
                welcome: 'Welcome Email',
                registration_confirmation: 'Registration Confirmation',
                payment_receipt: 'Payment Receipt',
                recovery_link: 'Recovery Link',
                waitlist_confirmation: 'Waitlist Confirmation',
                subscription_invoice: 'Subscription Invoice',
                trial_expiring: 'Trial Expiring',
                subscription_cancelled: 'Subscription Cancelled',
            };

            mc.innerHTML = `
                <div class="section-header"><h2>Email Templates</h2></div>
                <p style="color:#666; margin-bottom:16px;">Customize the emails sent to your attendees. Changes apply to ScaleUp Pro plans.</p>
                <div class="card">
                    <div class="card-body">
                        <div class="table-responsive"><table class="data-table">
                            <thead><tr><th>Template</th><th>Subject</th><th>Status</th><th>Actions</th></tr></thead>
                            <tbody>
                                ${templates.map(t => `
                                    <tr>
                                        <td><strong>${escapeHtml(typeLabels[t.template_type] || t.template_type)}</strong></td>
                                        <td>${escapeHtml(t.subject || '')}</td>
                                        <td><span class="badge badge-${t.is_default ? 'info' : 'success'}">${t.is_default ? 'Default' : 'Custom'}</span></td>
                                        <td>
                                            <button class="btn btn-sm btn-primary" onclick="Dashboard.previewEmailTpl('${t.template_type}')">Preview</button>
                                            <button class="btn btn-sm btn-outline" onclick="Dashboard.editEmailTpl('${t.template_type}', \`${escapeHtml(t.subject || '')}\`)">Edit</button>
                                            ${!t.is_default ? `<button class="btn btn-sm btn-danger" onclick="Dashboard.resetEmailTpl('${t.template_type}')">Reset</button>` : ''}
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table></div>
                    </div>
                </div>
            `;
        } catch (err) {
            mc.innerHTML = `<div class="section-header"><h2>Email Templates</h2></div><div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>${escapeHtml(err.message)}</p></div>`;
        }
    }

    async function previewEmailTpl(templateType) {
        try {
            showLoading();
            const data = await apiCall('GET', `/api/t/${getSlug()}/email-templates/${templateType}/preview`);
            const result = data.data || data;
            showModal('Email Preview - ' + templateType, `
                <p><strong>Subject:</strong> ${escapeHtml(result.subject || '')}</p>
                <div style="border:1px solid #ddd;border-radius:8px;overflow:hidden;margin-top:12px;">
                    <iframe srcdoc="${escapeHtml(result.html || '')}" style="width:100%;height:500px;border:none;"></iframe>
                </div>
            `);
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoading();
        }
    }

    function editEmailTpl(templateType, currentSubject) {
        showModal('Edit Email Template', `
            <form id="edit-email-tpl-form">
                <div class="form-group">
                    <label>Subject Line</label>
                    <input type="text" name="subject" value="${escapeHtml(currentSubject)}" required>
                </div>
                <div class="form-group">
                    <label>HTML Body</label>
                    <textarea name="html_body" rows="12" style="font-family:monospace;font-size:12px;" placeholder="Paste your HTML email template here..."></textarea>
                </div>
                <p style="color:#666;font-size:12px;">Available variables: {{tenant_name}}, {{attendee_name}}, {{event_name}}, {{amount}}, {{payment_id}}, etc.</p>
            </form>
        `, `<button class="btn btn-primary" id="save-email-tpl-btn">Save Template</button>`);

        $('#save-email-tpl-btn').addEventListener('click', async () => {
            const form = $('#edit-email-tpl-form');
            const fd = new FormData(form);
            const body = Object.fromEntries(fd.entries());
            if (!body.subject || !body.html_body) {
                showToast('Subject and HTML body are required', 'error');
                return;
            }
            try {
                showLoading();
                await apiCall('PUT', `/api/t/${getSlug()}/email-templates/${templateType}`, body);
                showToast('Template saved!', 'success');
                hideModal();
                loadEmailTemplates();
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                hideLoading();
            }
        });
    }

    async function resetEmailTpl(templateType) {
        if (!confirm('Reset this template to the default? Your custom version will be deleted.')) return;
        try {
            showLoading();
            await apiCall('DELETE', `/api/t/${getSlug()}/email-templates/${templateType}`);
            showToast('Template reset to default.', 'success');
            loadEmailTemplates();
        } catch (err) {
            showToast(err.message, 'error');
        } finally {
            hideLoading();
        }
    }

    // ===================================================================
    //  INITIALIZATION
    // ===================================================================

    function init() {
        // Login form
        els.loginForm().addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = $('#login-email').value.trim();
            const password = $('#login-password').value;
            const btn = els.loginBtn();
            const errorEl = els.loginError();

            btn.querySelector('.btn-text').style.display = 'none';
            btn.querySelector('.btn-spinner').style.display = 'inline';
            btn.disabled = true;
            errorEl.style.display = 'none';

            try {
                await DashboardAuth.login(email, password);
                showDashboard();
            } catch (err) {
                errorEl.textContent = err.message;
                errorEl.style.display = 'block';
            } finally {
                btn.querySelector('.btn-text').style.display = 'inline';
                btn.querySelector('.btn-spinner').style.display = 'none';
                btn.disabled = false;
            }
        });

        // Logout
        els.logoutBtn().addEventListener('click', () => {
            DashboardAuth.logout();
            showLoginScreen();
        });

        // Sidebar nav
        $$('.nav-item').forEach((item) => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                navigateTo(item.dataset.section);
            });
        });

        // Sidebar toggle (mobile)
        els.sidebarToggle().addEventListener('click', () => {
            els.sidebar().classList.toggle('open');
        });

        // Modal close
        els.modalCloseBtn().addEventListener('click', hideModal);
        els.modalOverlay().addEventListener('click', (e) => {
            if (e.target === els.modalOverlay()) hideModal();
        });

        // Check auth state
        if (DashboardAuth.isAuthenticated()) {
            showDashboard();
        } else {
            showLoginScreen();
        }
    }

    // ===================================================================
    //  ANALYTICS
    // ===================================================================

    async function loadAnalytics() {
        const mc = els.mainContent();
        mc.innerHTML = `<div class="section-header"><h2>Analytics</h2></div><div class="inline-loader"><div class="spinner"></div> Loading...</div>`;

        try {
            const res = await apiCall('GET', `/api/t/${getSlug()}/analytics`);
            const d = res.data || res;

            mc.innerHTML = `
                <div class="section-header"><h2>Analytics</h2></div>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-icon blue"><i class="fas fa-users"></i></div>
                        <div class="stat-info"><h3>${d.registrations?.this_month ?? 0}</h3><p>Registrations This Month</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon green"><i class="fas fa-rupee-sign"></i></div>
                        <div class="stat-info"><h3>${formatCurrency(d.revenue?.this_month ?? 0)}</h3><p>Revenue This Month</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon purple"><i class="fas fa-percentage"></i></div>
                        <div class="stat-info"><h3>${d.conversion?.rate ?? 0}%</h3><p>Conversion Rate</p></div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon orange"><i class="fas fa-redo"></i></div>
                        <div class="stat-info"><h3>${d.recovery?.recovery_rate ?? 0}%</h3><p>Recovery Rate</p></div>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header"><h3>Usage</h3></div>
                    <div class="card-body">
                        <p>${d.usage?.used ?? 0} / ${d.usage?.limit ?? 0} registrations used this month</p>
                        <div class="usage-bar"><div class="usage-bar-fill" style="width:${d.usage?.percent ?? 0}%"></div></div>
                        <p style="margin-top:4px;color:var(--text-muted);">${d.usage?.percent ?? 0}% of plan limit</p>
                    </div>
                </div>

                <div class="card">
                    <div class="card-header"><h3>All-Time Summary</h3></div>
                    <div class="card-body">
                        <div class="stats-grid" style="grid-template-columns:repeat(3,1fr);">
                            <div><strong>${d.registrations?.total ?? 0}</strong><p style="color:var(--text-muted)">Total Registrations</p></div>
                            <div><strong>${d.registrations?.confirmed ?? 0}</strong><p style="color:var(--text-muted)">Confirmed</p></div>
                            <div><strong>${formatCurrency(d.revenue?.total ?? 0)}</strong><p style="color:var(--text-muted)">Total Revenue</p></div>
                        </div>
                    </div>
                </div>

                ${d.registrations?.trend?.length ? `
                <div class="card">
                    <div class="card-header"><h3>Daily Registrations (Last 30 Days)</h3></div>
                    <div class="card-body">
                        <div class="trend-table">
                            <table class="data-table">
                                <thead><tr><th>Date</th><th>Registrations</th></tr></thead>
                                <tbody>
                                    ${d.registrations.trend.slice(-15).map(t => `<tr><td>${t.date}</td><td>${t.count}</td></tr>`).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>` : ''}
            `;
        } catch (err) {
            mc.innerHTML = `<div class="section-header"><h2>Analytics</h2></div><div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>${escapeHtml(err.message)}</p></div>`;
        }
    }

    // ===================================================================
    //  ACTIVITY LOG
    // ===================================================================

    let activityPage = 1;

    async function loadActivityLog() {
        const mc = els.mainContent();
        mc.innerHTML = `<div class="section-header"><h2>Activity Log</h2></div><div class="inline-loader"><div class="spinner"></div> Loading...</div>`;

        try {
            const res = await apiCall('GET', `/api/t/${getSlug()}/activity-log?page=${activityPage}&limit=50`);
            const d = res.data || res;
            const entries = d.entries || [];

            mc.innerHTML = `
                <div class="section-header"><h2>Activity Log</h2></div>
                <div class="card">
                    <div class="card-body">
                        ${entries.length ? `
                        <div class="table-responsive">
                            <table class="data-table">
                                <thead><tr>
                                    <th>Time</th>
                                    <th>Action</th>
                                    <th>Resource</th>
                                    <th>Details</th>
                                </tr></thead>
                                <tbody>
                                    ${entries.map(e => `<tr>
                                        <td>${new Date(e.created_at).toLocaleString('en-IN')}</td>
                                        <td><span class="badge badge-${e.action === 'delete' ? 'danger' : e.action === 'create' ? 'success' : 'info'}">${escapeHtml(e.action)}</span></td>
                                        <td>${escapeHtml(e.resource_type || '-')}</td>
                                        <td style="font-size:12px;color:var(--text-muted);">${e.resource_id ? escapeHtml(String(e.resource_id).substring(0, 8)) + '...' : '-'}</td>
                                    </tr>`).join('')}
                                </tbody>
                            </table>
                        </div>
                        <div style="display:flex;justify-content:space-between;margin-top:12px;">
                            <button class="btn btn-sm btn-outline" ${activityPage <= 1 ? 'disabled' : ''} onclick="Dashboard.activityPrev()">Previous</button>
                            <span style="color:var(--text-muted)">Page ${activityPage}</span>
                            <button class="btn btn-sm btn-outline" ${entries.length < 50 ? 'disabled' : ''} onclick="Dashboard.activityNext()">Next</button>
                        </div>
                        ` : '<div class="empty-state"><i class="fas fa-clipboard-list"></i><p>No activity recorded yet.</p></div>'}
                    </div>
                </div>
            `;
        } catch (err) {
            mc.innerHTML = `<div class="section-header"><h2>Activity Log</h2></div><div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>${escapeHtml(err.message)}</p></div>`;
        }
    }

    function activityPrev() { if (activityPage > 1) { activityPage--; loadActivityLog(); } }
    function activityNext() { activityPage++; loadActivityLog(); }

    // ===================================================================
    //  CANCELLATION / CHURN FLOW
    // ===================================================================

    function showCancelModal() {
        els.modalTitle().textContent = 'Cancel Subscription';
        els.modalBody().innerHTML = `
            <p style="margin-bottom:16px;">We're sorry to see you go. Please tell us why:</p>
            <div class="form-group">
                <label><input type="radio" name="churn-reason" value="too_expensive"> Too expensive</label>
            </div>
            <div class="form-group">
                <label><input type="radio" name="churn-reason" value="missing_features"> Missing features I need</label>
            </div>
            <div class="form-group">
                <label><input type="radio" name="churn-reason" value="found_alternative"> Found a better alternative</label>
            </div>
            <div class="form-group">
                <label><input type="radio" name="churn-reason" value="no_longer_organizing"> No longer organizing events</label>
            </div>
            <div class="form-group">
                <label><input type="radio" name="churn-reason" value="other"> Other</label>
            </div>
            <div class="form-group">
                <label>Additional feedback</label>
                <textarea id="churn-feedback" rows="3" class="form-control" placeholder="Tell us more (optional)..."></textarea>
            </div>
            <div style="background:var(--bg-secondary);padding:12px;border-radius:8px;margin-top:12px;">
                <p style="font-weight:600;">What happens next:</p>
                <ul style="margin:8px 0 0 16px;color:var(--text-muted);">
                    <li>Your form stays live for 30 more days</li>
                    <li>Download your data anytime during this period</li>
                    <li>Data retained for 90 days after deactivation</li>
                    <li>You can reactivate anytime</li>
                </ul>
            </div>
        `;
        els.modalFooter().innerHTML = `
            <button class="btn btn-outline" onclick="Dashboard.hideModal()">Keep My Subscription</button>
            <button class="btn btn-danger" onclick="Dashboard.confirmCancellation()">Cancel Subscription</button>
        `;
        els.modalOverlay().style.display = 'flex';
    }

    async function confirmCancellation() {
        const reasonEl = document.querySelector('input[name="churn-reason"]:checked');
        if (!reasonEl) {
            showToast('Please select a reason for cancelling.', 'warning');
            return;
        }
        const reason = reasonEl.value;
        const feedback = document.getElementById('churn-feedback')?.value || '';

        try {
            showLoading();
            const res = await apiCall('POST', `/api/t/${getSlug()}/subscription/initiate-cancellation`, { reason, feedback });
            hideModal();
            hideLoading();

            const data = res.data || res;
            if (data.offer) {
                showRetentionOffer(data.offer, data.effective_at);
            } else {
                showToast(`Cancellation scheduled for ${new Date(data.effective_at).toLocaleDateString('en-IN')}. Your form stays live until then.`, 'info');
                loadSubscription();
            }
        } catch (err) {
            hideLoading();
            showToast(err.message, 'error');
        }
    }

    function showRetentionOffer(offer, effectiveAt) {
        const details = offer.offer_details || {};
        const message = details.message || 'We have a special offer for you!';

        els.modalTitle().textContent = 'Wait — we have an offer for you!';
        els.modalBody().innerHTML = `
            <div style="text-align:center;padding:16px 0;">
                <div style="font-size:48px;">&#127881;</div>
                <p style="font-size:18px;font-weight:600;margin:12px 0;">${escapeHtml(message)}</p>
                <p style="color:var(--text-muted);">This offer expires in 7 days.</p>
            </div>
        `;
        els.modalFooter().innerHTML = `
            <button class="btn btn-outline" onclick="Dashboard.declineOffer('${offer.id}')">No thanks, cancel</button>
            <button class="btn btn-primary" onclick="Dashboard.acceptOffer('${offer.id}')">Accept Offer</button>
        `;
        els.modalOverlay().style.display = 'flex';
    }

    async function acceptOffer(offerId) {
        try {
            showLoading();
            await apiCall('POST', `/api/t/${getSlug()}/churn-offers/${offerId}/accept`);
            hideModal();
            hideLoading();
            showToast('Offer accepted! Your subscription is active.', 'success');
            loadSubscription();
        } catch (err) {
            hideLoading();
            showToast(err.message, 'error');
        }
    }

    function declineOffer() {
        hideModal();
        showToast('Cancellation confirmed. Your form stays live for 30 more days.', 'info');
        loadSubscription();
    }

    // ===================================================================
    //  CUSTOM DOMAIN (in Settings section — standalone load)
    // ===================================================================

    async function loadDomainSettings() {
        const mc = els.mainContent();
        mc.innerHTML = `<div class="section-header"><h2>Custom Domain</h2></div><div class="inline-loader"><div class="spinner"></div> Loading...</div>`;

        try {
            const res = await apiCall('GET', `/api/t/${getSlug()}/domain/status`);
            const d = res.data || res;

            const statusLabels = {
                none: 'No custom domain set',
                pending: 'Pending DNS verification',
                verified: 'Verified',
                ssl: 'Verified + SSL Active',
            };

            let status = 'none';
            if (d.custom_domain && d.domain_verified && d.ssl_provisioned) status = 'ssl';
            else if (d.custom_domain && d.domain_verified) status = 'verified';
            else if (d.custom_domain) status = 'pending';

            mc.innerHTML = `
                <div class="section-header"><h2>Custom Domain</h2></div>
                <div class="card">
                    <div class="card-header"><h3>Domain Setup</h3></div>
                    <div class="card-body">
                        <p>Status: <strong class="badge badge-${status === 'ssl' || status === 'verified' ? 'success' : status === 'pending' ? 'warning' : 'secondary'}">${statusLabels[status]}</strong></p>
                        ${d.custom_domain ? `<p style="margin-top:8px;">Domain: <code>${escapeHtml(d.custom_domain)}</code></p>` : ''}

                        ${status === 'none' || status === 'pending' ? `
                        <div class="form-group" style="margin-top:16px;">
                            <label>Custom Domain</label>
                            <div style="display:flex;gap:8px;">
                                <input type="text" id="domain-input" class="form-control" value="${escapeHtml(d.custom_domain || '')}" placeholder="events.yourdomain.com">
                                <button class="btn btn-primary" onclick="Dashboard.setDomain()">Set Domain</button>
                            </div>
                        </div>` : ''}

                        ${status === 'pending' ? `
                        <div style="background:var(--bg-secondary);padding:16px;border-radius:8px;margin-top:16px;">
                            <h4>DNS Configuration Required</h4>
                            <p style="margin:8px 0;">Add these DNS records to your domain provider:</p>
                            <div class="form-group">
                                <label>CNAME Record</label>
                                <code style="display:block;padding:8px;background:var(--bg-primary);border-radius:4px;">${escapeHtml(d.custom_domain)} → app.brtneura.com</code>
                            </div>
                            ${d.verification_token ? `
                            <div class="form-group">
                                <label>TXT Verification Record</label>
                                <code style="display:block;padding:8px;background:var(--bg-primary);border-radius:4px;">_brtneura-verify.${escapeHtml(d.custom_domain)} → ${escapeHtml(d.verification_token)}</code>
                            </div>` : ''}
                            <button class="btn btn-primary" style="margin-top:8px;" onclick="Dashboard.verifyDomain()">Verify DNS</button>
                        </div>` : ''}

                        ${status === 'verified' || status === 'ssl' ? `
                        <div style="margin-top:16px;padding:12px;background:var(--bg-secondary);border-radius:8px;">
                            <p>Your custom domain is active! Visitors can access your registration form at:</p>
                            <p style="font-weight:600;margin-top:4px;">https://${escapeHtml(d.custom_domain)}</p>
                        </div>` : ''}
                    </div>
                </div>
            `;
        } catch (err) {
            mc.innerHTML = `<div class="section-header"><h2>Custom Domain</h2></div><div class="empty-state"><i class="fas fa-exclamation-circle"></i><p>${escapeHtml(err.message)}</p></div>`;
        }
    }

    async function setDomain() {
        const domain = document.getElementById('domain-input')?.value?.trim();
        if (!domain) { showToast('Please enter a domain.', 'warning'); return; }

        try {
            showLoading();
            await apiCall('POST', `/api/t/${getSlug()}/domain/set`, { domain });
            hideLoading();
            showToast('Domain set! Please configure your DNS records.', 'success');
            loadDomainSettings();
        } catch (err) {
            hideLoading();
            showToast(err.message, 'error');
        }
    }

    async function verifyDomain() {
        try {
            showLoading();
            const res = await apiCall('POST', `/api/t/${getSlug()}/domain/verify`);
            hideLoading();
            const d = res.data || res;
            if (d.verified) {
                showToast('Domain verified successfully!', 'success');
            } else {
                showToast('Verification failed: ' + (d.errors || []).join('. '), 'error');
            }
            loadDomainSettings();
        } catch (err) {
            hideLoading();
            showToast(err.message, 'error');
        }
    }

    // Run on DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Public API (for onclick handlers in HTML)
    return {
        viewRegistration,
        showGuestForm,
        deleteGuest,
        showBenefitForm,
        deleteBenefit,
        sendRecovery,
        hideModal,
        showToast,
        // Rebrand
        payRebrandFee,
        showRebrandForm: loadRebrand,
        // Referral
        copyReferralLink,
        genRefCode,
        reqPayout,
        // Flyers
        selectTemplate,
        downloadFlyer,
        // Email Templates
        previewEmailTpl,
        editEmailTpl,
        resetEmailTpl,
        // Phase 4: Analytics, Activity Log, Churn, Domain
        activityPrev,
        activityNext,
        showCancelModal,
        confirmCancellation,
        acceptOffer,
        declineOffer,
        setDomain,
        verifyDomain: verifyDomain,
        loadDomainSettings,
    };
})();
