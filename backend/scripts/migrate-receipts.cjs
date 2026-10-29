/**
 * migrate-receipts.cjs
 * Asella Organic — Receipt Storage & URL Migration Script
 *
 * Physically moves uploaded receipt files from public/uploads/ to private/receipts/
 * and optionally updates legacy /uploads/receipt- URLs in orders.notes to /api/receipts/receipt-.
 *
 * Usage:
 *   node scripts/migrate-receipts.cjs                                (DRY RUN - default, no changes)
 *   node scripts/migrate-receipts.cjs --execute                      (LIVE RUN - moves files safely)
 *   node scripts/migrate-receipts.cjs --execute --rewrite-notes      (LIVE RUN - moves files & rewrites DB notes)
 */

const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const isLive = process.argv.includes("--execute");
const shouldRewriteNotes = process.argv.includes("--rewrite-notes");

const PUBLIC_UPLOADS_DIR = path.join(__dirname, "..", "public", "uploads");
const PRIVATE_RECEIPTS_DIR = path.join(__dirname, "..", "private", "receipts");

async function main() {
  console.log(`\n============================================================`);
  console.log(`📦 Receipt Migration: public/uploads -> private/receipts`);
  console.log(`Mode:           ${isLive ? "🚨 LIVE EXECUTION (--execute)" : "🔍 DRY RUN (no changes)"}`);
  console.log(`Rewrite Notes:  ${shouldRewriteNotes ? "✅ ENABLED (--rewrite-notes)" : "❌ DISABLED (default)"}`);
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
  let movedCount = 0;
  for (const file of receiptFiles) {
    const src = path.join(PUBLIC_UPLOADS_DIR, file);
    const dest = path.join(PRIVATE_RECEIPTS_DIR, file);

    // Skip if destination already exists
    if (fs.existsSync(dest)) {
      console.log(`⚠️  Destination already exists, skipping: ${file}`);
      continue;
    }

    if (isLive) {
      const srcStat = fs.statSync(src);
      fs.copyFileSync(src, dest);
      const destStat = fs.statSync(dest);

      // Verify copy before unlink
      if (!fs.existsSync(dest) || destStat.size !== srcStat.size) {
        console.error(`❌ Verification failed for ${file}: destination missing or size mismatch!`);
        process.exit(1);
      }

      fs.unlinkSync(src);
      console.log(`✓ Moved: ${file} -> private/receipts/`);
      movedCount++;
    } else {
      console.log(`[DRY RUN] Would move: ${file} -> private/receipts/`);
    }
  }

  // 2. Scan and update database references if --rewrite-notes is specified
  if (!shouldRewriteNotes) {
    console.log(`\nℹ️  Skipping database notes rewrite (pass --rewrite-notes to update DB URLs).`);
    console.log(`\n✅ Migration finished: ${isLive ? movedCount : receiptFiles.length} file(s) processed.`);
    return;
  }

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
  } catch (err) {
    console.error("❌ Database error during migration:", err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main().catch(err => {
  console.error("Migration error:", err);
  process.exit(1);
});
