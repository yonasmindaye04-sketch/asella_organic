/**
 * src/routes/customers.ts
 * Asella Organic — Customer Insights Routes (MySQL)
 *
 * Admin surface for the customers table, which until now had no read
 * endpoint at all. Everything here derives from vw_customer_insights
 * (db/sql/024_customer_insights.sql) rather than from stored counters,
 * so the value score cannot drift out of sync with the orders table.
 *
 * Endpoints:
 *   GET   /api/customers             → paginated list, filterable + sortable
 *   GET   /api/customers/summary     → segment distribution + KPI totals
 *   GET   /api/customers/:id         → profile, orders, products, timeline
 *   POST  /api/customers/:id/rating  → add a staff 1..5 star rating
 *   POST  /api/customers/:id/note    → add a staff note to the timeline
 *   PATCH /api/customers/:id         → edit contact details / tags
 *
 * The timeline itself is written from the order paths (see
 * recordCustomerActivity in lib/customerActivity.ts) so that sales,
 * returns, cancellations and status changes all land in one place
 * without this router having to poll for them.
 */

import { Router, Request, Response } from "express";
import crypto from "crypto";
import { z } from "zod";
import pool from "../config/db.js";
import { authenticate, authorise } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createLogger } from "../lib/logger.js";
import { entityIdParam } from "../lib/ids.js";
import { sanitizeObject } from "../lib/security.js";

// ─────────────────────────────────────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sort keys map to view columns rather than being interpolated raw.
 * A whitelisted map is required here: the ORDER BY clause cannot take a
 * placeholder, so an allow-list is the only thing keeping the column
 * name out of attacker-controlled input.
 */
const SORT_COLUMNS: Record<string, string> = {
  value_score:     "value_score",
  net_value:       "net_value",
  order_count:     "order_count",
  last_order_at:   "last_order_at",
  days_since:      "days_since_last_order",
  avg_stars:       "avg_stars",
  name:            "name",
  created_at:      "customer_since",
  return_rate:     "return_rate",
};

const UpdateCustomerSchema = z.object({
  name:     z.string().trim().min(2).max(255).optional(),
  email:    z.string().trim().email("Invalid email").max(255).optional().nullable(),
  city:     z.string().trim().max(255).optional(),
  location: z.string().trim().max(255).optional(),
  gender:   z.enum(["male", "female", "other"]).optional().nullable(),
  age_group: z
    .enum(["under-18", "18-24", "25-34", "35-44", "45-54", "55+"])
    .optional()
    .nullable(),
});

const AddRatingSchema = z.object({
  stars:   z.number().int().min(1, "Rating must be 1 to 5").max(5),
  comment: z.string().trim().max(1000).optional(),
});

const AddNoteSchema = z.object({
  note: z.string().trim().min(1, "Note cannot be empty").max(2000),
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const router = Router();

/**
 * Resolve the :id route param to a customer id.
 *
 * Accepting the phone number as an alternative would be ambiguous here: phone
 * is unique but staff type it with spaces, dashes and +251 prefixes, and
 * normalising all of that is a bigger surface than the feature needs.
 */
function customerIdFrom(value: unknown): string | null {
  return entityIdParam(value);
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customers — paginated list with filters
//
// Query: ?search ?city ?segment ?source ?min_score ?max_score
//        ?returned_only ?sort ?dir ?page ?limit
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);

    const {
      search, city, segment, source,
      min_score, max_score,
      returned_only,
      sort = "value_score",
      dir  = "desc",
      page  = "1",
      limit = "25",
    } = req.query as Record<string, string | undefined>;

    const conditions: string[] = ["1 = 1"];
    const values: unknown[]    = [];

    if (search) {
      conditions.push("(v.name LIKE ? OR v.phone LIKE ? OR v.email LIKE ? OR v.location LIKE ?)");
      const like = `%${search}%`;
      values.push(like, like, like, like);
    }
    if (city)     { conditions.push("v.city LIKE ?");           values.push(`%${city}%`); }
    // COLLATE is required, not decoration.
    //
    // vw_customer_insights is internally inconsistent: `segment` comes from
    // a CASE returning the literals 'VIP'/'Loyal'/... so it took the
    // database default, utf8mb4_general_ci, while every other projected
    // column is inherited from `customers` and is utf8mb3_unicode_ci.
    // Comparing that column against a literal raises
    //   ERROR 1267 Illegal mix of collations
    // and surfaced as a 500 on GET /api/customers?segment=... once the pool
    // was pinned to utf8mb4_unicode_ci. Pinning the pool cannot fix this
    // one column -- the two spellings have to be reconciled at the
    // comparison, and this is the only query in the codebase that
    // compares `segment` to a literal.
    if (segment)  { conditions.push("v.segment COLLATE utf8mb4_unicode_ci = ?"); values.push(segment); }
    if (min_score) { conditions.push("v.value_score >= ?");     values.push(Number(min_score) || 0); }
    if (max_score) { conditions.push("v.value_score <= ?");     values.push(Number(max_score) || 0); }
    if (returned_only === "true") { conditions.push("v.returned_count > 0"); }

    // Source is not a customer column — it lives on orders, so this
    // filter goes through an EXISTS rather than the view's aggregates.
    if (source) {
      conditions.push(`EXISTS (
        SELECT 1 FROM orders o
        WHERE o.deleted_at IS NULL
          AND o.source = ?
          AND (o.customer_id = v.customer_id OR (o.customer_id IS NULL AND o.phone = v.phone))
      )`);
      values.push(source);
    }

    // segment is derived in the view's outer SELECT, so filtering on it
    // requires wrapping the view — a WHERE on a column that only exists
    // in the projection is not valid SQL.
    //
    // The FROM/JOIN and the WHERE are kept as separate strings because
    // the affiliate join has to sit BETWEEN them: `FROM … JOIN …
    // WHERE …` is valid SQL, `FROM … WHERE … JOIN …` is a syntax error.
    // The COUNT below reuses only the view, since joining a 1:1 table
    // cannot change the count but is one more thing to keep in sync.
    const fromView = `FROM (SELECT * FROM vw_customer_insights) v`;
    const where    = `WHERE ${conditions.join(" AND ")}`;

    const sortColumn = SORT_COLUMNS[sort] ?? SORT_COLUMNS.value_score;
    const sortDir    = dir?.toLowerCase() === "asc" ? "ASC" : "DESC";

    const pageNum  = Math.max(1, parseInt(page ?? "1", 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? "25", 10) || 25));
    const offset   = (pageNum - 1) * limitNum;

    try {
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total ${fromView} ${where}`,
        values
      ) as [any[], any];

      const [rows] = await pool.query(
        `SELECT
           v.customer_id, v.name, v.phone, v.email, v.city, v.location,
           v.gender, v.age_group, v.customer_since,
           v.order_count, v.delivered_count, v.cancelled_count, v.returned_count, v.open_count,
           v.lifetime_value, v.refunded_value, v.net_value,
           v.distinct_products, v.total_units,
           v.last_order_at, v.last_delivered_at, v.days_since_last_order,
           v.value_score, v.segment,
           v.recency_score, v.frequency_score, v.monetary_score, v.penalty_score,
           v.avg_stars, v.rating_count,
           CASE WHEN v.telegram_chat_id IS NULL THEN 0 ELSE 1 END AS is_telegram,
           ap.full_name AS affiliate_name
         ${fromView}
         LEFT JOIN affiliate_profiles ap ON ap.id = v.referred_by_affiliate_id
         ${where}
         ORDER BY ${sortColumn} ${sortDir}, v.name ASC
         LIMIT ? OFFSET ?`,
        [...values, limitNum, offset]
      ) as [any[], any];

      res.json({
        success: true,
        data: rows.map((r: any) => ({ ...r, value_score: Math.round(Number(r.value_score)) })),
        meta: {
          total: Number(total),
          page:  pageNum,
          limit: limitNum,
          pages: Math.ceil(Number(total) / limitNum),
        },
      });
    } catch (err) {
      log.error("Failed to list customers", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customers/summary — segment distribution + portfolio KPIs
//
// Declared before /:id so "summary" is not swallowed by the UUID param.
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/summary",
  authenticate,
  authorise("admin", "manager"),
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const [segments] = await pool.query(
        `SELECT
           segment,
           COUNT(*)                        AS customers,
           COALESCE(SUM(net_value), 0)     AS net_value,
           COALESCE(AVG(value_score), 0)   AS avg_score
         FROM vw_customer_insights
         GROUP BY segment
         ORDER BY AVG(value_score) DESC`
      ) as [any[], any];

      const [[totals]] = await pool.query(
        `SELECT
           COUNT(*)                                                  AS total_customers,
           COALESCE(SUM(order_count), 0)                             AS total_orders,
           COALESCE(SUM(delivered_count), 0)                         AS delivered_orders,
           COALESCE(SUM(returned_count), 0)                          AS returned_orders,
           COALESCE(SUM(cancelled_count), 0)                         AS cancelled_orders,
           COALESCE(SUM(net_value), 0)                               AS total_net_value,
           COALESCE(AVG(value_score), 0)                             AS avg_score,
           SUM(CASE WHEN days_since_last_order IS NOT NULL
                     AND days_since_last_order > 90 THEN 1 ELSE 0 END) AS churning,
           SUM(CASE WHEN days_since_last_order IS NULL THEN 1 ELSE 0 END) AS never_ordered
         FROM vw_customer_insights`
      ) as [any[], any];

      // Top 5 by score, so the page can answer "who are our best
      // customers" without the caller sorting client-side.
      const [top] = await pool.query(
        `SELECT customer_id, name, phone, city, net_value, order_count, value_score, segment
         FROM vw_customer_insights
         WHERE order_count > 0
         ORDER BY value_score DESC, net_value DESC
         LIMIT 5`
      ) as [any[], any];

      res.json({
        success: true,
        data: {
          ...totals,
          avg_score: Math.round(Number(totals.avg_score)),
          segments: segments.map((s: any) => ({
            ...s,
            customers:    Number(s.customers),
            net_value:    Number(s.net_value),
            avg_score:    Math.round(Number(s.avg_score)),
          })),
          top_customers: top.map((t: any) => ({
            ...t,
            net_value:   Number(t.net_value),
            value_score: Math.round(Number(t.value_score)),
          })),
        },
      });
    } catch (err) {
      createLogger(_req).error("Failed to fetch customer summary", { error: err });
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customers/activity — cross-customer movement feed
//
// Declared before /:id so "activity" is not matched by the id param.
// Returns movements across every customer, newest first, for the
// Activity tab.
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/activity",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);

    const {
      type,
      customer_id,
      page  = "1",
      limit = "30",
    } = req.query as Record<string, string | undefined>;

    const conditions: string[] = ["1 = 1"];
    const values: unknown[]    = [];

    if (type)         { conditions.push("ca.activity_type = ?");  values.push(type); }
    if (customer_id)  { conditions.push("ca.customer_id = ?");    values.push(customer_id); }

    const where = `WHERE ${conditions.join(" AND ")}`;

    const pageNum  = Math.max(1, parseInt(page ?? "1", 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit ?? "30", 10) || 30));
    const offset   = (pageNum - 1) * limitNum;

    try {
      const [[{ total }]] = await pool.query(
        `SELECT COUNT(*) AS total FROM customer_activity ca ${where}`,
        values
      ) as [any[], any];

      const [rows] = await pool.query(
        `SELECT
           ca.id, ca.customer_id, ca.order_id, ca.activity_type, ca.title,
           ca.detail, ca.amount, ca.status_from, ca.status_to,
           ca.actor_name, ca.created_at,
           c.name AS customer_name, c.phone AS customer_phone
         FROM customer_activity ca
         JOIN customers c ON c.id = ca.customer_id
         ${where}
         ORDER BY ca.created_at DESC
         LIMIT ? OFFSET ?`,
        [...values, limitNum, offset]
      ) as [any[], any];

      res.json({
        success: true,
        data: rows.map((r: any) => ({
          ...r,
          amount: r.amount === null ? null : Number(r.amount),
        })),
        meta: {
          total: Number(total),
          page:  pageNum,
          limit: limitNum,
          pages: Math.ceil(Number(total) / limitNum),
        },
      });
    } catch (err) {
      log.error("Failed to fetch customer activity feed", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/customers/:id — full profile
//
// Returns the scored row, the order history, favourite products, the
// rating history and the full movement timeline in one round trip — the
// detail drawer would otherwise issue five requests on every open.
// ─────────────────────────────────────────────────────────────────────────────

router.get(
  "/:id",
  authenticate,
  authorise("admin", "manager"),
  async (req: Request, res: Response): Promise<void> => {
    const log    = createLogger(req);
    const id     = customerIdFrom(req.params.id);

    if (!id) {
      res.status(404).json({ success: false, error: "Customer not found" });
      return;
    }

    try {
      const [customers] = await pool.query(
        `SELECT
           v.*,
           ap.full_name  AS affiliate_name,
           ap.referral_code AS affiliate_code
         FROM (SELECT * FROM vw_customer_insights) v
         LEFT JOIN affiliate_profiles ap ON ap.id = v.referred_by_affiliate_id
         WHERE v.customer_id = ?`,
        [id]
      ) as [any[], any];

      const customer = customers[0];
      if (!customer) {
        res.status(404).json({ success: false, error: "Customer not found" });
        return;
      }

      // Phone match as well as customer_id: orders created before the
      // customer row existed carry no customer_id, and the view
      // attributes them by phone. The detail view has to do the same or
      // it will show a shorter history than the score was built from.
      const [orders] = await pool.query(
        `SELECT
           o.id, o.status, o.payment_status, o.total, o.source,
           o.order_type, o.city, o.created_at, o.delivery_date,
           (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count,
           (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.id) AS unit_count
         FROM orders o
         WHERE o.deleted_at IS NULL
           AND (o.customer_id = ? OR (o.customer_id IS NULL AND o.phone = ?))
         ORDER BY o.created_at DESC
         LIMIT 50`,
        [id, customer.phone]
      ) as [any[], any];

      const [products] = await pool.query(
        `SELECT oi.item_name, oi.package_size,
                SUM(oi.quantity)                                  AS units_bought,
                SUM(oi.quantity * oi.unit_price)                  AS amount_spent
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.deleted_at IS NULL
           AND o.status NOT IN ('Cancelled', 'Returned', 'Issue')
           AND (o.customer_id = ? OR (o.customer_id IS NULL AND o.phone = ?))
         GROUP BY oi.item_name, oi.package_size
         ORDER BY amount_spent DESC
         LIMIT 10`,
        [id, customer.phone]
      ) as [any[], any];

      const [ratings] = await pool.query(
        `SELECT id, stars, comment, rated_by_name, created_at
         FROM customer_ratings
         WHERE customer_id = ?
         ORDER BY created_at DESC`,
        [id]
      ) as [any[], any];

      const [activity] = await pool.query(
        `SELECT id, order_id, activity_type, title, detail, amount,
                status_from, status_to, actor_name, created_at
         FROM customer_activity
         WHERE customer_id = ?
         ORDER BY created_at DESC
         LIMIT 200`,
        [id]
      ) as [any[], any];

      res.json({
        success: true,
        data: {
          ...customer,
          value_score:   Math.round(Number(customer.value_score)),
          avg_stars:     Number(customer.avg_stars ?? 0),
          lifetime_value: Number(customer.lifetime_value ?? 0),
          refunded_value: Number(customer.refunded_value ?? 0),
          net_value:      Number(customer.net_value ?? 0),
          orders:    orders.map((o: any) => ({ ...o, total: Number(o.total) })),
          products:  products.map((p: any) => ({
            ...p,
            units_bought: Number(p.units_bought),
            amount_spent: Number(p.amount_spent),
          })),
          ratings:   ratings.map((r: any) => ({ ...r, stars: Number(r.stars) })),
          activity:  activity.map((a: any) => ({
            ...a,
            amount: a.amount === null ? null : Number(a.amount),
          })),
        },
      });
    } catch (err) {
      log.error("Failed to fetch customer", { customerId: id, error: err });
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/customers/:id/rating — staff 1..5 stars
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/:id/rating",
  authenticate,
  authorise("admin", "manager"),
  validate(AddRatingSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    const id  = customerIdFrom(req.params.id);
    const { stars, comment } = req.body as z.infer<typeof AddRatingSchema>;

    if (!id) {
      res.status(404).json({ success: false, error: "Customer not found" });
      return;
    }

    try {
      const [existing] = await pool.query(
        `SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL`,
        [id]
      ) as [any[], any];

      if (!existing.length) {
        res.status(404).json({ success: false, error: "Customer not found" });
        return;
      }

      const ratingId = crypto.randomUUID();

      // The rating row and its timeline entry are written together —
      // a rating that does not appear on the timeline would look like
      // the rating was lost.
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        await connection.query(
          `INSERT INTO customer_ratings (id, customer_id, stars, comment, rated_by, rated_by_name)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [ratingId, id, stars, comment ?? null, req.user!.id, req.user!.username]
        );

        await connection.query(
          `INSERT INTO customer_activity
             (id, customer_id, activity_type, title, detail, amount, actor_id, actor_name)
           VALUES (?, ?, 'rating', ?, ?, NULL, ?, ?)`,
          [
            crypto.randomUUID(),
            id,
            `Rated ${stars} star${stars === 1 ? "" : "s"}`,
            comment ?? null,
            req.user!.id,
            req.user!.username,
          ]
        );

        await connection.commit();
      } catch (txErr) {
        await connection.rollback();
        throw txErr;
      } finally {
        connection.release();
      }

      log.info("Customer rated", { customerId: id, stars, by: req.user?.username });

      res.status(201).json({ success: true, data: { id: ratingId, stars, comment } });
    } catch (err) {
      log.error("Failed to rate customer", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/customers/:id/note — staff note on the timeline
// ─────────────────────────────────────────────────────────────────────────────

router.post(
  "/:id/note",
  authenticate,
  authorise("admin", "manager"),
  validate(AddNoteSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    const id  = customerIdFrom(req.params.id);
    const { note } = req.body as z.infer<typeof AddNoteSchema>;

    if (!id) {
      res.status(404).json({ success: false, error: "Customer not found" });
      return;
    }

    try {
      const [existing] = await pool.query(
        `SELECT id FROM customers WHERE id = ? AND deleted_at IS NULL`,
        [id]
      ) as [any[], any];

      if (!existing.length) {
        res.status(404).json({ success: false, error: "Customer not found" });
        return;
      }

      const activityId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO customer_activity
           (id, customer_id, activity_type, title, detail, amount, actor_id, actor_name)
         VALUES (?, ?, 'note', 'Note added', ?, NULL, ?, ?)`,
        [activityId, id, note, req.user!.id, req.user!.username]
      );

      res.status(201).json({ success: true, data: { id: activityId } });
    } catch (err) {
      log.error("Failed to add customer note", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /api/customers/:id — edit contact details
// ─────────────────────────────────────────────────────────────────────────────

router.patch(
  "/:id",
  authenticate,
  authorise("admin", "manager"),
  validate(UpdateCustomerSchema),
  async (req: Request, res: Response): Promise<void> => {
    const log = createLogger(req);
    const id  = customerIdFrom(req.params.id);
    const body = sanitizeObject(req.body as Record<string, unknown>) as z.infer<typeof UpdateCustomerSchema>;

    if (!id) {
      res.status(404).json({ success: false, error: "Customer not found" });
      return;
    }

    try {
      const [existing] = await pool.query(
        `SELECT * FROM customers WHERE id = ? AND deleted_at IS NULL`,
        [id]
      ) as [any[], any];

      const customer = existing[0];
      if (!customer) {
        res.status(404).json({ success: false, error: "Customer not found" });
        return;
      }

      const updates: string[] = [];
      const values: unknown[]  = [];

      for (const field of ["name", "email", "city", "location", "gender", "age_group"] as const) {
        if (body[field] !== undefined) {
          updates.push(`${field} = ?`);
          values.push(body[field] ?? null);
        }
      }

      if (updates.length === 0) {
        res.status(400).json({ success: false, error: "No fields to update" });
        return;
      }

      values.push(id);
      await pool.query(`UPDATE customers SET ${updates.join(", ")} WHERE id = ?`, values);

      // Profile edits land on the timeline too, with the before/after
      // values, so a later reader can see why a delivery address changed.
      const changes = (["name", "email", "city", "location", "gender", "age_group"] as const)
        .filter(field => body[field] !== undefined)
        .map(field => ({
          field,
          from: customer[field],
          to:   body[field] ?? null,
        }));

      const activityId = crypto.randomUUID();
      await pool.query(
        `INSERT INTO customer_activity
           (id, customer_id, activity_type, title, detail, amount, actor_id, actor_name)
         VALUES (?, ?, 'profile_update', 'Profile updated', ?, NULL, ?, ?)`,
        [
          activityId,
          id,
          JSON.stringify(changes),
          req.user!.id,
          req.user!.username,
        ]
      );

      res.json({ success: true, data: { id, updated: changes.map(c => c.field) } });
    } catch (err) {
      log.error("Failed to update customer", err);
      res.status(500).json({ success: false, error: "Internal server error" });
    }
  }
);

export default router;