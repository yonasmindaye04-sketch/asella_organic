#!/usr/bin/env node
/*
 * gen-006.cjs
 * Regenerates backend/db/sql/006_clean_products.sql from
 * backend/data/catalog-active.csv so the canonical seed migration and the
 * catalog CSV can never drift apart.
 *
 * Columns written are only the ones that exist when 006 runs:
 *   001 creates products  ->  016 adds unit_cost  ->  018 adds active_unique
 *   035 adds product_group_id / sku / size_value / size_unit / sort_order
 * 006 sorts before 016/018/035, so unit_cost, sku and product_group_id are
 * filled in later by the v2 catalog import (import-catalog.cjs).
 */
const fs = require("fs");
const path = require("path");

const repo = path.resolve(__dirname, '../..');
const csvPath = path.join(repo, "backend/data/catalog-active.csv");
const outPath = path.join(repo, "backend/db/sql/006_clean_products.sql");

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1)
    .filter(r => r.some(v => String(v).trim() !== ""))
    .map(r => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const q = v => {
  if (v === null || v === undefined || v === "") return "NULL";
  return "'" + String(v).replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";
};
const num = v => (v === "" || v === null || v === undefined) ? "0" : String(Number(v));
const bool = v => (Number(v) === 1 || String(v).toLowerCase() === "true") ? "TRUE" : "FALSE";

const rows = parseCsv(fs.readFileSync(csvPath, "utf8"));

// Group rows by group_name, preserving first-seen order.
const groups = new Map();
for (const r of rows) {
  if (!groups.has(r.group_name)) groups.set(r.group_name, []);
  groups.get(r.group_name).push(r);
}

const activeCount = rows.filter(r => Number(r.variant_active) === 1).length;
const stockTotal = rows.filter(r => Number(r.variant_active) === 1)
  .reduce((s, r) => s + Number(r.opening_stock || 0), 0);

const L = [];
L.push("-- ============================================================");
L.push("-- 006_clean_products.sql");
L.push("-- Asella Organic - Canonical Product List");
L.push("--");
L.push("-- GENERATED FILE - source of truth: backend/data/catalog-active.csv");
L.push("-- Regenerate with: node backend/scripts/generate-006-sql.cjs   (see the header of that script)");
L.push("--");
L.push(`-- ${rows.length} variants across ${groups.size} product groups`);
L.push(`-- ${activeCount} active variants, ${stockTotal} units of opening stock`);
L.push("--");
L.push("-- SCOPE");
L.push("--   This migration runs BEFORE 016 (unit_cost), 018 (active_unique) and");
L.push("--   035 (product_group_id / sku / size columns), so it can only write the");
L.push("--   columns that exist at that point:");
L.push("--     id, name, package_size, price, tag, image_url, description,");
L.push("--     featured, active, inventory_quantity, low_stock_threshold");
L.push("--   product_group_id, unit_cost, sku and the aliases are filled in by the");
L.push("--   v2 catalog import: backend/scripts/data-migrations/import-catalog.cjs");
L.push("--");
L.push("-- RE-RUN SAFETY");
L.push("--   Rows are inserted on first run and UPDATED on conflict for the");
L.push("--   catalogue attributes (name, size, price, tag, image, description,");
L.push("--   featured, threshold).");
L.push("--   active and inventory_quantity are deliberately NOT overwritten on");
L.push("--   conflict: live stock and staff deactivations are business state, not");
L.push("--   seed data, and clobbering them would corrupt stock on an existing");
L.push("--   database. On a fresh database both come from the CSV as usual.");
L.push("-- ============================================================");
L.push("");
L.push("-- 1. Archive the legacy pr0000... products (historical references only).");
L.push("--    They are deactivated, never deleted, so order_items.product_id stays valid.");
L.push("UPDATE products SET active = false WHERE id LIKE 'pr0000%';");
L.push("");
L.push("-- 2. Drop their stock snapshots (they are rebuilt from the current catalog).");
L.push("DELETE FROM stock_snapshots WHERE product_id LIKE 'pr0000%';");
L.push("");

for (const [group, variants] of groups) {
  const activeVariants = variants.filter(v => Number(v.variant_active) === 1).length;
  L.push(`-- ${group} (${variants.length} variant(s), ${activeVariants} active)`);
  L.push("INSERT INTO products");
  L.push("  (id, name, package_size, price, tag, image_url, description, featured, active, inventory_quantity, low_stock_threshold, created_at, updated_at)");
  L.push("VALUES");
  const tuples = variants.map(v =>
    `  (${q(v.product_id)}, ${q(v.variant_name)}, ${q(v.package_size)}, ${num(v.price)}, ` +
    `${q(v.group_tag)}, ${q(v.group_image_url)}, ${q(v.group_description)}, ` +
    `${bool(v.group_featured)}, ${bool(v.variant_active)}, ${num(v.opening_stock)}, ` +
    `${num(v.low_stock_threshold)}, NOW(), NOW())`
  );
  L.push(tuples.join(",\r\n"));
  L.push("ON DUPLICATE KEY UPDATE");
  L.push("  name             = VALUES(name),");
  L.push("  package_size     = VALUES(package_size),");
  L.push("  price            = VALUES(price),");
  L.push("  tag              = VALUES(tag),");
  L.push("  image_url        = VALUES(image_url),");
  L.push("  description      = VALUES(description),");
  L.push("  featured         = VALUES(featured),");
  L.push("  low_stock_threshold = VALUES(low_stock_threshold),");
  L.push("  updated_at       = NOW();");
  L.push("");
}

fs.writeFileSync(outPath, L.join("\r\n"), "utf8");
console.log(`Wrote ${outPath}`);
console.log(`  ${rows.length} variants / ${groups.size} groups / ${activeCount} active / ${stockTotal} units`);
