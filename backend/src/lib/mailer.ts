/**
 * src/lib/mailer.ts
 * Asella Organic — Shared SMTP Transport (MySQL)
 *
 * Extracted from the inline transporter that used to live in routes/appointments.ts
 * so that affiliate reporting and any future transactional mail share one
 * configured transport instead of each route building its own.
 *
 * Configuration is read from SMTP_USER / SMTP_PASS. When either is missing the
 * app must not crash: `isMailConfigured()` lets callers degrade gracefully
 * (appointments falls back to Telegram; reports are recorded as skipped).
 */

import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";

let cached: Transporter | null = null;

export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function getTransporter(): Transporter {
  if (!isMailConfigured()) {
    throw new Error("SMTP is not configured — set SMTP_USER and SMTP_PASS.");
  }
  if (!cached) {
    cached = nodemailer.createTransport({
      service: process.env.SMTP_SERVICE ?? "gmail",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return cached;
}

export function senderAddress(): string {
  return process.env.SMTP_FROM ?? `"Asella Organic" <${process.env.SMTP_USER}>`;
}

export interface SendResult {
  sent: boolean;
  skipped: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Send one HTML email. Never throws — transport failures are reported through
 * the return value so a batch report run can log per-recipient outcomes
 * instead of aborting the whole send.
 */
export async function sendMail(
  to: string,
  subject: string,
  html: string,
): Promise<SendResult> {
  if (!isMailConfigured()) {
    return { sent: false, skipped: true, error: "SMTP is not configured" };
  }
  try {
    const info = await getTransporter().sendMail({
      from: senderAddress(),
      to,
      subject,
      html,
    });
    return { sent: true, skipped: false, messageId: info.messageId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { sent: false, skipped: false, error: message };
  }
}
