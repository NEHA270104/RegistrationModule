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

// ============================================
// Failed Registration Call Tracking
// ============================================
const CALLED_REGISTRATIONS_KEY = 'admin_called_registrations';

function getCalledRegistrations() {
    try {
        return JSON.parse(localStorage.getItem(CALLED_REGISTRATIONS_KEY) || '{}');
    } catch {
        return {};
    }
}

function markRegistrationAsCalled(bookingId) {
    const called = getCalledRegistrations();
    called[bookingId] = {
        calledAt: new Date().toISOString(),
        calledBy: 'admin'
    };
    localStorage.setItem(CALLED_REGISTRATIONS_KEY, JSON.stringify(called));
    renderRegistrations(); // Re-render to update UI
    updateFailedCallCounter();
}

function isRegistrationCalled(bookingId) {
    const called = getCalledRegistrations();
    return !!called[bookingId];
}

function getFailedRegistrationsNeedingCall() {
    return registrations.filter(reg =>
        reg.payment_status === 'failed' && !isRegistrationCalled(reg.booking_id)
    );
}

function updateFailedCallCounter() {
    const failedNeedingCall = getFailedRegistrationsNeedingCall();
    const counterEl = document.getElementById('failed-call-counter');

    if (counterEl) {
        if (failedNeedingCall.length > 0) {
            counterEl.textContent = failedNeedingCall.length;
            counterEl.classList.remove('hidden');
        } else {
            counterEl.classList.add('hidden');
        }
    }
}

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
    document.getElementById('btn-delete-all-registrations')?.addEventListener('click', deleteAllRegistrations);
    document.getElementById('btn-resync-seats')?.addEventListener('click', resyncSeatCounts);
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

// ============================================
// Modal Helper Functions (Replace browser alerts/confirms)
// ============================================
let confirmCallback = null;

function showConfirmModal(title, message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    const okBtn = document.getElementById('confirm-modal-ok');

    if (!modal) return;

    titleEl.textContent = title;
    messageEl.textContent = message;
    confirmCallback = onConfirm;

    // Remove old listener and add new one
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    newOkBtn.addEventListener('click', () => {
        // Save callback reference before closeConfirmModal sets it to null
        const callback = confirmCallback;
        closeConfirmModal();
        if (callback) callback();
    });

    modal.classList.remove('hidden');
}

function closeConfirmModal() {
    const modal = document.getElementById('confirm-modal');
    if (modal) modal.classList.add('hidden');
    confirmCallback = null;
}

function showAlertModal(title, message, isSuccess = true) {
    const modal = document.getElementById('alert-modal');
    const titleEl = document.getElementById('alert-modal-title');
    const messageEl = document.getElementById('alert-modal-message');

    if (!modal) return;

    titleEl.textContent = title;
    messageEl.textContent = message;

    // Update modal header color based on success/error
    const header = modal.querySelector('.modal-header');
    if (header) {
        header.style.borderBottomColor = isSuccess ? 'var(--green-500)' : 'var(--red-500)';
    }

    modal.classList.remove('hidden');
}

function closeAlertModal() {
    const modal = document.getElementById('alert-modal');
    if (modal) modal.classList.add('hidden');
}

function formatCurrency(amount) {
    // Database stores amounts in RUPEES (INR) directly
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
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/stats?_t=${Date.now()}`, {
            headers: { 'X-API-Key': apiKey },
            cache: 'no-store'
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
    autoRefreshInterval = setInterval(refreshDashboard, 90000); // 90 seconds — gives admin more time to edit
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
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/stats?_t=${Date.now()}`, {
            headers: { 'X-API-Key': apiKey },
            cache: 'no-store'
        });

        if (!response.ok) throw new Error('Failed to load stats');

        const result = await response.json();
        const data = result.data || result; // Unwrap nested data

        document.getElementById('stat-total').textContent = data.totalRegistrations || data.total_registrations || 0;
        document.getElementById('stat-confirmed').textContent = data.confirmedRegistrations || data.confirmed_registrations || data.confirmedPayments || data.confirmed_payments || 0;
        document.getElementById('stat-revenue').textContent = data.revenue_formatted || formatCurrency(data.totalRevenue || data.total_revenue || 0);
        document.getElementById('stat-waitlist').textContent = data.waitlist_count || data.waitlistCount || 0;

    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

// Seats
async function loadSeats() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/seats?_t=${Date.now()}`, {
            headers: { 'X-API-Key': apiKey },
            cache: 'no-store'
        });

        if (!response.ok) throw new Error('Failed to load seats');

        const result = await response.json();
        const seats = result.data?.seats || result.seats || result;

        // Process each tier
        const tiers = ['vip', 'standard', 'basic'];
        tiers.forEach(tier => {
            const tierData = Array.isArray(seats) ? seats.find(s => s.tier === tier || s.tier_name === tier) : null;
            if (tierData) {
                const totalSeats = tierData.total_seats || tierData.totalSeats || 0;
                const availableSeats = tierData.available_seats || tierData.availableSeats || 0;
                const soldSeats = tierData.sold_seats || tierData.soldSeats || 0;
                const heldSeats = tierData.held_seats || tierData.heldSeats || 0;
                const percentage = totalSeats > 0 ? ((soldSeats + heldSeats) / totalSeats) * 100 : 0;

                // Show actual sold count (not held)
                const soldEl = document.getElementById(`sold-${tier}`);
                if (soldEl) {
                    // Show sold count, with held count in parentheses if any
                    if (heldSeats > 0) {
                        soldEl.innerHTML = `${soldSeats} <span style="color: #f59e0b; font-size: 0.75rem;">(+${heldSeats} pending)</span>`;
                    } else {
                        soldEl.textContent = soldSeats;
                    }
                }
                document.getElementById(`available-${tier}`).textContent = availableSeats;
                document.getElementById(`total-${tier}`).textContent = totalSeats;
                document.getElementById(`progress-${tier}`).style.width = `${percentage}%`;

                // Populate seat capacity settings inputs
                const seatsInput = document.getElementById(`setting-seats-${tier}`);
                if (seatsInput) {
                    seatsInput.value = totalSeats;
                    // Store original value for change detection
                    seatsInput.dataset.originalValue = totalSeats;
                }
            }
        });

    } catch (error) {
        console.error('Error loading seats:', error);
    }
}

// Resync Seat Counts
async function resyncSeatCounts() {
    const btn = document.getElementById('btn-resync-seats');
    if (!btn) return;

    const originalText = btn.innerHTML;
    btn.classList.add('syncing');
    btn.disabled = true;
    btn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
        Syncing...
    `;

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/seats/resync`, {
            method: 'POST',
            headers: { 'X-API-Key': apiKey }
        });

        if (!response.ok) throw new Error('Failed to resync seats');

        const result = await response.json();

        if (result.success) {
            const changes = result.data?.changes || [];
            if (changes.length > 0) {
                const changesText = changes.map(c =>
                    `${c.tier}: ${c.field} ${c.before} → ${c.after}`
                ).join(', ');
                showAlertModal('Resync Complete', `Changes made: ${changesText}`, true);
            } else {
                showAlertModal('No Changes Needed', 'Seat counts are already in sync.', true);
            }
            // Refresh dashboard to show updated counts
            await loadDashboardData();
        } else {
            throw new Error(result.error?.message || 'Unknown error');
        }

    } catch (error) {
        console.error('Error resyncing seats:', error);
        showAlertModal('Error', 'Failed to resync seat counts. Please try again.', false);
    } finally {
        btn.classList.remove('syncing');
        btn.disabled = false;
        btn.innerHTML = originalText;
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

        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/registrations?${queryParams}&_t=${Date.now()}`, {
            headers: { 'X-API-Key': apiKey },
            cache: 'no-store'
        });

        if (!response.ok) throw new Error('Failed to load registrations');

        const result = await response.json();
        const data = result.data || result;
        registrations = data.registrations || [];
        totalRegistrations = data.pagination?.total || data.total || 0;

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
    if (status) filters.payment_status = status;

    if (dateRange) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (dateRange === 'today') {
            filters.date_from = today.toISOString();
        } else if (dateRange === 'week') {
            const weekAgo = new Date(today);
            weekAgo.setDate(weekAgo.getDate() - 7);
            filters.date_from = weekAgo.toISOString();
        } else if (dateRange === 'month') {
            const monthAgo = new Date(today);
            monthAgo.setDate(monthAgo.getDate() - 30);
            filters.date_from = monthAgo.toISOString();
        }
    }

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
                <td colspan="10">No registrations found.</td>
            </tr>
        `;
        updateFailedCallCounter();
        return;
    }

    tbody.innerHTML = registrations.map(reg => {
        const isFailed = reg.payment_status === 'failed';
        const isCalled = isRegistrationCalled(reg.booking_id);
        const needsCall = isFailed && !isCalled;
        const rowClass = needsCall ? 'needs-call' : '';

        // Build call action based on status
        let callAction = '';
        if (isFailed) {
            if (isCalled) {
                callAction = `
                    <span class="called-badge">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                        Called
                    </span>
                `;
            } else {
                callAction = `
                    <button class="call-reminder" onclick="markRegistrationAsCalled('${reg.booking_id}')" title="Mark as Called">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
                        </svg>
                        Call
                    </button>
                `;
            }
        }

        return `
        <tr class="${rowClass}">
            <td><code style="font-size: 0.75rem; background: var(--gray-100); padding: 0.25rem 0.5rem; border-radius: 4px;">${reg.booking_id || '--'}</code></td>
            <td><strong>${escapeHtml(reg.name || '--')}</strong></td>
            <td>${escapeHtml(reg.email || '--')}</td>
            <td>${escapeHtml(reg.phone || '--')}</td>
            <td>${escapeHtml(reg.business_name || '--')}</td>
            <td><span class="tier-badge ${reg.tier}">${getTierDisplayName(reg.tier)}</span></td>
            <td>${formatCurrency(reg.amount_paid || 0)}</td>
            <td>
                <span class="status-badge ${reg.payment_status}">${capitalizeFirst(reg.payment_status || 'pending')}</span>
                ${needsCall ? '<br><small style="color: #b91c1c; font-size: 0.625rem;">Needs follow-up</small>' : ''}
            </td>
            <td>${formatDate(reg.created_at)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action btn-delete" onclick="deleteRegistration('${reg.booking_id}')" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                    ${callAction}
                </div>
            </td>
        </tr>
    `}).join('');

    // Update counter after rendering
    updateFailedCallCounter();
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

// Delete Registration
async function deleteRegistration(bookingId) {
    showConfirmModal(
        'Delete Registration',
        `Are you sure you want to delete registration ${bookingId}? This action cannot be undone.`,
        async () => {
            try {
                showLoading();
                const response = await fetch(`${CONFIG.API_BASE_URL}/admin/registrations/${bookingId}`, {
                    method: 'DELETE',
                    headers: { 'X-API-Key': apiKey }
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error?.message || 'Failed to delete registration');
                }

                showAlertModal('Success', 'Registration deleted successfully', true);
                loadDashboardData();
            } catch (error) {
                console.error('Error deleting registration:', error);
                showAlertModal('Error', error.message, false);
            } finally {
                hideLoading();
            }
        }
    );
}

async function deleteAllRegistrations() {
    showConfirmModal(
        'Delete All Registrations',
        'Are you sure you want to delete ALL registrations? This will release all seats and cannot be undone.',
        async () => {
            try {
                showLoading();
                const response = await fetch(`${CONFIG.API_BASE_URL}/admin/registrations/all`, {
                    method: 'DELETE',
                    headers: { 'X-API-Key': apiKey }
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error?.message || 'Failed to delete all registrations');
                }

                showAlertModal('Success', result.message || 'All registrations deleted successfully', true);
                loadDashboardData();
            } catch (error) {
                console.error('Error deleting all registrations:', error);
                showAlertModal('Error', error.message, false);
            } finally {
                hideLoading();
            }
        }
    );
}

// Show Add Registration Modal
function showAddRegistrationModal() {
    document.getElementById('add-registration-modal').classList.remove('hidden');
}

// Hide Add Registration Modal
function hideAddRegistrationModal() {
    document.getElementById('add-registration-modal').classList.add('hidden');
    document.getElementById('add-registration-form').reset();
}

// Create Manual Registration
async function createManualRegistration(event) {
    event.preventDefault();

    const form = event.target;
    const formData = {
        name: form.name.value.trim(),
        email: form.email.value.trim().toLowerCase(),
        phone: form.phone.value.trim(),
        business_name: form.business_name.value.trim() || undefined,
        industry: form.industry.value || undefined,
        tier: form.tier.value,
        amount_paid: parseInt(form.amount_paid.value) || 0,
        payment_status: form.payment_status.value
    };

    try {
        showLoading();
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/registrations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify(formData)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error?.message || 'Failed to create registration');
        }

        showAlertModal('Success', `Registration created successfully! Booking ID: ${result.data.booking_id}`, true);
        hideAddRegistrationModal();
        loadDashboardData();
    } catch (error) {
        console.error('Error creating registration:', error);
        showAlertModal('Error', error.message, false);
    } finally {
        hideLoading();
    }
}

// Waitlist
async function loadWaitlist() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/waitlist?_t=${Date.now()}`, {
            headers: { 'X-API-Key': apiKey },
            cache: 'no-store'
        });

        if (!response.ok) throw new Error('Failed to load waitlist');

        const result = await response.json();
        const data = result.data || result;
        renderWaitlist(data.entries || data.waitlist || []);

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
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/export?_t=${Date.now()}`, {
            headers: { 'X-API-Key': apiKey },
            cache: 'no-store'
        });

        if (!response.ok) throw new Error('Failed to export');

        const blob = await response.blob();
        downloadBlob(blob, `registrations_${new Date().toISOString().split('T')[0]}.csv`);

    } catch (error) {
        console.error('Error exporting registrations:', error);
        showAlertModal('Export Failed', 'Failed to export registrations. Please try again.', false);
    } finally {
        hideLoading();
    }
}

async function exportWaitlist() {
    showLoading();

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/waitlist?_t=${Date.now()}`, {
            headers: { 'X-API-Key': apiKey },
            cache: 'no-store'
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
        showAlertModal('Export Failed', 'Failed to export waitlist. Please try again.', false);
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
        tab.addEventListener('click', () => window.switchSettingsTab(tab.dataset.tab));
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
        const response = await fetch(`${CONFIG.API_BASE_URL}/settings/admin?_t=${Date.now()}`, {
            headers: { 'X-API-Key': apiKey },
            cache: 'no-store'
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

    // Offer messaging
    setInput('setting-offer-label', currentSettings.offer_label);
    setInput('setting-offer-description', currentSettings.offer_description);

    // Hero promo section
    setCheckbox('setting-promo-enabled', currentSettings.promo_enabled);
    setInput('setting-promo-value-prop', currentSettings.promo_value_prop);
    setInput('setting-promo-whatsapp-keyword', currentSettings.promo_whatsapp_keyword);
    setInput('setting-promo-urgency-text', currentSettings.promo_urgency_text);

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
    setInput('setting-event-platform', currentSettings.event_platform);
    setCheckbox('setting-event-platform-visible', currentSettings.event_platform_visible);
    setInput('setting-event-venue', currentSettings.event_venue);
    setInput('setting-event-venue-map-link', currentSettings.event_venue_map_link);

    // Support settings
    setInput('setting-support-email', currentSettings.support_email);
    setInput('setting-support-phone', currentSettings.support_phone);
    setInput('setting-support-whatsapp', currentSettings.support_whatsapp);

    // Registration settings
    setCheckbox('setting-reg-open', currentSettings.registration_open);
    setCheckbox('setting-waitlist-enabled', currentSettings.waitlist_enabled);
    setDateTimeInput('setting-reg-close', currentSettings.registration_close_date);

    // Guest settings
    setInput('setting-guest-session-heading', currentSettings.guest_session_heading);
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

    // Offer messaging
    addUpdate('offer_label', document.getElementById('setting-offer-label')?.value || 'Early Bird Special!');
    addUpdate('offer_description', document.getElementById('setting-offer-description')?.value || 'Save on all passes');

    // Hero promo section
    addUpdate('promo_enabled', document.getElementById('setting-promo-enabled')?.checked || false);
    addUpdate('promo_value_prop', document.getElementById('setting-promo-value-prop')?.value || '');
    addUpdate('promo_whatsapp_keyword', document.getElementById('setting-promo-whatsapp-keyword')?.value || '');
    addUpdate('promo_urgency_text', document.getElementById('setting-promo-urgency-text')?.value || '');

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
    addUpdate('event_platform', document.getElementById('setting-event-platform')?.value || '');
    addUpdate('event_platform_visible', document.getElementById('setting-event-platform-visible')?.checked ?? true);
    addUpdate('event_venue', document.getElementById('setting-event-venue')?.value || '');
    addUpdate('event_venue_map_link', document.getElementById('setting-event-venue-map-link')?.value || '');

    // Support settings
    addUpdate('support_email', document.getElementById('setting-support-email')?.value || '');
    addUpdate('support_phone', document.getElementById('setting-support-phone')?.value || '');
    addUpdate('support_whatsapp', document.getElementById('setting-support-whatsapp')?.value || '');

    // Registration settings
    addUpdate('registration_open', document.getElementById('setting-reg-open')?.checked || false);
    addUpdate('waitlist_enabled', document.getElementById('setting-waitlist-enabled')?.checked || false);
    const regClose = document.getElementById('setting-reg-close')?.value;
    if (regClose) {
        const isoDate = new Date(regClose).toISOString();
        addUpdate('registration_close_date', isoDate);
    }

    // Seat capacity settings (synced to seat_inventory table)
    const seatsVip = document.getElementById('setting-seats-vip');
    if (seatsVip && seatsVip.value !== seatsVip.dataset.originalValue) {
        updates.push({ key: 'total_seats_vip', value: parseInt(seatsVip.value) || 0 });
    }
    const seatsStandard = document.getElementById('setting-seats-standard');
    if (seatsStandard && seatsStandard.value !== seatsStandard.dataset.originalValue) {
        updates.push({ key: 'total_seats_standard', value: parseInt(seatsStandard.value) || 0 });
    }
    const seatsBasic = document.getElementById('setting-seats-basic');
    if (seatsBasic && seatsBasic.value !== seatsBasic.dataset.originalValue) {
        updates.push({ key: 'total_seats_basic', value: parseInt(seatsBasic.value) || 0 });
    }

    // Guest settings
    addUpdate('guest_session_heading', document.getElementById('setting-guest-session-heading')?.value || "In this session, you'll learn:");

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
        const response = await fetch(`${CONFIG.API_BASE_URL}/settings/admin/history?limit=20&_t=${Date.now()}`, {
            headers: { 'X-API-Key': apiKey },
            cache: 'no-store'
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

// ============================================
// Payment Abandonments Management
// ============================================

let abandonmentPage = 1;
let abandonmentPageSize = 20;
let totalAbandonments = 0;
let abandonments = [];
let selectedAbandonment = null;
let pendingRegistrations = [];

// Initialize Abandonments UI
document.addEventListener('DOMContentLoaded', () => {
    initAbandonmentsUI();
});

function initAbandonmentsUI() {
    // Event listeners for abandonment section
    const exportBtn = document.getElementById('btn-export-abandonments');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportAbandonments);
    }

    const clearFiltersBtn = document.getElementById('btn-clear-abandonment-filters');
    if (clearFiltersBtn) {
        clearFiltersBtn.addEventListener('click', clearAbandonmentFilters);
    }

    const deleteAllBtn = document.getElementById('btn-delete-all-abandonments');
    if (deleteAllBtn) {
        deleteAllBtn.addEventListener('click', deleteAllAbandonments);
    }

    const cleanupBtn = document.getElementById('btn-cleanup-expired');
    if (cleanupBtn) {
        cleanupBtn.addEventListener('click', cleanupExpiredRegistrations);
    }

    const prevBtn = document.getElementById('btn-abandonment-prev');
    if (prevBtn) {
        prevBtn.addEventListener('click', () => changeAbandonmentPage(-1));
    }

    const nextBtn = document.getElementById('btn-abandonment-next');
    if (nextBtn) {
        nextBtn.addEventListener('click', () => changeAbandonmentPage(1));
    }

    // Filter listeners
    const searchInput = document.getElementById('filter-abandonment-search');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(applyAbandonmentFilters, 500));
    }

    const typeFilter = document.getElementById('filter-abandonment-type');
    if (typeFilter) {
        typeFilter.addEventListener('change', applyAbandonmentFilters);
    }

    const statusFilter = document.getElementById('filter-followup-status');
    if (statusFilter) {
        statusFilter.addEventListener('change', applyAbandonmentFilters);
    }

    // Modal listeners
    const closeModalBtn = document.getElementById('close-abandonment-modal');
    if (closeModalBtn) {
        closeModalBtn.addEventListener('click', closeAbandonmentModal);
    }

    const closeBtn = document.getElementById('btn-close-modal');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeAbandonmentModal);
    }

    const sendEmailBtn = document.getElementById('btn-send-recovery-email');
    if (sendEmailBtn) {
        sendEmailBtn.addEventListener('click', sendRecoveryEmailFromModal);
    }
}

// Load Abandonments
async function loadAbandonments() {
    try {
        const filters = getAbandonmentFilters();
        const queryParams = new URLSearchParams({
            page: abandonmentPage,
            limit: abandonmentPageSize,
            ...filters
        });

        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/abandonments?${queryParams}&_t=${Date.now()}`, {
            headers: { 'X-API-Key': apiKey },
            cache: 'no-store'
        });

        if (!response.ok) throw new Error('Failed to load abandonments');

        const data = await response.json();
        abandonments = data.data?.abandonments || [];
        totalAbandonments = data.data?.pagination?.total || 0;

        renderAbandonments();
        updateAbandonmentPagination();

    } catch (error) {
        console.error('Error loading abandonments:', error);
        const tbody = document.getElementById('abandonments-tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr class="loading-row">
                    <td colspan="9">Error loading abandonments. Please try again.</td>
                </tr>
            `;
        }
    }
}

// Load Abandonment Stats
async function loadAbandonmentStats() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/abandonments/stats?_t=${Date.now()}`, {
            headers: { 'X-API-Key': apiKey },
            cache: 'no-store'
        });

        if (!response.ok) throw new Error('Failed to load abandonment stats');

        const data = await response.json();
        const stats = data.data || {};

        const totalEl = document.getElementById('stat-abandoned-total');
        if (totalEl) totalEl.textContent = stats.total_abandonments || 0;

        const pendingEl = document.getElementById('stat-abandoned-pending');
        if (pendingEl) pendingEl.textContent = stats.pending_followup || 0;

        const convertedEl = document.getElementById('stat-abandoned-converted');
        if (convertedEl) convertedEl.textContent = stats.converted || 0;

        const revenueEl = document.getElementById('stat-abandoned-revenue');
        if (revenueEl) revenueEl.textContent = stats.lost_revenue_formatted || formatCurrency(stats.total_lost_revenue || 0);

    } catch (error) {
        console.error('Error loading abandonment stats:', error);
    }
}

function getAbandonmentFilters() {
    const filters = {};

    const searchEl = document.getElementById('filter-abandonment-search');
    const typeEl = document.getElementById('filter-abandonment-type');
    const statusEl = document.getElementById('filter-followup-status');

    const search = searchEl ? searchEl.value.trim() : '';
    const type = typeEl ? typeEl.value : '';
    const status = statusEl ? statusEl.value : '';

    if (search) filters.search = search;
    if (type) filters.abandonment_type = type;
    if (status) filters.followup_status = status;

    return filters;
}

function applyAbandonmentFilters() {
    abandonmentPage = 1;
    loadAbandonments();
}

function clearAbandonmentFilters() {
    const searchEl = document.getElementById('filter-abandonment-search');
    const typeEl = document.getElementById('filter-abandonment-type');
    const statusEl = document.getElementById('filter-followup-status');

    if (searchEl) searchEl.value = '';
    if (typeEl) typeEl.value = '';
    if (statusEl) statusEl.value = '';

    abandonmentPage = 1;
    loadAbandonments();
}

function renderAbandonments() {
    const tbody = document.getElementById('abandonments-tbody');
    if (!tbody) return;

    if (abandonments.length === 0) {
        tbody.innerHTML = `
            <tr class="loading-row">
                <td colspan="9">No payment abandonments found.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = abandonments.map(item => `
        <tr>
            <td><strong>${escapeHtml(item.name || '--')}</strong></td>
            <td>
                <div>${escapeHtml(item.email || '--')}</div>
                <div class="text-muted">${escapeHtml(item.phone || '--')}</div>
            </td>
            <td>${escapeHtml(item.business_name || '--')}</td>
            <td><span class="tier-badge ${item.tier}">${getTierDisplayName(item.tier)}</span></td>
            <td>${formatCurrency(item.amount || 0)}</td>
            <td><span class="type-badge ${item.abandonment_type}">${capitalizeFirst(item.abandonment_type || 'unknown')}</span></td>
            <td><span class="followup-badge ${item.followup_status}">${formatFollowupStatus(item.followup_status)}</span></td>
            <td>${formatDate(item.abandoned_at)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-action" onclick="viewAbandonmentDetails('${item.id}')" title="View Details">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                            <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                    </button>
                    <button class="btn-action btn-email" onclick="sendRecoveryEmail('${item.id}')" title="Send Recovery Email">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                            <polyline points="22,6 12,13 2,6"></polyline>
                        </svg>
                    </button>
                    <button class="btn-action btn-delete" onclick="deleteAbandonment('${item.id}', '${escapeHtml(item.name)}')" title="Delete">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                            <polyline points="3 6 5 6 21 6"></polyline>
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

function formatFollowupStatus(status) {
    const statusNames = {
        pending: 'Pending',
        email_sent: 'Email Sent',
        contacted: 'Contacted',
        converted: 'Converted',
        declined: 'Declined',
        unresponsive: 'Unresponsive'
    };
    return statusNames[status] || capitalizeFirst(status || 'pending');
}

function updateAbandonmentPagination() {
    const start = totalAbandonments === 0 ? 0 : (abandonmentPage - 1) * abandonmentPageSize + 1;
    const end = Math.min(abandonmentPage * abandonmentPageSize, totalAbandonments);

    const startEl = document.getElementById('abandonment-page-start');
    const endEl = document.getElementById('abandonment-page-end');
    const totalEl = document.getElementById('abandonment-page-total');
    const currentEl = document.getElementById('abandonment-current-page');

    if (startEl) startEl.textContent = start;
    if (endEl) endEl.textContent = end;
    if (totalEl) totalEl.textContent = totalAbandonments;
    if (currentEl) currentEl.textContent = abandonmentPage;

    const totalPages = Math.ceil(totalAbandonments / abandonmentPageSize);

    const prevBtn = document.getElementById('btn-abandonment-prev');
    const nextBtn = document.getElementById('btn-abandonment-next');

    if (prevBtn) prevBtn.disabled = abandonmentPage <= 1;
    if (nextBtn) nextBtn.disabled = abandonmentPage >= totalPages;
}

function changeAbandonmentPage(delta) {
    const totalPages = Math.ceil(totalAbandonments / abandonmentPageSize);
    const newPage = abandonmentPage + delta;

    if (newPage >= 1 && newPage <= totalPages) {
        abandonmentPage = newPage;
        loadAbandonments();
    }
}

// View Abandonment Details
async function viewAbandonmentDetails(id) {
    showLoading();

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/abandonments/${id}?_t=${Date.now()}`, {
            headers: { 'X-API-Key': apiKey },
            cache: 'no-store'
        });

        if (!response.ok) throw new Error('Failed to load abandonment details');

        const data = await response.json();
        selectedAbandonment = data.data;

        renderAbandonmentModal(selectedAbandonment);
        openAbandonmentModal();

    } catch (error) {
        console.error('Error loading abandonment details:', error);
        showAlertModal('Error', 'Failed to load abandonment details. Please try again.', false);
    } finally {
        hideLoading();
    }
}

function renderAbandonmentModal(item) {
    const modalBody = document.getElementById('abandonment-modal-body');
    if (!modalBody) return;

    modalBody.innerHTML = `
        <div class="abandonment-details">
            <div class="detail-section">
                <h4>Contact Information</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">Name</span>
                        <span class="detail-value">${escapeHtml(item.name || '--')}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Email</span>
                        <span class="detail-value"><a href="mailto:${item.email}">${escapeHtml(item.email || '--')}</a></span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Phone</span>
                        <span class="detail-value"><a href="tel:${item.phone}">${escapeHtml(item.phone || '--')}</a></span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Business</span>
                        <span class="detail-value">${escapeHtml(item.business_name || '--')}</span>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h4>Abandonment Details</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">Tier</span>
                        <span class="detail-value"><span class="tier-badge ${item.tier}">${getTierDisplayName(item.tier)}</span></span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Amount</span>
                        <span class="detail-value">${formatCurrency(item.amount || 0)}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Type</span>
                        <span class="detail-value"><span class="type-badge ${item.abandonment_type}">${capitalizeFirst(item.abandonment_type || 'unknown')}</span></span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Reason</span>
                        <span class="detail-value">${escapeHtml(item.abandonment_reason || '--')}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Abandoned At</span>
                        <span class="detail-value">${formatDate(item.abandoned_at)}</span>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h4>Follow-up Status</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">Status</span>
                        <span class="detail-value">
                            <select id="modal-followup-status" class="filter-select" value="${item.followup_status}">
                                <option value="pending" ${item.followup_status === 'pending' ? 'selected' : ''}>Pending</option>
                                <option value="email_sent" ${item.followup_status === 'email_sent' ? 'selected' : ''}>Email Sent</option>
                                <option value="contacted" ${item.followup_status === 'contacted' ? 'selected' : ''}>Contacted</option>
                                <option value="converted" ${item.followup_status === 'converted' ? 'selected' : ''}>Converted</option>
                                <option value="declined" ${item.followup_status === 'declined' ? 'selected' : ''}>Declined</option>
                                <option value="unresponsive" ${item.followup_status === 'unresponsive' ? 'selected' : ''}>Unresponsive</option>
                            </select>
                        </span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Follow-up Attempts</span>
                        <span class="detail-value">${item.followup_attempts || 0}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Last Follow-up</span>
                        <span class="detail-value">${item.last_followup_at ? formatDate(item.last_followup_at) : '--'}</span>
                    </div>
                </div>

                <div class="detail-item full-width">
                    <span class="detail-label">Notes</span>
                    <textarea id="modal-admin-notes" class="setting-input setting-textarea" rows="3" placeholder="Add notes...">${escapeHtml(item.admin_notes || '')}</textarea>
                </div>

                <div class="modal-actions">
                    <button class="btn btn-secondary" onclick="updateAbandonmentStatus('${item.id}')">Update Status</button>
                </div>
            </div>

            ${item.recovery_token ? `
            <div class="detail-section">
                <h4>Recovery Link</h4>
                <div class="detail-grid">
                    <div class="detail-item">
                        <span class="detail-label">Link</span>
                        <span class="detail-value"><code>${CONFIG.FRONTEND_URL || window.location.origin}/recover/${item.recovery_token}</code></span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Expires</span>
                        <span class="detail-value">${item.recovery_link_expires_at ? formatDate(item.recovery_link_expires_at) : '--'}</span>
                    </div>
                    <div class="detail-item">
                        <span class="detail-label">Used</span>
                        <span class="detail-value">${item.recovery_link_used ? 'Yes' : 'No'}</span>
                    </div>
                </div>
            </div>
            ` : ''}
        </div>
    `;
}

function openAbandonmentModal() {
    const modal = document.getElementById('abandonment-modal');
    if (modal) {
        modal.classList.remove('hidden');
    }
}

function closeAbandonmentModal() {
    const modal = document.getElementById('abandonment-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    selectedAbandonment = null;
}

// Update Abandonment Status
async function updateAbandonmentStatus(id) {
    const statusEl = document.getElementById('modal-followup-status');
    const notesEl = document.getElementById('modal-admin-notes');

    if (!statusEl) return;

    const status = statusEl.value;
    const notes = notesEl ? notesEl.value : '';

    showLoading();

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/abandonments/${id}/status`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey
            },
            body: JSON.stringify({ status, notes })
        });

        if (!response.ok) throw new Error('Failed to update status');

        showAlertModal('Success', 'Status updated successfully', true);
        closeAbandonmentModal();
        await loadAbandonments();
        await loadAbandonmentStats();

    } catch (error) {
        console.error('Error updating abandonment status:', error);
        showAlertModal('Error', 'Failed to update status. Please try again.', false);
    } finally {
        hideLoading();
    }
}

// Send Recovery Email
async function sendRecoveryEmail(id) {
    showConfirmModal(
        'Send Recovery Email',
        'Send recovery email to this user?',
        async () => {
            showLoading();

            try {
                const response = await fetch(`${CONFIG.API_BASE_URL}/admin/abandonments/${id}/send-email`, {
                    method: 'POST',
                    headers: { 'X-API-Key': apiKey }
                });

                if (!response.ok) throw new Error('Failed to send email');

                showAlertModal('Success', 'Recovery email sent successfully!', true);
                await loadAbandonments();
                await loadAbandonmentStats();

            } catch (error) {
                console.error('Error sending recovery email:', error);
                showAlertModal('Error', 'Failed to send recovery email. Please try again.', false);
            } finally {
                hideLoading();
            }
        }
    );
}

function sendRecoveryEmailFromModal() {
    if (selectedAbandonment) {
        sendRecoveryEmail(selectedAbandonment.id);
    }
}

// Delete Abandonment
async function deleteAbandonment(id, name) {
    showConfirmModal(
        'Delete Abandonment',
        `Are you sure you want to delete the abandonment record for ${name}? This action cannot be undone.`,
        async () => {
            showLoading();

            try {
                const response = await fetch(`${CONFIG.API_BASE_URL}/admin/abandonments/${id}`, {
                    method: 'DELETE',
                    headers: { 'X-API-Key': apiKey }
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error?.message || 'Failed to delete');
                }

                showAlertModal('Success', 'Abandonment record deleted successfully.', true);
                await loadAbandonments();
                await loadAbandonmentStats();

            } catch (error) {
                console.error('Error deleting abandonment:', error);
                showAlertModal('Error', error.message || 'Failed to delete abandonment. Please try again.', false);
            } finally {
                hideLoading();
            }
        }
    );
}

async function deleteAllAbandonments() {
    showConfirmModal(
        'Delete All Abandonments',
        'Are you sure you want to delete ALL abandonment records? This action cannot be undone.',
        async () => {
            try {
                showLoading();
                const response = await fetch(`${CONFIG.API_BASE_URL}/admin/abandonments/all`, {
                    method: 'DELETE',
                    headers: { 'X-API-Key': apiKey }
                });

                const result = await response.json();

                if (!response.ok) {
                    throw new Error(result.error?.message || 'Failed to delete all abandonments');
                }

                showAlertModal('Success', result.message || 'All abandonment records deleted successfully', true);
                await loadAbandonments();
                await loadAbandonmentStats();
            } catch (error) {
                console.error('Error deleting all abandonments:', error);
                showAlertModal('Error', error.message, false);
            } finally {
                hideLoading();
            }
        }
    );
}

// Export Abandonments
async function exportAbandonments() {
    showLoading();

    try {
        const filters = getAbandonmentFilters();
        const queryParams = new URLSearchParams(filters);

        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/abandonments/export?${queryParams}&_t=${Date.now()}`, {
            headers: { 'X-API-Key': apiKey },
            cache: 'no-store'
        });

        if (!response.ok) throw new Error('Failed to export');

        const blob = await response.blob();
        downloadBlob(blob, `abandonments_${new Date().toISOString().split('T')[0]}.csv`);

    } catch (error) {
        console.error('Error exporting abandonments:', error);
        showAlertModal('Export Failed', 'Failed to export abandonments. Please try again.', false);
    } finally {
        hideLoading();
    }
}

// Load Pending Registrations (held seats awaiting payment)
async function loadPendingRegistrations() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/admin/abandonments/pending?_t=${Date.now()}`, {
            headers: { 'X-API-Key': apiKey },
            cache: 'no-store'
        });

        if (!response.ok) throw new Error('Failed to load pending registrations');

        const data = await response.json();
        pendingRegistrations = data.data?.registrations || [];

        renderPendingRegistrations();

    } catch (error) {
        console.error('Error loading pending registrations:', error);
        const tbody = document.getElementById('pending-registrations-tbody');
        if (tbody) {
            tbody.innerHTML = `
                <tr class="loading-row">
                    <td colspan="8">Error loading pending registrations. Please try again.</td>
                </tr>
            `;
        }
    }
}

function renderPendingRegistrations() {
    const tbody = document.getElementById('pending-registrations-tbody');
    if (!tbody) return;

    if (pendingRegistrations.length === 0) {
        tbody.innerHTML = `
            <tr class="loading-row">
                <td colspan="8">No pending registrations (held seats) found.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = pendingRegistrations.map(item => {
        const statusClass = item.is_expired ? 'expired' : (item.time_remaining_minutes <= 15 ? 'expiring-soon' : 'active');
        const statusText = item.is_expired ? 'EXPIRED' : `${item.time_remaining_minutes}m left`;

        return `
        <tr class="${item.is_expired ? 'expired-row' : ''}">
            <td><strong>${escapeHtml(item.name || '--')}</strong></td>
            <td>
                <div>${escapeHtml(item.email || '--')}</div>
                <div class="text-muted">${escapeHtml(item.phone || '--')}</div>
            </td>
            <td>${escapeHtml(item.business_name || '--')}</td>
            <td><span class="tier-badge ${item.tier}">${getTierDisplayName(item.tier)}</span></td>
            <td>${formatCurrency(item.amount || 0)}</td>
            <td><span class="time-badge ${statusClass}">${statusText}</span></td>
            <td>${formatDate(item.created_at)}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn-send-reminder" onclick="sendPaymentReminder('${item.id}', '${escapeHtml(item.email)}', '${escapeHtml(item.name)}', '${item.tier}')" title="Send Reminder Email">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path>
                            <polyline points="22,6 12,13 2,6"></polyline>
                        </svg>
                        Remind
                    </button>
                    ${item.is_expired ? `
                        <button class="btn-action btn-release" onclick="releaseExpiredRegistration('${item.id}')" title="Release Seat">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path>
                            </svg>
                        </button>
                    ` : ''}
                </div>
            </td>
        </tr>
    `}).join('');
}

// Send Payment Reminder for Pending Registrations
async function sendPaymentReminder(registrationId, email, name, tier) {
    showConfirmModal(
        'Send Payment Reminder',
        `Send a payment reminder email to ${name} (${email})?`,
        async () => {
            showLoading();

            try {
                const response = await fetch(`${CONFIG.API_BASE_URL}/admin/registrations/${registrationId}/remind`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-Key': apiKey
                    },
                    body: JSON.stringify({ email, name, tier })
                });

                if (!response.ok) {
                    const data = await response.json();
                    throw new Error(data.error?.message || 'Failed to send reminder');
                }

                showAlertModal('Reminder Sent', `Payment reminder sent to ${email}`, true);

            } catch (error) {
                console.error('Error sending payment reminder:', error);
                showAlertModal('Error', error.message || 'Failed to send payment reminder. Please try again.', false);
            } finally {
                hideLoading();
            }
        }
    );
}

// Cleanup Expired Registrations
async function cleanupExpiredRegistrations() {
    showConfirmModal(
        'Cleanup Expired Registrations',
        'This will release all expired held seats and record them as abandonments. Continue?',
        async () => {
            showLoading();

            try {
                const response = await fetch(`${CONFIG.API_BASE_URL}/admin/abandonments/cleanup`, {
                    method: 'POST',
                    headers: { 'X-API-Key': apiKey }
                });

                if (!response.ok) throw new Error('Failed to cleanup');

                const data = await response.json();
                showAlertModal('Cleanup Complete', `Released ${data.data?.released || 0} expired registration(s).`, true);

                // Refresh all data
                await loadDashboardData();

            } catch (error) {
                console.error('Error cleaning up expired registrations:', error);
                showAlertModal('Error', 'Failed to cleanup expired registrations. Please try again.', false);
            } finally {
                hideLoading();
            }
        }
    );
}

// Release single expired registration
async function releaseExpiredRegistration(registrationId) {
    showConfirmModal(
        'Release Registration',
        'Release this expired registration and free the held seat?',
        async () => {
            showLoading();

            try {
                const response = await fetch(`${CONFIG.API_BASE_URL}/admin/abandonments/cleanup`, {
                    method: 'POST',
                    headers: { 'X-API-Key': apiKey }
                });

                if (!response.ok) throw new Error('Failed to release');

                showAlertModal('Success', 'Registration released successfully.', true);
                await loadDashboardData();

            } catch (error) {
                console.error('Error releasing registration:', error);
                showAlertModal('Error', 'Failed to release registration. Please try again.', false);
            } finally {
                hideLoading();
            }
        }
    );
}

// Update loadDashboardData to include abandonments and guests
const originalLoadDashboardDataWithSettings = loadDashboardData;
loadDashboardData = async function() {
    await originalLoadDashboardDataWithSettings();
    await Promise.all([
        loadAbandonments(),
        loadAbandonmentStats(),
        loadPendingRegistrations(),
        loadGuests(),
        loadBenefits()
    ]);
};

// ============================================
// Guest Management
// ============================================

let guestsData = [];
let editingGuestId = null;

async function loadGuests() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/guests/admin?_t=${Date.now()}`, {
            headers: { 'X-API-Key': apiKey },
            cache: 'no-store'
        });
        if (!response.ok) throw new Error('Failed to load guests');
        const result = await response.json();
        guestsData = result.data?.guests || [];
        renderGuestsList();
    } catch (error) {
        console.error('Error loading guests:', error);
        const container = document.getElementById('guests-list-container');
        if (container) {
            container.innerHTML = '<p class="history-empty">Failed to load guests.</p>';
        }
    }
}

function renderGuestsList() {
    const container = document.getElementById('guests-list-container');
    if (!container) return;

    if (guestsData.length === 0) {
        container.innerHTML = '<p class="history-empty">No guests added yet. Click "Add Guest" to get started.</p>';
        return;
    }

    container.innerHTML = guestsData.map(guest => `
        <div class="guest-admin-card ${!guest.is_active ? 'guest-inactive' : ''}" data-guest-id="${guest.id}">
            <div class="guest-admin-photo">
                ${guest.photo_url
                    ? `<img src="${guest.photo_url}" alt="${escapeHtml(guest.name)}">`
                    : `<svg viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" stroke-width="1.5" width="30" height="30">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
                        <circle cx="12" cy="7" r="4"/>
                    </svg>`
                }
            </div>
            <div class="guest-admin-info">
                <strong>${escapeHtml(guest.name)}</strong>
                <span class="text-muted">${escapeHtml(guest.title)}</span>
                <span class="text-muted" style="font-size: 0.6875rem;">${guest.session_points?.length || 0} session points${!guest.photo_url ? ' | No photo uploaded' : ''}</span>
            </div>
            <div class="guest-admin-meta">
                <span class="sort-order-badge" title="Sort Order">#${guest.sort_order}</span>
                <span class="status-badge ${guest.is_active ? 'confirmed' : 'failed'}">${guest.is_active ? 'Active' : 'Hidden'}</span>
            </div>
            <div class="guest-admin-actions">
                <button class="btn-icon" onclick="editGuest('${guest.id}')" title="Edit">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="btn-icon btn-icon-danger" onclick="confirmDeleteGuest('${guest.id}', '${escapeHtml(guest.name)}')" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

function showAddGuestForm() {
    editingGuestId = null;
    document.getElementById('guest-modal-title').textContent = 'Add Guest';
    document.getElementById('guest-edit-id').value = '';
    document.getElementById('guest-form').reset();
    document.getElementById('guest-is-active').checked = true;
    document.getElementById('guest-sort-order').value = guestsData.length;
    resetGuestPhotoPreview();
    initSessionPointInputs(4);
    document.getElementById('guest-modal').classList.remove('hidden');
}

function editGuest(id) {
    const guest = guestsData.find(g => g.id === id);
    if (!guest) return;

    editingGuestId = id;
    document.getElementById('guest-modal-title').textContent = 'Edit Guest';
    document.getElementById('guest-edit-id').value = id;
    document.getElementById('guest-name').value = guest.name;
    document.getElementById('guest-title').value = guest.title;
    document.getElementById('guest-bio').value = guest.bio;
    document.getElementById('guest-sort-order').value = guest.sort_order;
    document.getElementById('guest-is-active').checked = guest.is_active;

    // Set photo preview
    const preview = document.getElementById('guest-photo-preview');
    if (guest.photo_url) {
        preview.innerHTML = `<img src="${guest.photo_url}" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
        resetGuestPhotoPreview();
    }

    // Set session points
    initSessionPointInputs(Math.max(4, guest.session_points?.length || 4), guest.session_points);

    // Clear file input
    document.getElementById('guest-photo-input').value = '';

    document.getElementById('guest-modal').classList.remove('hidden');
}

function closeGuestModal() {
    document.getElementById('guest-modal').classList.add('hidden');
    editingGuestId = null;
}

function initSessionPointInputs(count, values = []) {
    const container = document.getElementById('guest-session-points-container');
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
        addSessionPointInput(values[i] || '');
    }
}

function addSessionPointInput(value = '') {
    const container = document.getElementById('guest-session-points-container');
    const index = container.children.length;
    const div = document.createElement('div');
    div.className = 'session-point-row';
    div.innerHTML = `
        <span class="session-point-number">${index + 1}.</span>
        <input type="text" class="guest-form-input session-point-input" value="${escapeHtml(value)}" placeholder="Session point ${index + 1}">
        <button type="button" class="btn-ai-enhance session-point-ai" onclick="showGuestAiActionsForPoint(this)" title="AI Enhance">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3z"/></svg>
        </button>
        <button type="button" class="btn-remove-point" onclick="removeSessionPoint(this)" title="Remove">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
        </button>
    `;
    container.appendChild(div);
}

function removeSessionPoint(btn) {
    const container = document.getElementById('guest-session-points-container');
    if (container.children.length <= 1) return;
    btn.closest('.session-point-row').remove();
    // Renumber
    Array.from(container.children).forEach((row, i) => {
        row.querySelector('.session-point-number').textContent = `${i + 1}.`;
    });
}

function previewGuestPhoto(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (file.size > 2 * 1024 * 1024) {
            showAlertModal('File Too Large', 'Photo must be under 2MB.', false);
            input.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = function(e) {
            document.getElementById('guest-photo-preview').innerHTML =
                `<img src="${e.target.result}" style="width:100%;height:100%;object-fit:cover;">`;
        };
        reader.readAsDataURL(file);
    }
}

function resetGuestPhotoPreview() {
    document.getElementById('guest-photo-preview').innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="var(--gray-400)" stroke-width="1.5" width="36" height="36">
            <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
        </svg>
    `;
}

async function saveGuest(event) {
    event.preventDefault();

    const sessionPointInputs = document.querySelectorAll('.session-point-input');
    const sessionPoints = Array.from(sessionPointInputs)
        .map(input => input.value.trim())
        .filter(val => val.length > 0);

    if (sessionPoints.length < 1) {
        showAlertModal('Validation Error', 'Please add at least one session point.', false);
        return;
    }

    const guestData = {
        name: document.getElementById('guest-name').value.trim(),
        title: document.getElementById('guest-title').value.trim(),
        bio: document.getElementById('guest-bio').value.trim(),
        session_points: sessionPoints,
        sort_order: parseInt(document.getElementById('guest-sort-order').value) || 0,
        is_active: document.getElementById('guest-is-active').checked,
    };

    if (!guestData.name || !guestData.title || !guestData.bio) {
        showAlertModal('Validation Error', 'Name, title, and bio are required.', false);
        return;
    }

    showLoading();
    const guestId = document.getElementById('guest-edit-id').value;

    try {
        let savedGuest;

        if (guestId) {
            const response = await fetch(`${CONFIG.API_BASE_URL}/guests/admin/${guestId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
                body: JSON.stringify(guestData)
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error?.message || 'Failed to update guest');
            }
            savedGuest = (await response.json()).data?.guest || { id: guestId };
        } else {
            const response = await fetch(`${CONFIG.API_BASE_URL}/guests/admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
                body: JSON.stringify(guestData)
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error?.message || 'Failed to create guest');
            }
            savedGuest = (await response.json()).data?.guest;
        }

        // Upload photo if a new file was selected
        const photoInput = document.getElementById('guest-photo-input');
        let photoError = null;
        let photoUploaded = false;
        if (photoInput.files && photoInput.files[0]) {
            const targetId = savedGuest?.id || guestId;
            console.log('[Guest] Photo file selected, uploading to guest:', targetId, 'file:', photoInput.files[0].name, 'size:', photoInput.files[0].size);
            if (targetId) {
                try {
                    const photoResult = await uploadGuestPhotoFile(targetId, photoInput.files[0]);
                    console.log('[Guest] Photo upload response:', photoResult);
                    photoUploaded = true;
                } catch (photoErr) {
                    console.error('[Guest] Photo upload failed:', photoErr);
                    photoError = photoErr.message || 'Photo upload failed';
                }
            } else {
                photoError = 'Could not determine guest ID for photo upload';
            }
        } else {
            console.log('[Guest] No photo file selected, skipping photo upload');
        }

        if (photoError) {
            showAlertModal('Partial Success', `Guest saved, but photo upload failed: ${photoError}`, false);
        } else if (photoUploaded) {
            showAlertModal('Success', guestId ? 'Guest updated with photo.' : 'Guest created with photo.', true);
        } else {
            showAlertModal('Success', guestId ? 'Guest updated successfully.' : 'Guest created successfully.', true);
        }
        closeGuestModal();
        await loadGuests();

    } catch (error) {
        console.error('Error saving guest:', error);
        showAlertModal('Error', error.message || 'Failed to save guest.', false);
    } finally {
        hideLoading();
    }
}

async function uploadGuestPhotoFile(guestId, file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async function(e) {
            try {
                const response = await fetch(`${CONFIG.API_BASE_URL}/guests/admin/${guestId}/photo`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
                    body: JSON.stringify({
                        photo: e.target.result,
                        filename: file.name
                    })
                });
                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error?.message || `Upload failed (${response.status})`);
                }
                resolve(await response.json());
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(file);
    });
}

function confirmDeleteGuest(id, name) {
    showConfirmModal('Delete Guest', `Are you sure you want to delete "${name}"? This cannot be undone.`, async () => {
        showLoading();
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/guests/admin/${id}`, {
                method: 'DELETE',
                headers: { 'X-API-Key': apiKey }
            });
            if (!response.ok) throw new Error('Failed to delete guest');
            showAlertModal('Success', 'Guest deleted successfully.', true);
            await loadGuests();
        } catch (error) {
            showAlertModal('Error', error.message || 'Failed to delete guest.', false);
        } finally {
            hideLoading();
        }
    });
}

// ============================================
// MSME Benefits Management
// ============================================

let benefitsData = [];
let editingBenefitId = null;
let csvParsedItems = [];

async function loadBenefits() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/msme-benefits/admin?_t=${Date.now()}`, {
            headers: { 'X-API-Key': apiKey },
            cache: 'no-store'
        });
        if (!response.ok) throw new Error('Failed to load benefits');
        const result = await response.json();
        benefitsData = result.data?.benefits || [];
        renderBenefitsList();
    } catch (error) {
        console.error('Error loading benefits:', error);
        const container = document.getElementById('benefits-list-container');
        if (container) {
            container.innerHTML = '<p class="history-empty">Failed to load benefits.</p>';
        }
    }
}

function renderBenefitsList() {
    const container = document.getElementById('benefits-list-container');
    if (!container) return;

    if (benefitsData.length === 0) {
        container.innerHTML = '<p class="history-empty">No benefits added yet. Use the buttons above to add items.</p>';
        return;
    }

    container.innerHTML = benefitsData.map(benefit => `
        <div class="guest-admin-card ${!benefit.is_active ? 'guest-inactive' : ''}" data-benefit-id="${benefit.id}">
            <div class="guest-admin-photo" style="font-size: 1.5rem; display: flex; align-items: center; justify-content: center;">
                ${benefit.icon ? escapeHtml(benefit.icon) : '&#x1F4CC;'}
            </div>
            <div class="guest-admin-info">
                <strong>${escapeHtml(benefit.title)}</strong>
                <span class="text-muted">${escapeHtml((benefit.description || '').substring(0, 80))}${(benefit.description || '').length > 80 ? '...' : ''}</span>
            </div>
            <div class="guest-admin-meta">
                <span class="sort-order-badge" title="Sort Order">#${benefit.sort_order}</span>
                <span class="status-badge ${benefit.is_active ? 'confirmed' : 'failed'}">${benefit.is_active ? 'Active' : 'Hidden'}</span>
            </div>
            <div class="guest-admin-actions">
                <button class="btn-icon" onclick="editBenefit('${benefit.id}')" title="Edit">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                        <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                </button>
                <button class="btn-icon btn-icon-danger" onclick="confirmDeleteBenefit('${benefit.id}', '${escapeHtml(benefit.title)}')" title="Delete">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                </button>
            </div>
        </div>
    `).join('');
}

// ---- Manual CRUD ----

function showAddBenefitForm() {
    editingBenefitId = null;
    document.getElementById('benefit-modal-title').textContent = 'Add Benefit';
    document.getElementById('benefit-edit-id').value = '';
    document.getElementById('benefit-form').reset();
    document.getElementById('benefit-is-active').checked = true;
    document.getElementById('benefit-sort-order').value = benefitsData.length;
    document.getElementById('benefit-modal').classList.remove('hidden');
}

function editBenefit(id) {
    const benefit = benefitsData.find(b => b.id === id);
    if (!benefit) return;
    editingBenefitId = id;
    document.getElementById('benefit-modal-title').textContent = 'Edit Benefit';
    document.getElementById('benefit-edit-id').value = id;
    document.getElementById('benefit-icon').value = benefit.icon || '';
    document.getElementById('benefit-title').value = benefit.title;
    document.getElementById('benefit-description').value = benefit.description || '';
    document.getElementById('benefit-sort-order').value = benefit.sort_order;
    document.getElementById('benefit-is-active').checked = benefit.is_active;
    document.getElementById('benefit-modal').classList.remove('hidden');
}

function closeBenefitModal() {
    document.getElementById('benefit-modal').classList.add('hidden');
    editingBenefitId = null;
}

async function saveBenefit(event) {
    event.preventDefault();
    const benefitData = {
        title: document.getElementById('benefit-title').value.trim(),
        description: document.getElementById('benefit-description').value.trim(),
        icon: document.getElementById('benefit-icon').value.trim() || null,
        sort_order: parseInt(document.getElementById('benefit-sort-order').value) || 0,
        is_active: document.getElementById('benefit-is-active').checked,
    };
    if (!benefitData.title) {
        showAlertModal('Validation Error', 'Title is required.', false);
        return;
    }
    showLoading();
    const benefitId = document.getElementById('benefit-edit-id').value;
    try {
        if (benefitId) {
            const response = await fetch(`${CONFIG.API_BASE_URL}/msme-benefits/admin/${benefitId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
                body: JSON.stringify(benefitData)
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error?.message || 'Failed to update benefit');
            }
        } else {
            const response = await fetch(`${CONFIG.API_BASE_URL}/msme-benefits/admin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
                body: JSON.stringify(benefitData)
            });
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.error?.message || 'Failed to create benefit');
            }
        }
        showAlertModal('Success', benefitId ? 'Benefit updated.' : 'Benefit created.', true);
        closeBenefitModal();
        await loadBenefits();
    } catch (error) {
        showAlertModal('Error', error.message || 'Failed to save benefit.', false);
    } finally {
        hideLoading();
    }
}

function confirmDeleteBenefit(id, title) {
    showConfirmModal('Delete Benefit', `Delete "${title}"? This cannot be undone.`, async () => {
        showLoading();
        try {
            const response = await fetch(`${CONFIG.API_BASE_URL}/msme-benefits/admin/${id}`, {
                method: 'DELETE',
                headers: { 'X-API-Key': apiKey }
            });
            if (!response.ok) throw new Error('Failed to delete benefit');
            showAlertModal('Success', 'Benefit deleted.', true);
            await loadBenefits();
        } catch (error) {
            showAlertModal('Error', error.message || 'Failed to delete benefit.', false);
        } finally {
            hideLoading();
        }
    });
}

// ---- CSV/Excel Upload ----

function showCsvUploadModal() {
    csvParsedItems = [];
    document.getElementById('csv-file-input').value = '';
    document.getElementById('csv-preview-container').classList.add('hidden');
    document.getElementById('csv-import-btn').classList.add('hidden');
    document.getElementById('csv-upload-modal').classList.remove('hidden');
}

function closeCsvUploadModal() {
    document.getElementById('csv-upload-modal').classList.add('hidden');
    csvParsedItems = [];
}

function previewCsvFile(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    const reader = new FileReader();

    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

            if (rows.length === 0) {
                showAlertModal('Empty File', 'The file contains no data rows.', false);
                return;
            }

            csvParsedItems = rows.map((row, i) => {
                const keys = Object.keys(row);
                const findCol = (names) => {
                    for (const name of names) {
                        const key = keys.find(k => k.toLowerCase().trim() === name);
                        if (key) return String(row[key]).trim();
                    }
                    return '';
                };
                return {
                    title: findCol(['title', 'benefit', 'name', 'heading']),
                    description: findCol(['description', 'desc', 'detail', 'details', 'text']),
                    icon: findCol(['icon', 'emoji']),
                    sort_order: i,
                    is_active: true,
                };
            }).filter(item => item.title.length > 0);

            if (csvParsedItems.length === 0) {
                showAlertModal('No Valid Rows', 'No rows with a title column found. Ensure your file has a "title" column header.', false);
                return;
            }

            const container = document.getElementById('csv-preview-container');
            container.innerHTML = `
                <table class="registrations-table" style="font-size: 0.8125rem;">
                    <thead><tr><th>Icon</th><th>Title</th><th>Description</th></tr></thead>
                    <tbody>
                        ${csvParsedItems.map(item => `
                            <tr>
                                <td>${escapeHtml(item.icon)}</td>
                                <td>${escapeHtml(item.title)}</td>
                                <td>${escapeHtml((item.description || '').substring(0, 80))}${(item.description || '').length > 80 ? '...' : ''}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                <p style="margin-top: 0.5rem; font-size: 0.8125rem; color: var(--gray-500);">${csvParsedItems.length} item(s) found</p>
            `;
            container.classList.remove('hidden');
            document.getElementById('csv-import-btn').classList.remove('hidden');
        } catch (err) {
            console.error('CSV parse error:', err);
            showAlertModal('Parse Error', 'Failed to parse file. Ensure it is a valid CSV or Excel file.', false);
        }
    };
    reader.readAsArrayBuffer(file);
}

async function importCsvBenefits() {
    if (csvParsedItems.length === 0) return;
    showLoading();
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/msme-benefits/admin/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
            body: JSON.stringify({ items: csvParsedItems })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || 'Import failed');
        }
        const result = await response.json();
        showAlertModal('Success', `${result.data?.count || csvParsedItems.length} benefit(s) imported.`, true);
        closeCsvUploadModal();
        await loadBenefits();
    } catch (error) {
        showAlertModal('Error', error.message || 'Import failed.', false);
    } finally {
        hideLoading();
    }
}

// ---- AI Generation ----

let _aiSuggestions = [];

function showAiGenerateModal() {
    document.getElementById('ai-theme').value = '';
    document.getElementById('ai-count').value = '6';
    document.getElementById('ai-suggestions-container').classList.add('hidden');
    document.getElementById('ai-save-btn').classList.add('hidden');
    document.getElementById('ai-generate-btn').disabled = false;
    document.getElementById('ai-generate-btn').textContent = 'Generate Suggestions';
    document.getElementById('ai-generate-modal').classList.remove('hidden');
}

function closeAiGenerateModal() {
    document.getElementById('ai-generate-modal').classList.add('hidden');
    _aiSuggestions = [];
}

async function generateAiBenefits() {
    const theme = document.getElementById('ai-theme').value.trim();
    const count = parseInt(document.getElementById('ai-count').value) || 6;
    if (!theme) {
        showAlertModal('Required', 'Please enter a theme or topic.', false);
        return;
    }

    const btn = document.getElementById('ai-generate-btn');
    btn.disabled = true;
    btn.textContent = 'Generating...';

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/msme-benefits/admin/ai-generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
            body: JSON.stringify({ theme, count })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || 'AI generation failed');
        }
        const result = await response.json();
        const suggestions = result.data?.suggestions || [];

        if (suggestions.length === 0) {
            showAlertModal('No Suggestions', 'AI returned no suggestions. Try a different theme.', false);
            return;
        }

        _aiSuggestions = suggestions;

        const listEl = document.getElementById('ai-suggestions-list');
        listEl.innerHTML = suggestions.map((s, i) => `
            <div style="display: flex; align-items: flex-start; gap: 0.75rem; padding: 0.75rem; border: 1px solid var(--gray-200); border-radius: 8px; margin-bottom: 0.5rem;">
                <input type="checkbox" id="ai-item-${i}" checked style="margin-top: 0.25rem;">
                <div style="flex: 1;">
                    <strong style="font-size: 0.875rem;">${s.icon ? escapeHtml(s.icon) + ' ' : ''}${escapeHtml(s.title)}</strong>
                    <p style="font-size: 0.8125rem; color: var(--gray-600); margin-top: 0.25rem;">${escapeHtml(s.description || '')}</p>
                </div>
            </div>
        `).join('');

        document.getElementById('ai-suggestions-container').classList.remove('hidden');
        document.getElementById('ai-save-btn').classList.remove('hidden');
    } catch (error) {
        showAlertModal('Error', error.message || 'AI generation failed.', false);
    } finally {
        btn.disabled = false;
        btn.textContent = 'Generate Suggestions';
    }
}

async function saveAiSuggestions() {
    const selectedItems = _aiSuggestions.filter((_, i) => {
        const checkbox = document.getElementById(`ai-item-${i}`);
        return checkbox && checkbox.checked;
    });

    if (selectedItems.length === 0) {
        showAlertModal('None Selected', 'Please select at least one suggestion to save.', false);
        return;
    }

    showLoading();
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/msme-benefits/admin/bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
            body: JSON.stringify({ items: selectedItems })
        });
        if (!response.ok) throw new Error('Failed to save suggestions');
        const result = await response.json();
        showAlertModal('Success', `${result.data?.count || selectedItems.length} benefit(s) saved from AI suggestions.`, true);
        closeAiGenerateModal();
        await loadBenefits();
    } catch (error) {
        showAlertModal('Error', error.message || 'Failed to save suggestions.', false);
    } finally {
        hideLoading();
    }
}

// ============================================
// AI Promo Suggestions
// ============================================

async function generatePromoAiSuggestions() {
    const occasion = document.getElementById('promo-ai-occasion')?.value?.trim();
    if (!occasion) {
        showAlertModal('Required', 'Please enter an occasion or theme (e.g., Valentine\'s Day).', false);
        return;
    }

    const btn = document.getElementById('promo-ai-suggest-btn');
    const container = document.getElementById('promo-ai-suggestions');
    btn.disabled = true;
    btn.textContent = 'Generating...';
    container.style.display = 'none';

    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/settings/admin/promo/ai-suggest`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
            body: JSON.stringify({ occasion })
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || 'AI generation failed');
        }

        const result = await response.json();
        const suggestions = result.data?.suggestions || [];

        if (suggestions.length === 0) {
            showAlertModal('No Suggestions', 'AI returned no suggestions. Try a different theme.', false);
            return;
        }

        container.innerHTML = suggestions.map((s, i) => `
            <div style="padding: 0.75rem; border: 1px solid #d1d5db; border-radius: 8px; margin-bottom: 0.5rem; background: white; cursor: pointer; transition: border-color 0.2s;"
                 onclick="applyPromoSuggestion(${i})"
                 onmouseenter="this.style.borderColor='#10b981'"
                 onmouseleave="this.style.borderColor='#d1d5db'"
                 title="Click to apply this suggestion">
                <div style="font-size: 0.8125rem; font-weight: 600; color: #111827; margin-bottom: 0.25rem;">${escapeHtml(s.valueProp)}</div>
                <div style="font-size: 0.75rem; color: #6b7280;">
                    <span style="background: #25D366; color: white; padding: 0.125rem 0.375rem; border-radius: 4px; font-size: 0.6875rem; font-weight: 600;">${escapeHtml(s.whatsappKeyword)}</span>
                    <span style="margin-left: 0.5rem;">${escapeHtml(s.urgencyText)}</span>
                </div>
            </div>
        `).join('');

        // Store suggestions for applying
        window._promoAiSuggestions = suggestions;
        container.style.display = 'block';
    } catch (error) {
        showAlertModal('Error', error.message || 'AI generation failed.', false);
    } finally {
        btn.disabled = false;
        btn.textContent = 'AI Suggest';
    }
}

function applyPromoSuggestion(index) {
    const suggestions = window._promoAiSuggestions;
    if (!suggestions || !suggestions[index]) return;

    const s = suggestions[index];
    const valuePropEl = document.getElementById('setting-promo-value-prop');
    const keywordEl = document.getElementById('setting-promo-whatsapp-keyword');
    const urgencyEl = document.getElementById('setting-promo-urgency-text');

    if (valuePropEl) valuePropEl.value = s.valueProp;
    if (keywordEl) keywordEl.value = s.whatsappKeyword;
    if (urgencyEl) urgencyEl.value = s.urgencyText;

    // Mark settings as modified
    settingsModified = true;

    // Visual feedback
    document.getElementById('promo-ai-suggestions').style.display = 'none';
    showAlertModal('Applied', 'Suggestion applied to the fields below. Remember to Save All Changes.', true);
}

// ============================================
// Guest AI Text Enhancement
// ============================================
let _aiTargetField = null;
let _aiFieldType = null;
let _aiButton = null;

function showGuestAiActions(inputId, fieldType, btnEl) {
    const inputEl = document.getElementById(inputId);
    if (!inputEl || !inputEl.value.trim()) {
        showAlertModal('Empty Field', 'Please enter some text first before using AI enhancement.', false);
        return;
    }
    _aiTargetField = inputEl;
    _aiFieldType = fieldType;
    _aiButton = btnEl;
    _positionAiDropdown(btnEl);
}

function showGuestAiActionsForPoint(btnEl) {
    const inputEl = btnEl.previousElementSibling;
    if (!inputEl || !inputEl.value.trim()) {
        showAlertModal('Empty Field', 'Please enter some text first before using AI enhancement.', false);
        return;
    }
    _aiTargetField = inputEl;
    _aiFieldType = 'session_point';
    _aiButton = btnEl;
    _positionAiDropdown(btnEl);
}

function _positionAiDropdown(btnEl) {
    const dropdown = document.getElementById('guest-ai-dropdown');
    const rect = btnEl.getBoundingClientRect();
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.left = `${Math.min(rect.left, window.innerWidth - 150)}px`;
    dropdown.classList.remove('hidden');

    setTimeout(() => {
        document.addEventListener('click', _closeAiDropdownHandler, { once: true });
    }, 0);
}

function _closeAiDropdownHandler(e) {
    const dropdown = document.getElementById('guest-ai-dropdown');
    if (dropdown && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
    }
}

async function enhanceGuestField(action, lineTarget) {
    const dropdown = document.getElementById('guest-ai-dropdown');
    dropdown.classList.add('hidden');

    if (!_aiTargetField || !_aiFieldType) return;

    const originalValue = _aiTargetField.value.trim();
    if (!originalValue) return;

    const targetField = _aiTargetField;
    const btn = _aiButton;

    // Gather context from all guest fields
    const context = {
        name: document.getElementById('guest-name')?.value?.trim() || '',
        title: document.getElementById('guest-title')?.value?.trim() || '',
        bio: document.getElementById('guest-bio')?.value?.trim() || '',
        sessionPoints: Array.from(document.querySelectorAll('.session-point-input'))
            .map(inp => inp.value.trim())
            .filter(v => v.length > 0)
    };

    // Loading state
    if (btn) {
        btn.classList.add('loading');
        btn.disabled = true;
    }

    try {
        const body = {
            fieldType: _aiFieldType,
            fieldValue: originalValue,
            action: action,
            context: context,
        };
        if (lineTarget) body.lineTarget = lineTarget;

        const response = await fetch(`${CONFIG.API_BASE_URL}/guests/admin/ai-enhance`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': apiKey,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error?.message || 'AI enhancement failed');
        }

        const result = await response.json();
        const enhanced = result.data?.enhanced;

        if (!enhanced) {
            throw new Error('No enhanced text returned');
        }

        // Build label for the action taken
        const actionLabel = lineTarget
            ? `${action === 'shorten' ? 'Shortened' : 'Expanded'} (~${lineTarget} lines)`
            : `${action === 'shorten' ? 'Shortened' : 'Expanded'} (AI)`;

        // Show confirm modal with before/after preview
        showConfirmModal('AI Enhancement Preview', '', () => {
            targetField.value = enhanced;
        });
        // Override textContent with HTML for rich preview
        const msgEl = document.getElementById('confirm-modal-message');
        if (msgEl) {
            msgEl.innerHTML = `<div style="text-align:left;">
                <div style="font-size:0.7rem;font-weight:600;color:var(--gray-500);text-transform:uppercase;margin-bottom:0.25rem;">Original:</div>
                <div style="padding:0.625rem;background:var(--gray-50);border-radius:6px;font-size:0.8125rem;color:var(--gray-600);margin-bottom:0.75rem;white-space:pre-wrap;">${escapeHtml(originalValue)}</div>
                <div style="font-size:0.7rem;font-weight:600;color:#059669;text-transform:uppercase;margin-bottom:0.25rem;">${actionLabel}:</div>
                <div style="padding:0.625rem;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:6px;font-size:0.8125rem;color:var(--gray-800);white-space:pre-wrap;">${escapeHtml(enhanced)}</div>
            </div>`;
        }
    } catch (error) {
        showAlertModal('AI Error', error.message || 'Failed to enhance text. Please try again.', false);
    } finally {
        if (btn) {
            btn.classList.remove('loading');
            btn.disabled = false;
        }
        _aiTargetField = null;
        _aiFieldType = null;
        _aiButton = null;
    }
}

// ============================================
// Flyer Generation Management
// ============================================

let flyerSectionData = {};
let flyerActiveTemplate = 'summit-classic';
let flyerActiveSection = 'event';
let flyerEditingActive = false;
let flyerFetchedSpeakers = [];
let flyerSelectedSpeaker = null;

// Scrape settings data directly from other tabs in the DOM
function getEventDataFromTabs() {
    const data = {
        eventName: document.getElementById('setting-event-name')?.value?.trim() || '',
        eventDate: document.getElementById('setting-event-date')?.value?.trim() || '',
        eventTime: document.getElementById('setting-event-time')?.value?.trim() || '',
        eventPlatform: document.getElementById('setting-event-platform')?.value?.trim() || '',
        eventVenue: document.getElementById('setting-event-venue')?.value?.trim() || '',
        
        vipOriginal: document.getElementById('setting-vip-original')?.value?.trim() || '',
        vipOffer: document.getElementById('setting-vip-offer')?.value?.trim() || '',
        standardOriginal: document.getElementById('setting-standard-original')?.value?.trim() || '',
        standardOffer: document.getElementById('setting-standard-offer')?.value?.trim() || '',
        basicOriginal: document.getElementById('setting-basic-original')?.value?.trim() || '',
        basicOffer: document.getElementById('setting-basic-offer')?.value?.trim() || '',
        
        category: document.getElementById('flyer-event-category')?.value || 'Corporate',
        logoSrc: document.getElementById('flyer-logo-display')?.getAttribute('src') || '',
        
        offerLabel: document.getElementById('setting-offer-label')?.value?.trim() || '',
        offerDescription: document.getElementById('setting-offer-description')?.value?.trim() || '',
        offerActive: document.getElementById('setting-offer-active')?.checked || false,

        guests: []
    };

    // Scrape guests from DOM if available, otherwise fallback to guestsData cache
    const guestCards = document.querySelectorAll('#guests-list-container .guest-admin-card');
    if (guestCards.length > 0) {
        guestCards.forEach(card => {
            const guestId = card.getAttribute('data-guest-id');
            const nameEl = card.querySelector('.guest-admin-info strong');
            const titleEl = card.querySelector('.guest-admin-info span.text-muted');
            const imgEl = card.querySelector('.guest-admin-photo img');
            
            const cachedGuest = guestsData.find(g => g.id === guestId);
            const sessionPoints = cachedGuest ? cachedGuest.session_points : [];
            const bio = cachedGuest ? cachedGuest.bio : '';

            data.guests.push({
                id: guestId,
                name: nameEl ? nameEl.textContent.trim() : '',
                title: titleEl ? titleEl.textContent.trim() : '',
                photo_url: imgEl ? imgEl.getAttribute('src') : '',
                session_points: sessionPoints,
                bio: bio
            });
        });
    } else if (typeof guestsData !== 'undefined' && guestsData && guestsData.length > 0) {
        data.guests = guestsData.map(g => ({
            id: g.id,
            name: g.name,
            title: g.title,
            photo_url: g.photo_url,
            session_points: g.session_points,
            bio: g.bio
        }));
    }

    return data;
}

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
    initFlyersUI();
});

function initFlyersUI() {
    // Override window.switchSettingsTab to load the unified flyer generator when the tab is switched
    const originalSwitchSettingsTab = window.switchSettingsTab || (typeof switchSettingsTab !== 'undefined' ? switchSettingsTab : null);
    
    window.switchSettingsTab = function(tabId) {
        if (typeof originalSwitchSettingsTab === 'function') {
            originalSwitchSettingsTab(tabId);
        } else {
            // Default tab switching logic if not already configured
            document.querySelectorAll('.settings-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.tab === tabId);
            });
            document.querySelectorAll('.settings-panel').forEach(panel => {
                panel.classList.toggle('active', panel.id === `panel-${tabId}`);
            });
        }
        
        if (tabId === 'flyer') {
            if (window.renderFlyerGenerator) {
                window.renderFlyerGenerator('flyer-generator-container', {
                    isAdmin: true,
                    apiKey: apiKey,
                    apiBaseUrl: CONFIG.API_BASE_URL
                });
            } else {
                console.error('window.renderFlyerGenerator not found.');
            }
        }
    };
    
    // Bind global function call
    if (typeof switchSettingsTab !== 'undefined') {
        try {
            switchSettingsTab = window.switchSettingsTab;
        } catch(e) {
            console.warn('Could not assign switchSettingsTab directly, relying on global window scope.');
        }
    }
}
