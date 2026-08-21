/**
 * EventReg Platform Super Admin Panel
 * Manages tenants, subscriptions, and global platform stats.
 */

(function () {
    'use strict';

    // ---- Config ----
    const API_BASE = '/api';
    const TOKEN_KEY = 'sa_token';
    const USER_KEY = 'sa_user';

    // ---- State ----
    let currentSection = 'overview';
    let tenantsCache = [];
    let subscriptionsCache = [];

    // ---- DOM Refs ----
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const loginScreen = $('#loginScreen');
    const dashboard = $('#dashboard');
    const loginForm = $('#loginForm');
    const loginError = $('#loginError');
    const loginBtn = $('#loginBtn');
    const logoutBtn = $('#logoutBtn');
    const pageTitle = $('#pageTitle');
    const contentArea = $('#contentArea');
    const sidebar = $('#sidebar');
    const mobileMenuBtn = $('#mobileMenuBtn');

    // Modals
    const tenantDetailModal = $('#tenantDetailModal');
    const alertModal = $('#alertModal');

    // ============================================
    // AUTH
    // ============================================

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function getUser() {
        try {
            return JSON.parse(localStorage.getItem(USER_KEY));
        } catch {
            return null;
        }
    }

    function setAuth(token, user) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    // Expose SuperAdmin for autoInit bypass
    window.SuperAdmin = {
        autoInit: async function() {
            try {
                const res = await fetch(`${API_BASE}/admin/check-access`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.success) {
                        setAuth('mock-access-token', { role: 'super_admin', email: data.email || 'dev@eventregplatform.com' });
                        return true;
                    }
                }
            } catch (e) {
                console.error('Auto-init check failed:', e);
            }
            return false;
        }
    };

    function clearAuth() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    }

    function isAuthenticated() {
        return !!getToken();
    }

    function checkAuth() {
        if (isAuthenticated()) {
            showDashboard();
        } else {
            showLogin();
        }
    }

    function showLogin() {
        if (loginScreen) loginScreen.style.display = 'flex';
        if (dashboard) dashboard.style.display = 'none';
    }

    function showDashboard() {
        window.location.href = '/super-admin/dashboard.html';
    }

    // ---- Login Handler ----
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = $('#loginEmail').value.trim();
            const password = $('#loginPassword').value;

            if (!email || !password) return;

            loginError.style.display = 'none';
            loginBtn.querySelector('.btn-text').textContent = 'Signing in...';
            loginBtn.querySelector('.btn-loader').style.display = 'inline-block';
            loginBtn.disabled = true;

            try {
                const res = await fetch(`${API_BASE}/admin/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.message || (data.error && data.error.message) || 'Login failed');
                }

                // Validate super_admin role
                const user = data.user || data;
                if (user.role !== 'super_admin') {
                    throw new Error('Access denied. Super admin privileges required.');
                }

                setAuth(data.token || data.access_token, user);

                // Verify access against the super_admins table in the database
                try {
                    await apiCall('GET', '/admin/check-access');
                } catch (checkErr) {
                    clearAuth();
                    throw new Error('Access denied. Your email is not registered in the Super Admin table.');
                }

                showDashboard();
            } catch (err) {
                loginError.textContent = err.message;
                loginError.style.display = 'block';
            } finally {
                loginBtn.querySelector('.btn-text').textContent = 'Sign In';
                loginBtn.querySelector('.btn-loader').style.display = 'none';
                loginBtn.disabled = false;
            }
        });
    }

    // ---- Logout ----
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            clearAuth();
            showLogin();
        });
    }

    // ============================================
    // API HELPER
    // ============================================

    async function apiCall(method, path, body) {
        const token = getToken();
        const headers = {
            'Content-Type': 'application/json'
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        const opts = { method, headers };
        if (body && method !== 'GET') {
            opts.body = JSON.stringify(body);
        }

        const res = await fetch(`${API_BASE}${path}`, opts);

        if (res.status === 401 || res.status === 403) {
            clearAuth();
            showLogin();
            throw new Error('Session expired. Please login again.');
        }

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || `Request failed (${res.status})`);
        }

        return data;
    }

    // ============================================
    // NAVIGATION
    // ============================================

    function navigateTo(pageName) {
        if (!pageName || typeof pageName !== 'string') return;
        currentSection = pageName;

        // Update nav active state
        $$('.nav-item').forEach((item) => {
            item.classList.toggle('active', item.dataset.section === pageName);
        });

        // Hide all sections
        $$('.section').forEach((s) => (s.style.display = 'none'));

        // Show target section
        const sectionId = 'section' + pageName.charAt(0).toUpperCase() + pageName.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const target = $(`#${sectionId}`);
        if (target) {
            target.style.display = 'block';
        }

        // Update page title
        const titles = {
            'overview': 'Overview',
            'tenants': 'Tenants',
            'subscriptions': 'Subscriptions',
            'global-stats': 'Global Stats',
            'rebrand-requests': 'Rebrand Requests',
            'referrals': 'Referrals',
            'notifications': 'Notifications',
            'analytics': 'Analytics',
            'audit-log': 'Audit Log',
        };
        pageTitle.textContent = titles[section] || section;

        // Load data for the section
        switch (section) {
            case 'overview':
                loadOverview();
                break;
            case 'tenants':
                loadTenants();
                break;
            case 'subscriptions':
                loadSubscriptions();
                break;
            case 'global-stats':
                loadGlobalStats();
                break;
            case 'rebrand-requests':
                loadRebrandRequests();
                break;
            case 'referrals':
                loadReferrals();
                break;
            case 'notifications':
                loadNotifications();
                break;
            case 'analytics':
                loadAnalyticsDashboard();
                break;
            case 'audit-log':
                loadAuditLog();
                break;
        }

        // Close mobile sidebar
        closeMobileSidebar();
    }

    $$('.nav-item').forEach((item) => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo(item.dataset.section);
        });
    });

    // ============================================
    // OVERVIEW
    // ============================================

    async function loadOverview() {
        try {
            const data = await apiCall('GET', '/super-admin/stats');
            const stats = data.stats || data;

            $('#metricTotalTenants').textContent = formatNumber(stats.total_tenants || 0);
            $('#metricActiveTenants').textContent = formatNumber(stats.active_tenants || 0);
            $('#metricMRR').textContent = formatCurrency(stats.mrr || 0);
            $('#metricTotalRegistrations').textContent = formatNumber(stats.total_registrations || 0);

            // Recent tenants
            const recentTenants = stats.recent_tenants || [];
            const tbody = $('#recentTenantsBody');
            if (recentTenants.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No tenants found</td></tr>';
            } else {
                tbody.innerHTML = recentTenants.map((t) => `
                    <tr>
                        <td class="table-tenant-name" data-id="${t.id}">${escapeHtml(t.name || t.company_name || '--')}</td>
                        <td>${escapeHtml(t.plan || 'free')}</td>
                        <td><span class="badge badge-${t.status || 'active'}">${t.status || 'active'}</span></td>
                        <td>${formatDate(t.created_at)}</td>
                    </tr>
                `).join('');

                // Click handlers for tenant names
                tbody.querySelectorAll('.table-tenant-name').forEach((el) => {
                    el.addEventListener('click', () => loadTenantDetail(el.dataset.id));
                });
            }
        } catch (err) {
            console.error('Failed to load overview:', err);
            showAlert('Error', err.message);
        }
    }

    // ============================================
    // TENANTS
    // ============================================

    async function loadTenants() {
        const grid = $('#tenantsGrid');
        grid.innerHTML = '<div class="loading-placeholder"><div class="loading-spinner"></div>Loading tenants...</div>';

        try {
            const data = await apiCall('GET', '/super-admin/tenants');
            tenantsCache = data.tenants || data || [];
            renderTenants(tenantsCache);
        } catch (err) {
            grid.innerHTML = `<div class="loading-placeholder">Failed to load tenants: ${escapeHtml(err.message)}</div>`;
        }
    }

    function renderTenants(tenants) {
        const grid = $('#tenantsGrid');
        if (tenants.length === 0) {
            grid.innerHTML = '<div class="loading-placeholder">No tenants found</div>';
            return;
        }

        grid.innerHTML = tenants.map((t) => `
            <div class="tenant-card" data-id="${t.id}">
                <div class="tenant-card-header">
                    <div>
                        <div class="tenant-card-name">${escapeHtml(t.name || t.company_name || 'Unnamed')}</div>
                        <div class="tenant-card-slug">${escapeHtml(t.slug || t.subdomain || '--')}</div>
                    </div>
                    <span class="badge badge-${t.status || 'active'}">${t.status || 'active'}</span>
                </div>
                <div class="tenant-card-body">
                    <div class="tenant-card-row">
                        <span class="tenant-card-label">Plan</span>
                        <span class="tenant-card-value">${escapeHtml(t.plan || 'free')}</span>
                    </div>
                    <div class="tenant-card-row">
                        <span class="tenant-card-label">Registrations</span>
                        <span class="tenant-card-value">${formatNumber(t.registration_count || t.registrations || 0)}</span>
                    </div>
                    <div class="tenant-card-row">
                        <span class="tenant-card-label">Created</span>
                        <span class="tenant-card-value">${formatDate(t.created_at)}</span>
                    </div>
                </div>
                <div class="tenant-card-actions">
                    <button class="btn btn-sm btn-secondary btn-view-details" data-id="${t.id}">Details</button>
                    ${t.status === 'active'
                        ? `<button class="btn btn-sm btn-danger btn-deactivate" data-id="${t.id}">Deactivate</button>`
                        : `<button class="btn btn-sm btn-success btn-activate" data-id="${t.id}">Activate</button>`
                    }
                </div>
            </div>
        `).join('');

        // Attach event listeners
        grid.querySelectorAll('.btn-view-details').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                loadTenantDetail(btn.dataset.id);
            });
        });

        grid.querySelectorAll('.btn-activate').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleTenantStatus(btn.dataset.id, 'active');
            });
        });

        grid.querySelectorAll('.btn-deactivate').forEach((btn) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleTenantStatus(btn.dataset.id, 'suspended');
            });
        });

        // Card click to view details
        grid.querySelectorAll('.tenant-card').forEach((card) => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.tenant-card-actions')) return;
                loadTenantDetail(card.dataset.id);
            });
        });
    }

    // Tenant search and filter
    const tenantSearch = $('#tenantSearch');
    const tenantStatusFilter = $('#tenantStatusFilter');

    if (tenantSearch) {
        tenantSearch.addEventListener('input', filterTenants);
    }
    if (tenantStatusFilter) {
        tenantStatusFilter.addEventListener('change', filterTenants);
    }

    function filterTenants() {
        const query = (tenantSearch.value || '').toLowerCase().trim();
        const statusFilter = tenantStatusFilter.value;

        const filtered = tenantsCache.filter((t) => {
            const name = (t.name || t.company_name || '').toLowerCase();
            const slug = (t.slug || t.subdomain || '').toLowerCase();
            const matchSearch = !query || name.includes(query) || slug.includes(query);
            const matchStatus = !statusFilter || (t.status || 'active') === statusFilter;
            return matchSearch && matchStatus;
        });

        renderTenants(filtered);
    }

    // ---- Activate / Deactivate ----
    async function toggleTenantStatus(tenantId, newStatus) {
        const action = newStatus === 'active' ? 'activate' : 'deactivate';
        if (!confirm(`Are you sure you want to ${action} this tenant?`)) return;

        try {
            await apiCall('PATCH', `/super-admin/tenants/${tenantId}/status`, { status: newStatus });
            showAlert('Success', `Tenant ${action}d successfully.`);
            loadTenants();
        } catch (err) {
            showAlert('Error', err.message);
        }
    }

    // ============================================
    // TENANT DETAIL MODAL
    // ============================================

    async function loadTenantDetail(id) {
        tenantDetailModal.style.display = 'flex';
        const modalBody = $('#modalBody');
        const modalFooter = $('#modalFooter');
        modalBody.innerHTML = '<div class="loading-placeholder"><div class="loading-spinner"></div>Loading...</div>';
        $('#modalTenantName').textContent = 'Tenant Details';

        try {
            const data = await apiCall('GET', `/super-admin/tenants/${id}`);
            const tenant = data.tenant || data;

            $('#modalTenantName').textContent = tenant.name || tenant.company_name || 'Tenant Details';

            modalBody.innerHTML = `
                <div class="detail-section-title">General Information</div>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">Name</span>
                        <span class="detail-value">${escapeHtml(tenant.name || tenant.company_name || '--')}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Slug / Subdomain</span>
                        <span class="detail-value">${escapeHtml(tenant.slug || tenant.subdomain || '--')}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Status</span>
                        <span class="detail-value"><span class="badge badge-${tenant.status || 'active'}">${tenant.status || 'active'}</span></span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Plan</span>
                        <span class="detail-value">${escapeHtml(tenant.plan || 'free')}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Email</span>
                        <span class="detail-value">${escapeHtml(tenant.email || tenant.owner_email || '--')}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Created</span>
                        <span class="detail-value">${formatDate(tenant.created_at)}</span>
                    </div>
                </div>

                <div class="detail-section-title">Usage</div>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">Registrations</span>
                        <span class="detail-value">${formatNumber(tenant.registration_count || tenant.registrations || 0)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Revenue</span>
                        <span class="detail-value">${formatCurrency(tenant.total_revenue || 0)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Events</span>
                        <span class="detail-value">${formatNumber(tenant.event_count || tenant.events || 0)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Last Active</span>
                        <span class="detail-value">${formatDate(tenant.last_active_at || tenant.updated_at)}</span>
                    </div>
                </div>

                ${tenant.subscription ? `
                    <div class="detail-section-title">Subscription</div>
                    <div class="detail-grid">
                        <div class="detail-item">
                            <span class="detail-label">Plan</span>
                            <span class="detail-value">${escapeHtml(tenant.subscription.plan || '--')}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Amount</span>
                            <span class="detail-value">${formatCurrency(tenant.subscription.amount || 0)}</span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Status</span>
                            <span class="detail-value"><span class="badge badge-${tenant.subscription.status || 'active'}">${tenant.subscription.status || 'active'}</span></span>
                        </div>
                        <div class="detail-item">
                            <span class="detail-label">Next Billing</span>
                            <span class="detail-value">${formatDate(tenant.subscription.next_billing_date)}</span>
                        </div>
                    </div>
                ` : ''}
            `;

            // Modal footer actions
            const status = tenant.status || 'active';
            modalFooter.innerHTML = `
                ${status === 'active'
                    ? `<button class="btn btn-danger" id="modalDeactivateBtn">Deactivate</button>`
                    : `<button class="btn btn-success" id="modalActivateBtn">Activate</button>`
                }
                <button class="btn btn-secondary" id="modalCloseBtn">Close</button>
            `;

            // Attach footer action listeners
            const deactivateBtn = $('#modalDeactivateBtn');
            const activateBtn = $('#modalActivateBtn');

            if (deactivateBtn) {
                deactivateBtn.addEventListener('click', async () => {
                    await toggleTenantStatus(id, 'suspended');
                    closeModal(tenantDetailModal);
                });
            }
            if (activateBtn) {
                activateBtn.addEventListener('click', async () => {
                    await toggleTenantStatus(id, 'active');
                    closeModal(tenantDetailModal);
                });
            }

            $('#modalCloseBtn').addEventListener('click', () => closeModal(tenantDetailModal));
        } catch (err) {
            modalBody.innerHTML = `<div class="loading-placeholder">Failed to load tenant: ${escapeHtml(err.message)}</div>`;
        }
    }

    // ============================================
    // SUBSCRIPTIONS
    // ============================================

    async function loadSubscriptions() {
        const tbody = $('#subscriptionsBody');
        tbody.innerHTML = '<tr><td colspan="7" class="table-empty"><div class="loading-spinner"></div>Loading...</td></tr>';

        try {
            const data = await apiCall('GET', '/super-admin/subscriptions');
            subscriptionsCache = data.subscriptions || data || [];
            renderSubscriptions(subscriptionsCache);
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="7" class="table-empty">Failed to load: ${escapeHtml(err.message)}</td></tr>`;
        }
    }

    function renderSubscriptions(subscriptions) {
        const tbody = $('#subscriptionsBody');
        if (subscriptions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="table-empty">No subscriptions found</td></tr>';
            return;
        }

        tbody.innerHTML = subscriptions.map((s) => `
            <tr>
                <td class="table-tenant-name" data-id="${s.tenant_id}">${escapeHtml(s.tenant_name || s.company_name || '--')}</td>
                <td>${escapeHtml(s.plan || '--')}</td>
                <td>${formatCurrency(s.amount || 0)}</td>
                <td><span class="badge badge-${s.status || 'active'}">${s.status || 'active'}</span></td>
                <td>${formatDate(s.start_date || s.created_at)}</td>
                <td>${formatDate(s.next_billing_date)}</td>
                <td>
                    <button class="btn btn-sm btn-secondary btn-view-tenant" data-id="${s.tenant_id}">View Tenant</button>
                </td>
            </tr>
        `).join('');

        // Attach listeners
        tbody.querySelectorAll('.table-tenant-name, .btn-view-tenant').forEach((el) => {
            el.addEventListener('click', () => loadTenantDetail(el.dataset.id));
        });
    }

    // Subscription search and filter
    const subscriptionSearch = $('#subscriptionSearch');
    const subscriptionStatusFilter = $('#subscriptionStatusFilter');

    if (subscriptionSearch) {
        subscriptionSearch.addEventListener('input', filterSubscriptions);
    }
    if (subscriptionStatusFilter) {
        subscriptionStatusFilter.addEventListener('change', filterSubscriptions);
    }

    function filterSubscriptions() {
        const query = (subscriptionSearch.value || '').toLowerCase().trim();
        const statusFilter = subscriptionStatusFilter.value;

        const filtered = subscriptionsCache.filter((s) => {
            const name = (s.tenant_name || s.company_name || '').toLowerCase();
            const plan = (s.plan || '').toLowerCase();
            const matchSearch = !query || name.includes(query) || plan.includes(query);
            const matchStatus = !statusFilter || (s.status || 'active') === statusFilter;
            return matchSearch && matchStatus;
        });

        renderSubscriptions(filtered);
    }

    // ============================================
    // GLOBAL STATS
    // ============================================

    async function loadGlobalStats() {
        try {
            const data = await apiCall('GET', '/super-admin/stats');
            const stats = data.stats || data;

            $('#statTotalRegistrations').textContent = formatNumber(stats.total_registrations || 0);
            $('#statTotalRevenue').textContent = formatCurrency(stats.total_revenue || 0);
            $('#statAvgRegistrations').textContent = formatNumber(stats.avg_registrations_per_tenant || 0);
            $('#statConversionRate').textContent = (stats.trial_to_paid_conversion || 0) + '%';

            // Stats by tenant table
            const byTenant = stats.by_tenant || stats.tenant_stats || [];
            const tbody = $('#statsByTenantBody');
            if (byTenant.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" class="table-empty">No data available</td></tr>';
            } else {
                tbody.innerHTML = byTenant.map((t) => `
                    <tr>
                        <td class="table-tenant-name" data-id="${t.id || t.tenant_id}">${escapeHtml(t.name || t.company_name || '--')}</td>
                        <td>${formatNumber(t.registration_count || t.registrations || 0)}</td>
                        <td>${formatCurrency(t.revenue || t.total_revenue || 0)}</td>
                        <td><span class="badge badge-${t.status || 'active'}">${t.status || 'active'}</span></td>
                    </tr>
                `).join('');

                tbody.querySelectorAll('.table-tenant-name').forEach((el) => {
                    el.addEventListener('click', () => loadTenantDetail(el.dataset.id));
                });
            }
        } catch (err) {
            console.error('Failed to load global stats:', err);
            showAlert('Error', err.message);
        }
    }

    // ============================================
    // REBRAND REQUESTS
    // ============================================

    async function loadRebrandRequests() {
        const tbody = $('#rebrandRequestsBody');
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty"><div class="loading-spinner"></div>Loading...</td></tr>';

        try {
            const data = await apiCall('GET', '/super-admin/rebrand-requests');
            const requests = data.data || data || [];

            if (requests.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No rebrand requests</td></tr>';
                return;
            }

            tbody.innerHTML = requests.map((r) => `
                <tr>
                    <td>${escapeHtml(r.tenant_name || r.tenant_slug || '--')}</td>
                    <td>${escapeHtml(r.requested_brand_name || '--')}</td>
                    <td>${escapeHtml(r.requested_domain || '--')}</td>
                    <td><span class="badge badge-${r.status === 'pending' ? 'warning' : r.status === 'approved' ? 'success' : r.status === 'completed' ? 'active' : 'danger'}">${r.status}</span></td>
                    <td>${formatDate(r.created_at)}</td>
                    <td>
                        ${r.status === 'pending' ? `
                            <button class="btn btn-sm btn-success btn-approve-rebrand" data-id="${r.id}">Approve</button>
                            <button class="btn btn-sm btn-danger btn-reject-rebrand" data-id="${r.id}">Reject</button>
                        ` : ''}
                    </td>
                </tr>
            `).join('');

            // Approve handlers
            tbody.querySelectorAll('.btn-approve-rebrand').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const notes = prompt('Approval notes (optional):');
                    try {
                        await apiCall('POST', `/super-admin/rebrand-requests/${btn.dataset.id}/approve`, { notes });
                        showAlert('Success', 'Rebrand request approved.');
                        loadRebrandRequests();
                        loadNotificationBadges();
                    } catch (err) {
                        showAlert('Error', err.message);
                    }
                });
            });

            // Reject handlers
            tbody.querySelectorAll('.btn-reject-rebrand').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    const notes = prompt('Rejection reason (required):');
                    if (!notes) return;
                    try {
                        await apiCall('POST', `/super-admin/rebrand-requests/${btn.dataset.id}/reject`, { notes });
                        showAlert('Success', 'Rebrand request rejected.');
                        loadRebrandRequests();
                        loadNotificationBadges();
                    } catch (err) {
                        showAlert('Error', err.message);
                    }
                });
            });
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Error: ${escapeHtml(err.message)}</td></tr>`;
        }
    }

    // ============================================
    // REFERRALS
    // ============================================

    async function loadReferrals() {
        const tbody = $('#referralsBody');
        const payoutsBody = $('#payoutsBody');
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty"><div class="loading-spinner"></div>Loading...</td></tr>';
        payoutsBody.innerHTML = '<tr><td colspan="4" class="table-empty"><div class="loading-spinner"></div>Loading...</td></tr>';

        try {
            const [refData, payoutData] = await Promise.all([
                apiCall('GET', '/super-admin/referrals'),
                apiCall('GET', '/super-admin/referrals/payouts'),
            ]);

            const referrals = refData.data || refData || [];
            const payouts = payoutData.data || payoutData || [];

            // Referrals table
            if (referrals.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No referrals yet</td></tr>';
            } else {
                tbody.innerHTML = referrals.map((r) => {
                    const referrer = r.referrer || {};
                    const referred = r.referred || {};
                    return `
                        <tr>
                            <td>${escapeHtml(referrer.name || referrer.slug || '--')}</td>
                            <td>${escapeHtml(referred.name || referred.slug || '--')}</td>
                            <td>${r.commission_percent || 10}%</td>
                            <td>${formatCurrency((r.total_commission_earned || 0) / 100)}</td>
                            <td>${formatCurrency((r.total_commission_paid || 0) / 100)}</td>
                            <td><span class="badge badge-${r.status === 'active' ? 'active' : 'warning'}">${r.status}</span></td>
                        </tr>
                    `;
                }).join('');
            }

            // Payouts table
            if (payouts.length === 0) {
                payoutsBody.innerHTML = '<tr><td colspan="4" class="table-empty">No pending payouts</td></tr>';
            } else {
                payoutsBody.innerHTML = payouts.map((p) => `
                    <tr>
                        <td>${escapeHtml(p.tenant_name || p.tenant_slug || '--')}</td>
                        <td>${formatCurrency((p.amount || 0) / 100)}</td>
                        <td>${p.count || 0}</td>
                        <td>
                            <button class="btn btn-sm btn-success btn-process-payout" data-id="${p.referrer_tenant_id}" data-amount="${p.amount}">Process Payout</button>
                        </td>
                    </tr>
                `).join('');

                payoutsBody.querySelectorAll('.btn-process-payout').forEach((btn) => {
                    btn.addEventListener('click', async () => {
                        const reference = prompt('Payout reference (bank transfer ID, etc):');
                        if (!reference) return;
                        try {
                            await apiCall('POST', '/super-admin/referrals/payout', {
                                referrer_tenant_id: btn.dataset.id,
                                amount: Number(btn.dataset.amount),
                                reference,
                            });
                            showAlert('Success', 'Payout processed.');
                            loadReferrals();
                        } catch (err) {
                            showAlert('Error', err.message);
                        }
                    });
                });
            }
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" class="table-empty">Error: ${escapeHtml(err.message)}</td></tr>`;
        }
    }

    // ============================================
    // NOTIFICATIONS
    // ============================================

    async function loadNotifications() {
        const list = $('#notificationsList');
        list.innerHTML = '<div class="loading-placeholder"><div class="loading-spinner"></div>Loading...</div>';

        try {
            const data = await apiCall('GET', '/super-admin/notifications');
            const result = data.data || data;
            const notifications = result.notifications || [];

            if (notifications.length === 0) {
                list.innerHTML = '<div class="loading-placeholder">No notifications</div>';
                return;
            }

            list.innerHTML = notifications.map((n) => `
                <div class="notification-item ${n.is_read ? '' : 'unread'}" data-id="${n.id}">
                    <div class="notification-icon">${n.type === 'rebrand_request' ? '&#9998;' : n.type === 'referral_signup' ? '&#128279;' : n.type === 'payout_request' ? '&#128176;' : '&#128276;'}</div>
                    <div class="notification-content">
                        <strong>${escapeHtml(n.title)}</strong>
                        <p>${escapeHtml(n.message || '')}</p>
                        <small>${formatDate(n.created_at)}</small>
                    </div>
                    ${!n.is_read ? `<button class="btn btn-sm btn-secondary btn-mark-read" data-id="${n.id}">Mark Read</button>` : ''}
                </div>
            `).join('');

            list.querySelectorAll('.btn-mark-read').forEach((btn) => {
                btn.addEventListener('click', async () => {
                    await apiCall('POST', `/super-admin/notifications/${btn.dataset.id}/read`);
                    loadNotifications();
                    loadNotificationBadges();
                });
            });
        } catch (err) {
            list.innerHTML = `<div class="loading-placeholder">Error: ${escapeHtml(err.message)}</div>`;
        }
    }

    async function loadNotificationBadges() {
        try {
            const data = await apiCall('GET', '/super-admin/notifications');
            const result = data.data || data;
            const unreadCount = result.unread_count || 0;

            const notifBadge = $('#notifBadge');
            if (notifBadge) {
                notifBadge.textContent = unreadCount;
                notifBadge.style.display = unreadCount > 0 ? 'flex' : 'none';
            }

            // Count pending rebrands
            const rebrandData = await apiCall('GET', '/super-admin/rebrand-requests/pending');
            const pendingRebrands = (rebrandData.data || []).filter((r) => r.status === 'pending').length;
            const rebrandBadge = $('#rebrandBadge');
            if (rebrandBadge) {
                rebrandBadge.textContent = pendingRebrands;
                rebrandBadge.style.display = pendingRebrands > 0 ? 'flex' : 'none';
            }
        } catch {
            // Silently fail badge loading
        }
    }

    // Mark all read handler
    const markAllReadBtn = $('#markAllReadBtn');
    if (markAllReadBtn) {
        markAllReadBtn.addEventListener('click', async () => {
            try {
                await apiCall('POST', '/super-admin/notifications/read-all');
                loadNotifications();
                loadNotificationBadges();
            } catch (err) {
                showAlert('Error', err.message);
            }
        });
    }

    // ============================================
    // COMPOSE NOTIFICATION (AI-Powered)
    // ============================================

    const composeModal = $('#composeNotificationModal');
    const openComposeModalBtn = $('#openComposeModalBtn');
    const closeComposeModalBtn = $('#closeComposeModalBtn');
    const cancelComposeBtn = $('#cancelComposeBtn');
    const aiGenerateBtn = $('#aiGenerateBtn');
    const aiGenerateBtnText = $('#aiGenerateBtnText');
    const broadcastBtn = $('#broadcastBtn');
    const broadcastBtnText = $('#broadcastBtnText');
    const aiPromptInput = $('#aiPromptInput');
    const notifTitleInput = $('#notifTitleInput');
    const notifMessageInput = $('#notifMessageInput');
    const targetTenantSelect = $('#targetTenantSelect');

    function openComposeModal() {
        if (!composeModal) return;
        // Reset fields
        if (aiPromptInput) aiPromptInput.value = '';
        if (notifTitleInput) notifTitleInput.value = '';
        if (notifMessageInput) notifMessageInput.value = '';
        if (targetTenantSelect) targetTenantSelect.value = '';
        composeModal.style.display = 'flex';
        populateTenantSelect();
    }

    function closeComposeModal() {
        if (composeModal) composeModal.style.display = 'none';
    }

    async function populateTenantSelect() {
        if (!targetTenantSelect) return;
        try {
            const data = await apiCall('GET', '/super-admin/tenants');
            const result = data.data || data;
            const tenantList = Array.isArray(result) ? result : (result.tenants || []);

            // Keep the Global Broadcast default option
            targetTenantSelect.innerHTML = '<option value="">&#127760; Global Broadcast (All Tenants)</option>';

            tenantList.forEach((t) => {
                const opt = document.createElement('option');
                opt.value = t.id || t.tenant_id || '';
                opt.textContent = `${t.company_name || t.name || 'Unknown'} (${t.email || ''})`;
                targetTenantSelect.appendChild(opt);
            });
        } catch (err) {
            console.warn('Could not load tenants for compose modal:', err.message);
        }
    }

    async function handleAiGenerate() {
        const prompt = aiPromptInput ? aiPromptInput.value.trim() : '';
        if (!prompt) {
            showToast('Please enter a prompt for the AI to work with.', 'error');
            return;
        }

        // Loading state
        if (aiGenerateBtn) aiGenerateBtn.disabled = true;
        if (aiGenerateBtnText) aiGenerateBtnText.textContent = '⏳ Generating...';

        try {
            const data = await apiCall('POST', '/admin/ai/compose-notification', { prompt });
            const result = data.data || data;

            if (result.title && notifTitleInput) notifTitleInput.value = result.title;
            if (result.message && notifMessageInput) notifMessageInput.value = result.message;

            showToast('✨ AI draft generated! Review and edit before sending.', 'success');
        } catch (err) {
            showToast(`AI generation failed: ${err.message}`, 'error');
        } finally {
            if (aiGenerateBtn) aiGenerateBtn.disabled = false;
            if (aiGenerateBtnText) aiGenerateBtnText.textContent = '✨ Generate with AI';
        }
    }

    async function handleBroadcast() {
        const title = notifTitleInput ? notifTitleInput.value.trim() : '';
        const message = notifMessageInput ? notifMessageInput.value.trim() : '';
        const targetTenantId = targetTenantSelect ? (targetTenantSelect.value || null) : null;

        if (!title) { showToast('Please enter a notification title.', 'error'); return; }
        if (!message) { showToast('Please enter a message body.', 'error'); return; }

        // Loading state
        if (broadcastBtn) broadcastBtn.disabled = true;
        if (broadcastBtnText) broadcastBtnText.textContent = '⏳ Sending...';

        try {
            await apiCall('POST', '/admin/notifications', {
                title,
                message,
                target_tenant_id: targetTenantId
            });

            showToast('📨 Notification broadcast successfully!', 'success');
            closeComposeModal();
            loadNotifications();
        } catch (err) {
            showToast(`Broadcast failed: ${err.message}`, 'error');
        } finally {
            if (broadcastBtn) broadcastBtn.disabled = false;
            if (broadcastBtnText) broadcastBtnText.textContent = '📨 Broadcast Now';
        }
    }

    // Wire up compose modal events
    if (openComposeModalBtn) openComposeModalBtn.addEventListener('click', openComposeModal);
    if (closeComposeModalBtn) closeComposeModalBtn.addEventListener('click', closeComposeModal);
    if (cancelComposeBtn) cancelComposeBtn.addEventListener('click', closeComposeModal);
    if (aiGenerateBtn) aiGenerateBtn.addEventListener('click', handleAiGenerate);
    if (broadcastBtn) broadcastBtn.addEventListener('click', handleBroadcast);

    // Close compose modal on overlay click
    if (composeModal) {
        composeModal.addEventListener('click', (e) => {
            if (e.target === composeModal) closeComposeModal();
        });
    }

    // ============================================
    // MODALS
    // ============================================

    function closeModal(modal) {
        modal.style.display = 'none';
    }

    function showAlert(title, message) {
        $('#alertTitle').textContent = title;
        $('#alertMessage').textContent = message;
        alertModal.style.display = 'flex';
    }

    // Modal close handlers
    const modalClose = $('#modalClose');
    if (modalClose) modalClose.addEventListener('click', () => closeModal(tenantDetailModal));
    
    const alertClose = $('#alertClose');
    if (alertClose) alertClose.addEventListener('click', () => closeModal(alertModal));
    
    const alertOkBtn = $('#alertOkBtn');
    if (alertOkBtn) alertOkBtn.addEventListener('click', () => closeModal(alertModal));

    // Close modals on overlay click
    [tenantDetailModal, alertModal].forEach((modal) => {
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) closeModal(modal);
            });
        }
    });

    // Close modals on Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (tenantDetailModal && tenantDetailModal.style.display !== 'none') closeModal(tenantDetailModal);
            if (alertModal && alertModal.style.display !== 'none') closeModal(alertModal);
        }
    });

    // ============================================
    // MOBILE SIDEBAR
    // ============================================

    // Sidebar toggle (desktop/mobile)
    const sidebarToggle = document.getElementById('sidebarToggle');
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', () => {
            const isMobile = window.innerWidth <= 768;
            if (isMobile) {
                sidebar.classList.toggle('open');
            } else {
                sidebar.classList.toggle('collapsed');
                document.getElementById('dashboard').classList.toggle('collapsed-sidebar');
            }
        });
    }

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', () => {
            if (sidebar) sidebar.classList.toggle('open');
        });
    }

    function closeMobileSidebar() {
        if (sidebar) sidebar.classList.remove('open');
    }

    // Close sidebar on clicking outside (mobile)
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768 && sidebar && sidebar.classList.contains('open')) {
            if (!sidebar.contains(e.target) && (!mobileMenuBtn || e.target !== mobileMenuBtn) && (sidebarToggle && e.target !== sidebarToggle)) {
                closeMobileSidebar();
            }
        }
    });

    // ============================================
    // HELPERS
    // ============================================

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function formatNumber(num) {
        if (num == null) return '--';
        return Number(num).toLocaleString('en-IN');
    }

    function formatCurrency(amount) {
        if (amount == null) return '--';
        return new Intl.NumberFormat('en-IN', {
            style: 'currency',
            currency: 'INR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(amount);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '--';
        try {
            return new Date(dateStr).toLocaleDateString('en-IN', {
                year: 'numeric', month: 'short', day: 'numeric'
            });
        } catch {
            return '--';
        }
    }

    // ============================================
    // ANALYTICS DASHBOARD
    // ============================================

    async function loadAnalyticsDashboard() {
        const metricsEl = $('#analyticsMetrics');
        const detailsEl = $('#analyticsDetails');
        metricsEl.innerHTML = '<div class="loading-placeholder">Loading analytics...</div>';
        detailsEl.innerHTML = '';

        try {
            const res = await apiCall('GET', '/super-admin/analytics');
            const d = res.data || res;

            metricsEl.innerHTML = `
                <div class="metric-card">
                    <div class="metric-icon metric-icon-mrr">&#8377;</div>
                    <div class="metric-body">
                        <span class="metric-value">${formatCurrency(d.mrr || 0)}</span>
                        <span class="metric-label">Monthly Recurring Revenue</span>
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-icon metric-icon-mrr">&#8377;</div>
                    <div class="metric-body">
                        <span class="metric-value">${formatCurrency(d.arr || 0)}</span>
                        <span class="metric-label">Annual Recurring Revenue</span>
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-icon metric-icon-tenants">&#9881;</div>
                    <div class="metric-body">
                        <span class="metric-value">${d.tenant_counts?.active || 0}</span>
                        <span class="metric-label">Active Tenants</span>
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-icon metric-icon-active">&#10003;</div>
                    <div class="metric-body">
                        <span class="metric-value">${d.churn_rate || 0}%</span>
                        <span class="metric-label">Churn Rate</span>
                    </div>
                </div>
            `;

            // Plan distribution + Top tenants
            const planRows = (d.plan_distribution || []).map(p =>
                `<tr><td>${escapeHtml(p.plan)}</td><td>${p.count}</td></tr>`
            ).join('');

            const topRows = (d.top_tenants || []).slice(0, 10).map((t, i) =>
                `<tr><td>${i + 1}</td><td>${escapeHtml(t.name)}</td><td>${escapeHtml(t.slug)}</td><td>${t.registrations}</td></tr>`
            ).join('');

            const signupRows = (d.signup_trend || []).map(s =>
                `<tr><td>${escapeHtml(s.month)}</td><td>${s.count}</td></tr>`
            ).join('');

            detailsEl.innerHTML = `
                <div class="card mt-lg">
                    <div class="card-header"><h3>Tenant Counts</h3></div>
                    <div class="card-body">
                        <div class="metrics-grid">
                            <div class="metric-card">
                                <div class="metric-body"><span class="metric-value">${d.tenant_counts?.total || 0}</span><span class="metric-label">Total</span></div>
                            </div>
                            <div class="metric-card">
                                <div class="metric-body"><span class="metric-value">${d.tenant_counts?.trialing || 0}</span><span class="metric-label">Trialing</span></div>
                            </div>
                            <div class="metric-card">
                                <div class="metric-body"><span class="metric-value">${d.tenant_counts?.cancelled || 0}</span><span class="metric-label">Cancelled</span></div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card mt-lg">
                    <div class="card-header"><h3>Plan Distribution</h3></div>
                    <div class="card-body">
                        <table class="data-table"><thead><tr><th>Plan</th><th>Count</th></tr></thead>
                        <tbody>${planRows || '<tr><td colspan="2" class="table-empty">No data</td></tr>'}</tbody></table>
                    </div>
                </div>

                <div class="card mt-lg">
                    <div class="card-header"><h3>Top Tenants by Registrations</h3></div>
                    <div class="card-body">
                        <table class="data-table"><thead><tr><th>#</th><th>Name</th><th>Slug</th><th>Registrations</th></tr></thead>
                        <tbody>${topRows || '<tr><td colspan="4" class="table-empty">No data</td></tr>'}</tbody></table>
                    </div>
                </div>

                <div class="card mt-lg">
                    <div class="card-header"><h3>Signup Trend (Monthly)</h3></div>
                    <div class="card-body">
                        <table class="data-table"><thead><tr><th>Month</th><th>New Tenants</th></tr></thead>
                        <tbody>${signupRows || '<tr><td colspan="2" class="table-empty">No data</td></tr>'}</tbody></table>
                    </div>
                </div>

                <div class="card mt-lg">
                    <div class="card-header"><h3>Referral Program</h3></div>
                    <div class="card-body">
                        <p>Total Referrals: <strong>${d.referral_stats?.total_referrals || 0}</strong></p>
                        <p>Total Commission Paid: <strong>${formatCurrency(d.referral_stats?.total_commission || 0)}</strong></p>
                    </div>
                </div>
            `;
        } catch (err) {
            metricsEl.innerHTML = `<div class="loading-placeholder" style="color:red;">${escapeHtml(err.message)}</div>`;
        }
    }

    // ============================================
    // AUDIT LOG
    // ============================================

    let auditPage = 1;

    async function loadAuditLog() {
        const tbody = $('#auditLogBody');
        tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Loading...</td></tr>';

        const action = $('#auditActionFilter')?.value || '';
        const resource = $('#auditResourceFilter')?.value || '';
        const dateFrom = $('#auditDateFrom')?.value || '';
        const dateTo = $('#auditDateTo')?.value || '';

        let url = `/super-admin/audit-log?page=${auditPage}&limit=50`;
        if (action) url += `&action=${action}`;
        if (resource) url += `&resource_type=${resource}`;
        if (dateFrom) url += `&date_from=${dateFrom}T00:00:00Z`;
        if (dateTo) url += `&date_to=${dateTo}T23:59:59Z`;

        try {
            const res = await apiCall('GET', url);
            const d = res.data || res;
            const entries = d.entries || [];

            if (entries.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="table-empty">No audit entries found.</td></tr>';
            } else {
                tbody.innerHTML = entries.map(e => {
                    const tenantName = e.tenants?.name || '--';
                    return `<tr>
                        <td style="white-space:nowrap;">${formatDate(e.created_at)} ${new Date(e.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</td>
                        <td>${escapeHtml(tenantName)}</td>
                        <td>${escapeHtml(e.actor_role || '--')}</td>
                        <td><span class="status-badge status-${e.action === 'delete' ? 'cancelled' : e.action === 'create' ? 'active' : 'trialing'}">${escapeHtml(e.action)}</span></td>
                        <td>${escapeHtml(e.resource_type || '--')}</td>
                        <td style="font-size:11px;">${e.resource_id ? escapeHtml(String(e.resource_id).substring(0, 8)) + '...' : '--'}</td>
                    </tr>`;
                }).join('');
            }

            // Pagination controls
            $('#auditPageInfo').textContent = `Page ${auditPage}`;
            $('#auditPrevBtn').disabled = auditPage <= 1;
            $('#auditNextBtn').disabled = entries.length < 50;
        } catch (err) {
            tbody.innerHTML = `<tr><td colspan="6" class="table-empty" style="color:red;">${escapeHtml(err.message)}</td></tr>`;
        }
    }

    // Audit log event listeners (deferred until DOM is ready)
    setTimeout(() => {
        const filterBtn = $('#auditFilterBtn');
        if (filterBtn) {
            filterBtn.addEventListener('click', () => { auditPage = 1; loadAuditLog(); });
        }
        const prevBtn = $('#auditPrevBtn');
        if (prevBtn) {
            prevBtn.addEventListener('click', () => { if (auditPage > 1) { auditPage--; loadAuditLog(); } });
        }
        const nextBtn = $('#auditNextBtn');
        if (nextBtn) {
            nextBtn.addEventListener('click', () => { auditPage++; loadAuditLog(); });
        }
    }, 100);

    // ============================================
    // INIT
    // ============================================

    if (loginForm) {
        checkAuth();
    }

})();
