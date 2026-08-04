# Asella Organic — Database Schema Documentation

**Database Engine:** MySQL 8.0  
**Migration Path:** `backend/db/sql/*.sql`  
**Driver:** `mysql2` (Connection Pool)

---

## Entity Relationship & Schema Overview

### 1. `products`
Primary catalog of organic products.
- `id` (INT, PK, AUTO_INCREMENT)
- `name` (VARCHAR(255), NOT NULL)
- `description` (TEXT)
- `price` (DECIMAL(10,2), NOT NULL)
- `unit_cost` (DECIMAL(10,2), DEFAULT 0.00) — Moving Average Cost snapshot
- `stock` (INT, DEFAULT 0)
- `min_stock_alert` (INT, DEFAULT 10)
- `category` (VARCHAR(100))
- `image_url` (VARCHAR(500))
- `is_active` (TINYINT(1), DEFAULT 1)
- `created_at`, `updated_at` (TIMESTAMP)

### 2. `orders`
Customer and staff order transactions.
- `id` (INT, PK, AUTO_INCREMENT)
- `order_number` (VARCHAR(50), UNIQUE)
- `customer_name` (VARCHAR(255))
- `phone` (VARCHAR(50))
- `city` (VARCHAR(100))
- `subcity` (VARCHAR(100))
- `woreda` (VARCHAR(100))
- `house_number` (VARCHAR(100))
- `order_type` (ENUM('delivery', 'pickup', 'wholesale'))
- `total` (DECIMAL(10,2))
- `delivery_fee` (DECIMAL(10,2), DEFAULT 0.00)
- `status` (ENUM('pending', 'processing', 'completed', 'delivered', 'cancelled'))
- `payment_status` (ENUM('unpaid', 'paid', 'refunded'))
- `receipt_url` (VARCHAR(500))
- `source` (VARCHAR(50)) — e.g. `website`, `telegram`, `dashboard`
- `created_at`, `updated_at` (TIMESTAMP)

### 3. `order_items`
Line items attached to an order.
- `id` (INT, PK, AUTO_INCREMENT)
- `order_id` (INT, FK -> orders.id)
- `product_id` (INT, FK -> products.id)
- `product_name` (VARCHAR(255))
- `quantity` (INT, NOT NULL)
- `unit_price` (DECIMAL(10,2), NOT NULL)
- `unit_cost` (DECIMAL(10,2), NOT NULL) — Snapshot of MAC at purchase time for accrual COGS
- `subtotal` (DECIMAL(10,2))

### 4. `staff_users`
System accounts for administrative and staff access.
- `id` (INT, PK, AUTO_INCREMENT)
- `name` (VARCHAR(255))
- `email` (VARCHAR(255), UNIQUE)
- `password_hash` (VARCHAR(255))
- `role` (ENUM('admin', 'manager', 'employee', 'delivery'))
- `totp_secret` (VARCHAR(255)) — 2FA Secret
- `totp_enabled` (TINYINT(1), DEFAULT 0)
- `telegram_username` (VARCHAR(255))
- `telegram_chat_id` (BIGINT)
- `is_active` (TINYINT(1), DEFAULT 1)

### 5. `stock_requests`
Internal stock allocation requests between secondary stores/staff and main warehouse.
- `id` (INT, PK, AUTO_INCREMENT)
- `item` (VARCHAR(255))
- `package_size` (VARCHAR(100)) — Volume/Weight detail (e.g. 30ml, 60ml, 250g)
- `qty_needed` (INT)
- `stock_available` (INT)
- `requested_by` (VARCHAR(255))
- `delivery_date` (DATE)
- `status` (ENUM('pending', 'received', 'rejected'))
- `created_at`, `updated_at` (TIMESTAMP)

### 6. `vendor_orders` & `expenses`
- `vendor_orders`: Tracks bulk purchase orders from suppliers and updates MAC when inventory is received.
- `expenses`: Log of business operating expenses (rent, utilities, salaries).

---

## Migration Index (`backend/db/sql/`)
1. `001_complete_schema.sql` — Base tables
2. `002_affiliate_commission_trigger.sql` — Affiliate calculation triggers
3. `003_security_and_inventory.sql` — Indexes & security constraints
4. `005_order_items_product_id.sql` — Foreign keys & normalization
5. `007_idempotency_keys.sql` — Idempotency table
6. `013_staff_telegram_username.sql` — Telegram RBAC columns
7. `016_add_unit_cost.sql` — COGS `unit_cost` migration
