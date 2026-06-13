/**
 * src/schemas/index.ts
 * Asella Organic — Zod Validation Schemas
 *
 * Every schema used by validate() middleware lives here.
 * Routes import from this file — never define schemas inline in routes.
 */

import { z } from "zod";

// ─── Auth ─────────────────────────────────────────────────────────────────

export const LoginSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "Username/Email must be at least 3 characters"),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(128),
});

export const ResetRequestSchema = z.object({
  username: z.string().trim().min(3).max(50),
});

export const ResetConfirmSchema = z.object({
  token:        z.string().min(10),
  new_password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain uppercase, lowercase, and a number"
    ),
});

export const CreateStaffSchema = z.object({
  username:  z.string().trim().min(3).max(50),
  password:  z
    .string()
    .min(8)
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
      "Password must contain uppercase, lowercase, and a number"
    ),
  full_name: z.string().trim().min(2).max(100),
  role: z.enum([
    "admin",
    "manager",
    "employee",
    "affiliate",
    "delivery",
    "vendor",
  ]),
  email: z.string().email().optional(),
  phone: z
    .string()
    .regex(/^\+?[0-9\s\-]{7,20}$/, "Invalid phone number")
    .optional(),
});

// ─── Orders ───────────────────────────────────────────────────────────────

const OrderItemSchema = z.object({
  name:         z.string().trim().min(1, "Item name is required"),
  package_size: z.string().trim().min(1, "Package size is required"),
  quantity:     z.coerce.number().int().positive("Quantity must be a positive integer"),
  unit_price:   z.coerce.number().min(0, "Unit price must be non-negative"),
});

export const CreateOrderSchema = z.object({
  customer_name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  phone: z
    .string()
    .regex(/^\+?[0-9\s\-]{7,20}$/, "Invalid phone number"),
  city:          z.string().trim().min(1, "City is required").max(100),
  location:      z.string().trim().min(2, "Location is required").max(255),
  source:        z.enum([
    "telegram",
    "website",
    "instagram",
    "facebook",
    "phone",
    "walk-in",
    "other",
  ]),
  order_type:    z.enum(["delivery", "pickup"]),
  gender:        z.enum(["male", "female", "other"]).optional(),
  age_group:     z
    .enum(["under-18", "18-24", "25-34", "35-44", "45-54", "55+"])
    .optional(),
  notes:         z.string().trim().max(500).optional(),
  delivery_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "delivery_date must be YYYY-MM-DD")
    .optional(),
  referral_code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^ASL-[A-Z0-9]{3,8}$/, "Invalid referral code format")
    .optional(),
  items: z
    .array(OrderItemSchema)
    .min(1, "At least one item is required")
    .max(20, "Too many items in one order"),
});

export const UpdateStatusSchema = z.object({
  status: z.enum([
    "Pending",
    "Confirmed",
    "Packed",
    "In Transit",
    "Processing",
    "Out for Delivery",
    "Delivered",
    "Cancelled",
    "Issue",
    "Returned",
  ]),
  note: z.string().trim().max(500).optional(),
});

export const UpdateItemsSchema = z.object({
  items: z
    .array(OrderItemSchema)
    .min(1, "At least one item is required")
    .max(20),
});

// ─── Products ─────────────────────────────────────────────────────────────

export const CreateProductSchema = z.object({
  name:         z.string().trim().min(2).max(100),
  package_size: z.string().trim().min(1).max(50),
  price:        z.number().positive(),
  description:  z.string().trim().max(1000).optional(),
  image_url:    z.string().url().optional(),
  featured:     z.boolean().default(false),
  tag:          z.string().trim().max(50).optional(),
  inventory_quantity: z
    .number()
    .int()
    .nonnegative("Inventory cannot be negative")
    .default(0),
  low_stock_threshold: z
    .number()
    .int()
    .nonnegative()
    .default(10),
});

export const UpdateProductSchema = z
  .object({
    name:                z.string().trim().min(2).max(100).optional(),
    package_size:        z.string().trim().min(1).max(50).optional(),
    price:               z.number().positive().optional(),
    description:         z.string().trim().max(1000).optional(),
    image_url:           z.string().url().optional(),
    featured:            z.boolean().optional(),
    tag:                 z.string().trim().max(50).optional(),
    inventory_quantity:  z.number().int().nonnegative().optional(),
    low_stock_threshold: z.number().int().nonnegative().optional(),
  })
  .refine(obj => Object.values(obj).some(v => v !== undefined), {
    message: "At least one field is required",
  });

export const AdjustStockSchema = z.object({
  change_amount: z
    .number()
    .int()
    .refine(n => n !== 0, "change_amount cannot be zero"),
  reason: z.string().trim().min(3, "Reason must be at least 3 characters").max(255),
});

// ─── Stock requests ───────────────────────────────────────────────────────

export const CreateStockRequestSchema = z.object({
  item:            z.string().trim().min(1),
  package_size:    z.string().trim().optional(),
  stock_available: z.number().int().nonnegative().default(0),
  qty_needed:      z.number().int().positive(),
  delivery_date:   z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "delivery_date must be YYYY-MM-DD")
    .optional(),
  requested_by: z.string().trim().optional(),
});

export const UpdateStockRequestStatusSchema = z.object({
  status: z.enum(["pending", "ordered", "received", "cancelled"]),
  notes:  z.string().trim().max(500).optional(),
});

// ─── Payments ─────────────────────────────────────────────────────────────

export const CreatePaymentSchema = z.object({
  order_id:       z.string().min(1),
  amount:         z.number().positive(),
  payment_method: z.enum(["cash", "bank_transfer", "mobile_money", "cod"]),
  transaction_id: z.string().trim().optional(),
  notes:          z.string().trim().max(500).optional(),
});

export const UpdatePaymentStatusSchema = z.object({
  status:         z.enum(["pending", "completed", "failed", "refunded"]),
  transaction_id: z.string().trim().optional(),
  notes:          z.string().trim().max(500).optional(),
});

// ─── Vendor orders ────────────────────────────────────────────────────────

export const CreateVendorOrderSchema = z.object({
  vendor_name:    z.string().trim().min(2).max(150),
  vendor_chat_id: z.string().trim().optional(),
  item:           z.string().trim().min(1).max(200),
  amount:         z.string().trim().min(1),    // e.g. "50kg"
  price:          z.number().positive(),
  delivery_date:  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

// ─── Telegram ────────────────────────────────────────────────────────────

export const SendTelegramSchema = z.object({
  chat_id: z.string().min(1, "chat_id is required"),
  message: z.string().min(1, "message is required").max(4096),
});

// ─── Appointments ────────────────────────────────────────────────────────

export const CreateAppointmentSchema = z.object({
  full_name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
  phone_number: z.string().regex(/^\+?[0-9\s\-]{7,20}$/, "Invalid phone number"),
  preferred_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
});


// ─── Type exports (inferred from schemas) ────────────────────────────────

export type LoginInput           = z.infer<typeof LoginSchema>;
export type CreateOrderInput     = z.infer<typeof CreateOrderSchema>;
export type UpdateStatusInput    = z.infer<typeof UpdateStatusSchema>;
export type CreateProductInput   = z.infer<typeof CreateProductSchema>;
export type AdjustStockInput     = z.infer<typeof AdjustStockSchema>;
export type CreatePaymentInput   = z.infer<typeof CreatePaymentSchema>;
export type SendTelegramInput    = z.infer<typeof SendTelegramSchema>;
export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>;
