/**
 * Dashboard Authentication Module
 * Handles login, logout, token storage, and auto-refresh.
 */
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
        return localStorage.getItem(KEYS.access);
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
                // Token expired and refresh failed — force logout
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

    async function login(email, password) {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || data.error || 'Login failed');
        }

        // Expect: { access_token, refresh_token, tenant: { id, slug, name }, user }
        setTokens(data.access_token, data.refresh_token);

        if (data.tenant) {
            setTenant(data.tenant);
        }

        // Redirect super admins to super-admin panel
        const role = getUserRole(data.access_token);
        if (role === 'super_admin') {
            window.location.href = '/super-admin';
            return data;
        }

        return data;
    }

    async function refreshToken() {
        const rt = getRefreshTokenValue();
        if (!rt) throw new Error('No refresh token');

        const res = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: rt }),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || data.error || 'Token refresh failed');
        }

        setTokens(data.access_token, data.refresh_token || rt);
        return data;
    }

    function logout() {
        clearTokens();
    }

    // On module load, schedule refresh if token exists
    function init() {
        const token = getToken();
        if (token) {
            scheduleRefresh(token);
        }
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
    };
})();
