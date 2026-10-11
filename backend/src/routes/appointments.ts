import { Router, Request, Response } from "express";
import { validate } from "../middleware/validate.js";
import { CreateAppointmentSchema, CreateAppointmentInput } from "../schemas/index.js";
import { generalRateLimit } from "../middleware/rateLimit.js";
import { createLogger } from "../lib/logger.js";
import { sendSimpleMessage } from "../lib/telegram.js";
import { isMailConfigured, sendMail } from "../lib/mailer.js";

const router = Router();

const BUSINESS_EMAIL = "asellamoringa@gmail.com";

function telegramText(data: CreateAppointmentInput): string {
  return (
    ` *New Appointment Request*\n\n` +
    ` *Name:* ${data.full_name}\n` +
    ` *Phone:* ${data.phone_number}\n` +
    ` *Date:* ${data.preferred_date}\n` +
    ` *Email:* ${data.email || "N/A"}`
  );
}

/**
 * Second delivery channel. Used when SMTP is absent AND when it is present
 * but the send failed — see the note on the route below.
 */
async function notifyViaTelegram(data: CreateAppointmentInput): Promise<boolean> {
  const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!adminChat) return false;
  try {
    await sendSimpleMessage(adminChat, telegramText(data));
    return true;
  } catch {
    return false;
  }
}

router.post(
  "/",
  generalRateLimit,
  validate(CreateAppointmentSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    const data = req.body as CreateAppointmentInput;

    try {
      if (!isMailConfigured()) {
        log.warn("SMTP_USER or SMTP_PASS missing. Falling back to Telegram notification.");
        const delivered = await notifyViaTelegram(data);

        res.status(200).json({
          success: true,
          data: {
            message: delivered
              ? "Appointment request sent successfully (via Telegram)."
              : "Appointment request received.",
            delivered_via: "telegram",
          },
        });
        return;
      }

      // 1. Notification to the business.
      //
      // The result MUST be inspected. sendMail never throws — it resolves to
      // { sent: false, error } — and this route used to await it and discard
      // the return, then log "emails sent" and answer 200 regardless. Since
      // nothing is persisted (there is no appointments table), a failed SMTP
      // send meant the request was lost outright: the customer was told it
      // succeeded, the business was told nothing, and the catch block below
      // was unreachable for exactly this case.
      const business = await sendMail(
        BUSINESS_EMAIL,
        "New Appointment Request",
        `
          <h2>New Appointment Request</h2>
          <p><strong>Name:</strong> ${data.full_name}</p>
          <p><strong>Phone:</strong> ${data.phone_number}</p>
          <p><strong>Preferred Date:</strong> ${data.preferred_date}</p>
          <p><strong>Email:</strong> ${data.email || "Not provided"}</p>
        `,
      );

      if (!business.sent) {
        log.error("Appointment notification email failed", {
          error: business.error ?? "unknown",
          customer: data.full_name,
        });

        // Never let the request evaporate: retry on the other channel.
        const delivered = await notifyViaTelegram(data);

        res.status(200).json({
          success: true,
          data: {
            message: delivered
              ? "Appointment request sent successfully (via Telegram)."
              : "Appointment request received.",
            delivered_via: delivered ? "telegram" : "email_failed",
          },
        });
        return;
      }

      // 2. Confirmation to the customer. A failure here must NOT fail the
      //    request: the business has already been notified, and telling the
      //    customer it failed would only invite a duplicate submission.
      if (data.email) {
        const customer = await sendMail(
          data.email,
          "Appointment Request Received - Asella Organic",
          `
            <p>Dear ${data.full_name},</p>
            <p>We have successfully received your appointment request for <strong>${data.preferred_date}</strong>.</p>
            <p>Our team will contact you shortly at <strong>${data.phone_number}</strong> to confirm the exact time and details.</p>
            <br/>
            <p>Best regards,</p>
            <p><strong>Asella Organic Team</strong></p>
          `,
        );
        if (!customer.sent) {
          log.warn("Appointment confirmation email to customer failed", {
            error: customer.error ?? "unknown",
          });
        }
      }

      log.info("Appointment request processed and emails sent", {
        customer: data.full_name,
      });

      res.status(200).json({
        success: true,
        data: { message: "Appointment request sent successfully.", delivered_via: "email" },
      });
    } catch (error: unknown) {
      log.error("Failed to send appointment emails", error);
      res.status(500).json({
        success: false,
        error: "Failed to send the request. Please try again later.",
      });
    }
  }
);

export default router;
