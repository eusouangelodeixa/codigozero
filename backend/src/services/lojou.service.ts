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

interface PlanPatchPayload {
  price?: number;
  name?: string;
  description?: string;
  product_pid?: string;
  plan_id?: string;
  billing_interval?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  billing_interval_count?: number;
  trial_days?: number;
  is_active?: boolean;
}

type DiscountType = 'fixed' | 'amount' | 'percent' | 'percentage' | 'percentual' | '%';
type DiscountStatus = 'active' | 'inactive' | 'enabled' | 'disabled' | 'published' | 'unpublished';

interface DiscountPayload {
  code?: string;
  type?: DiscountType;
  value?: number;
  product_ids?: (number | string)[];
  uses_limit?: number | null;
  single_use?: boolean;
  expires_at?: string | null;
  never_expires?: boolean;
  status?: DiscountStatus;
  // convenience boolean — translated to `status` before send (the Lojou API
  // doesn't accept `active`, only `status: active|inactive`).
  active?: boolean;
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

    // DELETE often returns 204 / empty body
    if (response.status === 204) return null;
    const text = await response.text();
    return text ? JSON.parse(text) : null;
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

  // ── Orders ──────────────────────────────────────────────────────────────

  async getOrder(orderId: string): Promise<any> {
    return this.request('GET', `/orders/${orderId}`);
  }

  async listOrders(status?: 'approved' | 'pending' | 'cancelled' | 'refunded'): Promise<any> {
    const query = status ? `?status=${status}` : '';
    return this.request('GET', `/orders${query}`);
  }

  async createOrder(payload: LojouOrderPayload): Promise<any> {
    return this.request('POST', '/orders', payload);
  }

  // ── Plans ───────────────────────────────────────────────────────────────

  async getPlan(planId: string): Promise<any> {
    return this.request('GET', `/plans/${planId}`);
  }

  /** PATCH /v1/plans/{id} — used by admin to sync price changes upstream. */
  async updatePlan(planId: string, data: PlanPatchPayload): Promise<any> {
    return this.request('PATCH', `/plans/${planId}`, data);
  }

  // ── Discounts (coupons) ────────────────────────────────────────────────

  /** Normalize convenience fields (active boolean) into the API's shape (status). */
  private normalizeDiscount(payload: DiscountPayload): Record<string, any> {
    const { active, ...rest } = payload;
    const out: Record<string, any> = { ...rest };
    if (active !== undefined && out.status === undefined) {
      out.status = active ? 'active' : 'inactive';
    }
    return out;
  }

  async listDiscounts(): Promise<any> {
    return this.request('GET', '/discounts');
  }

  async getDiscount(id: string | number): Promise<any> {
    return this.request('GET', `/discounts/${id}`);
  }

  async createDiscount(payload: DiscountPayload): Promise<any> {
    return this.request('POST', '/discounts', this.normalizeDiscount(payload));
  }

  async updateDiscount(id: string | number, payload: DiscountPayload): Promise<any> {
    return this.request('PATCH', `/discounts/${id}`, this.normalizeDiscount(payload));
  }

  async deleteDiscount(id: string | number): Promise<any> {
    return this.request('DELETE', `/discounts/${id}`);
  }

  /** Extract the discount id from any of the response shapes Lojou has used. */
  static extractDiscountId(resp: any): string | null {
    return (
      resp?.discount?.id?.toString() ||
      resp?.data?.id?.toString() ||
      resp?.id?.toString() ||
      null
    );
  }

  // ── Webhooks / misc ────────────────────────────────────────────────────

  async createWebhook(url: string, events: string[]): Promise<any> {
    return this.request('POST', '/webhooks', { url, events });
  }

  async listWebhooks(): Promise<any> {
    return this.request('GET', '/webhooks');
  }

  async getUserStats(): Promise<any> {
    return this.request('GET', '/user/stats');
  }
}

export const lojouService = new LojouService();
