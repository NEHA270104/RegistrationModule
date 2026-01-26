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
    const url = `${this.baseUrl}${endpoint}`;
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
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        throw new ApiError(
          data.error?.message || 'Request failed',
          data.error?.code || 'REQUEST_ERROR',
          response.status
        );
      }

      return data;
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError(
        CONFIG.MESSAGES.NETWORK_ERROR,
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
  }

  /**
   * Get seat availability
   */
  async getSeats() {
    try {
      const response = await this.client.get('/seats');
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
}

// Create global API instance
const api = new RegistrationApi();
