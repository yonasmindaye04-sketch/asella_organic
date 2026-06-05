/**
 * backend/tests/integration/orders-patch.test.ts
 * Asella Organic — Tests for resolveOrderItem helper (orders.patch.ts)
 *
 * We test the resolveOrderItem function directly since the full handler
 * in orders.patch.ts depends on a DB schema column (orders.affiliate_id)
 * that doesn't exist yet. The unit-level function is still testable.
 */

import pool from "../../src/config/db.js";
import crypto from "crypto";
import { resolveOrderItem } from "../../src/routes/orders.patch.js";

const productId = crypto.randomUUID();

beforeAll(async () => {
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

describe("resolveOrderItem()", () => {
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
