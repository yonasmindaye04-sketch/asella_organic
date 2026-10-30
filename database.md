# Asella Organic — Database Schema Documentation

**Database Engine:** MariaDB 10.11 / MySQL 8.0  
**Character Set / Collation:** `utf8mb3` / `utf8mb3_unicode_ci`  
**Migration Path:** `backend/db/sql/*.sql`  
**Driver:** `mysql2/promise` (Connection Pool)

---

## 1. Architectural Principles

1. **Parent-Variant Catalog Hierarchy (v2):**
   - `product_groups` represents the customer-facing product (e.g. "Moringa Powder").
   - `products` represents individual package size/SKU variants (e.g. "200g", "500g", "1kg").
   - Enforced by `fk_products_group` and unique variant constraint `uq_products_group_size_active`.

2. **Immutable Inventory Ledger:**
   - `inventory_movements` records every physical stock delta with change type, delta, unit cost, and before/after balances.
   - `products.inventory_quantity` represents the live available balance. All balance modifications must go through `recordMovement()`.

3. **Financial Snapshotting:**
   - `order_items` stores historical snapshots of `unit_price`, `unit_cost` (MAC snapshot at order creation), item name, and package size.
   - Future catalog price or cost adjustments never mutate completed or past order items.

4. **Identifier Conventions:**
   - Entities use UUID v4 (`CHAR(36)`).
   - Orders use structured prefixed strings: `ORD-YYYYMMDD-XXXXXXXX` (`VARCHAR(50)`).
   - Mapping, audit, and log tables use `INT AUTO_INCREMENT`.

---

## 2. Core Tables

### `product_groups`
Parent catalog grouping for product families.
- `id` (CHAR(36), PK, DEFAULT UUID())
- `name` (VARCHAR(255), UNIQUE, NOT NULL) — Canonical display name
- `slug` (VARCHAR(255), UNIQUE, NOT NULL) — URL slug
- `description` (TEXT)
- `image_url` (TEXT)
- `featured` (TINYINT(1), DEFAULT 0)
- `tag` (VARCHAR(100), DEFAULT '') — Product family tag (e.g. 'Herbs', 'Oils', 'Superfood')
- `active` (TINYINT(1), DEFAULT 1)
- `created_at`, `updated_at` (DATETIME)

### `products`
Individual sellable variant and inventory unit.
- `id` (CHAR(36), PK, DEFAULT UUID())
- `product_group_id` (CHAR(36), FK -> `product_groups.id`, ON DELETE RESTRICT)
- `name` (VARCHAR(255), NOT NULL) — Base name matching group for backward compatibility
- `package_size` (VARCHAR(100), NOT NULL) — Volume or weight (e.g. '200g', '500g', '30ml')
- `sku` (VARCHAR(100), UNIQUE) — Unique Stock Keeping Unit
- `price` (DECIMAL(10,2), NOT NULL) — Current retail price
- `unit_cost` (DECIMAL(10,2), DEFAULT 0.00) — Current Moving Average Cost (MAC)
- `inventory_quantity` (INT, NOT NULL, DEFAULT 0) — Current physical stock balance
- `low_stock_threshold` (INT, NOT NULL, DEFAULT 10)
- `sort_order` (INT, NOT NULL, DEFAULT 0)
- `active` (TINYINT(1), NOT NULL, DEFAULT 1)
- `active_unique` (TINYINT, GENERATED ALWAYS AS (IF(active = 1, 1, NULL)) VIRTUAL)
- `created_at`, `updated_at` (DATETIME)
- *Constraints:* `uq_products_group_size_active (product_group_id, package_size, active_unique)`

### `product_aliases`
Lookup aliases for catalog matching and search resolution.
- `id` (INT, PK, AUTO_INCREMENT)
- `product_id` (CHAR(36), FK -> `products.id`, ON DELETE CASCADE)
- `alias` (VARCHAR(255), UNIQUE, NOT NULL)
- `source` (VARCHAR(100), DEFAULT 'legacy')
- `created_at` (DATETIME)

### `legacy_sku_map`
Decision registry for legacy order line matching.
- `id` (INT, PK, AUTO_INCREMENT)
- `legacy_name` (VARCHAR(255), NOT NULL)
- `legacy_size` (VARCHAR(100), NOT NULL)
- `product_id` (CHAR(36), FK -> `products.id`, ON DELETE SET NULL)
- `decision` (VARCHAR(50), NOT NULL) — 'MAP', 'REVIEW', 'LEAVE_NULL', 'NO_ACTION'
- `match_type` (VARCHAR(50), NOT NULL)
- `confidence` (VARCHAR(20), NOT NULL) — 'high', 'medium', 'low'
- `notes` (TEXT)
- `created_at` (DATETIME)

### `orders`
Customer and staff sales transactions.
- `id` (VARCHAR(50), PK) — Format: `ORD-YYYYMMDD-XXXXXXXX`
- `order_type` (VARCHAR(50), DEFAULT 'website') — 'website', 'telegram', 'manual', etc.
- `name` (VARCHAR(255), NOT NULL) — Customer full name
- `phone` (VARCHAR(50), NOT NULL)
- `city` (VARCHAR(100), NOT NULL)
- `location` (VARCHAR(255), NOT NULL) — Specific sub-city, district, or landmark
- `gender` (VARCHAR(20))
- `age_group` (VARCHAR(20))
- `channel` (VARCHAR(50))
- `status` (VARCHAR(50), NOT NULL, DEFAULT 'Pending') — 'Pending', 'In Transit', 'Delivered', 'Cancelled', 'Returned'
- `payment_status` (VARCHAR(50), NOT NULL, DEFAULT 'pending') — 'pending', 'completed', 'failed', 'refunded'
- `total` (DECIMAL(12,2), NOT NULL)
- `notes` (TEXT) — Order notes, delivery instructions, internal audit remarks
- `customer_id` (CHAR(36), FK -> `customers.id`, ON DELETE SET NULL)
- `assigned_to` (VARCHAR(255)) — Assigned driver or delivery partner username
- `created_by_staff_id` (CHAR(36), FK -> `staff_users.id`, ON DELETE SET NULL)
- `delivery_date` (DATE)
- `receipt_url` (VARCHAR(255))
- `created_at`, `updated_at`, `deleted_at` (DATETIME)

### `order_items`
Individual line items on an order.
- `id` (CHAR(36), PK, DEFAULT UUID())
- `order_id` (VARCHAR(50), FK -> `orders.id`, ON DELETE CASCADE)
- `product_id` (CHAR(36), FK -> `products.id`, ON DELETE SET NULL)
- `item_name` (VARCHAR(255), NOT NULL) — Historical snapshot
- `package_size` (VARCHAR(100), NOT NULL) — Historical snapshot
- `quantity` (INT, NOT NULL)
- `unit_price` (DECIMAL(12,2), NOT NULL) — Historical snapshot
- `unit_cost` (DECIMAL(12,2), NOT NULL, DEFAULT 0.00) — Historical snapshot for accrual COGS
- `product_match_type` (ENUM('exact','normalized','rename','size_substitution','manual','ambiguous','discontinued','custom','unmapped'))
- `product_match_confidence` (ENUM('high','medium','low'))
- `product_match_note` (VARCHAR(255))

### `inventory_movements`
Double-entry immutable inventory ledger.
- `id` (CHAR(36), PK, DEFAULT UUID())
- `product_id` (CHAR(36), FK -> `products.id`, ON DELETE RESTRICT)
- `change_type` (VARCHAR(50), NOT NULL) — 'sale', 'receiving', 'adjustment', 'return', 'initial', 'void'
- `quantity` (INT, NOT NULL) — Negative for outward/sale, positive for inbound/receiving
- `previous_quantity` (INT, NOT NULL)
- `new_quantity` (INT, NOT NULL)
- `unit_cost` (DECIMAL(12,2))
- `reason` (TEXT)
- `reference_id` (VARCHAR(50)) — Order ID or Vendor Order ID
- `performed_by` (VARCHAR(255))
- `created_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

### `staff_users`
Staff and administrative user accounts.
- `id` (CHAR(36), PK, DEFAULT UUID())
- `username` (VARCHAR(100), UNIQUE, NOT NULL)
- `email` (VARCHAR(255))
- `password_hash` (VARCHAR(255), NOT NULL)
- `full_name` (VARCHAR(255), NOT NULL)
- `role` (VARCHAR(30), NOT NULL, DEFAULT 'employee') — 'admin', 'manager', 'employee', 'delivery', 'vendor', 'call_center', 'store_manager'
- `telegram_username` (VARCHAR(255))
- `telegram_chat_id` (BIGINT)
- `totp_secret` (VARCHAR(255))
- `totp_enabled` (TINYINT(1), DEFAULT 0)
- `active` (TINYINT(1), DEFAULT 1)
- `created_at`, `updated_at`, `deleted_at` (DATETIME)

### `used_reset_tokens`
Invalidation store for single-use password reset tokens (Security Fix F-02).
- `token_hash` (CHAR(64), PK) — SHA-256 hash of used token
- `used_at` (DATETIME, DEFAULT CURRENT_TIMESTAMP)

---

## 3. Operational & Analytics Tables

- `delivery_assignments`: Active order assignments claimed by Telegram delivery drivers.
- `delivery_rejections`: Driver rejection logs for computing delivery acceptance metrics.
- `call_logs`: Telephony interaction records for call center operations.
- `call_center_daily_reports`: Daily KPI aggregation for call center staff.
- `store_reports`: Store manager daily closing reports (gross sales, cash collected, expenses, deposit variance).
- `order_total_audit`: Reconciliation log capturing historical recalculations of order sums.
- `catalog_import`: Staging audit table for bulk catalog CSV imports.

---

## 4. Views and Triggers

### Views (`043_v2_views.sql`)
1. **`vw_affiliate_dashboard`**: Real-time aggregation of referral commissions, customer counts, and payout statuses.
2. **`vw_low_stock`**: Threshold-based stock health view ('critical', 'low', 'out_of_stock').
3. **`vw_inventory_summary`**: Catalog-wide valuation, unit counts, and category statistics.
4. **`vw_customer_insights`**: Recency, Frequency, Monetary (RFM) scoring and customer segmentation ('VIP', 'Loyal', 'Promising', 'At Risk', 'Dormant').

### Triggers
1. **`trg_order_delivered_commission`**: AFTER UPDATE on `orders`. Computes and credits affiliate referral commission when order transitions to 'Delivered'.
2. **`trg_order_status_commission_reversal`**: AFTER UPDATE on `orders`. Automatically reverses or marks pending commissions void when an order is cancelled or returned.
