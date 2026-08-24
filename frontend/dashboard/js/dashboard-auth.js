/**
 * Dashboard Authentication & Activity Tracking Module
 * Handles login, logout, token storage, auto-refresh, and comprehensive activity logging.
 */

// ── ACTIVITY LOGGER MODULE ─────────────────────────────────────────
const ActivityLogger = (() => {
    const LOGS_KEY = 'tenant_activity_logs';
    const LOGIN_COUNT_KEY = 'tenant_login_count';

    function seedDefaultLogs() {
        const now = Date.now();
        const initialLogs = [
            {
                id: 'act_seed_1',
                action_type: 'Login Activity',
                icon: 'key',
                description: 'User logged into workspace session (Login Count: 1)',
                metadata: { channel: 'Web Portal', status_code: 200 },
                status: 'Success',
                created_at: new Date(now - 1000 * 60 * 120).toISOString()
            },
            {
                id: 'act_seed_2',
                action_type: 'Event Creation',
                icon: 'calendar',
                description: 'Successfully created event "Tech Innovation Summit 2026"',
                metadata: { venue: 'Grand Hyatt Convention Center', date: 'October 24, 2026' },
                status: 'Success',
                created_at: new Date(now - 1000 * 60 * 90).toISOString()
            },
            {
                id: 'act_seed_3',
                action_type: 'Flyer Generation',
                icon: 'image',
                description: 'Synthesized AI Flyer Canvas for "Tech Innovation Summit 2026"',
                metadata: { vibe: 'Cyberpunk Tech', color: '#00f5ff', format: 'Square 1080x1080' },
                status: 'Success',
                created_at: new Date(now - 1000 * 60 * 45).toISOString()
            }
        ];
        localStorage.setItem(LOGS_KEY, JSON.stringify(initialLogs));
        if (!localStorage.getItem(LOGIN_COUNT_KEY)) {
            localStorage.setItem(LOGIN_COUNT_KEY, '1');
        }
        return initialLogs;
    }

    function getLogs() {
        try {
            const raw = localStorage.getItem(LOGS_KEY);
            const logs = raw ? JSON.parse(raw) : [];
            if (!logs || logs.length === 0) {
                return seedDefaultLogs();
            }
            return logs;
        } catch {
            return seedDefaultLogs();
        }
    }

    function log(action_type, description, metadata = {}, status = 'Success') {
        const logs = getLogs();
        const newLog = {
            id: 'act_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
            action_type: action_type,
            description: description,
            metadata: metadata || {},
            status: status,
            created_at: new Date().toISOString()
        };
        logs.unshift(newLog);
        if (logs.length > 100) logs.pop();
        localStorage.setItem(LOGS_KEY, JSON.stringify(logs));
        return newLog;
    }

    function recordLogin(email = '') {
        let count = parseInt(localStorage.getItem(LOGIN_COUNT_KEY) || '0', 10) + 1;
        localStorage.setItem(LOGIN_COUNT_KEY, count.toString());
        return log(
            'Login Activity',
            `User ${email ? email : 'admin'} logged into session (Total Logins: ${count})`,
            { login_frequency: count, email: email },
            'Success'
        );
    }

    function getLoginCount() {
        return parseInt(localStorage.getItem(LOGIN_COUNT_KEY) || '1', 10);
    }

    return {
        getLogs,
        log,
        recordLogin,
        getLoginCount
    };
})();

window.ActivityLogger = ActivityLogger;


// ── DASHBOARD AUTH MODULE ──────────────────────────────────────────
const DashboardAuth = (() => {
    const KEYS = {
        access: 'dashboard_access_token',
        refresh: 'dashboard_refresh_token',
        tenant: 'dashboard_tenant',
    };

    let refreshTimer = null;

    // ---- Token helpers ----

    function setTokens(accessToken, refreshToken) {
        localStorage.setItem(KEYS.access, accessToken);
        if (refreshToken) {
            localStorage.setItem(KEYS.refresh, refreshToken);
        }
        scheduleRefresh(accessToken);
    }

    function clearTokens() {
        localStorage.removeItem(KEYS.access);
        localStorage.removeItem(KEYS.refresh);
        localStorage.removeItem(KEYS.tenant);
        if (refreshTimer) {
            clearTimeout(refreshTimer);
            refreshTimer = null;
        }
    }

    function getToken() {
        let token = localStorage.getItem(KEYS.access) || localStorage.getItem('authToken');
        if (!token) {
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key && key.startsWith('sb-') && key.endsWith('-auth-token')) {
                    try {
                        const sbData = JSON.parse(localStorage.getItem(key));
                        if (sbData && sbData.access_token) {
                            token = sbData.access_token;
                            localStorage.setItem(KEYS.access, token);
                            if (sbData.refresh_token) {
                                localStorage.setItem(KEYS.refresh, sbData.refresh_token);
                            }
                            break;
                        }
                    } catch (e) {}
                }
            }
        }
        return token;
    }

    function getRefreshTokenValue() {
        return localStorage.getItem(KEYS.refresh);
    }

    function isAuthenticated() {
        return !!getToken();
    }

    // ---- Tenant helpers ----

    function setTenant(tenant) {
        localStorage.setItem(KEYS.tenant, JSON.stringify(tenant));
    }

    function getTenant() {
        try {
            const raw = localStorage.getItem(KEYS.tenant);
            return raw ? JSON.parse(raw) : null;
        } catch {
            return null;
        }
    }

    // ---- JWT decode (minimal, no verification) ----

    function decodeJWT(token) {
        try {
            const payload = token.split('.')[1];
            const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
            return JSON.parse(decoded);
        } catch {
            return null;
        }
    }

    // ---- Auto-refresh ----

    function scheduleRefresh(token) {
        if (refreshTimer) {
            clearTimeout(refreshTimer);
            refreshTimer = null;
        }

        const payload = decodeJWT(token);
        if (!payload || !payload.exp) return;

        // Refresh 60 seconds before expiry
        const expiresIn = payload.exp * 1000 - Date.now();
        const refreshIn = Math.max(expiresIn - 60000, 5000);

        refreshTimer = setTimeout(async () => {
            try {
                await refreshToken();
            } catch (err) {
                console.warn('Auto-refresh failed:', err.message);
                logout();
                window.location.reload();
            }
        }, refreshIn);
    }

    // ---- Role helpers ----

    function getUserRole(token) {
        const payload = decodeJWT(token || getToken());
        return payload?.user_metadata?.role || 'tenant';
    }

    // ---- API calls ----

    async function login(email) {
        let data;
        if (typeof window !== 'undefined' && typeof window.safeApiFetch === 'function') {
            data = await window.safeApiFetch('/auth/login-email-only', {
                method: 'POST',
                body: JSON.stringify({ email }),
            });
        } else {
            const url = (typeof window !== 'undefined' && typeof window.resolveApiUrl === 'function')
                ? window.resolveApiUrl('/auth/login-email-only')
                : 'https://bizflow-registration.onrender.com/api/auth/login-email-only';

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email }),
            });
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
                data = await res.json().catch(() => ({}));
            } else {
                const text = await res.text().catch(() => '');
                try { data = JSON.parse(text); } catch { data = { message: text || `HTTP ${res.status}` }; }
            }

            if (!res.ok) {
                const errorMsg = data.error?.message || data.message || (typeof data.error === 'string' ? data.error : null) || 'Login failed';
                throw new Error(errorMsg);
            }
        }

        const payload = data.data || data;
        const accessToken = payload?.session?.access_token || payload?.access_token || data.token;
        const refreshTokenVal = payload?.session?.refresh_token || payload?.refresh_token;
        const tenant = payload?.tenant;

        if (data.token) {
            localStorage.setItem('authToken', data.token);
        }

        if (accessToken) {
            setTokens(accessToken, refreshTokenVal);
        }

        if (tenant) {
            setTenant(tenant);
        }

        // Record Login activity entry
        ActivityLogger.recordLogin(email);

        // Redirect super admins to admin-portal panel
        const role = getUserRole(accessToken);
        if (role === 'super_admin') {
            window.location.href = '/admin-portal';
            return data;
        }

        return data;
    }

    async function refreshToken() {
        const rt = getRefreshTokenValue();
        if (!rt) throw new Error('No refresh token');

        let data;
        if (typeof window !== 'undefined' && typeof window.safeApiFetch === 'function') {
            data = await window.safeApiFetch('/auth/refresh', {
                method: 'POST',
                body: JSON.stringify({ refresh_token: rt }),
            });
        } else {
            const url = (typeof window !== 'undefined' && typeof window.resolveApiUrl === 'function')
                ? window.resolveApiUrl('/auth/refresh')
                : 'https://bizflow-registration.onrender.com/api/auth/refresh';

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh_token: rt }),
            });
            const ct = res.headers.get('content-type') || '';
            if (ct.includes('application/json')) {
                data = await res.json().catch(() => ({}));
            } else {
                const text = await res.text().catch(() => '');
                try { data = JSON.parse(text); } catch { data = { message: text || `HTTP ${res.status}` }; }
            }

            if (!res.ok) {
                throw new Error(data.message || data.error || 'Token refresh failed');
            }
        }

        const payload = data.data || data;
        const accessToken = payload?.access_token;
        const refreshTokenVal = payload?.refresh_token || rt;

        setTokens(accessToken, refreshTokenVal);
        return data;
    }

    function logout() {
        clearTokens();
    }

    // On module load, schedule refresh if token exists & seed initial logs
    function init() {
        const token = getToken();
        if (token) {
            scheduleRefresh(token);

            // ── Onboarding Page Guard ────────────────────────────────────────────
            // If the user already holds a valid session token and is currently on
            // the onboarding page, redirect them straight to the dashboard.
            // This fires synchronously before onboarding.js even runs, preventing
            // any flash of the Step 1 UI for already-registered users.
            //
            // We intentionally do NOT call /api/auth/session-status here (that is
            // onboarding.js's job for the full is_paid check) — this guard simply
            // removes the most obvious case: a logged-in user landing on /onboarding.
            const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
            const isOnOnboarding = currentPath === '/onboarding' || currentPath.startsWith('/onboarding/');
            if (isOnOnboarding) {
                // Redirect and halt — onboarding.js will handle the edge case of
                // registered-but-unpaid users via its own checkExistingSession() guard.
                window.location.replace('/dashboard/');
                return;
            }
            // ── End Onboarding Page Guard ────────────────────────────────────────
        }
        ActivityLogger.getLogs(); // ensure activity logs exist
    }


    function isAdmin(token) {
        const payload = decodeJWT(token || getToken());
        return !!payload?.user_metadata?.is_admin || payload?.user_metadata?.role === 'super_admin';
    }

    function wipeAllTestData() {
        if (refreshTimer) {
            clearTimeout(refreshTimer);
            refreshTimer = null;
        }
        localStorage.clear();
        sessionStorage.clear();
        console.log('[DashboardAuth] Clean Slate: All local/session storage test data wiped successfully.');
    }

    init();

    // Public API
    return {
        login,
        logout,
        refreshToken,
        getToken,
        isAuthenticated,
        getTenant,
        setTenant,
        getUserRole,
        isAdmin,
        wipeAllTestData,
    };
})();


// ── DASHBOARD THEME MODULE ─────────────────────────────────────────────────────
/**
 * DashboardTheme — persists and applies the user's preferred UI theme.
 *
 * How it works:
 *  1. Theme key ('dark' | 'light' | 'neon') is saved to localStorage under
 *     'dashboard_theme'.
 *  2. On every page load, the saved key is read and applied to
 *     document.documentElement as [data-theme="..."].  The CSS file
 *     (dashboard.css) handles the rest via CSS custom property overrides.
 *  3. The header pill (index.html) and settings cards (settings.html) both
 *     call DashboardTheme.apply() to switch and persist the theme.
 *
 * Exported: window.DashboardTheme
 */
const DashboardTheme = (() => {
    const STORAGE_KEY = 'dashboard_theme';
    const DEFAULT_THEME = 'dark';

    const THEMES = {
        dark: {
            label: 'Dark High-Tech',
            dot: 'linear-gradient(135deg, #38bdf8, #ec4899)',
        },
        light: {
            label: 'Light Clean',
            dot: 'linear-gradient(135deg, #f1f5f9, #4f46e5)',
        },
        neon: {
            label: 'Vibrant Neon',
            dot: 'linear-gradient(135deg, #f0abfc, #818cf8, #00f5ff)',
        },
    };

    /** Returns the currently stored theme key (defaults to 'dark'). */
    function getTheme() {
        return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
    }

    /**
     * Applies a theme by setting [data-theme] on <html> and persists the
     * choice.  Adds a short transition class so the swap animates smoothly.
     * @param {string} themeKey - 'dark' | 'light' | 'neon'
     */
    function apply(themeKey) {
        if (!THEMES[themeKey]) themeKey = DEFAULT_THEME;

        // Animate the transition
        document.documentElement.classList.add('theme-transitioning');
        setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 350);

        // Apply
        if (themeKey === DEFAULT_THEME) {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', themeKey);
        }

        // Persist
        localStorage.setItem(STORAGE_KEY, themeKey);

        // Sync all on-page UI elements
        _syncPill(themeKey);
        _syncCards(themeKey);
        _syncDropdown(themeKey);

        console.log(`[DashboardTheme] Applied theme: ${themeKey}`);
    }

    /** Syncs the header pill dot colour and label text. */
    function _syncPill(themeKey) {
        const dot   = document.getElementById('theme-dot');
        const label = document.getElementById('theme-pill-label');
        if (dot)   dot.style.background   = THEMES[themeKey]?.dot || '';
        if (label) label.textContent = THEMES[themeKey]?.label || 'Theme';
    }

    /** Syncs the .active class on theme-card elements in settings.html. */
    function _syncCards(themeKey) {
        document.querySelectorAll('.theme-card[data-theme]').forEach(card => {
            card.classList.toggle('active', card.dataset.theme === themeKey);
        });
    }

    /** Syncs .active class on .theme-dd-option items in the header dropdown. */
    function _syncDropdown(themeKey) {
        document.querySelectorAll('.theme-dd-option[data-theme]').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.theme === themeKey);
        });
    }

    /**
     * Wires interactive controls after the DOM is ready.
     * Call once from DOMContentLoaded, or call apply() on its own to
     * programmatically switch themes.
     */
    function bindControls() {
        // ── Header pill toggle ─────────────────────────────────
        const pill     = document.getElementById('theme-switcher-pill');
        const dropdown = document.getElementById('theme-switcher-dropdown');

        if (pill && dropdown) {
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('open');
            });

            // Close on outside click
            document.addEventListener('click', () => dropdown.classList.remove('open'));

            // Dropdown option click
            dropdown.querySelectorAll('.theme-dd-option[data-theme]').forEach(opt => {
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    apply(opt.dataset.theme);
                    dropdown.classList.remove('open');
                });
            });
        }

        // ── Settings page theme cards ──────────────────────────
        document.querySelectorAll('.theme-card[data-theme]').forEach(card => {
            card.addEventListener('click', () => apply(card.dataset.theme));

            // Keyboard accessibility (Enter / Space)
            card.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    apply(card.dataset.theme);
                }
            });
        });
    }

    // ── Immediate init: apply persisted theme BEFORE paint ────────────────
    // This runs synchronously as soon as dashboard-auth.js is parsed, before
    // DOMContentLoaded, so there's zero flash-of-wrong-theme.
    apply(getTheme());

    // Wire controls once DOM is ready
    document.addEventListener('DOMContentLoaded', bindControls);

    // Public API
    return { apply, getTheme };
})();
