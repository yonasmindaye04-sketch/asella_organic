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

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

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
  get:    <T>(path: string)                           => request<T>("GET",    path),
  post:   <T>(path: string, body: unknown)            => request<T>("POST",   path, body),
  put:    <T>(path: string, body: unknown)            => request<T>("PUT",    path, body),
  patch:  <T>(path: string, body: unknown)            => request<T>("PATCH",  path, body),
  delete: <T>(path: string, headers?: Record<string, string>) => request<T>("DELETE", path, undefined, true, headers),
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
  city:           string | null;
  status:         string;
  payment_status: string;
  total:          number;
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
  delete:        (id: string)                         => api.delete(`/api/orders/${id}`),
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
