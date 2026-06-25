/**
 * src/routes/vendor-orders.ts
 * Asella Organic — Vendor Purchase Order Routes
 *
 * Status flow:
 *   pending → approved | cancelled
 *   approved → received | cancelled
 *   received → (terminal)
 *   cancelled → (terminal)
 *
 * On "received":
 *   1. If product_id linked → auto-add stock via recordMovement()
 *   2. Always creates an expense record
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import pool from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { recordMovement } from "../lib/inventory.js";

const router = Router();

// ─── Schemas ──────────────────────────────────────────────────────────────

const CreateVendorOrderSchema = z
  .object({
    vendor_name: z.string().trim().min(2).max(150),
    vendor_chat_id: z.string().trim().optional(),
    product_id: z.string().trim().optional(),
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
  status: z.enum(["pending", "approved", "received", "cancelled"]),
  notes:  z.string().trim().max(500).optional(),
});

// ─── Valid transitions ────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending:   ["approved", "cancelled"],
  approved:  ["received", "cancelled"],
  received:  [],  // terminal
  cancelled: [],  // terminal
};

// ─── GET /api/vendor-orders ───────────────────────────────────────────────

router.get(
  "/",
  authenticate,
  authorise("admin", "manager", "employee"),
  async (req: Request, res: Response): Promise<void> => {
    const { status, search } = req.query as Record<string, string | undefined>;

    const conditions: string[] = [];
    const values: unknown[] = [];

    if (status) { conditions.push("vo.status = ?"); values.push(status); }
    if (search) {
      conditions.push("(vo.vendor_name LIKE ? OR vo.item LIKE ? OR vo.order_id LIKE ?)");
      values.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

    try {
      const [rows] = await pool.query(
        `SELECT vo.id, vo.order_id, vo.product_id, vo.vendor_name, vo.vendor_chat_id,
                vo.item, vo.amount, vo.price, vo.delivery_date, vo.status,
                vo.received_by, vo.received_at,
                vo.created_at, vo.updated_at,
                p.name AS product_name, p.package_size AS product_package_size,
                su.full_name AS received_by_name
         FROM vendor_orders vo
         LEFT JOIN products p ON vo.product_id = p.id
         LEFT JOIN staff_users su ON vo.received_by = su.id
         ${where}
         ORDER BY vo.created_at DESC
         LIMIT 200`,
        values
      ) as [any[], any];

      res.json({ success: true, data: rows });
    } catch (err) {
      console.error("[GET /vendor-orders]", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─── POST /api/vendor-orders ──────────────────────────────────────────────

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
        `SELECT vo.*, p.name AS product_name, p.package_size AS product_package_size
         FROM vendor_orders vo
         LEFT JOIN products p ON vo.product_id = p.id
         WHERE vo.id = ?`,
        [id]
      ) as [any[], any];

      res.status(201).json({ success: true, data: rows[0] });
    } catch (err) {
      console.error("[POST /vendor-orders]", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─── PATCH /api/vendor-orders/:id/status ──────────────────────────────────
// Status transitions with auto-stock and auto-expense on "received"

router.patch(
  "/:id/status",
  authenticate,
  authorise("admin", "manager"),
  validate(UpdateVendorOrderStatusSchema),
  async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { status, notes } = req.body as z.infer<typeof UpdateVendorOrderStatusSchema>;

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      // Fetch current vendor order with lock
      const [voRows] = await conn.query(
        `SELECT id, order_id, product_id, vendor_name, item, amount, price, status
         FROM vendor_orders
         WHERE id = ?
         FOR UPDATE`,
        [id]
      ) as [any[], any];

      const vo = voRows[0];
      if (!vo) {
        await conn.rollback();
        res.status(404).json({ success: false, error: "Vendor order not found" });
        return;
      }

      // Validate transition
      const allowed = VALID_TRANSITIONS[vo.status] ?? [];
      if (!allowed.includes(status)) {
        await conn.rollback();
        res.status(400).json({
          success: false,
          error: `Cannot transition from "${vo.status}" to "${status}". Allowed: ${allowed.join(", ") || "none (terminal state)"}`,
        });
        return;
      }

      // Update status
      const updateFields: string[] = ["status = ?", "updated_at = NOW()"];
      const updateValues: unknown[] = [status];

      if (status === "received") {
        updateFields.push("received_by = ?", "received_at = NOW()");
        updateValues.push(req.user!.id);
      }

      updateValues.push(id);
      await conn.query(
        `UPDATE vendor_orders SET ${updateFields.join(", ")} WHERE id = ?`,
        updateValues
      );

      let stockResult = null;

      // ── On "received": auto-add stock if product linked ─────────
      if (status === "received" && vo.product_id) {
        const parsedQty = parseInt(String(vo.amount).replace(/\D/g, ""), 10);
        if (parsedQty && parsedQty > 0) {
          try {
            stockResult = await recordMovement(
              {
                productId:     vo.product_id as string,
                type:          "purchase_received",
                changeAmount:  parsedQty,
                performedBy:   req.user!.id,
                referenceId:   id,
                referenceType: "vendor_order",
                reason:        `PO received from ${vo.vendor_name} (ref: ${vo.order_id})`,
                notes:         notes ?? null,
              },
              conn
            );
          } catch (stockErr: any) {
            await conn.rollback();
            res.status(400).json({
              success: false,
              error: `Stock update failed: ${stockErr.message}`,
            });
            return;
          }
        }
      }

      // ── On "received": always create expense record ─────────────
      if (status === "received") {
        const expenseId = crypto.randomUUID();
        const expenseDescription = vo.product_id
          ? `Vendor purchase: ${vo.item} from ${vo.vendor_name} (ref: ${vo.order_id})`
          : `Expense: ${vo.item} from ${vo.vendor_name} (ref: ${vo.order_id})`;

        await conn.query(
          `INSERT INTO expenses (id, category, description, amount, vendor_order_id, recorded_by, notes)
           VALUES (?, 'vendor_purchase', ?, ?, ?, ?, ?)`,
          [expenseId, expenseDescription, vo.price, id, req.user!.id, notes ?? null]
        );
      }

      await conn.commit();

      // Fetch updated record
      const [updatedRows] = await pool.query(
        `SELECT vo.*, p.name AS product_name, p.package_size AS product_package_size,
                su.full_name AS received_by_name
         FROM vendor_orders vo
         LEFT JOIN products p ON vo.product_id = p.id
         LEFT JOIN staff_users su ON vo.received_by = su.id
         WHERE vo.id = ?`,
        [id]
      ) as [any[], any];

      res.json({
        success: true,
        data: updatedRows[0],
        ...(stockResult ? {
          inventory_updated: true,
          new_quantity:      stockResult.newQuantity,
          below_threshold:   stockResult.belowThreshold,
        } : {}),
      });
    } catch (err) {
      await conn.rollback();
      console.error("[PATCH /vendor-orders/:id/status]", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    } finally {
      conn.release();
    }
  }
);

export default router;
