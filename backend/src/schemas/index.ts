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
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.])/i,
      "Password must contain uppercase, lowercase, a number, and a special character"
    ),
});

export const CreateStaffSchema = z.object({
  username:  z.string().trim().min(3).max(50),
  password:  z
    .string()
    .min(8)
    .max(128)
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&.])/i,
      "Password must contain uppercase, lowercase, a number, and a special character"
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
    .regex(/^ASL[-_\s]?[A-Z0-9]{3,8}$/, "Invalid referral code format")
    .optional(),
  items: z
    .array(OrderItemSchema)
    .min(1, "At least one item is required")
    .max(50, "Too many items in one order"),
});

// ─── Telegram Mini App Profile ─────────────────────────────────────────────

export const TelegramProfileSchema = z.object({
  display_name: z
    .string()
    .trim()
    .min(2, "Display name must be at least 2 characters")
    .max(100),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9\s\-]{7,20}$/, "Invalid phone number"),
  city: z.string().trim().min(1, "City is required").max(100),
  location: z.string().trim().max(255).optional().default(""),
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
    .max(50),
});

// ─── Products ─────────────────────────────────────────────────────────────

export const CreateProductSchema = z.object({
  name:         z.string()
                  .trim()
                  .min(2)
                  .max(100)
                  .transform((val) => val.replace(/\s+/g, ' ')), // collapse multiple spaces
  package_size: z.string().trim().min(1).max(50),
  price:        z.number().positive(),
  unit_cost:    z.number().nonnegative().default(0),
  description:  z.string().trim().max(1000).optional(),
  image_url:    z.string().trim().max(2048).optional().nullable(),
  featured:     z.coerce.boolean().default(false),
  active:       z.coerce.boolean().default(true),
  tag:          z.enum(["Traditional", "Herbs", "Oils", "Superfood", "Other"]).optional(),
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
    name:                z.string().trim().min(2).max(100).transform((val) => val.replace(/\s+/g, ' ')).optional(),
    package_size:        z.string().trim().min(1).max(50).optional(),
    price:               z.number().positive().optional(),
    unit_cost:           z.number().nonnegative().optional(),
    description:         z.string().trim().max(1000).optional(),
    image_url:           z.string().trim().max(2048).optional().nullable(),
    featured:            z.coerce.boolean().optional(),
    active:              z.coerce.boolean().optional(),
    tag:                 z.enum(["Traditional", "Herbs", "Oils", "Superfood", "Other"]).optional(),
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


// ─── SMS ─────────────────────────────────────────────────────────────────
//
// Destinations are accepted in any format the UI collects and normalized in
// src/lib/smsNormalize.ts. The regex here is a shape check that rejects
// obvious junk early; normalizeEthiopianMSISDN remains the authority, so a
// value passing this schema can still fail normalization (a landline
// range, say) and is then recorded as `skipped_invalid`, not silently sent.
const phoneShape = z
  .string()
  .trim()
  .regex(/^\+?[0-9\s\-().]{9,20}$/, "Invalid phone number");

export const SendSmsSchema = z.object({
  to: phoneShape,
  text: z.string().trim().min(1, "Message text is required").max(1000),
});

export const PreviewSmsCampaignSchema = z.object({
  // Whichever the operator supplies: a targeting predicate against
  // vw_customer_insights, or an explicit pasted/uploaded list.
  segment: z
    .enum(["VIP", "Loyal", "Promising", "At Risk", "Dormant"])
    .optional(),
  city: z.string().trim().max(120).optional(),
  min_orders: z.coerce.number().int().min(0).optional(),
  max_days_idle: z.coerce.number().int().min(0).optional(),
  recipients: z
    .array(
      z.object({
        phone: phoneShape,
        name: z.string().trim().max(120).optional(),
      }),
    )
    .max(20_000, "Too many recipients in one upload")
    .optional(),
  text: z.string().trim().min(1, "Message text is required").max(1000),
});

export const CreateSmsCampaignSchema = PreviewSmsCampaignSchema.extend({
  name: z.string().trim().min(3, "Campaign name is required").max(160),
  category: z.enum(["broadcast", "marketing"]).default("broadcast"),
  template_id: z.string().uuid().optional().or(z.literal("")),
  scheduled_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/, "Invalid schedule timestamp")
    .optional()
    .or(z.literal("")),
  max_cost_etb: z.coerce.number().positive().max(100_000).optional(),
});

export const DispatchSmsCampaignSchema = z.object({
  // Staff retype the campaign name to confirm they read the dry-run numbers.
  confirm_phrase: z.string().trim().min(1).max(160),
  // Set only when the draft exceeds its own cost ceiling. The daily ceiling
  // has no override and is not part of this schema.
  cost_override: z.coerce.boolean().optional().default(false),
});

export const SmsConsentSchema = z.object({
  to: phoneShape,
  // 'opt-in' clears sms_marketing_opt_in; 'hard-opt-out' sets sms_opt_out_at
  // and suppresses transactional sends too. 'opt-out' matches the consent
  // log enum and leaves transactional sends permitted.
  action: z.enum(["opt-in", "opt-out", "hard-opt-out"]),
});

// ─── Site Media ──────────────────────────────────────────────────────────

/** Dotted lowercase slug, e.g. "category.oils" or "hero.banner". */
const assetKeyShape = z
  .string()
  .trim()
  .min(3, "Asset key is required")
  .max(191)
  .regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/, "Invalid asset key format");

/**
 * An asset can point at a Cloudinary https URL, a first-party path under
 * /image/, or a pasted external URL. Cloud drive share links are rejected for
 * the same reason products reject them (see validateProductData in
 * routes/products.ts): they are not directly renderable in <img src>.
 */
const assetUrlShape = z
  .string()
  .trim()
  .min(1, "Image URL is required")
  .max(2048)
  .refine(
    (v) => v.startsWith("https://") || v.startsWith("http://") || v.startsWith("/image/") || v.startsWith("/uploads/"),
    "URL must be an http(s) address or a /image/ path",
  )
  .refine(
    (v) => !/drive\.google\.com|dropbox\.com/i.test(v),
    "Direct image URL required, not a cloud drive share link",
  );

export const UpdateAssetSchema = z.object({
  url: assetUrlShape,
  alt_text: z.string().trim().max(255).optional().nullable(),
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
export type SendSmsInput          = z.infer<typeof SendSmsSchema>;
export type PreviewSmsCampaignInput = z.infer<typeof PreviewSmsCampaignSchema>;
export type CreateSmsCampaignInput  = z.infer<typeof CreateSmsCampaignSchema>;
export type DispatchSmsCampaignInput = z.infer<typeof DispatchSmsCampaignSchema>;
export type SmsConsentInput       = z.infer<typeof SmsConsentSchema>;
export type UpdateAssetInput      = z.infer<typeof UpdateAssetSchema>;
export { assetKeyShape };
