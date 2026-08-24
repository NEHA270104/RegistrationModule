/**
 * API Client for Registration System
 * AI for MSME Summit
 */

class ApiClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl;
  }

  /**
   * Make HTTP request
   */
  async request(endpoint, options = {}) {
    const rawUrl = endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `${this.baseUrl.replace(/\/$/, '')}${endpoint.startsWith('/') ? endpoint : '/' + endpoint}`;

    const defaultOptions = {
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const config = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers,
      },
    };

    try {
      const response = await fetch(rawUrl, config);
      const contentType = response.headers.get('content-type') || '';
      let data;

      if (contentType.includes('application/json')) {
        try {
          data = await response.json();
        } catch {
          throw new ApiError(
            'The server returned an unparseable JSON response. Please check cloud backend status.',
            'INVALID_JSON',
            response.status
          );
        }
      } else {
        const text = await response.text().catch(() => '');
        if (text.startsWith('<!DOCTYPE') || text.includes('<html')) {
          throw new ApiError(
            `Backend API route (${endpoint}) returned static HTML instead of JSON. Ensure the backend server is running on Render and CORS is active.`,
            'HTML_ROUTING_ERROR',
            response.status
          );
        }
        try {
          data = JSON.parse(text);
        } catch {
          const previewText = text.length > 80 ? text.slice(0, 80) + '...' : text;
          throw new ApiError(
            previewText || `Server responded with status ${response.status}`,
            'NON_JSON_RESPONSE',
            response.status
          );
        }
      }

      if (!response.ok) {
        const apiError = new ApiError(
          data?.error?.message || data?.message || (typeof data?.error === 'string' ? data.error : null) || 'Request failed',
          data?.error?.code || data?.code || 'REQUEST_ERROR',
          response.status
        );
        throw apiError;
      }

      return data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        error.message || CONFIG.MESSAGES.NETWORK_ERROR,
        'NETWORK_ERROR',
        0
      );
    }
  }

  /**
   * GET request
   */
  async get(endpoint) {
    return this.request(endpoint, { method: 'GET' });
  }

  /**
   * POST request
   */
  async post(endpoint, data) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
}

/**
 * Custom API Error
 */
class ApiError extends Error {
  constructor(message, code, statusCode) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

/**
 * Registration API
 */
class RegistrationApi {
  constructor() {
    this.client = new ApiClient(CONFIG.API_BASE_URL);
    this.tenantSlug = CONFIG.TENANT_SLUG;
  }

  /**
   * Get the correct endpoint path based on tenant context.
   * When on /t/:slug, maps legacy endpoints to tenant-scoped public endpoints.
   */
  _ep(path) {
    if (this.tenantSlug) {
      const tb = `/t/${this.tenantSlug}/public`;
      if (path === '/seats') return `${tb}/seats`;
      if (path === '/settings') return `${tb}/config`;
      if (path === '/guests') return `${tb}/guests`;
      if (path === '/msme-benefits') return `${tb}/benefits`;
    }
    return path;
  }

  /**
   * Get seat availability
   */
  async getSeats() {
    try {
      const response = await this.client.get(this._ep('/seats'));
      return response;
    } catch (error) {
      console.error('Error fetching seats:', error);
      throw error;
    }
  }

  /**
   * Create payment order
   */
  async createOrder(formData) {
    try {
      const response = await this.client.post('/create-order', formData);
      return response;
    } catch (error) {
      console.error('Error creating order:', error);
      throw error;
    }
  }

  /**
   * Verify payment
   */
  async verifyPayment(paymentData) {
    try {
      const response = await this.client.post('/verify-payment', paymentData);
      return response;
    } catch (error) {
      console.error('Error verifying payment:', error);
      throw error;
    }
  }

  /**
   * Get registration by booking ID
   */
  async getRegistration(bookingId) {
    try {
      const response = await this.client.get(`/registration/${bookingId}`);
      return response;
    } catch (error) {
      console.error('Error fetching registration:', error);
      throw error;
    }
  }

  /**
   * Check if email is registered
   */
  async checkEmail(email) {
    try {
      const response = await this.client.post('/registration/check', { email });
      return response;
    } catch (error) {
      console.error('Error checking email:', error);
      throw error;
    }
  }

  /**
   * Check if email or phone is already registered
   */
  async checkDuplicates(email, phone) {
    try {
      const response = await this.client.post('/registration/check', { email, phone });
      return response;
    } catch (error) {
      console.error('Error checking duplicates:', error);
      throw error;
    }
  }

  /**
   * Join waitlist
   */
  async joinWaitlist(data) {
    try {
      const response = await this.client.post('/waitlist', data);
      return response;
    } catch (error) {
      console.error('Error joining waitlist:', error);
      throw error;
    }
  }

  /**
   * Track payment abandonment
   */
  async trackAbandonment(orderId, reason) {
    try {
      const response = await this.client.post('/track-abandonment', {
        razorpay_order_id: orderId,
        reason: reason,
      });
      return response;
    } catch (error) {
      // Don't throw - this is a best-effort tracking call
      console.error('Error tracking abandonment:', error);
      return { success: false };
    }
  }



  /**
   * Check for pending registration by email
   * Returns pending registration data if user has an incomplete payment
   */
  async checkPendingRegistration(email) {
    try {
      const response = await this.client.post('/registration/pending', { email });
      return response;
    } catch (error) {
      console.error('Error checking pending registration:', error);
      return { success: false, data: { has_pending: false } };
    }
  }
}

// Create global API instance
const api = new RegistrationApi();
