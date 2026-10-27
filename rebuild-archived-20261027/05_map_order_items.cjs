#!/usr/bin/env node
/*
 * 05_map_order_items.cjs
 *
 * Applies catalog-legacy-decisions.csv to legacy_sku_map and, for
 * decision=MAP rows only, repoints order_items to the correct variant.
 *
 * It never changes item_name, package_size, quantity, unit_price,
 * unit_cost, orders.total, or any historical snapshot.
 *
 * Usage:
 *   node rebuild/05_map_order_items.cjs --database asella_organic_v2 \
 *     --csv rebuild/catalog-legacy-decisions.csv
 *
 *   node rebuild/05_map_order_items.cjs --database asella_organic_v2 \
 *     --csv rebuild/catalog-legacy-decisions.csv --apply
 *
 *   node rebuild/05_map_order_items.cjs --database asella_organic_v2 \
 *     --csv rebuild/catalog-legacy-decisions.csv --apply --clear-orphans
 *
 * --clear-orphans nulls order_items.product_id when it points at a product
 * row that no longer exists. It never changes item_name, package_size,
 * quantity, unit_price, unit_cost, orders.total, or any snapshot field.
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
function flag(name) {
  return args.includes(name);
}

const csvPath = arg("--csv", path.resolve(__dirname, "catalog-legacy-decisions.csv"));
const database = arg("--database", process.env.DB_NAME || "asella_organic_v2");
const apply = flag("--apply");
const clearOrphans = flag("--clear-orphans");

const REQUIRED_HEADERS = [
  "legacy_name", "legacy_size", "items", "null_pid", "active_pid", "inactive_pid",
  "proposed_group", "proposed_size", "decision", "match_type", "confidence", "notes",
];

const ALLOWED_DECISIONS = new Set(["MAP", "REVIEW", "LEAVE_NULL", "NO_ACTION"]);
const ALLOWED_MATCH_TYPES = new Set([
  "exact", "normalized", "rename", "size_substitution",
  "manual", "ambiguous", "discontinued", "custom", "unmapped",
]);
const ALLOWED_CONFIDENCE = new Set(["high", "medium", "low"]);

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

async function resolveProduct(conn, groupName, packageSize) {
  if (!groupName || !packageSize) return null;

  // Try active products first, then fall back to inactive variants so that
  // historical order lines can still be linked to their matching product
  // (even if that variant is no longer sold).
  for (const activeOnly of [true, false]) {
    const [exact] = await conn.query(
      `SELECT p.id, p.package_size, g.name AS group_name, p.active
       FROM products p
       JOIN product_groups g ON g.id = p.product_group_id
       WHERE g.name = ? AND p.package_size = ? AND p.active = ?
       LIMIT 2`,
      [groupName, packageSize, activeOnly ? 1 : 0]
    );
    if (exact.length === 1) return exact[0];
    if (exact.length > 1) return { error: "multiple exact variants" };

    const [normalized] = await conn.query(
      `SELECT p.id, p.package_size, g.name AS group_name, p.active
       FROM products p
       JOIN product_groups g ON g.id = p.product_group_id
       WHERE g.name = ?
         AND REPLACE(LOWER(p.package_size), ' ', '') = REPLACE(LOWER(?), ' ', '')
         AND p.active = ?
       LIMIT 2`,
      [groupName, packageSize, activeOnly ? 1 : 0]
    );
    if (normalized.length === 1) return normalized[0];
    if (normalized.length > 1) return { error: "multiple normalized variants" };
  }

  return null;
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
    mapRows: 0,
    reviewRows: 0,
    leaveNullRows: 0,
    noActionRows: 0,
    mappedItems: 0,
    fallbackMapped: 0,
    unresolvedMapRows: 0,
    auditRows: 0,
    recomputedTotals: 0,
    orphanProductIds: 0,
    orphanItems: 0,
    orphanItemsCleared: 0,
    warnings: [],
  };

  try {
    const [tables] = await conn.query(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('legacy_sku_map','order_total_audit','product_groups')`
    );
    const found = new Set(tables.map((t) => t.TABLE_NAME));
    for (const required of ["legacy_sku_map", "order_total_audit", "product_groups"]) {
      if (!found.has(required)) {
        throw new Error(`Table ${required} is missing. Run rebuild/01_v2_schema.sql first.`);
      }
    }

    await conn.beginTransaction();

    for (const row of rows) {
      const decision = (row.decision || "REVIEW").toUpperCase();
      const matchType = (row.match_type || "ambiguous").toLowerCase();
      const confidence = (row.confidence || "low").toLowerCase();

      if (!ALLOWED_DECISIONS.has(decision)) {
        throw new Error(`Row ${row.__row}: invalid decision "${row.decision}"`);
      }
      if (!ALLOWED_MATCH_TYPES.has(matchType)) {
        throw new Error(`Row ${row.__row}: invalid match_type "${row.match_type}"`);
      }
      if (!ALLOWED_CONFIDENCE.has(confidence)) {
        throw new Error(`Row ${row.__row}: invalid confidence "${row.confidence}"`);
      }

      let target = null;
      if (decision !== "LEAVE_NULL" && row.proposed_group && row.proposed_size) {
        target = await resolveProduct(conn, row.proposed_group, row.proposed_size);
        if (target?.error) {
          stats.warnings.push(
            `Row ${row.__row} (${row.legacy_name} / ${row.legacy_size}): ` +
            `${target.error} for ${row.proposed_group} / ${row.proposed_size}`
          );
          target = null;
        }
      }

      if (decision === "MAP" && !target) {
        stats.unresolvedMapRows++;
        stats.warnings.push(
          `Row ${row.__row} (${row.legacy_name} / ${row.legacy_size}) is MAP but ` +
          `no active variant was found for ${row.proposed_group || "(blank)"} / ${row.proposed_size || "(blank)"}.`
        );
      }

      await conn.query(
        `INSERT INTO legacy_sku_map
           (legacy_name, legacy_size, target_product_id, target_group_name,
            target_package_size, decision, match_type, confidence, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           target_product_id = VALUES(target_product_id),
           target_group_name = VALUES(target_group_name),
           target_package_size = VALUES(target_package_size),
           decision = VALUES(decision),
           match_type = VALUES(match_type),
           confidence = VALUES(confidence),
           notes = VALUES(notes)`,
        [
          row.legacy_name,
          row.legacy_size,
          target?.id || null,
          row.proposed_group || null,
          row.proposed_size || null,
          decision,
          matchType,
          confidence,
          row.notes || null,
        ]
      );

      if (decision === "MAP") {
        stats.mapRows++;
        if (target) {
          const note = `legacy_sku_map: ${matchType} / ${confidence}${row.notes ? ` / ${row.notes}` : ""}`.slice(0, 255);
          const [result] = await conn.query(
            `UPDATE order_items oi
             LEFT JOIN products cur
               ON cur.id = oi.product_id AND cur.active = 1
             SET oi.product_id = ?,
                 oi.product_match_type = ?,
                 oi.product_match_confidence = ?,
                 oi.product_match_note = ?
             WHERE oi.item_name = ?
               AND oi.package_size = ?
               AND cur.id IS NULL`,
            [target.id, matchType, confidence, note, row.legacy_name, row.legacy_size]
          );
          stats.mappedItems += result.affectedRows || 0;
        }
      } else if (decision === "REVIEW") {
        stats.reviewRows++;
      } else if (decision === "LEAVE_NULL") {
        stats.leaveNullRows++;
      } else {
        stats.noActionRows++;
      }
    }

    // Name+size fallback: any order item still without a product_id but with
    // item_name + package_size present can be matched directly to a product.
    // Active variants preferred; fall back to inactive for historical accuracy.
    const [unmappedDistinct] = await conn.query(
      `SELECT DISTINCT oi.item_name, oi.package_size
       FROM order_items oi
       WHERE oi.product_id IS NULL
       ORDER BY oi.item_name, oi.package_size`
    );

    let fallbackMapped = 0;
    for (const { item_name, package_size } of unmappedDistinct) {
      if (!item_name || !package_size) continue;

      let target = null;
      for (const activeOnly of [true, false]) {
        const [rows] = await conn.query(
          `SELECT id, active FROM products
           WHERE LOWER(name) = LOWER(?) AND package_size = ? AND active = ?
           LIMIT 2`,
          [item_name, package_size, activeOnly ? 1 : 0]
        );
        if (rows.length === 1) { target = rows[0]; break; }
        if (rows.length > 1) {
          stats.warnings.push(
            `Fallback: multiple variants for "${item_name}" / "${package_size}" ` +
            `(active=${activeOnly}), skipping.`
          );
          target = null;
          break;
        }
      }

      if (target) {
        const note = `fallback name+size match / ${target.active ? 'high' : 'medium'}`.slice(0, 255);
        const [result] = await conn.query(
          `UPDATE order_items oi
           LEFT JOIN products cur
             ON cur.id = oi.product_id AND cur.active = 1
           SET oi.product_id = ?,
               oi.product_match_type = 'fallback',
               oi.product_match_confidence = ?,
               oi.product_match_note = ?
           WHERE oi.item_name = ?
             AND oi.package_size = ?
             AND oi.product_id IS NULL`,
          [target.id, target.active ? 'high' : 'medium', note, item_name, package_size]
        );
        fallbackMapped += result.affectedRows || 0;
        stats.mappedItems += result.affectedRows || 0;
      }
    }
    stats.fallbackMapped = fallbackMapped;

    // Record order-total mismatches and recompute where accounting math is wrong.
    // orders.total is set to the sum of line items (quantity × unit_price)
    // whenever it differs; audit rows are marked 'applied'.
    const [recomputeResult] = await conn.query(
      `UPDATE orders o
       JOIN (
         SELECT oi.order_id, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS line_total
         FROM order_items oi
         GROUP BY oi.order_id
       ) lt ON o.id = lt.order_id
       SET o.total = lt.line_total, o.updated_at = NOW()
       WHERE ABS(o.total - lt.line_total) > 0.01`
    );
    stats.recomputedTotals = recomputeResult.affectedRows || 0;

    // Record order-total mismatches in the audit table.
    const [auditResult] = await conn.query(
      `INSERT INTO order_total_audit
         (id, order_id, old_total, line_total, status, reason)
       SELECT UUID(), x.id, x.total, x.line_total,
              IF(ABS(x.total - x.line_total) > 0.01, 'applied', 'open'),
              'Recomputed from line items (quantity × unit_price)'
       FROM (
         SELECT o.id, o.total,
                ROUND(SUM(oi.quantity * oi.unit_price), 2) AS line_total
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         GROUP BY o.id, o.total
       ) x
       ON DUPLICATE KEY UPDATE
         old_total = VALUES(old_total),
         line_total = VALUES(line_total),
         status = VALUES(status)`
    );
    stats.auditRows = auditResult.affectedRows || 0;

    // Historical order items may point at product ids that were deleted from
    // products (legacy pr0000... rows). Snapshot fields stay untouched;
    // --clear-orphans only nulls the dangling product_id and records why, so
    // the order_items.product_id foreign key can be added safely afterwards.
    const [orphanGroups] = await conn.query(
      `SELECT oi.product_id,
              COUNT(*) AS items,
              MIN(oi.item_name) AS sample_name,
              MIN(oi.package_size) AS sample_size
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id
       WHERE oi.product_id IS NOT NULL AND p.id IS NULL
       GROUP BY oi.product_id
       ORDER BY items DESC, oi.product_id`
    );
    stats.orphanProductIds = orphanGroups.length;
    stats.orphanItems = orphanGroups.reduce((sum, g) => sum + Number(g.items), 0);

    if (stats.orphanItems > 0) {
      if (clearOrphans) {
        const [orphanResult] = await conn.query(
          `UPDATE order_items oi
           LEFT JOIN products p ON p.id = oi.product_id
           SET oi.product_id = NULL,
               oi.product_match_type = COALESCE(oi.product_match_type, 'unmapped'),
               oi.product_match_confidence = COALESCE(oi.product_match_confidence, 'low'),
               oi.product_match_note = LEFT(
                 CONCAT(
                   'Orphaned product_id cleared during v2 migration',
                   IF(oi.product_match_note IS NULL OR oi.product_match_note = '',
                      '',
                      CONCAT('; ', oi.product_match_note))
                 ),
                 255
               )
           WHERE oi.product_id IS NOT NULL AND p.id IS NULL`
        );
        stats.orphanItemsCleared = orphanResult.affectedRows || 0;
      } else {
        const detail = orphanGroups
          .map((g) => `${g.product_id} (${g.sample_name} / ${g.sample_size}, ${g.items} items)`)
          .join("; ");
        stats.warnings.push(
          `${stats.orphanItems} order items reference ${stats.orphanProductIds} missing product id(s): ${detail}. ` +
          "Re-run with --clear-orphans to null the dangling product_id (snapshot fields are not changed)."
        );
      }
    }

    const [remaining] = await conn.query(
      `SELECT COUNT(*) AS remaining
       FROM order_items oi
       LEFT JOIN products p ON p.id = oi.product_id AND p.active = 1
       WHERE p.id IS NULL`
    );
    const [mapSummary] = await conn.query(
      `SELECT decision, COUNT(*) AS rows_count
       FROM legacy_sku_map
       GROUP BY decision
       ORDER BY decision`
    );

    if (apply) {
      await conn.commit();
    } else {
      await conn.rollback();
    }

    console.log(apply ? "APPLIED" : "DRY RUN (rolled back)");
    console.log(JSON.stringify(stats, null, 2));
    console.log(`Remaining order items without an active variant: ${remaining[0].remaining}`);
    console.log(
      `Orphan order items: ${stats.orphanItems} found, ` +
      `${stats.orphanItemsCleared} ${apply ? "cleared" : "would be cleared (dry run)"}`
    );
    console.log("Legacy map decisions:");
    for (const r of mapSummary) console.log(`  ${r.decision}: ${r.rows_count}`);

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
