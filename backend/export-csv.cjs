/**
 * export-csv.js
 * Exports products (with groups), orders, and order items to CSV for Excel.
 * Run from: backend/
 */
require("dotenv").config();
const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

const csvEscape = (v) => {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
};

const writeCsv = (filePath, headers, rows) => {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map(h => csvEscape(row[h])).join(","));
  }
  fs.writeFileSync(filePath, lines.join("\r\n") + "\r\n", "utf8");
  console.log(`Wrote ${rows.length} rows to ${filePath}`);
};

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || "3306", 10),
  });

  const outDir = path.join(__dirname, "..", "exports");
  fs.mkdirSync(outDir, { recursive: true });

  // ── Products with product group info ──
  const [products] = await connection.query(`
    SELECT
      p.id AS product_id,
      p.product_group_id,
      g.name AS product_group_name,
      g.active AS group_active,
      p.name AS product_name,
      p.package_size,
      p.sku,
      p.size_value,
      p.size_unit,
      p.sort_order,
      p.price,
      p.unit_cost,
      p.inventory_quantity,
      p.low_stock_threshold,
      p.active AS product_active,
      p.deleted_at,
      p.created_at,
      p.updated_at,
      p.description,
      p.tag,
      p.image_url,
      p.featured
    FROM products p
    LEFT JOIN product_groups g ON g.id = p.product_group_id
    ORDER BY g.name, p.name, p.package_size
  `);
  writeCsv(
    path.join(outDir, "products_export.csv"),
    ["product_id","product_group_id","product_group_name","group_active","product_name","package_size","sku","size_value","size_unit","sort_order","price","unit_cost","inventory_quantity","low_stock_threshold","product_active","deleted_at","created_at","updated_at","description","tag","image_url","featured"],
    products
  );

  // ── Orders ──
  const [orders] = await connection.query(`
    SELECT
      id AS order_id,
      source,
      customer_name,
      phone,
      location,
      city,
      gender,
      age_group,
      order_type,
      franchise_type,
      status,
      payment_status,
      total,
      notes,
      customer_id,
      assigned_to,
      delivery_date,
      delivery_message_id,
      deleted_at,
      created_at,
      updated_at,
      deleted_by,
      deleted_at_ip,
      deleted_reason,
      created_by_staff_id,
      telegram_chat_id
    FROM orders
    ORDER BY created_at DESC
  `);
  writeCsv(
    path.join(outDir, "orders_export.csv"),
    ["order_id","source","customer_name","phone","location","city","gender","age_group","order_type","franchise_type","status","payment_status","total","notes","customer_id","assigned_to","delivery_date","delivery_message_id","deleted_at","created_at","updated_at","deleted_by","deleted_at_ip","deleted_reason","created_by_staff_id","telegram_chat_id"],
    orders
  );

  // ── Order items ──
  const [items] = await connection.query(`
    SELECT
      oi.id AS order_item_id,
      oi.order_id,
      o.created_at AS order_date,
      o.customer_name,
      oi.item_name,
      oi.package_size,
      oi.quantity,
      oi.unit_price,
      ROUND(oi.quantity * oi.unit_price, 2) AS line_total,
      oi.product_id,
      oi.product_match_type,
      p.name AS matched_product_name,
      p.package_size AS matched_product_size,
      p.active AS matched_product_active
    FROM order_items oi
    JOIN orders o ON o.id = oi.order_id
    LEFT JOIN products p ON p.id = oi.product_id
    ORDER BY o.created_at DESC, oi.item_name
  `);
  writeCsv(
    path.join(outDir, "order_items_export.csv"),
    ["order_item_id","order_id","order_date","customer_name","item_name","package_size","quantity","unit_price","line_total","product_id","product_match_type","matched_product_name","matched_product_size","matched_product_active"],
    items
  );

  await connection.end();
  console.log("\nAll exports complete. Folder:", outDir);
}

main().catch(err => {
  console.error("Export failed:", err);
  process.exit(1);
});
