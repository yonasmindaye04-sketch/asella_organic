#!/usr/bin/env node
/*
 * export_catalog.cjs
 *
 * Exports active products from a database into the catalog-active.csv
 * format used by 04_import_catalog.cjs.
 *
 * This is a convenience for local rehearsal. On the host, the same
 * columns are available in 00_production_export.sql query 1 and can
 * be exported directly from phpMyAdmin.
 *
 * Usage:
 *   node rebuild/export_catalog.cjs --database asella_organic \
 *     --out rebuild/catalog-active.local-rehearsal.csv
 */

const fs = require("fs");
const path = require("path");

// Reuse the backend's installed dependencies without duplicating node_modules.
module.paths.unshift(path.resolve(__dirname, "../backend/node_modules"));

const mysql = require("mysql2/promise");

require("dotenv").config({ path: path.resolve(__dirname, "../backend/.env") });

const args = process.argv.slice(2);
function arg(name, fallback = undefined) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

const database = arg("--database", process.env.DB_NAME || "asella_organic");
const outPath = arg("--out", path.resolve(__dirname, "catalog-active.csv"));
const source = arg("--source", "export");

function csv(value) {
  if (value === null || value === undefined) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
}

const HEADERS = [
  "product_id", "group_name", "group_slug", "group_description",
  "group_image_url", "group_featured", "group_tag", "group_active",
  "variant_name", "package_size", "sku", "price", "unit_cost",
  "opening_stock", "low_stock_threshold", "variant_active",
  "aliases", "source", "verified", "notes",
];

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database,
    charset: "utf8mb4_unicode_ci",
  });

  try {
    const [rows] = await conn.query(
      `SELECT
         id, name, package_size, price, unit_cost,
         description, image_url, featured, tag,
         inventory_quantity, low_stock_threshold, active
       FROM products
       WHERE active = 1
       ORDER BY name, package_size`
    );

    const lines = [HEADERS.map(csv).join(",")];
    for (const row of rows) {
      lines.push([
        row.id,
        row.name,
        "",
        row.description || "",
        row.image_url || "",
        row.featured ? 1 : 0,
        row.tag || "",
        1,
        row.name,
        row.package_size,
        "",
        row.price,
        row.unit_cost,
        row.inventory_quantity,
        row.low_stock_threshold,
        row.active ? 1 : 0,
        "",
        source,
        0,
        "Exported active product; verify price, cost, and stock before production import",
      ].map(csv).join(","));
    }

    fs.writeFileSync(outPath, lines.join("\r\n") + "\r\n", "utf8");
    console.log(`Wrote ${rows.length} active products to ${outPath}`);
    console.log(`Database: ${database}`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
