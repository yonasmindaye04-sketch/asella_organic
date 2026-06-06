import { Router, Request, Response } from "express";
import { validate } from "../middleware/validate.js";
import { CreateAppointmentSchema, CreateAppointmentInput } from "../schemas/index.js";
import { generalRateLimit } from "../middleware/rateLimit.js";
import nodemailer from "nodemailer";
import { createLogger } from "../lib/logger.js";
import { sendSimpleMessage } from "../lib/telegram.js";

const router = Router();

// Create a reusable transporter using environment variables.
// Users will need to set SMTP_USER and SMTP_PASS in their .env
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail', // Or configure custom SMTP host/port
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
};

router.post("/", generalRateLimit, validate(CreateAppointmentSchema), async (req: Request, res: Response): Promise<void> => {
  const log = createLogger(req);
  const data = req.body as CreateAppointmentInput;

  try {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      log.warn("SMTP_USER or SMTP_PASS missing. Falling back to Telegram notification.");
      
      // Fallback: Send to Telegram Admin
      const adminChat = process.env.TELEGRAM_ADMIN_CHAT_ID;
      if (adminChat) {
        const msg = ` *New Appointment Request*\n\n` +
                    ` *Name:* ${data.full_name}\n` +
                    ` *Phone:* ${data.phone_number}\n` +
                    ` *Date:* ${data.preferred_date}\n` +
                    ` *Email:* ${data.email || "N/A"}`;
        await sendSimpleMessage(adminChat, msg);
      }

      res.status(200).json({ 
        success: true, 
        data: { message: "Appointment request sent successfully (via Telegram)." } 
      });
      return;
    }

    const transporter = createTransporter();

    // 1. Send notification to the business (asellamoringa@gmail.com)
    await transporter.sendMail({
      from: `"Asella Organic" <${process.env.SMTP_USER}>`,
      to: "asellamoringa@gmail.com",
      subject: "New Appointment Request",
      html: `
        <h2>New Appointment Request</h2>
        <p><strong>Name:</strong> ${data.full_name}</p>
        <p><strong>Phone:</strong> ${data.phone_number}</p>
        <p><strong>Preferred Date:</strong> ${data.preferred_date}</p>
        <p><strong>Email:</strong> ${data.email || "Not provided"}</p>
      `,
    });

    // 2. Send confirmation to the customer (if they provided an email)
    if (data.email) {
      await transporter.sendMail({
        from: `"Asella Organic" <${process.env.SMTP_USER}>`,
        to: data.email,
        subject: "Appointment Request Received - Asella Organic",
        html: `
          <p>Dear ${data.full_name},</p>
          <p>We have successfully received your appointment request for <strong>${data.preferred_date}</strong>.</p>
          <p>Our team will contact you shortly at <strong>${data.phone_number}</strong> to confirm the exact time and details.</p>
          <br/>
          <p>Best regards,</p>
          <p><strong>Asella Organic Team</strong></p>
        `,
      });
    }

    log.info("Appointment request processed and emails sent", { customer: data.full_name });
    
    res.status(200).json({ 
      success: true, 
      data: { message: "Appointment request sent successfully." } 
    });

  } catch (error: any) {
    log.error("Failed to send appointment emails", error);
    res.status(500).json({ 
      success: false, 
      error: "Failed to send the request. Please try again later." 
    });
  }
});

export default router;
