#!/usr/bin/env node
/*
 * 04_import_catalog.cjs
 *
 * Imports catalog-active.csv into product_groups + products variants,
 * creates opening-balance inventory movements, and records aliases.
 *
 * Safe defaults:
 *   - dry run unless --apply is passed
 *   - refuses rows with verified <> 1 unless --allow-unverified is passed
 *   - does not touch orders or order_items
 *   - does not delete products
 *
 * Usage:
 *   node rebuild/04_import_catalog.cjs --database asella_organic_v2 \
 *     --csv rebuild/catalog-active.csv
 *
 *   node rebuild/04_import_catalog.cjs --database asella_organic_v2 \
 *     --csv rebuild/catalog-active.csv --apply --reset-ledger
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// Reuse the backend's installed dependencies without duplicating node_modules.
module.paths.unshift(path.resolve(__dirname, "../backend/node_modules"));

const mysql = require("mysql2/promise");

require("dotenv").config({ path: path.resolve(__dirname, "../backend/.env") });

const args = process.argv.slice(2);
function arg(name, fallback = undefined) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : fallback;
}
function flag(name) {
  return args.includes(name);
}

const csvPath = arg("--csv", path.resolve(__dirname, "catalog-active.csv"));
const database = arg("--database", process.env.DB_NAME || "asella_organic_v2");
const apply = flag("--apply");
const allowUnverified = flag("--allow-unverified");
const resetLedger = flag("--reset-ledger");

const REQUIRED_HEADERS = [
  "product_id", "group_name", "group_slug", "group_description",
  "group_image_url", "group_featured", "group_tag", "group_active",
  "variant_name", "package_size", "sku", "price", "unit_cost",
  "opening_stock", "low_stock_threshold", "variant_active",
  "aliases", "source", "verified", "notes",
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((v) => String(v).trim() !== ""));
}

function loadCsv(file) {
  if (!fs.existsSync(file)) {
    throw new Error(`CSV not found: ${file}`);
  }
  const raw = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(raw);
  if (rows.length < 2) throw new Error(`CSV has no data rows: ${file}`);

  const headers = rows[0].map((h) => h.trim());
  const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length) {
    throw new Error(`CSV is missing required columns: ${missing.join(", ")}`);
  }

  return rows.slice(1).map((cells, index) => {
    const obj = {};
    headers.forEach((h, i) => {
      obj[h] = (cells[i] ?? "").trim();
    });
    obj.__row = index + 2;
    return obj;
  });
}

function bool(value, fallback = false) {
  if (value === undefined || value === null || value === "") return fallback;
  const s = String(value).trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "y";
}

function slugify(value) {
  return String(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200) || "product";
}

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function normalizePackageSize(value) {
  return cleanName(value).replace(/(\d)\s+(g|kg|ml|l)\b/gi, "$1$2");
}

function parseSize(size) {
  const m = String(size).trim().match(
    /^(\d+(?:\.\d+)?)\s*(g|kg|ml|l|tablet|tablets|capsule|capsules|gummy|gummies|jar|piece|pcs)$/i
  );
  if (!m) return { value: null, unit: null, sortOrder: 0 };

  const value = Number(m[1]);
  let unit = m[2].toLowerCase();
  if (unit === "tablets") unit = "tablet";
  if (unit === "capsules") unit = "capsule";
  if (unit === "gummy") unit = "gummies";
  if (unit === "pcs") unit = "piece";

  let sortValue = value;
  if (unit === "kg" || unit === "l") sortValue = value * 1000;

  return { value, unit, sortOrder: Math.round(sortValue) };
}

function makeSku(productId, packageSize) {
  const idPart = String(productId).replace(/-/g, "").slice(0, 8).toUpperCase();
  const sizePart = String(packageSize).replace(/[^A-Za-z0-9]+/g, "").toUpperCase();
  return `ASL-${idPart}-${sizePart}`.slice(0, 100);
}

async function main() {
  const rows = loadCsv(csvPath);
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database,
    charset: "utf8mb4_unicode_ci",
  });

  const stats = {
    rows: rows.length,
    groupsCreated: 0,
    groupsUpdated: 0,
    variantsInserted: 0,
    variantsUpdated: 0,
    movements: 0,
    aliases: 0,
    warnings: [],
  };

  try {
    const [tables] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('product_groups','catalog_import','inventory_movements','stock_snapshots')`
    );
    const found = new Set(tables.map((t) => t.TABLE_NAME));
    for (const required of ["product_groups", "catalog_import", "inventory_movements", "stock_snapshots"]) {
      if (!found.has(required)) {
        throw new Error(`Table ${required} is missing. Run rebuild/01_v2_schema.sql first.`);
      }
    }

    await conn.beginTransaction();
    await conn.query(`DELETE FROM catalog_import`);

    const groupCache = new Map();
    const seenVariants = new Map();

    for (const row of rows) {
      const rawGroupName = row.group_name;
      let groupName = cleanName(rawGroupName);
      const rawPackageSize = row.package_size;
      const packageSize = normalizePackageSize(rawPackageSize);
      if (!groupName) throw new Error(`Row ${row.__row}: group_name is empty`);
      if (!packageSize) throw new Error(`Row ${row.__row}: package_size is empty`);

      const verified = bool(row.verified, false);
      if (!verified && !allowUnverified) {
        throw new Error(
          `Row ${row.__row} (${groupName} / ${packageSize}) has verified=0. ` +
          `Correct the production values and set verified=1, or pass --allow-unverified for a local rehearsal.`
        );
      }

      const groupSlug = slugify(row.group_slug || groupName);
      const variantKey = `${groupSlug}|${packageSize.toLowerCase()}`;
      if (seenVariants.has(variantKey)) {
        throw new Error(
          `Rows ${seenVariants.get(variantKey)} and ${row.__row} both define ` +
          `${groupName} / ${packageSize}. Remove the duplicate row.`
        );
      }
      seenVariants.set(variantKey, row.__row);

      if (rawGroupName !== groupName) {
        stats.warnings.push(
          `Row ${row.__row}: group name "${rawGroupName}" normalized to "${groupName}".`
        );
      }
      if (rawPackageSize !== packageSize) {
        stats.warnings.push(
          `Row ${row.__row}: package size "${rawPackageSize}" normalized to "${packageSize}".`
        );
      }

      const price = Number(row.price);
      const unitCost = Number(row.unit_cost || 0);
      const openingStock = Number(row.opening_stock || 0);
      const lowStock = Number(row.low_stock_threshold || 10);

      if (!Number.isFinite(price) || price < 0) {
        throw new Error(`Row ${row.__row}: invalid price "${row.price}"`);
      }
      if (!Number.isFinite(unitCost) || unitCost < 0) {
        throw new Error(`Row ${row.__row}: invalid unit_cost "${row.unit_cost}"`);
      }
      if (!Number.isInteger(openingStock) || openingStock < 0) {
        throw new Error(`Row ${row.__row}: opening_stock must be a non-negative integer`);
      }
      if (!Number.isInteger(lowStock) || lowStock < 0) {
        throw new Error(`Row ${row.__row}: low_stock_threshold must be a non-negative integer`);
      }

      const groupActive = bool(row.group_active, true);
      const variantActive = bool(row.variant_active, true);
      const featured = bool(row.group_featured, false);
      const description = row.group_description || null;
      const imageUrl = row.group_image_url || null;
      const tag = row.group_tag || "";
      const size = parseSize(packageSize);

      // ---- group ----
      let group = groupCache.get(groupSlug);
      if (!group) {
        const [existing] = await conn.query(
          `SELECT id, name, slug FROM product_groups
           WHERE slug = ? OR name = ? LIMIT 2`,
          [groupSlug, groupName]
        );

        if (existing.length > 1 && existing[0].id !== existing[1].id) {
          throw new Error(
            `Row ${row.__row}: group name "${groupName}" and slug "${groupSlug}" ` +
            `point to different existing groups. Fix the CSV.`
          );
        }

        if (existing.length === 1) {
          group = existing[0];
          if (group.name !== groupName) {
            const [nameConflict] = await conn.query(
              `SELECT id FROM product_groups WHERE name = ? AND id <> ? LIMIT 1`,
              [groupName, group.id]
            );
            if (nameConflict.length) {
              throw new Error(`Row ${row.__row}: group name "${groupName}" is already used by another group.`);
            }
            stats.warnings.push(
              `Row ${row.__row}: "${groupName}" shares slug "${groupSlug}" with existing group ` +
              `"${group.name}"; using "${group.name}" as the canonical name.`
            );
            groupName = group.name;
          }

          await conn.query(
            `UPDATE product_groups
             SET name = ?, slug = ?, description = ?, image_url = ?,
                 featured = ?, tag = ?, active = ?, updated_at = NOW()
             WHERE id = ?`,
            [groupName, groupSlug, description, imageUrl, featured ? 1 : 0, tag, groupActive ? 1 : 0, group.id]
          );
          stats.groupsUpdated++;
          group = { ...group, name: groupName, slug: groupSlug };
        } else {
          const id = crypto.randomUUID();
          await conn.query(
            `INSERT INTO product_groups
               (id, name, slug, description, image_url, featured, tag, active)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [id, groupName, groupSlug, description, imageUrl, featured ? 1 : 0, tag, groupActive ? 1 : 0]
          );
          stats.groupsCreated++;
          group = { id, name: groupName, slug: groupSlug };
        }

        groupCache.set(groupSlug, group);
      } else if (group.name !== groupName) {
        stats.warnings.push(
          `Row ${row.__row}: "${groupName}" shares slug "${groupSlug}" with "${group.name}"; ` +
          `using "${group.name}" as the canonical name.`
        );
        groupName = group.name;
      }

      let variantName = cleanName(row.variant_name || groupName);
      if (variantName.toLowerCase() === groupName.toLowerCase()) {
        variantName = groupName;
      }

      // ---- variant ----
      let product = null;
      if (row.product_id) {
        const [byId] = await conn.query(
          `SELECT id, sku FROM products WHERE id = ? LIMIT 1`,
          [row.product_id]
        );
        product = byId[0] || null;
      }

      if (!product) {
        const [byGroupSize] = await conn.query(
          `SELECT id, sku FROM products
           WHERE product_group_id = ?
             AND REPLACE(LOWER(package_size), ' ', '') = REPLACE(LOWER(?), ' ', '')
           LIMIT 2`,
          [group.id, packageSize]
        );
        if (byGroupSize.length > 1) {
          throw new Error(
            `Row ${row.__row}: multiple products already exist for ` +
            `${groupName} / ${packageSize}. Resolve duplicates before importing.`
          );
        }
        product = byGroupSize[0] || null;
      }

      const productId = product?.id || row.product_id || crypto.randomUUID();
      let sku = row.sku || makeSku(productId, packageSize);

      // Ensure SKU uniqueness without overwriting another product.
      let suffix = 0;
      let candidate = sku;
      while (true) {
        const [dup] = await conn.query(
          `SELECT id FROM products WHERE sku = ? AND id <> ? LIMIT 1`,
          [candidate, productId]
        );
        if (!dup.length) break;
        suffix++;
        candidate = `${sku}-${suffix}`.slice(0, 100);
        if (suffix > 50) throw new Error(`Row ${row.__row}: cannot generate a unique SKU`);
      }
      sku = candidate;

      if (product) {
        await conn.query(
          `UPDATE products SET
             product_group_id = ?, name = ?, package_size = ?, sku = ?,
             size_value = ?, size_unit = ?, sort_order = ?,
             price = ?, unit_cost = ?, description = ?, image_url = ?,
             featured = ?, tag = ?, inventory_quantity = ?,
             low_stock_threshold = ?, active = ?, deleted_at = NULL, updated_at = NOW()
           WHERE id = ?`,
          [
            group.id, variantName, packageSize, sku,
            size.value, size.unit, size.sortOrder,
            price, unitCost, description, imageUrl,
            featured ? 1 : 0, tag, openingStock,
            lowStock, variantActive ? 1 : 0,
            productId,
          ]
        );
        stats.variantsUpdated++;
      } else {
        await conn.query(
          `INSERT INTO products
             (id, product_group_id, name, package_size, sku,
              size_value, size_unit, sort_order, price, unit_cost,
              description, image_url, featured, tag, inventory_quantity,
              low_stock_threshold, active, deleted_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
          [
            productId, group.id, variantName, packageSize, sku,
            size.value, size.unit, size.sortOrder, price, unitCost,
            description, imageUrl, featured ? 1 : 0, tag, openingStock,
            lowStock, variantActive ? 1 : 0,
          ]
        );
        stats.variantsInserted++;
      }

      // ---- opening ledger ----
      if (resetLedger) {
        await conn.query(`DELETE FROM inventory_movements WHERE product_id = ?`, [productId]);
        await conn.query(`DELETE FROM stock_snapshots WHERE product_id = ?`, [productId]);
      }

      const [existingOpening] = await conn.query(
        `SELECT id FROM inventory_movements
         WHERE product_id = ? AND reference_id = 'rebuild-v2'
         LIMIT 1`,
        [productId]
      );

      if (!existingOpening.length) {
        await conn.query(
          `INSERT INTO inventory_movements
             (id, product_id, movement_type, change_amount, reason,
              performed_by, quantity_after, notes, reference_id, reference_type)
           VALUES (?, ?, 'initial_stock', ?, 'Opening balance - clean rebuild',
                   NULL, ?, 'Created by rebuild import', 'rebuild-v2', 'manual')`,
          [crypto.randomUUID(), productId, openingStock, openingStock]
        );
        stats.movements++;
      }

      await conn.query(
        `INSERT INTO stock_snapshots (product_id, current_quantity, last_updated)
         VALUES (?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           current_quantity = VALUES(current_quantity),
           last_updated = NOW()`,
        [productId, openingStock]
      );

      // ---- aliases ----
      const aliases = String(row.aliases || "")
        .split("|")
        .map((a) => a.trim())
        .filter(Boolean);

      for (const alias of aliases) {
        await conn.query(
          `INSERT IGNORE INTO product_aliases
             (id, product_group_id, alias, alias_type)
           VALUES (?, ?, ?, 'legacy_name')`,
          [crypto.randomUUID(), group.id, alias]
        );
        const [aliasRows] = await conn.query(
          `SELECT product_group_id FROM product_aliases
           WHERE alias = ? AND alias_type = 'legacy_name' LIMIT 1`,
          [alias]
        );
        if (aliasRows.length && aliasRows[0].product_group_id !== group.id) {
          stats.warnings.push(
            `Alias "${alias}" already belongs to group ${aliasRows[0].product_group_id}; ` +
            `it was not reassigned to ${groupName}.`
          );
        } else {
          stats.aliases++;
        }
      }

      // ---- audit row ----
      await conn.query(
        `INSERT INTO catalog_import
           (product_id, group_name, group_slug, group_description, group_image_url,
            group_featured, group_tag, group_active, variant_name, package_size,
            sku, price, unit_cost, opening_stock, low_stock_threshold,
            variant_active, aliases, source, verified, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          productId, groupName, groupSlug, description, imageUrl,
          featured ? 1 : 0, tag, groupActive ? 1 : 0, variantName, packageSize,
          sku, price, unitCost, openingStock, lowStock,
          variantActive ? 1 : 0, row.aliases || null, row.source || null,
          verified ? 1 : 0, row.notes || null,
        ]
      );
    }

    if (apply) {
      await conn.commit();
    } else {
      await conn.rollback();
    }

    console.log(apply ? "APPLIED" : "DRY RUN (rolled back)");
    console.log(JSON.stringify(stats, null, 2));
    if (stats.warnings.length) {
      console.log("\nWarnings:");
      for (const warning of stats.warnings) console.log(`- ${warning}`);
    }
    console.log(`\nDatabase: ${database}`);
    console.log(`CSV: ${csvPath}`);
  } catch (err) {
    try { await conn.rollback(); } catch {}
    throw err;
  } finally {
    await conn.end();
  }
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
