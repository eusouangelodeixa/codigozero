import { env } from '../config/env';

interface LojouOrderPayload {
  amount: number;
  product_pid: string;
  plan_id?: string;
  coupon_code?: string;
  return_url?: string;
  cancel_url?: string;
  customer: {
    name: string;
    email: string;
    mobile_number: string;
  };
  metadata?: Record<string, any>;
}

/**
 * Lojou API Service
 * Handles all communication with the Lojou payment gateway.
 */
export class LojouService {
  private baseUrl: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = env.LOJOU_API_URL;
    this.apiKey = env.LOJOU_API_KEY;
  }

  private async request(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.baseUrl}/v1${path}`;
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Lojou API error (${response.status}): ${error}`);
    }

    return response.json();
  }

  /** Health check */
  async ping(): Promise<boolean> {
    try {
      await this.request('GET', '/ping');
      return true;
    } catch {
      return false;
    }
  }

  /** Get order by ID */
  async getOrder(orderId: string): Promise<any> {
    return this.request('GET', `/orders/${orderId}`);
  }

  /** List orders with optional status filter */
  async listOrders(status?: 'approved' | 'pending' | 'cancelled' | 'refunded'): Promise<any> {
    const query = status ? `?status=${status}` : '';
    return this.request('GET', `/orders${query}`);
  }

  /** Create a new order (checkout) */
  async createOrder(payload: LojouOrderPayload): Promise<any> {
    return this.request('POST', '/orders', payload);
  }

  /** Create webhook subscription */
  async createWebhook(url: string, events: string[]): Promise<any> {
    return this.request('POST', '/webhooks', { url, events });
  }

  /** List registered webhooks */
  async listWebhooks(): Promise<any> {
    return this.request('GET', '/webhooks');
  }

  /** Get user/store stats */
  async getUserStats(): Promise<any> {
    return this.request('GET', '/user/stats');
  }
}

export const lojouService = new LojouService();
