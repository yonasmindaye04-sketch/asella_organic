/**
 * migrate-receipts.cjs
 * Asella Organic — Receipt Storage & URL Migration Script
 *
 * Physically moves uploaded receipt files from public/uploads/ to private/receipts/
 * and updates any legacy /uploads/receipt- URLs in orders.notes to /api/receipts/receipt-.
 *
 * Usage:
 *   node scripts/migrate-receipts.cjs           (DRY RUN - default, no changes)
 *   node scripts/migrate-receipts.cjs --execute (LIVE RUN - moves files & updates DB)
 */

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const isLive = process.argv.includes("--execute");

const PUBLIC_UPLOADS_DIR = path.join(__dirname, "..", "public", "uploads");
const PRIVATE_RECEIPTS_DIR = path.join(__dirname, "..", "private", "receipts");

async function main() {
  console.log(`\n============================================================`);
  console.log(`📦 Receipt Migration: public/uploads -> private/receipts`);
  console.log(`Mode: ${isLive ? "🚨 LIVE EXECUTION (--execute)" : "🔍 DRY RUN (no changes)"}`);
  console.log(`============================================================\n`);

  if (!fs.existsSync(PRIVATE_RECEIPTS_DIR)) {
    if (isLive) {
      fs.mkdirSync(PRIVATE_RECEIPTS_DIR, { recursive: true });
      console.log(`✓ Created private receipts directory: ${PRIVATE_RECEIPTS_DIR}`);
    } else {
      console.log(`[DRY RUN] Would create directory: ${PRIVATE_RECEIPTS_DIR}`);
    }
  }

  // 1. Scan filesystem for receipt files
  let receiptFiles = [];
  if (fs.existsSync(PUBLIC_UPLOADS_DIR)) {
    receiptFiles = fs.readdirSync(PUBLIC_UPLOADS_DIR).filter(f => f.startsWith("receipt-"));
  }

  console.log(`Found ${receiptFiles.length} receipt file(s) in ${PUBLIC_UPLOADS_DIR}`);
  for (const file of receiptFiles) {
    const src = path.join(PUBLIC_UPLOADS_DIR, file);
    const dest = path.join(PRIVATE_RECEIPTS_DIR, file);
    if (isLive) {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
      console.log(`✓ Moved: ${file} -> private/receipts/`);
    } else {
      console.log(`[DRY RUN] Would move: ${file} -> private/receipts/`);
    }
  }

  // 2. Scan and update database references
  let conn = null;
  try {
    conn = await mysql.createConnection({
      host:     process.env.DB_HOST || "localhost",
      user:     process.env.DB_USER || "root",
      password: process.env.DB_PASSWORD || "",
      database: process.env.DB_NAME || "asellafs_organic",
    });

    const [rows] = await conn.query(
      "SELECT id, notes FROM orders WHERE notes LIKE '%/uploads/receipt-%'"
    );

    console.log(`\nFound ${rows.length} order(s) referencing /uploads/receipt- in notes`);
    for (const order of rows) {
      if (isLive) {
        await conn.query(
          "UPDATE orders SET notes = REPLACE(notes, '/uploads/receipt-', '/api/receipts/receipt-') WHERE id = ?",
          [order.id]
        );
        console.log(`✓ Updated order ${order.id}`);
      } else {
        console.log(`[DRY RUN] Would update order ${order.id}`);
      }
    }

    console.log(`\n✅ Migration summary: ${receiptFiles.length} file(s), ${rows.length} DB row(s).`);
    if (!isLive) {
      console.log(`\nℹ️  To apply these changes, rerun with: node scripts/migrate-receipts.cjs --execute`);
    }
  } catch (err) {
    console.error("Database connection error:", err.message);
  } finally {
    if (conn) await conn.end();
  }
}

main().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
