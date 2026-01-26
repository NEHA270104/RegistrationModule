/**
 * Admin Dashboard JavaScript
 * AI for MSME Summit 2026
 */

// State
let apiKey = localStorage.getItem('admin_api_key') || '';
let currentPage = 1;
let pageSize = 20;
let totalRegistrations = 0;
let registrations = [];
let autoRefreshInterval = null;

// DOM Elements
const authScreen = document.getElementById('auth-screen');
const dashboard = document.getElementById('dashboard');
const authForm = document.getElementById('auth-form');
const authError = document.getElementById('auth-error');
const loadingOverlay = document.getElementById('loading-overlay');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    if (apiKey) {
        validateAndShowDashboard();
    }

    // Event Listeners
    authForm.addEventListener('submit', handleAuth);
    document.getElementById('btn-refresh').addEventListener('click', refreshDashboard);
    document.getElementById('btn-logout').addEventListener('click', handleLogout);
    document.getElementById('btn-export').addEventListener('click', exportRegistrations);
    document.getElementById('btn-export-waitlist').addEventListener('click', exportWaitlist);
    document.getElementById('btn-clear-filters').addEventListener('click', clearFilters);
    document.getElementById('btn-prev').addEventListener('click', () => changePage(-1));
    document.getElementById('btn-next').addEventListener('click', () => changePage(1));

    // Filter listeners
    document.getElementById('filter-search').addEventListener('input', debounce(applyFilters, 500));
    document.getElementById('filter-tier').addEventListener('change', applyFilters);
    document.getElementById('filter-status').addEventListener('change', applyFilters);
    document.getElementById('filter-date').addEventListener('change', applyFilters);
});

// Utility Functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(amount);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function showLoading() {
    loadingOverlay.classList.remove('hidden');
}

function hideLoading() {
    loadingOverlay.classList.add('hidden');
}

function updateLastUpdated() {
    const now = new Date();
    document.getElementById('last-updated').textContent = `Last updated: ${now.toLocaleTimeString('en-IN')}`;
}

// Authentication
async function handleAuth(e) {
    e.preventDefault();
    const key = document.getElementById('api-key').value.trim();

    if (!key) {
        authError.textContent = 'Please enter an API key';
        return;
    }

    apiKey = key;
    await validateAndShowDashboard();
}

async function validateAndShowDashboard() {
    showLoading();

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/stats`, {
            headers: { 'X-API-Key': apiKey }
        });

        if (!response.ok) {
            throw new Error('Invalid API key');
        }

        // Store valid key
        localStorage.setItem('admin_api_key', apiKey);

        // Show dashboard
        authScreen.classList.add('hidden');
        dashboard.classList.remove('hidden');

        // Load all data
        await loadDashboardData();

        // Start auto-refresh
        startAutoRefresh();

    } catch (error) {
        authError.textContent = 'Invalid API key. Please try again.';
        localStorage.removeItem('admin_api_key');
        apiKey = '';
        authScreen.classList.remove('hidden');
        dashboard.classList.add('hidden');
    } finally {
        hideLoading();
    }
}

function handleLogout() {
    localStorage.removeItem('admin_api_key');
    apiKey = '';
    stopAutoRefresh();
    dashboard.classList.add('hidden');
    authScreen.classList.remove('hidden');
    document.getElementById('api-key').value = '';
    authError.textContent = '';
}

// Auto Refresh
function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshInterval = setInterval(refreshDashboard, 60000); // 60 seconds
}

function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
    }
}

async function refreshDashboard() {
    await loadDashboardData();
}

// Load Dashboard Data
async function loadDashboardData() {
    showLoading();

    try {
        await Promise.all([
            loadStats(),
            loadSeats(),
            loadRegistrations(),
            loadWaitlist()
        ]);
        updateLastUpdated();
    } catch (error) {
        console.error('Error loading dashboard data:', error);
    } finally {
        hideLoading();
    }
}

// Stats
async function loadStats() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/stats`, {
            headers: { 'X-API-Key': apiKey }
        });

        if (!response.ok) throw new Error('Failed to load stats');

        const data = await response.json();

        document.getElementById('stat-total').textContent = data.total_registrations || 0;
        document.getElementById('stat-confirmed').textContent = data.confirmed_payments || 0;
        document.getElementById('stat-revenue').textContent = formatCurrency(data.total_revenue || 0);
        document.getElementById('stat-waitlist').textContent = data.waitlist_count || 0;

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Seats
async function loadSeats() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/seats`, {
            headers: { 'X-API-Key': apiKey }
        });

        if (!response.ok) throw new Error('Failed to load seats');

        const data = await response.json();

        // Process each tier
        const tiers = ['vip', 'standard', 'basic'];
        tiers.forEach(tier => {
            const tierData = data.find(s => s.tier === tier);
            if (tierData) {
                const sold = tierData.total_seats - tierData.available_seats;
                const percentage = (sold / tierData.total_seats) * 100;

                document.getElementById(`sold-${tier}`).textContent = sold;
                document.getElementById(`available-${tier}`).textContent = tierData.available_seats;
                document.getElementById(`total-${tier}`).textContent = tierData.total_seats;
                document.getElementById(`progress-${tier}`).style.width = `${percentage}%`;
            }
        });

    } catch (error) {
        console.error('Error loading seats:', error);
    }
}

// Registrations
async function loadRegistrations() {
    try {
        const filters = getFilters();
        const queryParams = new URLSearchParams({
            page: currentPage,
            limit: pageSize,
            ...filters
        });

        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/registrations?${queryParams}`, {
            headers: { 'X-API-Key': apiKey }
        });

        if (!response.ok) throw new Error('Failed to load registrations');

        const data = await response.json();
        registrations = data.registrations || [];
        totalRegistrations = data.total || 0;

        renderRegistrations();
        updatePagination();

    } catch (error) {
        console.error('Error loading registrations:', error);
        document.getElementById('registrations-tbody').innerHTML = `
            <tr class="loading-row">
                <td colspan="9">Error loading registrations. Please try again.</td>
            </tr>
        `;
    }
}

function getFilters() {
    const filters = {};

    const search = document.getElementById('filter-search').value.trim();
    const tier = document.getElementById('filter-tier').value;
    const status = document.getElementById('filter-status').value;
    const dateRange = document.getElementById('filter-date').value;

    if (search) filters.search = search;
    if (tier) filters.tier = tier;
    if (status) filters.status = status;
    if (dateRange) filters.date_range = dateRange;

    return filters;
}

function applyFilters() {
    currentPage = 1;
    loadRegistrations();
}

function clearFilters() {
    document.getElementById('filter-search').value = '';
    document.getElementById('filter-tier').value = '';
    document.getElementById('filter-status').value = '';
    document.getElementById('filter-date').value = '';
    currentPage = 1;
    loadRegistrations();
}

function renderRegistrations() {
    const tbody = document.getElementById('registrations-tbody');

    if (registrations.length === 0) {
        tbody.innerHTML = `
            <tr class="loading-row">
                <td colspan="9">No registrations found.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = registrations.map(reg => `
        <tr>
            <td><code style="font-size: 0.75rem; background: var(--gray-100); padding: 0.25rem 0.5rem; border-radius: 4px;">${reg.booking_id || '--'}</code></td>
            <td><strong>${escapeHtml(reg.name || '--')}</strong></td>
            <td>${escapeHtml(reg.email || '--')}</td>
            <td>${escapeHtml(reg.phone || '--')}</td>
            <td>${escapeHtml(reg.business_name || '--')}</td>
            <td><span class="tier-badge ${reg.tier}">${getTierDisplayName(reg.tier)}</span></td>
            <td>${formatCurrency(reg.amount_paid || 0)}</td>
            <td><span class="status-badge ${reg.payment_status}">${capitalizeFirst(reg.payment_status || 'pending')}</span></td>
            <td>${formatDate(reg.created_at)}</td>
        </tr>
    `).join('');
}

function getTierDisplayName(tier) {
    const names = {
        vip: 'Executive',
        standard: 'Business',
        basic: 'Growth'
    };
    return names[tier] || tier;
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updatePagination() {
    const start = totalRegistrations === 0 ? 0 : (currentPage - 1) * pageSize + 1;
    const end = Math.min(currentPage * pageSize, totalRegistrations);

    document.getElementById('page-start').textContent = start;
    document.getElementById('page-end').textContent = end;
    document.getElementById('page-total').textContent = totalRegistrations;
    document.getElementById('current-page').textContent = currentPage;

    const totalPages = Math.ceil(totalRegistrations / pageSize);
    document.getElementById('btn-prev').disabled = currentPage <= 1;
    document.getElementById('btn-next').disabled = currentPage >= totalPages;
}

function changePage(delta) {
    const totalPages = Math.ceil(totalRegistrations / pageSize);
    const newPage = currentPage + delta;

    if (newPage >= 1 && newPage <= totalPages) {
        currentPage = newPage;
        loadRegistrations();
    }
}

// Waitlist
async function loadWaitlist() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/waitlist`, {
            headers: { 'X-API-Key': apiKey }
        });

        if (!response.ok) throw new Error('Failed to load waitlist');

        const data = await response.json();
        renderWaitlist(data.waitlist || []);

    } catch (error) {
        console.error('Error loading waitlist:', error);
        document.getElementById('waitlist-tbody').innerHTML = `
            <tr class="loading-row">
                <td colspan="7">Error loading waitlist. Please try again.</td>
            </tr>
        `;
    }
}

function renderWaitlist(waitlist) {
    const tbody = document.getElementById('waitlist-tbody');

    if (waitlist.length === 0) {
        tbody.innerHTML = `
            <tr class="loading-row">
                <td colspan="7">No waitlist entries found.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = waitlist.map((entry, index) => `
        <tr>
            <td><strong>#${index + 1}</strong></td>
            <td>${escapeHtml(entry.name || '--')}</td>
            <td>${escapeHtml(entry.email || '--')}</td>
            <td>${escapeHtml(entry.phone || '--')}</td>
            <td>${escapeHtml(entry.business_name || '--')}</td>
            <td><span class="livestream-badge ${entry.wants_livestream ? 'yes' : 'no'}">${entry.wants_livestream ? 'Yes' : 'No'}</span></td>
            <td>${formatDate(entry.created_at)}</td>
        </tr>
    `).join('');
}

// Export Functions
async function exportRegistrations() {
    showLoading();

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/export`, {
            headers: { 'X-API-Key': apiKey }
        });

        if (!response.ok) throw new Error('Failed to export');

        const blob = await response.blob();
        downloadBlob(blob, `registrations_${new Date().toISOString().split('T')[0]}.csv`);

    } catch (error) {
        console.error('Error exporting registrations:', error);
        alert('Failed to export registrations. Please try again.');
    } finally {
        hideLoading();
    }
}

async function exportWaitlist() {
    showLoading();

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/waitlist`, {
            headers: { 'X-API-Key': apiKey }
        });

        if (!response.ok) throw new Error('Failed to fetch waitlist');

        const data = await response.json();
        const waitlist = data.waitlist || [];

        // Convert to CSV
        const headers = ['Position', 'Name', 'Email', 'Phone', 'Business', 'Wants Livestream', 'Date'];
        const rows = waitlist.map((entry, index) => [
            index + 1,
            entry.name || '',
            entry.email || '',
            entry.phone || '',
            entry.business_name || '',
            entry.wants_livestream ? 'Yes' : 'No',
            entry.created_at
        ]);

        const csvContent = [headers, ...rows]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        downloadBlob(blob, `waitlist_${new Date().toISOString().split('T')[0]}.csv`);

    } catch (error) {
        console.error('Error exporting waitlist:', error);
        alert('Failed to export waitlist. Please try again.');
    } finally {
        hideLoading();
    }
}

function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
}

// ============================================
// Settings Management
// ============================================

let currentSettings = {};
let settingsModified = false;

// Initialize settings UI
function initSettingsUI() {
    // Tab switching
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.addEventListener('click', () => switchSettingsTab(tab.dataset.tab));
    });

    // Save button
    document.getElementById('btn-save-settings')?.addEventListener('click', saveAllSettings);

    // Toggle history
    document.getElementById('btn-toggle-history')?.addEventListener('click', toggleSettingsHistory);

    // Track changes
    document.querySelectorAll('.settings-panel input, .settings-panel textarea').forEach(input => {
        input.addEventListener('change', markSettingsModified);
        input.addEventListener('input', markSettingsModified);
    });

    // Offer date preview
    const offerStartInput = document.getElementById('setting-offer-start');
    const offerDurationInput = document.getElementById('setting-offer-duration');
    if (offerStartInput) offerStartInput.addEventListener('change', updateOfferPreview);
    if (offerDurationInput) offerDurationInput.addEventListener('input', updateOfferPreview);
}

function switchSettingsTab(tabId) {
    // Update tab buttons
    document.querySelectorAll('.settings-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabId);
    });

    // Update panels
    document.querySelectorAll('.settings-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === `panel-${tabId}`);
    });
}

function markSettingsModified() {
    settingsModified = true;
    const status = document.getElementById('settings-status');
    if (status) {
        status.textContent = 'Unsaved changes';
        status.className = 'settings-status';
    }
}

// Load settings from API
async function loadSettings() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/settings/admin`, {
            headers: { 'X-API-Key': apiKey }
        });

        if (!response.ok) throw new Error('Failed to load settings');

        const data = await response.json();
        currentSettings = {};

        // Convert to key-value map
        data.settings.forEach(setting => {
            currentSettings[setting.setting_key] = setting.setting_value;
        });

        // Populate form fields
        populateSettingsForm();
        updateOfferPreview();
        settingsModified = false;

    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

function populateSettingsForm() {
    // Offer settings
    setCheckbox('setting-offer-active', currentSettings.offer_is_active);
    setDateTimeInput('setting-offer-start', currentSettings.offer_start_date);
    setInput('setting-offer-duration', currentSettings.offer_duration_days);
    setInput('setting-offer-discount', currentSettings.offer_discount_amount);

    // Pricing settings
    setInput('setting-vip-original', currentSettings.tier_vip_original_price);
    setInput('setting-vip-offer', currentSettings.tier_vip_offer_price);
    setInput('setting-standard-original', currentSettings.tier_standard_original_price);
    setInput('setting-standard-offer', currentSettings.tier_standard_offer_price);
    setInput('setting-basic-original', currentSettings.tier_basic_original_price);
    setInput('setting-basic-offer', currentSettings.tier_basic_offer_price);
    setInput('setting-waitlist-price', currentSettings.tier_waitlist_price);

    // Event settings
    setInput('setting-event-name', currentSettings.event_name);
    setInput('setting-event-date', currentSettings.event_date);
    setInput('setting-event-time', currentSettings.event_time);
    setInput('setting-event-venue', currentSettings.event_venue);

    // Registration settings
    setCheckbox('setting-reg-open', currentSettings.registration_open);
    setCheckbox('setting-waitlist-enabled', currentSettings.waitlist_enabled);
    setDateTimeInput('setting-reg-close', currentSettings.registration_close_date);
}

function setInput(id, value) {
    const el = document.getElementById(id);
    if (el && value !== undefined) {
        el.value = typeof value === 'string' ? value.replace(/^"|"$/g, '') : value;
    }
}

function setCheckbox(id, value) {
    const el = document.getElementById(id);
    if (el) {
        el.checked = value === true || value === 'true';
    }
}

function setDateTimeInput(id, value) {
    const el = document.getElementById(id);
    if (el && value) {
        // Convert ISO string to datetime-local format
        const dateStr = typeof value === 'string' ? value.replace(/^"|"$/g, '') : value;
        try {
            const date = new Date(dateStr);
            // Format as YYYY-MM-DDTHH:MM for datetime-local input
            const formatted = date.toISOString().slice(0, 16);
            el.value = formatted;
        } catch (e) {
            console.error('Error parsing date:', e);
        }
    }
}

function updateOfferPreview() {
    const startInput = document.getElementById('setting-offer-start');
    const durationInput = document.getElementById('setting-offer-duration');
    const previewEl = document.getElementById('offer-end-preview');

    if (!startInput || !durationInput || !previewEl) return;

    const startDate = new Date(startInput.value);
    const duration = parseInt(durationInput.value) || 3;

    if (isNaN(startDate.getTime())) {
        previewEl.textContent = 'Invalid start date';
        return;
    }

    const endDate = new Date(startDate.getTime() + (duration * 24 * 60 * 60 * 1000));
    previewEl.textContent = endDate.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Save all settings
async function saveAllSettings() {
    if (!settingsModified) {
        showSettingsStatus('No changes to save', '');
        return;
    }

    showSettingsStatus('Saving...', 'saving');
    const saveBtn = document.getElementById('btn-save-settings');
    if (saveBtn) saveBtn.disabled = true;

    try {
        const updates = collectSettingsUpdates();

        const response = await fetch(`${CONFIG.API_BASE_URL}/settings/admin/batch`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify({ updates })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error?.message || 'Failed to save settings');
        }

        showSettingsStatus('All changes saved!', 'saved');
        settingsModified = false;

        // Reload settings to sync
        await loadSettings();

        // Clear status after 3 seconds
        setTimeout(() => {
            const status = document.getElementById('settings-status');
            if (status && status.classList.contains('saved')) {
                status.textContent = '';
            }
        }, 3000);

    } catch (error) {
        console.error('Error saving settings:', error);
        showSettingsStatus('Failed to save: ' + error.message, 'error');
    } finally {
        if (saveBtn) saveBtn.disabled = false;
    }
}

function collectSettingsUpdates() {
    const updates = [];

    // Helper to add update if value changed
    function addUpdate(key, value) {
        const oldValue = currentSettings[key];
        const newValue = typeof value === 'string' ? `"${value}"` : value;

        // Compare values (handle JSON strings)
        let oldCompare = oldValue;
        if (typeof oldValue === 'string') {
            try { oldCompare = JSON.parse(oldValue); } catch (e) { oldCompare = oldValue; }
        }

        if (JSON.stringify(oldCompare) !== JSON.stringify(value)) {
            updates.push({ key, value: value });
        }
    }

    // Offer settings
    addUpdate('offer_is_active', document.getElementById('setting-offer-active')?.checked || false);
    const offerStart = document.getElementById('setting-offer-start')?.value;
    if (offerStart) {
        const isoDate = new Date(offerStart).toISOString();
        addUpdate('offer_start_date', isoDate);
    }
    addUpdate('offer_duration_days', parseInt(document.getElementById('setting-offer-duration')?.value) || 3);
    addUpdate('offer_discount_amount', parseInt(document.getElementById('setting-offer-discount')?.value) || 1000);

    // Pricing settings
    addUpdate('tier_vip_original_price', parseInt(document.getElementById('setting-vip-original')?.value) || 0);
    addUpdate('tier_vip_offer_price', parseInt(document.getElementById('setting-vip-offer')?.value) || 0);
    addUpdate('tier_standard_original_price', parseInt(document.getElementById('setting-standard-original')?.value) || 0);
    addUpdate('tier_standard_offer_price', parseInt(document.getElementById('setting-standard-offer')?.value) || 0);
    addUpdate('tier_basic_original_price', parseInt(document.getElementById('setting-basic-original')?.value) || 0);
    addUpdate('tier_basic_offer_price', parseInt(document.getElementById('setting-basic-offer')?.value) || 0);
    addUpdate('tier_waitlist_price', parseInt(document.getElementById('setting-waitlist-price')?.value) || 0);

    // Event settings
    addUpdate('event_name', document.getElementById('setting-event-name')?.value || '');
    addUpdate('event_date', document.getElementById('setting-event-date')?.value || '');
    addUpdate('event_time', document.getElementById('setting-event-time')?.value || '');
    addUpdate('event_venue', document.getElementById('setting-event-venue')?.value || '');

    // Registration settings
    addUpdate('registration_open', document.getElementById('setting-reg-open')?.checked || false);
    addUpdate('waitlist_enabled', document.getElementById('setting-waitlist-enabled')?.checked || false);
    const regClose = document.getElementById('setting-reg-close')?.value;
    if (regClose) {
        const isoDate = new Date(regClose).toISOString();
        addUpdate('registration_close_date', isoDate);
    }

    return updates;
}

function showSettingsStatus(message, type) {
    const status = document.getElementById('settings-status');
    if (status) {
        status.textContent = message;
        status.className = 'settings-status ' + type;
    }
}

// Settings history
async function toggleSettingsHistory() {
    const panel = document.getElementById('history-panel');
    if (!panel) return;

    if (panel.classList.contains('hidden')) {
        await loadSettingsHistory();
        panel.classList.remove('hidden');
    } else {
        panel.classList.add('hidden');
    }
}

async function loadSettingsHistory() {
    const listEl = document.getElementById('history-list');
    if (!listEl) return;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/settings/admin/history?limit=20`, {
            headers: { 'X-API-Key': apiKey }
        });

        if (!response.ok) throw new Error('Failed to load history');

        const data = await response.json();
        renderSettingsHistory(data.history || []);

    } catch (error) {
        console.error('Error loading settings history:', error);
        listEl.innerHTML = '<p class="history-empty">Failed to load history.</p>';
    }
}

function renderSettingsHistory(history) {
    const listEl = document.getElementById('history-list');
    if (!listEl) return;

    if (history.length === 0) {
        listEl.innerHTML = '<p class="history-empty">No changes recorded.</p>';
        return;
    }

    listEl.innerHTML = history.map(item => {
        const time = new Date(item.created_at).toLocaleString('en-IN');
        const oldVal = formatSettingValue(item.old_value);
        const newVal = formatSettingValue(item.new_value);

        return `
            <div class="history-item">
                <span class="history-time">${time}</span>
                <div class="history-details">
                    <span class="history-key">${item.setting_key}</span>
                    <div class="history-change">
                        <span class="history-old">${oldVal}</span>
                        &rarr;
                        <span class="history-new">${newVal}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function formatSettingValue(value) {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'string') {
        // Remove quotes and truncate if too long
        const clean = value.replace(/^"|"$/g, '');
        return clean.length > 30 ? clean.substring(0, 30) + '...' : clean;
    }
    return String(value);
}

// Update loadDashboardData to include settings
const originalLoadDashboardData = loadDashboardData;
loadDashboardData = async function() {
    await originalLoadDashboardData();
    await loadSettings();
};

// Initialize settings on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initSettingsUI();
});
