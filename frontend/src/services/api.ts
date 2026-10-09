/**
 * frontend/src/services/api.ts
 * Asella Organic — Central API Client (HttpOnly Cookie Edition)
 *
 * MIGRATION FROM PREVIOUS VERSION:
 *   Previously: manually attached Authorization: Bearer <token> header,
 *               read from localStorage.getItem("token").
 *   Now:        tokens live in HttpOnly cookies managed by the browser.
 *               All we need is `credentials: "include"` on every request.
 *               There is no token in JavaScript memory at all.
 *
 * This module exports:
 *   api.get / api.post / api.patch / api.delete
 *   auth.login / auth.logout / auth.me / auth.refresh
 *
 * The apiClient automatically:
 *   1. Attaches credentials (cookies) to every request.
 *   2. On a 401 response, attempts one silent token refresh via /auth/refresh.
 *   3. If refresh fails (session truly expired), redirects to /login.
 */

/**
 * API base URL.
 *
 * Defaults to an empty string, i.e. same-origin relative requests. That is
 * required for the Telegram Mini App: it is served from a public tunnel
 * (trycloudflare.com / ngrok), so an absolute "http://localhost:3001" would
 * resolve to the *user's* device and fail with "Failed to fetch".
 *
 * In development the Vite dev server proxies /api to the backend, and in
 * production .env.production sets VITE_API_URL to the public API host.
 */
const BASE_URL = import.meta.env.VITE_API_URL ?? "";

// ─── Core fetch wrapper ───────────────────────────────────────────────────────

interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  details?: Record<string, string[]>;
  meta?: {
    total: number;
    page: number;
    limit: number;
    pages: number;
  };
}

let isRefreshing = false;
let refreshPromise: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  try {
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  retry = true,
  extraHeaders?: Record<string, string>,
): Promise<ApiResponse<T>> {
  const isFormData = body instanceof FormData;
  const options: RequestInit = {
    method,
    credentials: "include", // Send HttpOnly cookies automatically
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...extraHeaders,
    },
  };

  if (body !== undefined) {
    options.body = isFormData ? (body as FormData) : JSON.stringify(body);
  }

  const res = await fetch(`${BASE_URL}${path}`, options);

  // Silent token refresh on 401 (skip for login/refresh endpoints to avoid redirect loops)
  const isAuthEndpoint = path.includes("/api/auth/login") || path.includes("/api/auth/refresh");
  
  if (res.status === 401 && retry && !isAuthEndpoint) {
    // Deduplicate concurrent refresh attempts
    if (!isRefreshing) {
      isRefreshing = true;
      refreshPromise = doRefresh().finally(() => {
        isRefreshing = false;
        refreshPromise = null;
      });
    }

    const refreshed = await refreshPromise!;

    if (refreshed) {
      // Retry the original request once with the new access token cookie
      return request<T>(method, path, body, false);
    } else {
      // Refresh failed — session is truly gone, redirect to login
      window.location.href = "/login";
      return { success: false, error: "Session expired." };
    }
  }

  // Parse JSON (backend always returns JSON)
  try {
    const json = await res.json() as ApiResponse<T>;
    return json;
  } catch {
    return { success: false, error: `HTTP ${res.status}` };
  }
}

// ─── Typed API surface ────────────────────────────────────────────────────────

export const api = {
  get:    <T>(path: string)                                    => request<T>("GET",    path),
  post:   <T>(path: string, body: unknown, headers?: Record<string, string>) => request<T>("POST",   path, body, true, headers),
  put:    <T>(path: string, body: unknown, headers?: Record<string, string>) => request<T>("PUT",    path, body, true, headers),
  patch:  <T>(path: string, body: unknown, headers?: Record<string, string>) => request<T>("PATCH",  path, body, true, headers),
  delete: <T>(path: string, headers?: Record<string, string>)   => request<T>("DELETE", path, undefined, true, headers),
};

// ─── Auth helpers ─────────────────────────────────────────────────────────────

export interface StaffProfile {
  id:                string;
  username:          string;
  full_name:         string;
  role:              string;
  email:             string | null;
  active:            boolean;
  two_factor_enabled: boolean;
  orders_placed_count?:    number;
  orders_delivered_count?: number;
}

export const auth = {
  /**
   * Log in. On success the backend sets HttpOnly cookies.
   * Returns the staff profile (no token ever touches JS).
   */
  login: (username: string, password: string) =>
    api.post<{ token: string; refreshToken: string; user: StaffProfile }>("/api/auth/login", { username, password }),

  /**
   * Log out. The backend clears both cookies and revokes the refresh token.
   */
  logout: () => api.post<void>("/api/auth/logout", {}),

  /**
   * Fetch the current authenticated user.
   * Call this on app load to rehydrate auth state from the cookie.
   * Returns 401 if not logged in.
   */
  me: () => api.get<StaffProfile>("/api/auth/me"),
};

// ─── Affiliate helpers (admin surface) ────────────────────────────────────────

export type AffiliateRuleType = 'global' | 'custom';
export type CommissionStatus = 'pending' | 'paid' | 'reversed';

export interface AffiliateRule {
  id?: string;
  affiliate_id?: string;
  commission_type: 'percentage' | 'fixed';
  commission_value: number;
  min_order_amount: number;
  max_commission: number | null;
  is_active?: boolean;
}

export interface AffiliateRuleState {
  rule_type: AffiliateRuleType;
  effective: boolean;
  rule: AffiliateRule | null;
  global_rule: AffiliateRule | null;
}

/** One-time credentials returned when an affiliate portal login is provisioned. */
export interface PortalCredentials {
  username: string;
  temporary_password: string;
}

export interface AdminCommission {
  id: string;
  order_id: string | null;
  commission_amount: number;
  commission_type: string;
  commission_value: number;
  order_total: number;
  status: CommissionStatus;
  rule_source: 'global' | 'individual';
  clawback_settled: number;
  reversal_reason: string | null;
  reversed_at: string | null;
  calculated_at: string;
  paid_at: string | null;
  affiliate_name: string;
  referral_code: string;
  customer_name?: string | null;
  customer_phone?: string | null;
}

export const referrals = {
  stats:     ()         => api.get('/api/referrals/stats'),
  config:    ()         => api.get<AffiliateRule | null>('/api/referrals/config'),
  saveConfig:(body: Omit<AffiliateRule, 'id' | 'affiliate_id'>) =>
                           api.post<AffiliateRule>('/api/referrals/config', body),

  /** Whether the signed-in admin has 2FA enabled — gates the guarded actions. */
  twoFactorStatus: ()    => api.get<{ two_factor_enabled: boolean }>('/api/auth/me'),

  list:      (params: { active?: boolean; rule_type?: AffiliateRuleType } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
    return api.get(`/api/referrals/affiliates?${qs}`);
  },

  // Item 1 — per-affiliate commission rules
  getRule:   (id: string) => api.get<AffiliateRuleState>(`/api/referrals/affiliates/${id}/rule`),
  saveRule:  (id: string, body: Omit<AffiliateRule, 'id' | 'affiliate_id'>) =>
                           api.put<AffiliateRule>(`/api/referrals/affiliates/${id}/rule`, body),
  clearRule: (id: string) => api.delete(`/api/referrals/affiliates/${id}/rule`),

  create:    (body: unknown) => api.post('/api/referrals/affiliates', body),
  update:    (id: string, body: unknown) => api.patch(`/api/referrals/affiliates/${id}`, body),
  /** Item 3 — permanent removal (soft delete; deactivation is separate). */
  remove:    (id: string, twoFaToken: string) =>
                           api.delete(`/api/referrals/affiliates/${id}`, { 'x-2fa-token': twoFaToken }),
  /** Item 2 — provision a portal login for an external affiliate. */
  grantPortalAccess: (id: string, twoFaToken: string) =>
                           api.post<PortalCredentials>(`/api/referrals/affiliates/${id}/portal-access`, {},
                                    { 'x-2fa-token': twoFaToken }),

  commissions: (params: { status?: CommissionStatus; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
    return api.get<AdminCommission[]>(`/api/referrals/commissions?${qs}`);
  },
  markPaid:  (id: string, twoFaToken: string) =>
                           api.patch(`/api/referrals/commissions/${id}/pay`, {},
                                    { 'x-2fa-token': twoFaToken }),
  reverse:   (id: string, reason: string, twoFaToken: string) =>
                           api.post(`/api/referrals/commissions/${id}/reverse`, { reason },
                                    { 'x-2fa-token': twoFaToken }),

  // Item 5 — reporting
  recipients:   () => api.get('/api/referrals/reports/recipients'),
  reportHistory:() => api.get('/api/referrals/reports/history'),
  sendReports:  (body: { affiliate_id?: string; from?: string; to?: string }, twoFaToken: string) =>
                           api.post('/api/referrals/reports/send', body, { 'x-2fa-token': twoFaToken }),
  previewUrl:   (affiliateId: string, from: string, to: string) =>
                           `${BASE_URL}/api/referrals/reports/preview?affiliate_id=${affiliateId}&from=${from}&to=${to}`,
};

// ─── Affiliate portal helpers (self-service) ─────────────────────────────────

export interface AffiliateMe {
  referral_code: string;
  display_name: string;
  is_active: boolean;
  rule_type: AffiliateRuleType;
  member_since: string | null;
  share_link: string;
  /** True until the affiliate replaces the admin-issued temporary password. */
  must_change_password: boolean;
  total_earnings: number;
  total_customers: number;
  clawback_pending: number;
}

export interface AffiliateSummary {
  affiliateName: string;
  referralCode: string;
  period: { start: string; end: string };
  commissionRule: string;
  orders: number;
  grossSales: number;
  commissionEarned: number;
  commissionPaid: number;
  commissionPending: number;
  commissionReversed: number;
  clawback: number;
  netEarned: number;
  linkClicks: number;
  uniqueVisitors: number;
  referredCustomers: number;
  convertedCustomers: number;
  conversionRate: number;
  lifetime: {
    totalEarned: number;
    totalPaid: number;
    totalPending: number;
    clawbackPending: number;
    customers: number;
    orders: number;
    grossSales: number;
  };
}

export interface PortalCommission {
  id: string;
  order_id: string | null;
  order_total: number;
  commission_amount: number;
  commission_type: string;
  status: CommissionStatus;
  rule_source: 'global' | 'individual';
  calculated_at: string;
  paid_at: string | null;
  reversed_at: string | null;
  reversal_reason: string | null;
}

export const affiliatePortal = {
  me:         () => api.get<AffiliateMe>('/api/affiliate/me'),
  summary:    (params: { from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
    return api.get<AffiliateSummary>(`/api/affiliate/me/summary?${qs}`);
  },
  commissions: (params: { status?: CommissionStatus; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
    return api.get<PortalCommission[]>(`/api/affiliate/me/commissions?${qs}`);
  },
  referrals:  (params: { from?: string; to?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
    return api.get(`/api/affiliate/me/referrals?${qs}`);
  },
  activity:   () => api.get('/api/affiliate/me/activity'),
  changePassword: (current_password: string, new_password: string) =>
                           api.post<{ message: string }>('/api/affiliate/me/change-password', { current_password, new_password }),
  trackClick: (code: string, path?: string, source?: string) =>
                           api.post('/api/affiliate/track-click', { code, path, source }),
};

// ─── Products helpers ─────────────────────────────────────────────────────────

export interface Product {
  id:                 string;
  name:               string;
  package_size:       string;
  price:              number;
  description:        string | null;
  image_url:          string | null;
  featured:           boolean;
  tag:                string | null;
  inventory_quantity: number;
  low_stock_threshold: number;
  active:             boolean;
}

export interface PaginatedMeta {
  total: number;
  page:  number;
  limit: number;
  pages: number;
}

export const products = {
  list: (params: { page?: number; limit?: number; search?: string; tag?: string; active?: boolean } = {}) => {
    const qs = new URLSearchParams();
    if (params.page   !== undefined) qs.set("page",   String(params.page));
    if (params.limit  !== undefined) qs.set("limit",  String(params.limit));
    if (params.search)               qs.set("search", params.search);
    if (params.tag)                  qs.set("tag",    params.tag);
    if (params.active !== undefined) qs.set("active", String(params.active));
    return api.get<Product[]>(`/api/products?${qs}`);
  },

  get:    (id: string)             => api.get<Product>(`/api/products/${id}`),
  create: (body: Partial<Product>) => api.post<Product>("/api/products", body),
  update: (id: string, body: Partial<Product>) => api.patch<Product>(`/api/products/${id}`, body),
  delete: (id: string)             => api.delete(`/api/products/${id}`),

  adjustInventory: (id: string, change_amount: number, reason: string, notes?: string) =>
    api.patch(`/api/products/${id}/inventory`, { change_amount, reason, notes }),

  lowStock: (page = 1, limit = 20) =>
    api.get(`/api/products/low-stock?page=${page}&limit=${limit}`),
};

// ─── Orders helpers ───────────────────────────────────────────────────────────

export interface Order {
  id:             string;
  source:         string;
  customer_name:  string;
  phone:          string;
  city:           string;
  status:         string;
  payment_status: string;
  total:          number;
  total_amount?:  number;
  location?:      string;
  items?:         Array<{
    id?: string;
    item_name: string;
    package_size: string;
    quantity: number;
    unit_price: number;
  }>;
  created_at:     string;
}

export const orders = {
  list: (params: {
    page?: number; limit?: number; status?: string;
    source?: string; search?: string; from?: string; to?: string; city?: string;
  } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
    return api.get<Order[]>(`/api/orders?${qs}`);
  },

  get:           (id: string)                         => api.get<Order>(`/api/orders/${id}`),
  create:        (body: unknown)                      => api.post<Order>("/api/orders", body),
  updateStatus:  (id: string, status: string, note?: string) =>
    api.patch(`/api/orders/${id}/status`, { status, note }),
  updatePayment: (id: string, body: unknown)          => api.patch(`/api/orders/${id}/payment`, body),
  updateItems:   (id: string, items: Array<{ name: string; package_size: string; quantity: number; unit_price: number }>) =>
    api.patch(`/api/orders/${id}/items`, { items }),
  delete:        (id: string, twoFaToken: string)     => api.delete(`/api/orders/${id}`, { "x-2fa-token": twoFaToken }),
};

// ─── Customers helpers (admin surface) ────────────────────────────────────────

export type CustomerSegment = 'VIP' | 'Loyal' | 'Promising' | 'At Risk' | 'Dormant';
export type CustomerActivityType =
  | 'sale' | 'status_change' | 'return' | 'cancellation'
  | 'payment' | 'note' | 'rating' | 'profile_update';

export interface CustomerListItem {
  customer_id: string;
  name: string;
  phone: string;
  email: string | null;
  city: string | null;
  location: string | null;
  gender: string | null;
  age_group: string | null;
  customer_since: string;
  order_count: number;
  delivered_count: number;
  cancelled_count: number;
  returned_count: number;
  open_count: number;
  lifetime_value: number;
  refunded_value: number;
  net_value: number;
  distinct_products: number;
  total_units: number;
  last_order_at: string | null;
  last_delivered_at: string | null;
  days_since_last_order: number | null;
  value_score: number;
  segment: CustomerSegment;
  recency_score: number;
  frequency_score: number;
  monetary_score: number;
  penalty_score: number;
  avg_stars: number;
  rating_count: number;
  is_telegram: number;
  affiliate_name: string | null;
}

export interface CustomerActivity {
  id: string;
  order_id: string | null;
  activity_type: CustomerActivityType;
  title: string;
  detail: string | null;
  amount: number | null;
  status_from: string | null;
  status_to: string | null;
  actor_name: string | null;
  created_at: string;
}

export interface CustomerRating {
  id: string;
  stars: number;
  comment: string | null;
  rated_by_name: string | null;
  created_at: string;
}

export interface CustomerDetail extends CustomerListItem {
  order_count: number;
  affiliate_code: string | null;
  orders: Array<{
    id: string;
    status: string;
    payment_status: string;
    total: number;
    source: string;
    order_type: string | null;
    city: string | null;
    item_count: number;
    unit_count: number;
    created_at: string;
    delivery_date: string | null;
  }>;
  products: Array<{
    item_name: string;
    package_size: string;
    units_bought: number;
    amount_spent: number;
  }>;
  ratings: CustomerRating[];
  activity: CustomerActivity[];
}

export interface CustomerSummary {
  total_customers: number;
  total_orders: number;
  delivered_orders: number;
  returned_orders: number;
  cancelled_orders: number;
  total_net_value: number;
  avg_score: number;
  churning: number;
  never_ordered: number;
  segments: Array<{
    segment: CustomerSegment;
    customers: number;
    net_value: number;
    avg_score: number;
  }>;
  top_customers: Array<{
    customer_id: string;
    name: string;
    phone: string;
    city: string | null;
    net_value: number;
    order_count: number;
    value_score: number;
    segment: CustomerSegment;
  }>;
}

export const customers = {
  list: (params: {
    page?: number; limit?: number; search?: string; city?: string;
    segment?: CustomerSegment; source?: string;
    min_score?: number; max_score?: number; returned_only?: boolean;
    sort?: string; dir?: 'asc' | 'desc';
  } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
    return api.get<CustomerListItem[]>(`/api/customers?${qs}`);
  },

  summary: () => api.get<CustomerSummary>('/api/customers/summary'),

  /** Cross-customer movement feed for the Activity tab. */
  activity: (params: { type?: CustomerActivityType; customer_id?: string; page?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
    return api.get<Array<CustomerActivity & { customer_name: string; customer_phone: string }>>(
      `/api/customers/activity?${qs}`);
  },

  get: (id: string) => api.get<CustomerDetail>(`/api/customers/${id}`),

  rate: (id: string, body: { stars: number; comment?: string }) =>
    api.post<{ id: string; stars: number }>(`/api/customers/${id}/rating`, body),

  addNote: (id: string, note: string) =>
    api.post<{ id: string }>(`/api/customers/${id}/note`, { note }),

  update: (id: string, body: {
    name?: string; email?: string | null; city?: string;
    location?: string; gender?: string | null; age_group?: string | null;
  }) => api.patch<{ id: string; updated: string[] }>(`/api/customers/${id}`, body),
};

// ─── Staff helpers ────────────────────────────────────────────────────────────

export const staff = {
  list:   (params: { page?: number; limit?: number; role?: string; search?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined) qs.set(k, String(v)); });
    return api.get<StaffProfile[]>(`/api/staff?${qs}`);
  },
  get:    (id: string)                       => api.get<StaffProfile>(`/api/staff/${id}`),
  create: (body: unknown)                    => api.post<StaffProfile>("/api/staff", body),
  update: (id: string, body: unknown)        => api.patch<StaffProfile>(`/api/staff/${id}`, body),
  delete: (id: string, twoFaToken: string) =>
    api.delete(`/api/staff/${id}`, { "x-2fa-token": twoFaToken }),

  setup2FA:   ()              => api.post("/api/staff/2fa/setup", {}),
  verify2FA:  (token: string) => api.post("/api/staff/2fa/verify", { token }),
  disable2FA: (token: string) => api.delete("/api/staff/2fa/disable", { "x-2fa-token": token }),
};
