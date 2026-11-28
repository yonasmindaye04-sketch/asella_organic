/**
 * src/config/env.ts
 * Asella Organic — Typed Environment Validation
 */

import { z } from "zod";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import {
  JwtSecretConfigError,
  formatJwtSecretFatalMessage,
  resolveJwtSecrets,
} from "./jwtSecret.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env") });
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const EnvSchema = z.object({
  // ── Node ────────────────────────────────────────────────
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.union([z.string(), z.coerce.number()]).default(3000),

  // ── Database ─────────────────────────────────────────────
  DATABASE_URL: z.string().min(10).optional().or(z.literal("")).default("mysql://root@127.0.0.1:3306/asella_organic"),

  // ── Auth ─────────────────────────────────────────────────
  // JWT_SECRET and JWT_SECRET_PREVIOUS are validated by
  // src/config/jwtSecret.ts, not by this schema.
  //
  // ASE-2026-003: the schema used to carry a published DEFAULT for
  // JWT_SECRET, so an operator who forgot to set it got a signing key
  // that is in the public git history — anyone could mint an admin token
  // with it. The resolution rules (required, minimum length, rotation
  // window) now live in one module so the issuer, the verifier and the
  // boot guard cannot disagree, and there is no default anywhere.
  //
  // See src/config/jwtSecret.ts and security/findings/REGISTER.md
  // ASE-2026-003 for the full rationale.

  // ── Frontend ──────────────────────────────────────────────
  ALLOWED_ORIGINS: z.string().default("http://localhost:5173,http://localhost:3000"),
  // Extra origins allowed to call this API cross-origin OUTSIDE
  // production, named one by one.
  //
  // ASE-2026-011: the allowlist used to trust any host under
  // *.trycloudflare.com / *.ngrok.io / *.run.app and friends. Those
  // suffixes are free to claim, and the same list is the CSRF Origin
  // check, so the wildcard handed any of them a trusted channel to the
  // API. Name the origins you actually run instead.
  //
  // The origin of TELEGRAM_MINIAPP_URL is trusted automatically outside
  // production — it is already an operator-set URL.
  PREVIEW_ORIGINS: z.string().optional().or(z.literal("")),

  // ── Telegram ─────────────────────────────────────────────
  TELEGRAM_BOT_TOKEN: z.string().min(20, "TELEGRAM_BOT_TOKEN looks too short").optional().or(z.literal("")),
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .min(16, "TELEGRAM_WEBHOOK_SECRET must be at least 16 characters").optional().or(z.literal("")),
  TELEGRAM_ADMIN_CHAT_ID: z.string().min(1).optional().or(z.literal("")),
  TELEGRAM_DELIVERY_GROUP_ID: z.string().min(1).optional().or(z.literal("")),
  TELEGRAM_MINIAPP_URL: z.string().url().optional().or(z.literal("")),
  TELEGRAM_BOT_NAME: z.string().optional().or(z.literal("")),
  TELEGRAM_BOT_USERNAME: z.string().optional().or(z.literal("")),

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

// ── Hard-fail on missing/short JWT_SECRET (ASE-2026-003) ────────────────────
// Without a JWT_SECRET, every signed token is forgeable. We refuse to boot
// rather than fall through to a published default.
//
// The exit shape (ExitCode=78, EX_USAGE) is intentional: systemd / launchd
// surface exit codes 64-78 in their journal; 78 is the closest conventional
// value for "config error" that won't be confused with a runtime crash.
//
// The rules live in src/config/jwtSecret.ts so that the boot guard, the
// token issuer and the token verifier cannot disagree about what a usable
// key is.
try {
  resolveJwtSecrets(process.env);
} catch (err) {
  if (err instanceof JwtSecretConfigError) {
    // Use stderr explicitly so the message survives stdout redirection.
    process.stderr.write(formatJwtSecretFatalMessage(err.fault));
    process.exit(78);
  }
  throw err;
}

if (!result.success) {
  const issues = result.error.issues;

  // Everything else — log warnings, fall back to schema defaults.
  // This is the pre-existing fallback path; it stays in place for the
  // SMS dispatcher tuning knobs, RETENTION_YEARS, etc. It is deliberately
  // NOT used for the JWT path, because every other variable has a safe
  // default and the signing key does not.
  console.warn(
    "\n[env] Environment variable validation warning (using safe defaults for invalid fields):\n"
  );
  issues.forEach((issue) => {
    console.warn(`  ${issue.path.join(".")}: ${issue.message}`);
  });
  const sanitizedEnv: Record<string, unknown> = { ...process.env };
  for (const issue of issues) {
    const key = String(issue.path[0]);
    delete sanitizedEnv[key];
  }
  env = EnvSchema.parse(sanitizedEnv);
} else {
  env = result.data;
}

// Publish the *validated* (trimmed) JWT_SECRET values into process.env so
// that any downstream reader sees the canonical value rather than
// re-reading whatever the operator put in .env (which can have
// whitespace, trailing newlines, BOM chars, etc. — see
// security/findings/REGISTER.md ASE-2026-003).
const jwtSecrets = resolveJwtSecrets(process.env);
process.env.JWT_SECRET = jwtSecrets.secret;
if (jwtSecrets.previous) {
  process.env.JWT_SECRET_PREVIOUS = jwtSecrets.previous;
} else {
  // Do not leave a stale previous key behind: if the operator removed it,
  // the process must forget it too.
  delete process.env.JWT_SECRET_PREVIOUS;
}

export default env;