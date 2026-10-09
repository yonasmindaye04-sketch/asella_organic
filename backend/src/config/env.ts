/**
 * src/config/env.ts
 * Asella Organic — Typed Environment Validation
 */

import { z } from "zod";
import "dotenv/config";

const EnvSchema = z.object({
  // ── Node ────────────────────────────────────────────────
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.union([z.string(), z.coerce.number()]).default(3001),

  // ── Database ─────────────────────────────────────────────
  DATABASE_URL: z.string().min(10).optional().or(z.literal("")).default("mysql://root@127.0.0.1:3306/asella_organic"),

  // ── Auth ─────────────────────────────────────────────────
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),

  // ── Frontend ──────────────────────────────────────────────
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),

  // ── Telegram ─────────────────────────────────────────────
  TELEGRAM_BOT_TOKEN: z.string().min(20, "TELEGRAM_BOT_TOKEN looks too short").optional().or(z.literal("")),
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .min(16, "TELEGRAM_WEBHOOK_SECRET must be at least 16 characters").optional().or(z.literal("")),
  TELEGRAM_ADMIN_CHAT_ID: z.string().min(1).optional().or(z.literal("")),
  TELEGRAM_DELIVERY_GROUP_ID: z.string().min(1).optional().or(z.literal("")),
  TELEGRAM_MINIAPP_URL: z.string().url().optional().or(z.literal("")),

  // ── Google Sheets ─────────────────────────────────────────
  GOOGLE_SPREADSHEET_ID: z.string().min(20).optional().or(z.literal("")),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().refine((s) => {
    if (!s || s.length < 50) return true;
    try { JSON.parse(s); return true; } catch { return false; }
  }, "GOOGLE_SERVICE_ACCOUNT_JSON must be valid JSON").optional(),
  GOOGLE_SERVICE_ACCOUNT_PATH: z.string().optional(),

  // ── SMSEthiopia (outbound SMS) ──────────────────────────────────
  // Self-service: signup at smsethiopia.com, then Console -> API Keys.
  // 100 free test SMS are granted on signup, no credit card.
  //
  // NOTE: the provider authenticates with a `KEY` request header. There is
  // no username/password variant and no Bearer token — smsethiopia.com
  // publishes a note specifically warning that models guess this wrong.
  SMSETHIOPIA_API_KEY: z.string().min(8).optional().or(z.literal("")),

  // Display label only. The v1 API accepts just { msisdn, text } — there is
  // no sender field in the body. Alphanumeric sender IDs are a dashboard
  // account setting and must be registered there.
  SMS_SENDER_LABEL: z.string().max(11).optional().or(z.literal("")),

  // Set "false" to hold sends in the queue on a box that holds a credential
  // but must not dispatch (staging, a demo tenant).
  SMS_DISPATCH_ENABLED: z
    .enum(["true", "false"])
    .optional()
    .or(z.literal(""))
    .default("true"),

  // Dispatcher tuning.
  SMS_SEND_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60_000).default(10_000),
  SMS_DISPATCH_INTERVAL_MS: z.coerce.number().int().min(500).max(60_000).default(2000),
  SMS_DISPATCH_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(25),

  // Ceilings in ETB. Per-campaign has an operator override; per-day does not.
  // At the published 0.10-0.45 ETB/segment band, 2000 ETB is roughly
  // 4,400-20,000 segments — sized to catch catastrophe, not routine sends.
  SMS_MAX_CAMPAIGN_COST_ETB: z.coerce.number().positive().default(2000),
  SMS_MAX_DAILY_COST_ETB: z.coerce.number().positive().default(3000),

  // Suppress a repeat of the same status for the same order inside this
  // window. Status churn is the main way transactional SMS turns into spam.
  SMS_STATUS_COOLDOWN_MINUTES: z.coerce.number().int().min(0).max(1440).default(120),
  SMS_MAX_PER_ORDER: z.coerce.number().int().min(1).max(20).default(4),
});

const result = EnvSchema.safeParse(process.env);

if (!result.success) {
  console.error("\n Missing or invalid environment variables:\n");
  result.error.issues.forEach((issue) => {
    console.error(`  ${issue.path.join(".")}: ${issue.message}`);
  });
  console.error(
    "\n  → Copy .env.example to .env and fill in the values.\n"
  );
  process.exit(1);
}

const env = result.data;
export default env;