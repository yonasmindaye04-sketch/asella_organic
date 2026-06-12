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
  DATABASE_URL: z.string().min(10, "DATABASE_URL must be a valid connection URL"),

  // ── Auth ─────────────────────────────────────────────────
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),

  // ── Frontend ──────────────────────────────────────────────
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),

  // ── Telegram ─────────────────────────────────────────────
  TELEGRAM_BOT_TOKEN: z.string().min(20, "TELEGRAM_BOT_TOKEN looks too short").optional().or(z.literal("")),
  TELEGRAM_WEBHOOK_SECRET: z
    .string()
    .min(16, "TELEGRAM_WEBHOOK_SECRET must be at least 16 characters").optional().or(z.literal("")),
  TELEGRAM_ADMIN_CHAT_ID: z.string().min(1).optional().or(z.literal("")),
  TELEGRAM_DELIVERY_GROUP_ID: z.string().min(1).optional().or(z.literal("")),

  // ── Google Sheets ─────────────────────────────────────────
  GOOGLE_SPREADSHEET_ID: z.string().min(20).optional().or(z.literal("")),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().refine((s) => {
    if (!s || s.length < 50) return true;
    try { JSON.parse(s); return true; } catch { return false; }
  }, "GOOGLE_SERVICE_ACCOUNT_JSON must be valid JSON").optional(),
  GOOGLE_SERVICE_ACCOUNT_PATH: z.string().optional(),
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