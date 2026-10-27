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
  PORT: z.union([z.string(), z.coerce.number()]).default(3000),

  // ── Database ─────────────────────────────────────────────
  DATABASE_URL: z.string().min(10).optional().or(z.literal("")).default("mysql://root@127.0.0.1:3306/asella_organic"),

  // ── Auth ─────────────────────────────────────────────────
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters").default("asella-organic-preview-jwt-secret-key-2026-secure"),

  // ── Frontend ──────────────────────────────────────────────
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173,http://localhost:3000"),

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

  // ── SMS provider selection ────────────────────────────────────
  // Which transport sends. Defaults to smsethiopia, so an existing
  // deployment that sets none of the new variables behaves exactly as it
  // did before the split.
  //
  //   smsethiopia — HTTP API. Per-message billing, carrier throughput,
  //                 alphanumeric sender ID. The default for campaigns.
  //   textbee     — sends from a physical Android handset. No per-message
  //                 cost and no account approval, but the sender is the SIM
  //                 number and throughput is radio-bound to roughly one
  //                 message every 5s. Suited to low volume and testing.
  //
  // An unrecognised value falls back to smsethiopia rather than failing
  // boot: this is read on every send, and a typo in a staging .env should
  // not take the dispatcher down from inside a queue tick.
  SMS_PROVIDER: z
    .enum(["smsethiopia", "textbee"])
    .optional()
    .or(z.literal(""))
    .default("smsethiopia"),

  // ── TextBee (outbound SMS, handset gateway) ────────────────────
  // Both are required for the transport to report itself configured; a key
  // without a device has nothing to send from.
  //
  // From textbee.dev/dashboard: register the device, then generate an API
  // key. On a self-hosted instance, scan the QR in the Android app or enter
  // the key by hand.
  TEXTBEE_API_KEY: z.string().min(8).optional().or(z.literal("")),
  TEXTBEE_DEVICE_ID: z.string().min(1).optional().or(z.literal("")),

  // Only for self-hosted TextBee. Leave unset to use the textbee.dev cloud
  // API. Self-hosting needs its own domain serving the NestJS API, e.g.
  // https://sms.example.com — note this is the API base, not the dashboard.
  TEXTBEE_BASE_URL: z.string().url().optional().or(z.literal("")),

  // The handset path is slower than an HTTP provider's: the request has to
  // reach a phone that may be waking up. Higher default than
  // SMS_SEND_TIMEOUT_MS, and a phone that is merely asleep should retry
  // rather than be recorded as a hard failure.
  TEXTBEE_SEND_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(120_000).default(20_000),

  // Display label only. The v1 API accepts just { msisdn, text } — there is
  // no sender field in the body. Alphanumeric sender IDs are a dashboard
  // account setting and must be registered there.
  //
  // TextBee has no sender field either, and there the limitation is real
  // rather than cosmetic: recipients see the raw SIM number. This label is
  // shown in the admin UI so staff are not surprised by what a customer
  // actually receives.
  SMS_SENDER_LABEL: z.string().max(64).optional().or(z.literal("")),

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
  SMS_MAX_CAMPAIGN_COST_ETB: z.coerce.number().positive().default(2000),
  SMS_MAX_DAILY_COST_ETB: z.coerce.number().positive().default(3000),

  // Suppress a repeat of the same status for the same order inside this
  // window. Status churn is the main way transactional SMS turns into spam.
  SMS_STATUS_COOLDOWN_MINUTES: z.coerce.number().int().min(0).max(1440).default(120),
  SMS_MAX_PER_ORDER: z.coerce.number().int().min(1).max(20).default(4),
});

const result = EnvSchema.safeParse(process.env);

let env: z.infer<typeof EnvSchema>;
if (!result.success) {
  console.warn("\n Environment variable validation warning (using safe defaults for invalid fields):\n");
  result.error.issues.forEach((issue) => {
    console.warn(`  ${issue.path.join(".")}: ${issue.message}`);
  });
  const sanitizedEnv: Record<string, unknown> = { ...process.env };
  for (const issue of result.error.issues) {
    const key = String(issue.path[0]);
    delete sanitizedEnv[key];
  }
  env = EnvSchema.parse(sanitizedEnv);
} else {
  env = result.data;
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = env.JWT_SECRET;
}
export default env;