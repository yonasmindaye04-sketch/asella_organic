# Asella Organic - Clean Catalog & Database Rebuild Plan

**Status:** Rehearsed locally; schema migrated into `backend/db/sql/` (migrations 035–043), scripts moved to `backend/scripts/data-migrations/`, validation in `backend/tests/db-validation/`  
**Date:** 2026-10-27  
**Goal:** Replace the current inconsistent catalog/order data with a clean product-group + variant model, preserve historical orders, and keep the old database as a rollback.

---

## Where everything now lives

| Concern | Location |
|---------|----------|
| Schema migrations (035–043) | `backend/db/sql/035_v2_product_groups.sql` through `043_v2_views.sql` |
| Catalog import script | `backend/scripts/data-migrations/import-catalog.cjs` |
| Order-item mapping script | `backend/scripts/data-migrations/map-order-items.cjs` |
| Catalog CSV | `backend/data/catalog-active.csv` |
| Legacy decisions CSV | `backend/data/catalog-legacy-decisions.csv` |
| Validation queries | `backend/tests/db-validation/06_validate.sql` |
| Application code (grouped endpoint, groups, inventory resolver) | `backend/src/` (already applied, uncommitted) |
| Superseded rebuild folder | `rebuild/` (kept for reference only) |

---

## Rehearsal status (2026-10-26)

The real production dump (`asellafs_organic (1).sql`, generated 2026-10-26) was restored into the local database `asellafs_organic_v2` and the full rebuild was rehearsed against it:

- 47 production tables/views, 2 triggers, and 39 foreign keys imported; the v2 schema adds 5 tables and 5 FKs, for **52 objects** and **44 FKs**.
- 65 products: **26 active**, **7 inactive canonical**, and 32 legacy `pr0000...` rows.
- **980 active units**; stock ledger drift **0**; stock snapshot mismatches **0**.
- Inventory ledger: **53 movements** in v2 (33 `initial_stock`, 16 `sale`, 4 `adjustment`). `--reset-ledger` intentionally replaced the **1,504 historical movements** for the 26 rebuilt active variants with opening balances; the full movement history stays in `asellafs_organic`.
- **23 product groups**, **33 variants** (26 active, 7 inactive canonical), **20 active groups**.
- **1,183 orders** and **1,981 order items** preserved.
- **752 order items** remapped by **45 `MAP` decisions**; **0 unresolved `MAP` rows**.
- **306 order items** remain unlinked, exactly the **26 `REVIEW` rows (293 items)** plus the **6 `LEAVE_NULL` rows (13 items)**.
- **35 orphan items** (Turmeric 15, Qasil 20) pointed at deleted legacy IDs; `map-order-items.cjs --clear-orphans` nulled them, then `042_v2_order_item_fk.sql` added the `order_items.product_id` FK with `ON DELETE SET NULL`.
- **137 orders** recorded in `order_total_audit`; all still `open`, no totals changed.
- **0** snapshot mismatches and **0** order-total changes versus the production dump.
- The four application views (`vw_affiliate_dashboard`, `vw_customer_insights`, `vw_inventory_summary`, `vw_low_stock`) were recreated from the production migrations; `vw_customer_insights` returns **1,022** rows. The phpMyAdmin dump had exported them as empty stand-in tables.
- One zero-cost active variant remains: **`Hibscus Dry Leafe / 400g`** (17 units, `unit_cost = 0`).
- 23 orders have no order items; this is historical data, not a rebuild failure.

**Nothing in this rehearsal touched production or the existing local `asella_organic` database.**

---

## Migration sequence (host cutover)

Apply in order on the host database `asellafs_organic_v2`:

1. `backend/db/sql/035_v2_product_groups.sql` — product_groups table + variant columns
2. `backend/db/sql/036_v2_product_aliases.sql` — product_aliases table
3. `backend/db/sql/037_v2_legacy_sku_map.sql` — legacy_sku_map table
4. `backend/db/sql/038_v2_order_item_columns.sql` — order-item mapping columns
5. `backend/db/sql/039_v2_order_total_audit.sql` — order_total_audit table
6. `backend/db/sql/040_v2_catalog_import.sql` — catalog_import table
7. `backend/scripts/data-migrations/import-catalog.cjs --apply --reset-ledger` — import catalog + opening stock
8. `backend/db/sql/041_v2_unique_active_variant.sql` — partial unique index + guards
9. `backend/scripts/data-migrations/map-order-items.cjs --apply --clear-orphans` — map history + audit totals
10. `backend/db/sql/042_v2_order_item_fk.sql` — order_items.product_id FK
11. `backend/db/sql/043_v2_views.sql` — recreate the 4 application views
12. `backend/tests/db-validation/06_validate.sql` — validate all checks pass

---

## Business decisions still required

### Legacy `REVIEW` rows (26 rows, 293 items)

Change `decision` from `REVIEW` to `MAP` only after the business confirms. Change it to
`LEAVE_NULL` if the item should stay unlinked.

Pending confirmations:
- None — all 4 former REVIEW size-substitution rows (Pumpkin Seed 100g, Ashwagandha Powder 250g/100g/220g) are now LEAVE_NULL. Sizes are kept as-is; no substitutions are applied.

### Zero-cost variant

- `Hibscus Dry Leafe / 400g` is active with `unit_cost = 0`. Supply the real landed cost,
  set `verified = 1`, and re-export the catalog before the production import. Do not use
  `--allow-unverified` as a workaround.

### Order totals

- 83 smeared orders, 53 line-total-high, 1 order-total-high (137 total).
- No total has been changed until line prices are validated.

---

## Guardrails (unchanged)

- **Do not run `026_repair_catalog.sql`.** It was written for a different dataset.
- **Do not delete the old `pr0000...` products.** They are historical references.
- **Do not update `orders.total`** until the line prices have been reviewed.
- **Do not import the local synthetic data into production.**
- Keep `asellafs_organic` untouched and read-only after the final backup until the new database is signed off.

---

## 1. Why rebuild instead of patching

Current production audit:

- **26 active products**, **980 units**, 1 zero-cost product (`Hibscus Dry Leafe / 400g`).
- **1,981 order items**:
  - 398 have `product_id = NULL`
  - 660 point to inactive `pr0000...` products
  - 923 point to active products
- **667 order items (33.7%)** fail the current name/size join.
- **137 orders** have order-total vs line-total mismatches: **83 smeared**, **53 line-total-high**, **1 order-total-high**.
- **35 order items** point at two product IDs that do not exist in `products` (`...014` Turmeric, 15 items; `...017` Qasil, 20 items).
- Stock ledger drift is **0**, so product quantities match recorded movements. The problem is sales linkage and order totals, not random stock corruption.
- You mentioned `026_repair_catalog.sql` was applied earlier. The production `migrations_log` has no row for 026 (nor 006 or 018), and the current data does **not** reflect 026's expected end state:
  - 980 units instead of 2,057
  - 26 active products instead of 31
  - varied unit costs (roughly 48–97% of price) instead of flat `price * 0.55`
  - 137 order totals still wrong

That means the current database's provenance is unclear. Patching it again would preserve hidden inconsistencies. A clean rebuild from a verified catalog and controlled import is safer.

**Decision: do not run 026 again. Build a new database.**

---

## 2. Target model

### Recommended: `product_groups` + `products` (variants)

- `product_groups` = the product the customer sees, e.g. **Moringa Powder**.
- `products` = one row per variant/SKU, e.g. **200g, 500g, 1kg**.
- Existing foreign keys to `products.id` stay valid:
  - `order_items.product_id`
  - `inventory_movements.product_id`
  - `stock_requests.product_id`
  - `vendor_orders.product_id`
  - `stock_snapshots.product_id`
- The existing `/api/products/grouped` endpoint can group by `product_group_id` instead of regex/name normalization.
- The frontend already expects `{ name, variants: [...] }`; keep that shape and add `product_group_id` and `slug`.

Schema:

```sql
CREATE TABLE product_groups (
  id          CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  name        VARCHAR(255) NOT NULL,
  slug        VARCHAR(255) NOT NULL UNIQUE,
  description TEXT NULL,
  tag         VARCHAR(100) DEFAULT '',
  image_url   TEXT NULL,
  featured    BOOLEAN DEFAULT FALSE,
  active      BOOLEAN DEFAULT TRUE,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

ALTER TABLE products
  ADD COLUMN product_group_id CHAR(36) NULL AFTER id,
  ADD COLUMN sku VARCHAR(100) NULL AFTER package_size,
  ADD CONSTRAINT fk_products_group
    FOREIGN KEY (product_group_id) REFERENCES product_groups(id)
    ON DELETE RESTRICT;

CREATE INDEX idx_products_group ON products(product_group_id);

-- Partial unique index: one active variant per (group, size)
ALTER TABLE products
  ADD COLUMN active_unique TINYINT AS (IF(active = 1, 1, NULL)) VIRTUAL;
ALTER TABLE products
  ADD UNIQUE INDEX idx_unique_variant
    (product_group_id, package_size, active_unique);
```

Optional alias table for legacy names/search:

```sql
CREATE TABLE product_aliases (
  id               CHAR(36) PRIMARY KEY DEFAULT (UUID()),
  product_group_id CHAR(36) NOT NULL,
  alias            VARCHAR(255) NOT NULL,
  alias_type       ENUM('legacy_name','search','synonym') DEFAULT 'legacy_name',
  UNIQUE KEY uq_alias (alias, alias_type),
  FOREIGN KEY (product_group_id) REFERENCES product_groups(id) ON DELETE CASCADE
);
```

### Alternative: `products` + `product_variants`

Cleaner naming, but requires rewriting every foreign key and code path. Defer unless you want a full rename now.

---

## 3. Data policy

- Historical `order_items` keep `item_name`, `package_size`, `quantity`, `unit_price`, and `unit_cost` as snapshots.
- Set `order_items.product_id` only when the legacy item maps unambiguously to a variant.
- Ambiguous or discontinued items:
  - leave `product_id = NULL`, or
  - link to an inactive “Legacy / Discontinued” variant, and flag the mapping status.
- Do not rewrite historical `unit_price` or `orders.total` without approval. Keep an audit table of any reconstructed values.
- Opening stock = physical count. Create `initial_stock` movements so the ledger starts consistent.
- Unit cost = real landed cost, not `price * 0.55`.
- Preserve old `pr0000...` products as inactive legacy variants if needed for foreign-key history. Do not delete them until all history is remapped and validated.

---

## 4. Phases

### Phase 0 — Freeze and back up

- Put the app in maintenance mode or pause writes.
- Full `mysqldump` of schema, data, triggers, and routines.
- Export CSVs of `products`, `order_items`, `orders`, `inventory_movements`, `stock_requests`, `vendor_orders`, `stock_snapshots`, and `customers`.
- Restore the dump into a scratch database and verify row counts.
- Record checksums.

### Phase 1 — Canonical catalog

- Fill `catalog-active-template.csv`.
- Fill `catalog-legacy-decisions.csv`.
- Decide canonical names, variants, discontinued items, and size substitutions.
- This catalog is the source of truth for the new database.

### Phase 2 — New database

- Create `asellafs_organic_v2` on the host.
- Use the production schema dump as the baseline to preserve manual columns and indexes, then apply the `product_groups` changes.
- Alternative: build from migrations `001`–`033`, excluding `004`, `006`, `026`, `027`–`029`, `031`, `032`, then compare the schema to production.
- Do not point the app at it yet.

### Phase 3 — Catalog and opening stock

- Insert `product_groups`.
- Insert `products` variants. Keep the current product IDs for existing variants where possible.
- Set `price`, `unit_cost`, `inventory_quantity`, `low_stock_threshold`, and `active`.
- Create an `initial_stock` movement for each variant:
  - `change_amount = opening quantity`
  - `quantity_after = opening quantity`
  - `reason = 'Opening balance - clean rebuild'`
- Validate:
  - every active variant has a group;
  - no duplicate `(group, size)`;
  - ledger equals stock.

### Phase 4 — History and mapping

- Import customers, orders, order_items, payments, status history, delivery assignments, audit log, staff, and affiliates.
- Map order items:
  - exact variant match → set `product_id`;
  - alias/rename → set `product_id`;
  - ambiguous/discontinued → leave `NULL` or link to an inactive legacy variant and flag.
- Preserve original order totals. Create `order_total_audit` for mismatches.
- Import inventory movements with mapped variant IDs.

### Phase 5 — Validation

- Row counts match source, except intentionally excluded fixtures.
- No orphan foreign keys.
- Every active variant has a group and a unique size.
- Stock ledger drift = 0.
- Report order-item linkage counts and remaining NULLs.
- Report order-total mismatch counts.
- Check zero-price and zero-cost variants.
- Run app smoke tests.

### Phase 6 — Code changes

- `/api/products/grouped`: group by `product_group_id`; remove name regex and hardcoded corrections.
- Product detail/storefront: use group + variants.
- Order creation: store variant ID plus snapshot name/size/price/cost.
- `inventory.ts`: `product_id` first; no name/size join; fail or log unresolved items.
- `restoreOrderStock`: reverse movements by `reference_id`.
- `stock.ts`: require variant ID; use `finalQty`.
- Frontend: key selections by group ID, not product name.
- Admin: manage groups and variants.

### Phase 7 — Staging test

- Point a staging backend at the new database.
- Test login, catalog, grouped products, order create/deliver/cancel, stock request, adjustment, and reports.
- Compare key reports old vs new.

### Phase 8 — Cutover

- Maintenance mode.
- Final backup.
- Delta sync orders created since the copy.
- Switch `DB_NAME` to the new database.
- Restart backend.
- Smoke test.
- Keep the old database read-only for rollback.

### Phase 9 — Rollback

- Revert `DB_NAME` to the old database.
- Restart.
- Investigate offline.

---

## 5. Business decisions needed

### Size substitutions and inactive variants

Do **not** map a different size or an inactive variant automatically. Confirm each:

- Pumpkin Seed 100g (26 items) → Pumpkin Seed 300g?
- Ashwagandha Powder 100g / 220g / 250g (15 items) → Ashewagenda Powder 300g?
- Blackseed Oil 30ml / 30 ml (15 items) → inactive Blackseed Oil 30ml, or 250ml?
- Ashwagandha Tablet 120 capsules / 120 Tablet (18 items) → inactive 120 Tablet, or 60 Tablet?
- Frankincense Oil 60ml (2 items) → inactive 60ml, or 30ml?
- Moringa Seed 200g / 500g (5 items) → keep linked to the inactive canonical variants?
- Shilajit Gummies 30 Gummies (3 items) → keep linked to the inactive canonical variant?

### Discontinued / unlinked products

Confirm whether to keep as inactive legacy variants or leave unlinked:

- Moringa Seed 200g / 500g (inactive canonical variants)
- Shilajit Gummies 30 Gummies (inactive canonical variant)
- Shilajit Jel 20g (inactive canonical variant)
- Himalayan Shilajit Jell 1 jar (20g)
- Shilajit Oil 30ml
- Turmeric Powder 200g / trumeric (Erde) 200g (no target)
- Custom Item / Standard

### Renames

- Qasil Powder → Kesil Powder?
- Turmeric Powder → Erde?
- Hibiscus Dry Leafe → Hibiscus Dry Leaf?
- Kerkede Leafe → Hibscus Dry Leafe (is Kerkede = Hibiscus?)
- Ashewagenda → Ashwagandha?
- Kerbe Raw / myrrh Kerbe Raw → Asella Kerbe Raw?

### Orphan cleanup

- 35 order items pointed at deleted product IDs (Turmeric 15, Qasil 20). The rehearsal nulled `product_id` and recorded `product_match_type = 'unmapped'`; confirm this is acceptable. Snapshot fields were not changed.

### Zero-cost variant

- `Hibscus Dry Leafe / 400g` is active with 17 units and `unit_cost = 0`. Supply the real landed cost before the production import. The production import must **not** use `--allow-unverified` for this row.

### Order totals

- 83 smeared orders, 53 line-total-high, 1 order-total-high (137 total).
- For the smeared orders: reconstruct line prices from the catalog, or leave historical values and flag them?
- `ORD-20260526-0001`: is the correct total **110,250** or **2,900**? The order has one line at 2,900.

---

## 6. Validation queries for the new database

```sql
-- Stock ledger drift
SELECT *
FROM (
  SELECT
    p.id, p.name, p.package_size,
    p.inventory_quantity AS current_qty,
    COALESCE(SUM(m.change_amount), 0) AS ledger_qty,
    p.inventory_quantity - COALESCE(SUM(m.change_amount), 0) AS drift
  FROM products p
  LEFT JOIN inventory_movements m ON m.product_id = p.id
  WHERE p.active = 1
  GROUP BY p.id, p.name, p.package_size, p.inventory_quantity
) x
WHERE x.drift <> 0
ORDER BY ABS(x.drift) DESC;

-- Active variants without a group
SELECT id, name, package_size
FROM products
WHERE active = 1 AND product_group_id IS NULL;

-- Duplicate active variants per group/size
SELECT product_group_id, package_size, COUNT(*) AS c
FROM products
WHERE active = 1
GROUP BY product_group_id, package_size
HAVING c > 1;

-- Order items not linked to an active variant
SELECT oi.item_name, oi.package_size, COUNT(*) AS items
FROM order_items oi
LEFT JOIN products p ON p.id = oi.product_id AND p.active = 1
WHERE p.id IS NULL
GROUP BY oi.item_name, oi.package_size
ORDER BY items DESC;

-- Order total mismatches
SELECT COUNT(*) AS mismatched_orders
FROM (
  SELECT o.id
  FROM orders o
  JOIN order_items oi ON oi.order_id = o.id
  GROUP BY o.id, o.total
  HAVING ABS(o.total - SUM(oi.quantity * oi.unit_price)) > 0.01
) x;

-- Zero-cost active variants
SELECT id, name, package_size, price, unit_cost
FROM products
WHERE active = 1 AND unit_cost = 0;
```

---

## 7. Immediate next actions

1. Approve the rehearsed schema (`product_groups` + `products`) and the mapping policy.
2. Confirm the business decisions above, especially:
   - the 26 `REVIEW` rows (293 items);
   - the real landed cost for `Hibscus Dry Leafe / 400g`;
   - nulling the 35 orphan `order_items.product_id` values;
   - the order-total policy for the 137 mismatched orders.
3. Build `asellafs_organic_v2` on the host from the 2026-10-26 dump and verify the row counts.
4. Apply the rebuild sequence:
   - `01_v2_schema.sql`;
   - `07_views.sql`;
   - `04_import_catalog.cjs` (no `--allow-unverified` in production);
   - `02_constraints.sql`;
   - `05_map_order_items.cjs --apply --clear-orphans`;
   - `03_order_item_constraints.sql`;
   - `06_validate.sql`.
5. Patch the application code to use variant/group IDs and update `/api/products/grouped`, `inventory.ts`, `stock.ts`, and the frontend hooks.

Do not run 026, do not delete the old `pr0000` products, and do not update `orders.total` until the new catalog and mapping are validated.
