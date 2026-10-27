#!/usr/bin/env node
/*
 * export_production_catalog.cjs
 *
 * Builds rebuild/catalog-active.csv from a restored production dump.
 *
 * Includes:
 *   - every active product
 *   - every inactive canonical product (id starts with 11111111-0001-0001-0001-)
 *
 * Group-level fields are copied from the first active variant so an inactive
 * variant cannot overwrite the storefront image or description.
 *
 * Usage:
 *   node rebuild/export_production_catalog.cjs \
 *     --database asellafs_organic_prod \
 *     --out rebuild/catalog-active.csv
 */

const fs = require("fs");
const path = require("path");

module.paths.unshift(path.resolve(__dirname, "../backend/node_modules"));

const mysql = require("mysql2/promise");
require("dotenv").config({ path: path.resolve(__dirname, "../backend/.env") });

const args = process.argv.slice(2);
function arg(name, fallback = undefined) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}

const database = arg("--database", "asellafs_organic_prod");
const outPath = arg("--out", path.resolve(__dirname, "catalog-active.csv"));
const source = arg("--source", "production_dump_20261026");

const HEADERS = [
  "product_id", "group_name", "group_slug", "group_description",
  "group_image_url", "group_featured", "group_tag", "group_active",
  "variant_name", "package_size", "sku", "price", "unit_cost",
  "opening_stock", "low_stock_threshold", "variant_active",
  "aliases", "source", "verified", "notes",
];

// Search aliases only. These do not change historical order links.
const ALIASES = {
  "Hibscus Dry Leafe": "Hibiscus Dry Leaf|hibiscus Kerkede Leafe|Hibiscus Kerkede Leafe",
  "Kerebe (Myrrh) Oil": "Kerebe (Myrrh ) Oil|Myrrh Kerebe Oil|Myrrh  Kerebe  Oil",
  "Ashewagenda (Himalya) Tablet": "Ashwagandha Tablet (Himalayan)|Ashewagenda (himalya) Tablet",
  "Ashewagenda powder": "Ashwagandha Powder|Ashwegenda Powder|Ashewagenda (300g) powder",
  "Kesil Powder": "Qasil Powder",
  "Asella Kerbe Raw": "Kerbe Raw|myrrh Kerbe Raw",
  "Moringa powder": "Moringa Powder",
  "Blackseed Oil": "Blackseed Oil",
  "Frankincense Oil": "Frankincense Oil",
  "Chia Seed": "Chia Seed",
};

function csv(value) {
  if (value === null || value === undefined) return "";
  return `"${String(value).replace(/"/g, '""')}"`;
}

function parseSize(size) {
  const m = String(size).trim().match(
    /^(\d+(?:\.\d+)?)\s*(g|kg|ml|l|tablet|tablets|capsule|capsules|gummy|gummies|jar|piece|pcs)$/i
  );
  if (!m) return { value: 0, unit: "", sort: 0 };

  const value = Number(m[1]);
  let unit = m[2].toLowerCase();
  if (unit === "tablets") unit = "tablet";
  if (unit === "capsules") unit = "capsule";
  if (unit === "gummy") unit = "gummies";
  if (unit === "pcs") unit = "piece";

  let base = value;
  if (unit === "kg" || unit === "l") base = value * 1000;

  return { value, unit, sort: base };
}

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
         id, name, package_size, price, unit_cost, description, image_url,
         featured, tag, inventory_quantity, low_stock_threshold, active, deleted_at
       FROM products
       WHERE active = 1
          OR id LIKE '11111111-0001-0001-0001-%'
       ORDER BY name, package_size`
    );

    const groups = new Map();
    for (const row of rows) {
      if (!groups.has(row.name)) groups.set(row.name, []);
      groups.get(row.name).push(row);
    }

    const lines = [HEADERS.map(csv).join(",")];
    let activeRows = 0;
    let inactiveRows = 0;
    let zeroCostActive = 0;

    for (const [groupName, variants] of [...groups.entries()].sort((a, b) =>
      a[0].localeCompare(b[0])
    )) {
      variants.sort((a, b) => {
        const sa = parseSize(a.package_size);
        const sb = parseSize(b.package_size);
        if (sa.unit !== sb.unit) return sa.unit.localeCompare(sb.unit);
        return sa.sort - sb.sort;
      });

      const activeVariants = variants.filter((v) => Number(v.active) === 1);
      const primary = activeVariants[0] || variants[0];
      const groupActive = activeVariants.length > 0 ? 1 : 0;
      const groupFeatured = activeVariants.some((v) => Number(v.featured) === 1) ? 1 : 0;
      const groupTag = primary.tag || "";
      const groupDescription = primary.description || "";
      const groupImageUrl = primary.image_url || "";
      const aliases = ALIASES[groupName] || "";

      for (const row of variants) {
        const isActive = Number(row.active) === 1;
        if (isActive) activeRows++;
        else inactiveRows++;

        const unitCost = Number(row.unit_cost || 0);
        const needsCost = isActive && unitCost <= 0;
        if (needsCost) zeroCostActive++;

        const notes = needsCost
          ? "Active but unit_cost=0; confirm real landed cost before production import."
          : isActive
            ? ""
            : "Inactive canonical variant; preserve product_id and keep off storefront.";

        lines.push([
          row.id,
          groupName,
          "",
          groupDescription,
          groupImageUrl,
          groupFeatured,
          groupTag,
          groupActive,
          groupName,
          row.package_size,
          "",
          row.price,
          row.unit_cost,
          row.inventory_quantity,
          row.low_stock_threshold,
          isActive ? 1 : 0,
          aliases,
          source,
          needsCost ? 0 : 1,
          notes,
        ].map(csv).join(","));
      }
    }

    fs.writeFileSync(outPath, lines.join("\r\n") + "\r\n", "utf8");

    console.log(`Wrote ${rows.length} variants in ${groups.size} groups to ${outPath}`);
    console.log(`Active variants: ${activeRows}`);
    console.log(`Inactive canonical variants: ${inactiveRows}`);
    console.log(`Active zero-cost variants: ${zeroCostActive}`);
    console.log(`Database: ${database}`);
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
