# Production Cutover Checklist

**Read this first:** the full sequence has been rehearsed locally against the real
2026-10-26 production dump in `asellafs_organic_v2`. Nothing below has been run against
production. The old database `asellafs_organic` is the rollback and must stay untouched
until the new database is signed off.

---

## 1. Back up production

In phpMyAdmin on the host, select `asellafs_organic`:

1. **Export → Custom**
   - Format: SQL
   - Output: save to file
   - Include: structure and data
   - Add `DROP TABLE`
   - Include triggers, routines, and events
2. Save as `asellafs_organic_YYYYMMDD_HHMM.sql`.
3. Do not continue until the dump opens and contains the `orders` and `order_items` tables.

---

## 2. Export the rebuild inputs

Run these blocks from `rebuild/00_production_export.sql` in phpMyAdmin. Export each
result grid as CSV.

| Block | Export as | Why |
|---|---|---|
| 1b. Full canonical catalog | `catalog-active.csv` | 26 active + 7 inactive canonical variants (33 total / 23 groups) |
| 3. Legacy order-item decisions | `legacy-source.csv` | Confirms the 79 legacy name/size pairs and counts |
| 4. Order-total mismatches | `order-totals.csv` | 137 orders whose total differs from its lines |
| 5. Order-total pattern summary | `order-totals-summary.csv` | 83 smeared / 53 line-total-high / 1 order-total-high |
| 6. Row counts | `row-counts.csv` | Baseline for restore verification |
| 7. Products table shape | `products-shape.csv` | Confirms production schema matches the dump |
| 11. Zero-cost active variants | `zero-cost.csv` | Must be fixed before import |
| 13. Active links with mismatched text | `linked-mismatch.csv` | Review list, not an automatic remap |

Use **1b**, not query 1. Query 1b keeps the seven inactive canonical products so their
product IDs and groups survive the rebuild. Leave `variant_active = 0` for those seven.

---

## 3. Fill `catalog-active.csv`

- Correct `price`, `unit_cost`, `opening_stock`, and `low_stock_threshold` from the
  physical count and real landed cost.
- Normalize `package_size` to `100g`, `200g`, `500g`, `1kg`, `30ml`, `60 Tablet`, etc.
- Keep the existing `product_id` values.
- Set `group_active = 1` for groups that should appear on the storefront.
- Set `variant_active = 0` only for the seven inactive canonical variants.
- Add aliases such as `Hibiscus Dry Leaf|Hibscus Dry Leafe`.
- Set `verified = 1` on every row you have checked. `Hibscus Dry Leafe / 400g` is the one
  row exported with `verified = 0` because its `unit_cost` is still 0; confirm the real
  landed cost and set it to `verified = 1` before production import.

The import script refuses `verified = 0` rows unless `--allow-unverified` is passed.
That flag is for local rehearsal only.

---

## 4. Create the new database on the host

1. Create `asellafs_organic_v2` with `utf8` / `utf8_unicode_ci`. Do **not** use
   `utf8mb4`: the production core tables use `utf8`, and the `products.product_group_id`
   foreign key will fail against a `utf8mb4` default.
2. Import the production SQL dump into it.
3. Confirm the row counts match `row-counts.csv`.
4. Apply the v2 schema migrations in order:

   ```powershell
   Get-Content 'backend/db/sql/035_v2_product_groups.sql' -Raw | & 'C:\xampp\mysql\bin\mysql.exe' -h 127.0.0.1 -u asella -p asellafs_organic_v2
   Get-Content 'backend/db/sql/036_v2_product_aliases.sql' -Raw | & 'C:\xampp\mysql\bin\mysql.exe' -h 127.0.0.1 -u asella -p asellafs_organic_v2
   Get-Content 'backend/db/sql/037_v2_legacy_sku_map.sql' -Raw | & 'C:\xampp\mysql\bin\mysql.exe' -h 127.0.0.1 -u asella -p asellafs_organic_v2
   Get-Content 'backend/db/sql/038_v2_order_item_columns.sql' -Raw | & 'C:\xampp\mysql\bin\mysql.exe' -h 127.0.0.1 -u asella -p asellafs_organic_v2
   Get-Content 'backend/db/sql/039_v2_order_total_audit.sql' -Raw | & 'C:\xampp\mysql\bin\mysql.exe' -h 127.0.0.1 -u asella -p asellafs_organic_v2
   Get-Content 'backend/db/sql/040_v2_catalog_import.sql' -Raw | & 'C:\xampp\mysql\bin\mysql.exe' -h 127.0.0.1 -u asella -p asellafs_organic_v2
   ```

5. Recreate the four application views:

   ```powershell
   Get-Content 'backend/db/sql/043_v2_views.sql' -Raw | & 'C:\xampp\mysql\bin\mysql.exe' -h 127.0.0.1 -u asella -p asellafs_organic_v2
   ```

   phpMyAdmin exports views as empty stand-in tables; `043_v2_views.sql` drops the placeholders and
   recreates the real views from the production migrations.

6. Confirm these tables exist: `product_groups`, `product_aliases`, `legacy_sku_map`,
   `order_total_audit`, `catalog_import`.

7. Confirm `vw_affiliate_dashboard`, `vw_customer_insights`, `vw_inventory_summary`, and
   `vw_low_stock` have `TABLE_TYPE = 'VIEW'`, and that `vw_customer_insights` returns
   rows. If they are `BASE TABLE`, `043_v2_views.sql` was not applied.

**phpMyAdmin `#1109 - Unknown table 'products' in information_schema`:** the SQL ran
against the `information_schema` database. Select `asellafs_organic` in the left sidebar
before running the block, or add `USE asellafs_organic;` at the top. This is a
database-selection issue, not a SQL error.

---

## 5. Import the catalog

Dry run first:

```powershell
node backend/scripts/data-migrations/import-catalog.cjs --database asellafs_organic_v2 --csv backend/data/catalog-active.csv
```

Apply only if the dry run reports no errors:

```powershell
node backend/scripts/data-migrations/import-catalog.cjs --database asellafs_organic_v2 --csv backend/data/catalog-active.csv --apply --reset-ledger
```

Then add the constraints by importing `backend/db/sql/041_v2_unique_active_variant.sql` through phpMyAdmin
(or `SOURCE backend/db/sql/041_v2_unique_active_variant.sql;` from the `mysql` client).

---

## 6. Map historical order items

Dry run:

```powershell
node backend/scripts/data-migrations/map-order-items.cjs --database asellafs_organic_v2 --csv backend/data/catalog-legacy-decisions.csv
```

Apply with orphan cleanup:

```powershell
node backend/scripts/data-migrations/map-order-items.cjs --database asellafs_organic_v2 --csv backend/data/catalog-legacy-decisions.csv --apply --clear-orphans
```

This only changes `order_items.product_id` for `MAP` rows whose current link is NULL
or inactive, plus nulling the 35 dangling IDs (Turmeric 15, Qasil 20). It does not
change names, sizes, quantities, prices, costs, or totals. Cleared rows are recorded
as `product_match_type = 'unmapped'`.

Then add the foreign key:

```powershell
Get-Content 'backend/db/sql/042_v2_order_item_fk.sql' -Raw |
  & 'C:\xampp\mysql\bin\mysql.exe' -h 127.0.0.1 -u asella -p asellafs_organic_v2
```

The script refuses to add the FK if any dangling `product_id` remains. The FK is
`ON DELETE SET NULL`, so future product deletions preserve the order-item snapshot.

---

## 7. Validate

```powershell
Get-Content 'backend/tests/db-validation/06_validate.sql' -Raw |
  & 'C:\xampp\mysql\bin\mysql.exe' -h 127.0.0.1 -u asella -p --table asellafs_organic_v2
```

Stop if any of these are non-zero:

- active variants without a group
- duplicate active group/size variants
- stock ledger drift
- stock snapshot mismatches
- `MAP` rows without a target
- orphan order-item product IDs
- duplicate SKUs

Expected results on the production rehearsal:

- 23 groups, 33 variants, 26 active variants, 20 active groups, 980 active units.
- 53 inventory movements (33 `initial_stock`, 16 `sale`, 4 `adjustment`). The 1,504 historical movements for the rebuilt active variants remain in the old database by design of `--reset-ledger`.
- 306 remaining unlinked items: 293 from `REVIEW` rows and 13 from `LEAVE_NULL` rows.
- 137 `order_total_audit` rows, all still `open`.
- One zero-cost active variant: `Hibscus Dry Leafe / 400g` (must be confirmed).
- 23 orders without items (informational).
- `order_items.product_id` FK present with `ON DELETE SET NULL`.
- All four `vw_*` objects are `VIEW`, not `BASE TABLE`; `vw_customer_insights` returns 1,022 rows.

---

## 8. Decisions still required

### Legacy `REVIEW` rows (26 rows, 293 items)

| Legacy item | Size | Items | Proposed target | Question |
|---|---|---:|---|---|
| Shilajit Capsules | 60 capsules | 54 | Shilajit Tablet / 60 Tablet | Capsule vs tablet: same product? |
| Hibiscus Dry Leaf | 100 g | 37 | Hibscus Dry Leafe / 100g | Same product, spelling only? |
| Hibiscus Dry Leaf | 200 g | 32 | Hibscus Dry Leafe / 200g | Same product, spelling only? |
| Ashwagandha Tablet (Himalayan) | 60 capsules | 31 | Ashewagenda (Himalya) Tablet / 60 Tablet | Capsule vs tablet: same product? |
| Pumpkin Seed | 100g | 26 | Pumpkin Seed / 300g | Accept 100g → 300g substitution? |
| Qasil Powder | 200 g | 20 | Kesil Powder / 200g | Is Qasil the old name for Kesil? |
| Turmeric Powder | 200 g | 15 | none | Discontinued, or is it Erde? |
| Ashwagandha Powder | 250 g | 12 | Ashewagenda powder / 300g | Accept 250g → 300g substitution? |
| Ashewagenda (Himalya) Tablet | 120 Tablet | 11 | Ashewagenda (Himalya) Tablet / 120 Tablet (inactive) | Reactivate 120 Tablet, or map to 60 Tablet? |
| Blackseed Oil | 30ml | 8 | Blackseed Oil / 30ml (inactive) | Reactivate 30ml, or map to 250ml? |
| Blackseed Oil | 30 ml | 7 | Blackseed Oil / 30ml (inactive) | Reactivate 30ml, or map to 250ml? |
| Ashwagandha Tablet (Himalayan) | 120 capsules | 7 | Ashewagenda (Himalya) Tablet / 120 Tablet (inactive) | Capsule vs tablet; reactivate 120 Tablet? |
| Kerbe Raw | 100 g | 7 | Asella Kerbe Raw / 100g | Same product? |
| trumeric (Erde) | 200 g | 4 | none | Discontinued, or is it Erde? |
| Shilajit Gummies | 30 Gummies | 3 | Shilajit Gummies / 30 Gummies (inactive) | Reactivate or keep unlinked? |
| hibiscus Kerkede Leafe | 200 g | 3 | Hibscus Dry Leafe / 200g | Is Kerkede = Hibiscus? |
| Ashwagandha Powder | 100 g | 2 | Ashewagenda powder / 300g | Accept 100g → 300g substitution? |
| Moringa Seed | 200g | 2 | Moringa Seed / 200g (inactive) | Reactivate or keep unlinked? |
| Moringa Seed | 500g | 2 | Moringa Seed / 500g (inactive) | Reactivate or keep unlinked? |
| Kerkede Leafe | 200 g | 2 | Hibscus Dry Leafe / 200g | Is Kerkede = Hibiscus? |
| Kerkede Leafe | 100 g | 2 | Hibscus Dry Leafe / 100g | Is Kerkede = Hibiscus? |
| Frankincense Oil | 60ml | 2 | Frankincense Oil / 60ml (inactive) | Reactivate 60ml, or map to 30ml? |
| Moringa Seed | 200 g | 1 | Moringa Seed / 200g (inactive) | Reactivate or keep unlinked? |
| Ashwagandha Powder | 220 g | 1 | Ashewagenda powder / 300g | Accept 220g → 300g substitution? |
| hibiscus Kerkede Leafe | 100 g | 1 | Hibscus Dry Leafe / 100g | Is Kerkede = Hibiscus? |
| myrrh Kerbe Raw | 100 g | 1 | Asella Kerbe Raw / 100g | Same product? |

Change `decision` from `REVIEW` to `MAP` only after the business confirms. Change it to
`LEAVE_NULL` if the item should stay unlinked.

### Orphan cleanup

- 35 order items pointed at deleted product IDs: Turmeric 15 and Qasil 20.
- The rehearsal nulled `product_id`, set `product_match_type = 'unmapped'`, and left all
  snapshot fields untouched. Confirm this is acceptable before the production run.

### Zero-cost variant

- `Hibscus Dry Leafe / 400g` is active with 17 units and `unit_cost = 0`.
- Supply the real landed cost, set `verified = 1`, and re-export the catalog before the
  production import. Do not use `--allow-unverified` as a workaround.

### Order totals

- 83 orders show the smeared-price pattern.
- 53 orders are line-total-high; 1 order is order-total-high.
- No total has been changed.
- Decide whether to:
  - **A.** keep the historical totals and treat the line prices as unreliable;
  - **B.** recompute totals from validated line prices after review;
  - **C.** handle the 83 smeared orders separately from the rest.

`ORD-20260526-0001` is the order-total-high outlier: old total 110,250, line total 2,900.
Confirm whether the correct total is 110,250 or 2,900.

Do not apply any option until the line prices are validated.

---

## 9. Rollback

The old database is never dropped. To roll back:

1. Set `DB_NAME=asellafs_organic`.
2. Restart the backend.
3. Investigate offline.
