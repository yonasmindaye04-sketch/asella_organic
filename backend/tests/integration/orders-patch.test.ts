/**
 * backend/tests/integration/orders-patch.test.ts
 * Asella Organic - Tests for resolveOrderItem helper (orders.patch.ts)
 *
 * SKIPPED - the module under test does not exist.
 *
 * This suite was written against src/routes/orders.patch.ts, a placeholder
 * for a feature that was never built: its own header said the handler
 * "depends on a DB schema column (orders.affiliate_id) that doesn't exist
 * yet". The file was later removed as dead code (it duplicated routes/orders.ts
 * with different auth), and resolveOrderItem does not exist anywhere in src.
 *
 * The import is therefore lazy rather than static, and the suite is skipped,
 * so the module still loads and these assertions are kept intact as the spec
 * for the feature. To re-enable: implement resolveOrderItem, point
 * IMPLEMENTATION_PATH at wherever it lands, and drop the .skip.
 *
 * The behaviour worth keeping: resolve product_id by name + package_size,
 * case-insensitively and whitespace-trimmed; fall back to the catalogue price
 * when the submitted unit_price is 0; allow a positive submitted price to
 * override; return a null product_id and the submitted price for an unknown
 * product.
 */

import pool from "../../src/config/db.js";
import crypto from "crypto";

const IMPLEMENTATION_PATH = "../../src/routes/orders.patch.js";

// Resolved in beforeAll so a missing module cannot fail the whole suite at
// import time, which is what used to turn one dead file into a red build.
let resolveOrderItem: (
  conn: unknown,
  name: string,
  size: string,
  submittedPrice: number,
) => Promise<{ product_id: string | null; unit_price: number }>;

const productId = crypto.randomUUID();

beforeAll(async () => {
  const mod = (await import(IMPLEMENTATION_PATH)) as {
    resolveOrderItem: typeof resolveOrderItem;
  };
  resolveOrderItem = mod.resolveOrderItem;

  // Product for resolution tests
  await pool.query(
    `INSERT INTO products (id, name, package_size, price, inventory_quantity, low_stock_threshold, active)
     VALUES (?, 'Resolve Moringa', '250g', 350, 100, 10, true)
     ON DUPLICATE KEY UPDATE name = VALUES(name)`,
    [productId]
  );
});

afterAll(async () => {
  await pool.query(`DELETE FROM products WHERE id = ?`, [productId]).catch(() => {});
  await pool.end();
});

describe.skip("resolveOrderItem()", () => {
  it("resolves product_id and unit_price for a known product", async () => {
    const conn = await pool.getConnection();
    try {
      const result = await resolveOrderItem(conn, "Resolve Moringa", "250g", 350);
      expect(result.product_id).toBe(productId);
      expect(result.unit_price).toBe(350);
    } finally {
      conn.release();
    }
  });

  it("returns DB price when submitted unit_price is 0", async () => {
    const conn = await pool.getConnection();
    try {
      const result = await resolveOrderItem(conn, "Resolve Moringa", "250g", 0);
      expect(result.product_id).toBe(productId);
      expect(result.unit_price).toBe(350); // from DB
    } finally {
      conn.release();
    }
  });

  it("returns null product_id for unknown product", async () => {
    const conn = await pool.getConnection();
    try {
      const result = await resolveOrderItem(conn, "NonExistentXYZ", "500g", 200);
      expect(result.product_id).toBeNull();
      expect(result.unit_price).toBe(200); // uses submitted price
    } finally {
      conn.release();
    }
  });

  it("returns 0 unit_price for unknown product with 0 submitted price", async () => {
    const conn = await pool.getConnection();
    try {
      const result = await resolveOrderItem(conn, "NonExistentXYZ", "500g", 0);
      expect(result.product_id).toBeNull();
      expect(result.unit_price).toBe(0);
    } finally {
      conn.release();
    }
  });

  it("handles case-insensitive product name matching", async () => {
    const conn = await pool.getConnection();
    try {
      const result = await resolveOrderItem(conn, "resolve moringa", "250g", 0);
      expect(result.product_id).toBe(productId);
      expect(result.unit_price).toBe(350);
    } finally {
      conn.release();
    }
  });

  it("uses submitted price when it is positive (override)", async () => {
    const conn = await pool.getConnection();
    try {
      const result = await resolveOrderItem(conn, "Resolve Moringa", "250g", 999);
      expect(result.product_id).toBe(productId);
      expect(result.unit_price).toBe(999); // submitted override
    } finally {
      conn.release();
    }
  });

  it("trims whitespace from item name and package size", async () => {
    const conn = await pool.getConnection();
    try {
      const result = await resolveOrderItem(conn, "  Resolve Moringa  ", "  250g  ", 0);
      expect(result.product_id).toBe(productId);
      expect(result.unit_price).toBe(350);
    } finally {
      conn.release();
    }
  });
});
