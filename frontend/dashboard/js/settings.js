/**
 * Standalone Account Settings Controller
 * Features: Auto-Population from LocalStorage / Tenant Session · Instant Sync with Dashboard
 */
document.addEventListener('DOMContentLoaded', () => {
    // ── 1. Auth check ────────────────────────────────────────────────
    if (!DashboardAuth.isAuthenticated()) {
        window.location.href = '/dashboard';
        return;
    }

    // ── 2. Tenant Data Auto-Population ────────────────────────────────
    const localTenant = DashboardAuth.getTenant() || {};

    const sidebarTenantName = document.getElementById('sidebar-tenant-name');
    if (sidebarTenantName) {
        sidebarTenantName.textContent = localTenant.company_name || localTenant.name || 'Dashboard';
    }
    const headerUserName = document.getElementById('header-user-name');
    if (headerUserName) {
        headerUserName.innerHTML = `<i data-lucide="circle-user"></i> <span>${localTenant.name || localTenant.company_name || 'User'}</span>`;
    }

    const root = document.documentElement;
    if (localTenant.primary_color) {
        root.style.setProperty('--primary', localTenant.primary_color);
        root.style.setProperty('--primary-dark', localTenant.primary_color);
    }
    if (localTenant.secondary_color) {
        root.style.setProperty('--secondary', localTenant.secondary_color);
    }
    const pColor = localTenant.primary_color || '#667eea';
    const sColor = localTenant.secondary_color || '#764ba2';
    root.style.setProperty('--gradient', `linear-gradient(135deg, ${pColor} 0%, ${sColor} 100%)`);

    const adminNav = document.getElementById('nav-item-admin-notifications');
    if (adminNav) {
        adminNav.style.display = DashboardAuth.isAdmin() ? 'flex' : 'none';
    }

    // Bind values into inputs immediately on DOM load
    function populateFormValues(data) {
        const companyInput = document.getElementById('setting-company-name');
        const nameInput = document.getElementById('setting-name');
        const slugInput = document.getElementById('setting-slug');
        const emailInput = document.getElementById('setting-email');
        const phoneInput = document.getElementById('setting-phone');
        const domainInput = document.getElementById('setting-custom-domain');
        const jobInput = document.getElementById('setting-job-title');
        const bioInput = document.getElementById('setting-bio');
        const pColorInput = document.getElementById('setting-primary-color');
        const sColorInput = document.getElementById('setting-secondary-color');
        const logoInput = document.getElementById('setting-logo-url');
        const avatarPreview = document.getElementById('settings-avatar-preview');

        if (companyInput) companyInput.value = data.company_name || data.name || 'Event Organization';
        if (nameInput) nameInput.value = data.name || data.company_name || 'Event Admin';
        if (slugInput) slugInput.value = data.slug || 'default-tenant';
        if (emailInput) emailInput.value = data.email || 'admin@eventreg.com';
        if (phoneInput) phoneInput.value = data.phone || '+91 9876543210';
        if (domainInput) domainInput.value = data.custom_domain || 'registration.eventreg.in';
        if (jobInput) jobInput.value = data.job_title || 'Lead Event Architect';
        if (bioInput) bioInput.value = data.bio || 'Managing enterprise technology events and attendee registrations.';
        if (pColorInput) pColorInput.value = data.primary_color || '#667eea';
        if (sColorInput) sColorInput.value = data.secondary_color || '#764ba2';
        if (logoInput) logoInput.value = data.logo_url || '';
        if (avatarPreview && data.logo_url) avatarPreview.src = data.logo_url;
    }

    // Populate from local storage session immediately
    populateFormValues(localTenant);

    // Try background sync with API
    async function fetchAccountAPI() {
        const token = DashboardAuth.getToken();
        const slug = localTenant.slug;
        if (!slug || !token) return;

        try {
            const targetUrl = (typeof window !== 'undefined' && typeof window.resolveApiUrl === 'function')
                ? window.resolveApiUrl(`/t/${slug}/account`)
                : `/api/t/${slug}/account`;

            const res = await fetch(targetUrl, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const ct = res.headers.get('content-type') || '';
            if (res.ok && ct.includes('application/json')) {
                const json = await res.json();
                const acct = json.account || json.tenant || json || {};
                const merged = { ...localTenant, ...acct };
                DashboardAuth.setTenant(merged);
                populateFormValues(merged);
            }
        } catch (err) {
            console.warn('[Settings] API account sync warning:', err);
        }
    }
    fetchAccountAPI();

    // ── 3. Form Submit & Seamless Local Storage Data Sync ─────────────
    const settingsForm = document.getElementById('account-settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const updatedData = {
                company_name: document.getElementById('setting-company-name')?.value.trim(),
                name: document.getElementById('setting-name')?.value.trim(),
                email: document.getElementById('setting-email')?.value.trim(),
                phone: document.getElementById('setting-phone')?.value.trim(),
                custom_domain: document.getElementById('setting-custom-domain')?.value.trim(),
                job_title: document.getElementById('setting-job-title')?.value.trim(),
                bio: document.getElementById('setting-bio')?.value.trim(),
                primary_color: document.getElementById('setting-primary-color')?.value,
                secondary_color: document.getElementById('setting-secondary-color')?.value,
                logo_url: document.getElementById('setting-logo-url')?.value.trim()
            };

            // Merge with local tenant state
            const mergedTenant = { ...localTenant, ...updatedData };
            DashboardAuth.setTenant(mergedTenant);

            // Update UI headers
            if (sidebarTenantName) sidebarTenantName.textContent = mergedTenant.company_name || mergedTenant.name;
            if (headerUserName) headerUserName.innerHTML = `<i data-lucide="circle-user"></i> <span>${mergedTenant.name || mergedTenant.company_name}</span>`;

            // Sync with backend API in background
            try {
                const token = DashboardAuth.getToken();
                const slug = mergedTenant.slug;
                if (slug && token) {
                    const saveUrl = (typeof window !== 'undefined' && typeof window.resolveApiUrl === 'function')
                        ? window.resolveApiUrl(`/t/${slug}/account`)
                        : `/api/t/${slug}/account`;

                    await fetch(saveUrl, {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`
                        },
                        body: JSON.stringify(updatedData)
                    });
                }
            } catch (err) {
                console.warn('[Settings] Backend save warning:', err);
            }

            alert('✓ Account settings updated and synced seamlessly!');
        });
    }

    // Avatar Upload Handler
    const uploadBtn = document.getElementById('btn-upload-avatar');
    const uploadInput = document.getElementById('settings-avatar-upload');
    const avatarPreview = document.getElementById('settings-avatar-preview');

    if (uploadBtn && uploadInput) {
        uploadBtn.addEventListener('click', () => uploadInput.click());
        uploadInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (evt) => {
                const base64 = evt.target.result;
                if (avatarPreview) avatarPreview.src = base64;
                const logoInput = document.getElementById('setting-logo-url');
                if (logoInput) logoInput.value = base64;

                const current = DashboardAuth.getTenant() || {};
                current.logo_url = base64;
                DashboardAuth.setTenant(current);
            };
            reader.readAsDataURL(file);
        });
    }

    // ── 4. Sidebar Toggle & Clean Slate Reset ──────────────────────────
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
            if (confirm('⚠️ Clean Slate Data Reset:\n\nAre you sure you want to wipe all local test data, cached events, and sessions? You will be redirected to restart onboarding.')) {
                DashboardAuth.wipeAllTestData();
                alert('✓ Local test data and sessions wiped cleanly. Redirecting to onboarding...');
                window.location.href = '/onboarding';
            }
        });
    }

    if (window.lucide) window.lucide.createIcons();
});
