/**
 * src/routes/vendor-orders.ts
 * Asella Organic - Vendor purchase order routes.
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import pool from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";

const router = Router();

const CreateVendorOrderSchema = z
  .object({
    vendor_name: z.string().trim().min(2).max(150),
    vendor_chat_id: z.string().trim().optional(),
    product_id: z.string().uuid().optional(),
    item: z.string().trim().min(1).max(200).optional(),
    amount: z.string().trim().min(1).optional(),
    price: z.number().positive().optional(),
    delivery_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),

    // Payload currently sent by the frontend VendorPurchasePage.
    phone: z.string().trim().optional(),
    material_type: z.string().trim().optional(),
    description: z.string().trim().min(1).max(200).optional(),
    quantity: z.number().positive().optional(),
    unit_price: z.number().positive().optional(),
    payment_status: z.string().trim().optional(),
    notes: z.string().trim().max(1000).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.item && !value.description) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["item"],
        message: "item or description is required",
      });
    }
    if (!value.amount && value.quantity === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["amount"],
        message: "amount or quantity is required",
      });
    }
    if (value.price === undefined && value.unit_price === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["price"],
        message: "price or unit_price is required",
      });
    }
  });

const UpdateVendorOrderStatusSchema = z.object({
  status: z.enum(["pending", "confirmed", "declined", "completed"]),
});

router.get(
  "/",
  authenticate,
  authorise("admin", "manager", "employee"),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const [rows] = await pool.query(
        `SELECT id, order_id, product_id, vendor_name, vendor_chat_id,
                item, amount, price, delivery_date, status, created_at, updated_at
         FROM vendor_orders
         ORDER BY created_at DESC
         LIMIT 100`
      ) as [any[], any];

      res.json({ success: true, data: rows });
    } catch (err) {
      console.error("[GET /vendor-orders]", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

router.post(
  "/",
  authenticate,
  authorise("admin", "manager", "employee"),
  validate(CreateVendorOrderSchema),
  async (req: Request, res: Response): Promise<void> => {
    const body = req.body as z.infer<typeof CreateVendorOrderSchema>;
    const id = crypto.randomUUID();
    const orderId = `PO-${Date.now()}`;
    const item = body.item ?? body.description!;
    const amount = body.amount ?? String(body.quantity);
    const price = body.price ?? Number((body.quantity ?? 1) * body.unit_price!);

    try {
      await pool.query(
        `INSERT INTO vendor_orders
           (id, product_id, order_id, vendor_name, vendor_chat_id,
            item, amount, price, delivery_date, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
        [
          id,
          body.product_id ?? null,
          orderId,
          body.vendor_name,
          body.vendor_chat_id ?? null,
          item,
          amount,
          price,
          body.delivery_date ?? null,
        ]
      );

      const [rows] = await pool.query(
        `SELECT id, order_id, product_id, vendor_name, vendor_chat_id,
                item, amount, price, delivery_date, status, created_at, updated_at
         FROM vendor_orders
         WHERE id = ?`,
        [id]
      ) as [any[], any];

      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      console.error("[POST /vendor-orders]", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

router.patch(
  "/:id/status",
  authenticate,
  authorise("admin", "manager"),
  validate(UpdateVendorOrderStatusSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { status } = req.body as z.infer<typeof UpdateVendorOrderStatusSchema>;

    try {
      const [result] = await pool.query(
        `UPDATE vendor_orders SET status = ?, updated_at = NOW() WHERE id = ?`,
        [status, id]
      ) as [any, any];

      if (result.affectedRows === 0) {
        res.status(404).json({ success: false, error: "Vendor order not found" });
        return;
      }

      res.json({ success: true, data: { id, status } });
    } catch (err) {
      console.error("[PATCH /vendor-orders/:id/status]", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;
