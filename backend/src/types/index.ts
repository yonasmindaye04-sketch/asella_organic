/**
 * src/types/index.ts
 * Asella Organic — Shared Backend Types
 */

// ─── User / Auth ──────────────────────────────────────────────────────────

export type UserRole = "admin" | "manager" | "employee" | "affiliate" | "delivery" | "vendor";

export interface StaffUser {
  id: string;
  username: string;
  full_name: string;
  role: UserRole;
  email?: string;
  phone?: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TokenPayload {
  id: string;
  username: string;
  role: UserRole;
  jti: string;
}

// ─── Orders ───────────────────────────────────────────────────────────────

export type OrderStatus =
  | "Pending"
  | "Confirmed"
  | "Processing"
  | "In Transit"
  | "Delivered"
  | "Cancelled";

export type PaymentStatus = "Pending" | "Paid" | "Failed" | "Refunded";

export interface OrderItem {
  id?: string;
  order_id?: string;
  item_name: string;
  package_size: string;
  quantity: number;
  unit_price: number;
}

export interface Order {
  id: string;
  source: string;
  customer_name: string;
  phone: string;
  location: string;
  city: string;
  gender?: string;
  age_group?: string;
  order_type: string;
  franchise_type?: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  total: number;
  notes?: string;
  customer_id?: string;
  assigned_to?: string;
  delivery_date?: string;
  created_at: string;
  updated_at: string;
  items?: OrderItem[];
}

// ─── Products ─────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  package_size: string;
  price: number;
  description: string;
  image_url?: string;
  featured: boolean;
  tag: string;
  inventory_quantity: number;
  low_stock_threshold: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

// ─── Customers ────────────────────────────────────────────────────────────

export interface Customer {
  id: string;
  phone: string;
  name: string;
  email?: string;
  city: string;
  location: string;
  gender?: string;
  age_group?: string;
  referral_code?: string;
  total_orders: number;
  total_spent: number;
  created_at: string;
}

// ─── Payments ─────────────────────────────────────────────────────────────

export interface Payment {
  id: string;
  order_id: string;
  transaction_id: string;
  amount: number;
  currency: string;
  status: "Success" | "Failed" | "Pending";
  paid_at?: string;
  metadata?: Record<string, unknown>;
}

// ─── Referrals ────────────────────────────────────────────────────────────

export type ReferralStatus = "pending" | "converted" | "expired";

export interface Referral {
  id: string;
  referrer_customer_id: string;
  referee_phone: string;
  referee_customer_id?: string;
  status: ReferralStatus;
  reward_issued: boolean;
  expires_at: string;
  created_at: string;
}

// ─── API Responses ────────────────────────────────────────────────────────

export interface ApiSuccess<T> {
  success: true;
  data: T;
  total?: number;
  page?: number;
  limit?: number;
}

export interface ApiError {
  success: false;
  error: string;
  details?: Record<string, string[]>;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

// ─── Audit Log ────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  order_id?: string;
  actor: string;
  old_status: string;
  new_status: string;
  note: string;
  created_at: string;
}