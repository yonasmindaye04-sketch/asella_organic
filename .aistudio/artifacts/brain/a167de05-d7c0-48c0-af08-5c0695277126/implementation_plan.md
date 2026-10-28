# Asella Organic — System Design Audit, Scenario Trace & Hardening Blueprint

This blueprint provides a full end-to-end architectural audit across all **8 system domains (39 production scenarios)**—tracing each path from API routes through business logic, database transactions, caching, and storefront/admin views—followed by **custom Asella Organic stress-test scenarios** and a structured remediation architecture ready for execution when you click **Proceed**.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> **No source code has been modified yet.** Review the traced findings (rated **OK**, **RISKY**, or **BROKEN**) and the remediation decisions below. Click **Proceed** to execute the fixes, or share any adjustments in chat.

- **Confirmed Decision 1 (Authoritative Pricing & Checkout Stock Validation)**: Reject or reconcile stale client-side prices against authoritative database product prices during order creation, and fix the checkout source payload mismatch (`website` vs `website/online`) that currently blocks `/checkout` submissions.
- **Confirmed Decision 2 (Order State Machine & Idempotent Stock Deduction)**: Enforce a strict order status transition state machine and tie stock deduction/restoration to an explicit per-order deduction state inside a single database transaction so inventory can never be double-deducted or leaked across multi-hop status changes.
- **Confirmed Decision 3 (Immediate Auth Revocation & Public Tracking Privacy)**: Validate active staff status and live role assignments during token authentication so demoted or deactivated accounts lose privileges immediately, and redact sensitive customer contact/address fields on unauthenticated public order tracking unless verified by the customer's phone suffix.
- **Confirmed Decision 4 (Unified Vendor Receipt & P&L Accounting)**: Unify Purchase Order receipt handling across both the stock-receive route and the vendor-order status route so inventory movements, Moving Average Cost (MAC), and vendor purchase expense entries always commit atomically in one transaction, while excluding `Returned` and `Issue` orders from net revenue.

---

### 1. Overview & Core Concept

- **What It Does**: Audits every operational workflow of the Asella Organic platform (Catalog & Variants, Inventory & Stock, Cart & Checkout, Payments & Orders, ERP & P&L Reporting, Auth & Security, Infrastructure & Scale, and Storefront UX) and establishes a hardened, transactional architecture.
- **Target Audience / Persona**: System architects, engineering leads, and store administrators verifying production readiness, financial accuracy, and security resilience.
- **Key Value**: Eliminates silent financial drift (double stock deduction, unrecorded PO expenses, returned orders counted in P&L revenue, client-side price tampering) and closes security gaps (stale JWT role retention and public order PII enumeration).

#### Executive Scorecard Summary

| Domain | OK | RISKY | BROKEN | Critical Highlights |
| :--- | :---: | :---: | :---: | :--- |
| **1. Products, Variants & Featured** | 2 | 3 | 3 | 60s LRU cache not invalidated on edit; client-supplied price trusted at order creation; orders link to products by name string instead of immutable ID |
| **2. Inventory & Stock** | 0 | 4 | 4 | Stock only checked at `Delivered` (overselling at checkout); multi-hop status changes double-deduct stock; no batch/expiry tracking |
| **3. Cart & Checkout** | 0 | 4 | 1 | Checkout page sends invalid enum `website/online` (422 error); cart doesn't reconcile stale prices; `Idempotency-Key` middleware unused by frontend |
| **4. Payments & Orders** | 0 | 2 | 3 | No `/payment` or `/payment/callback` route implemented; no order status transition state machine (`Delivered → Pending` allowed) |
| **5. ERP, Accounting & Reporting** | 1 | 2 | 2 | Receiving a PO via Stock Receive skips Moving Average Cost and Expense creation; P&L report counts `Returned` orders as positive revenue |
| **6. Auth, Roles & Security** | 2 | 1 | 2 | Deactivated/demoted staff retain JWT access for up to 1 hour; public `/track/:id` exposes full customer PII on 4-char order IDs |
| **7. Infrastructure & Operations** | 0 | 6 | 1 | `/api/health` returns 503 if Telegram is slow; `GET /api/reports/pl` loads all order IDs into memory; UTC vs Ethiopian `UTC+3` date shift |
| **8. Frontend & SEO** | 0 | 3 | 0 | Storefront fetches once on mount with no error retry state if initial mobile connection drops |

---

### 2. End-to-End Scenario Trace (Routes → Services → DB → Cache → Frontend)

#### Section 1: Products, Variants, and Featured Items

> [!NOTE]
> **How Variants Work Today**: There is no separate `product_variants` table. Each variant is a row in the `products` table (`id`, `name`, `package_size`, `price`, `unit_cost`, `featured`, `active`, `inventory_quantity`). Grouping into a parent product with a `variants[]` array happens dynamically in memory inside the grouped products endpoint.

1. **Admin changes a featured product from Variant A to Variant B. Does the homepage update immediately, or is it cached?** — **[BROKEN]**
   - **What happens today**: The product update handler updates `featured` in the `products` table, but the public product list and grouped product endpoints sit behind an in-memory `LRUCache` (`apiCache` middleware) with a **60-second TTL** (`max: 100`). Furthermore, the homepage `DailyHighlights` 3D carousel uses a hardcoded `highlightsMapping` list of 11 product search strings rather than querying `featured = true`, and `BestSellers` groups variants by normalized name and sets the group's `featured` flag from the first row returned, while always defaulting `selectedVariantIndex` to `0`.
   - **What breaks**: (1) Storefront API responses remain stale for up to 60 seconds (`X-Cache: HIT`). (2) `DailyHighlights` ignores the `featured` flag altogether. (3) `BestSellers` still selects Variant A (index `0`) by default instead of Variant B.
   - **Recommended fix**: Invalidate `apiCache` on every product/stock mutation (`POST`, `PATCH`, `DELETE`), include `featured` per variant in the grouped response, and initialize `selectedVariantIndex` in `BestSellers` to the featured variant index.

2. **Admin deletes a variant that is featured, in a cart, or in past orders. What happens to each?** — **[RISKY]**
   - **What happens today**: The product delete handler (admin + 2FA) executes a soft delete (`UPDATE products SET active = false`).
     - *Featured*: Disappears from public product queries (`WHERE p.active = true`) after the 60s cache TTL expires.
     - *In a cart*: Cart items live in browser `localStorage` (`asella-cart`). When the customer submits the order creation endpoint, the handler looks up `SELECT id, unit_cost FROM products WHERE LOWER(name) = LOWER(?) AND package_size = ? LIMIT 1` **without checking `AND active = true`**, allowing the order to be created for the deleted variant!
     - *In past orders*: `order_items` stores denormalized `item_name`, `package_size`, `quantity`, `unit_price`, and `unit_cost`, so historical orders render intact. However, if a pending order containing that variant is later marked `Delivered`, `deductOrderStock` filters `AND p.active = true` and silently skips stock deduction.
   - **What breaks**: Customers can still check out with soft-deleted variants sitting in `localStorage`.
   - **Recommended fix**: Require `AND active = true` during `POST /api/orders` item resolution and return a `400/409` error naming the unavailable variant so the cart can remove it.

3. **Admin changes a variant’s price. What happens to carts that already contain it? What about unpaid orders?** — **[BROKEN]**
   - **What happens today**:
     - *Carts*: `Checkout` stores `unit_price` in `localStorage` when added. When `POST /api/orders` runs, the backend calculates `total = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)` **using the client-supplied `unit_price` from the request body** without reading `products.price` from the database!
     - *Unpaid orders*: Existing `Pending` orders retain their snapshotted `order_items.unit_price` and `orders.total`.
   - **What breaks**: Stale carts check out at old prices, and **any caller can tamper with the `POST /api/orders` payload to set `unit_price: 0` and order products for free**.
   - **Recommended fix**: For customer-initiated orders, look up the authoritative `price` from `products` in the database inside the order creation transaction (and notify the user if the price changed since they added it to their cart).

4. **A product has zero variants. Can it still be published or featured?** — **[OK]**
   - **What happens today**: Because every row in `products` requires both `name` and `package_size` via schema validation, a product group only exists when at least one `active = true` variant row exists.
   - **What breaks**: Nothing; a zero-variant published product cannot exist in this schema.
   - **Recommended fix**: Maintain the constraint; if parent products and child variants are separated in the future, require `EXISTS (SELECT 1 FROM variants WHERE product_id = p.id AND active = true)` before publishing.

5. **Admin unpublishes a product that is featured, in a wishlist, or in a customer’s open cart.** — **[RISKY]**
   - **What happens today**: Setting `active = false` via `PATCH /api/products/:id` hides it from the storefront after the 60s cache expires (there is no wishlist feature). However, `Checkout` never reconciles `localStorage` cart items against the live `products` array returned by `useProducts()`.
   - **What breaks**: Open carts still display the unpublished item and can submit it at checkout.
   - **Recommended fix**: Reconcile `localStorage` cart items against `useProducts()` on mount in `Checkout` and reject inactive products in `POST /api/orders`.

6. **Two admins edit the same product at the same time. Does the last write silently win?** — **[RISKY]**
   - **What happens today**: `PATCH /api/products/:id` runs an unlocked `UPDATE products SET ..., updated_at = NOW() WHERE id = ?` and writes only `new_values` (omitting `old_values`) to `audit_log`.
   - **What breaks**: Last write silently overwrites concurrent edits (lost update), and `audit_log` does not capture the overwritten `old_values`.
   - **Recommended fix**: Check `updated_at` optimistic concurrency version in `PATCH /api/products/:id` (returning `409 Conflict` on mismatch) and log `old_values` in `audit_log`.

7. **What happens when a product’s slug or SKU is changed? Do old URLs and references break?** — **[BROKEN]**
   - **What happens today**: There is no immutable `sku` column. Worse, even though `order_items` has a `product_id` UUID column, `deductOrderStock()`, `restoreOrderStock()`, and the `Delivered` pre-check in `PATCH /api/orders/:id/status` join `order_items` to `products` using **`ON LOWER(oi.item_name) = LOWER(p.name) AND oi.package_size = p.package_size`** instead of `oi.product_id = p.id`!
   - **What breaks**: If an admin fixes a typo in a product's `name` or updates `package_size` while orders are `Pending` or `In Transit`, when those orders are later marked `Delivered` or `Returned`, the string join matches zero rows and **stock is silently never deducted or restored**.
   - **Recommended fix**: Join on `oi.product_id = p.id` in `deductOrderStock`, `restoreOrderStock`, and `PATCH /api/orders/:id/status`, falling back to `LOWER(oi.item_name) = LOWER(p.name) AND oi.package_size = p.package_size` only when `oi.product_id IS NULL`.

8. **How does the system handle a variant whose image upload failed halfway?** — **[OK]**
   - **What happens today**: `POST /api/upload/image` buffers the file in memory via Multer (5 MB limit), verifies binary magic bytes via `fileTypeFromBuffer`, and streams to Cloudinary before returning a URL. If the upload drops halfway, no URL is returned and the product record is untouched. If a product has a missing image, `resolveProductImage()` and `OptimizedImage` render a clean fallback, and `GET /api/products/health` lists broken images for admin review.
   - **What breaks**: Nothing in the database or storefront UI.
   - **Recommended fix**: Keep current two-phase upload validation.

---

#### Section 2: Inventory and Stock

1. **A new product is added to inventory. Which tables, caches, search indexes, and pages are affected?** — **[RISKY]**
   - **What happens today**: `POST /api/products` inserts into `products` and `audit_log`. It does **not** insert an `initial_stock` row into `inventory_movements` or `stock_snapshots`, and does **not** clear `apiCache`.
   - **What breaks**: Products created with positive opening stock show `last_movement_at: null` on the Stock Management page and have no opening audit trail in `inventory_movements`.
   - **Recommended fix**: Call `recordMovement({ type: "initial_stock", ... })` inside `POST /api/products` when `inventory_quantity > 0`, and invalidate `apiCache`.

2. **Two customers buy the last unit at the same moment. Is there a race condition?** — **[BROKEN]**
   - **What happens today**: `POST /api/orders` does not check or deduct stock at checkout—both orders succeed with `201 Created` (`Pending`). Stock is only deducted when staff sets `status = 'Delivered'`. Furthermore, in `PATCH /api/orders/:id/status`, `SELECT status FROM orders WHERE id = ?` runs **outside** a transaction before `deductOrderStock()`, and `UPDATE orders SET status = 'Delivered'` runs after `deductOrderStock()` commits.
   - **What breaks**: (1) Multiple customers can buy the last unit on the storefront; the oversell is only discovered when delivery fails. (2) Two concurrent `PATCH /api/orders/:id/status` (`Delivered`) requests can both pass `current.status !== 'Delivered'` and deduct stock twice.
   - **Recommended fix**: Validate available stock (`inventory_quantity >= item.quantity`) during `POST /api/orders`, and wrap the `SELECT ... FROM orders FOR UPDATE`, `deductOrderStock()`, and `UPDATE orders` in a single atomic transaction.

3. **Stock is reduced manually by an admin while a customer is in checkout.** — **[BROKEN]**
   - **What happens today**: Admin reduces stock to `0` via `POST /api/stock/adjustment`. Customer submits `POST /api/orders`. The order creation succeeds without rejecting the out-of-stock item, and only fires an asynchronous Telegram alert (`*OUT OF STOCK*`) to the admin group after commit.
   - **What breaks**: Customer receives a confirmed order ID for an item that has `0` stock.
   - **Recommended fix**: Validate `inventory_quantity >= item.quantity` inside the `POST /api/orders` transaction and return `409 Conflict` with available stock counts so the checkout UI can inform the customer immediately.

4. **When is stock deducted: at add-to-cart, at order creation, or at payment confirmation? What happens to abandoned checkouts?** — **[RISKY]**
   - **What happens today**: Stock is deducted **only when an order transitions to `Delivered`**. Abandoned carts and `Pending` / `Confirmed` / `In Transit` orders do not deduct or reserve stock.
   - **What breaks**: Abandoned checkouts never lock inventory, which is good for conversion, but `inventory_quantity` overstates sellable stock whenever multiple orders are in `Pending`, `Confirmed`, or `In Transit`.
   - **Recommended fix**: Validate stock at checkout against available stock (or deduct on `Confirmed`/`Delivered` with a tracked `stock_deducted` flag on `orders`).

5. **An order is cancelled or refunded. Is stock restored automatically, and is it restored only once?** — **[BROKEN]**
   - **What happens today**: `PATCH /api/orders/:id/status` only calls `restoreOrderStock()` when `(status === "Cancelled" || status === "Issue" || status === "Returned") && current.status === "Delivered"`.
   - **What breaks**:
     - If an order moves `Delivered → In Transit → Cancelled`, stock is **never restored** because `current.status` on the second hop was `In Transit`, not `Delivered`!
     - If an order moves `Delivered → In Transit → Delivered`, stock is **deducted twice**!
   - **Recommended fix**: Track whether stock is currently deducted for a given `order_id` (via `inventory_movements` net sum or `orders.stock_deducted`). Deduct only if not currently deducted when entering `Delivered`, and restore whenever leaving `Delivered` into any non-delivered status.

6. **Stock goes negative. Can it, and who gets alerted?** — **[RISKY]**
   - **What happens today**: `recordMovement()` blocks `newQty < 0` unless `allowNegative: true` (used for `damage_loss`), and even then clamps `finalQty = Math.max(0, newQty)`. However, `PATCH /api/products/:id` allows overwriting `inventory_quantity` directly without calling `recordMovement()` or firing `sendLowStockAlert()`. Also, the Notification Center (`notifications.ts`) only queries `WHERE im.movement_type = 'sale'` for `low_stock` alerts, ignoring `adjustment` and `damage_loss` movements that push stock below threshold!
   - **What breaks**: Low-stock events caused by manual adjustments or damage losses never appear in the in-app Notification Center.
   - **Recommended fix**: Route `inventory_quantity` changes in `PATCH /api/products/:id` through `recordMovement()` and include `movement_type IN ('sale', 'adjustment', 'damage_loss')` in the Notification Center low-stock query.

7. **Bulk stock import (CSV) has duplicate SKUs or invalid rows. Is it all-or-nothing or partial?** — **[RISKY]**
   - **What happens today**: `POST /api/products/bulk` runs inside a single database transaction (`beginTransaction` → `rollback` on any invalid or duplicate row), so it is all-or-nothing. **However**, its `INSERT INTO products` query omits the `unit_cost` column!
   - **What breaks**: Every product created via bulk import gets `unit_cost = 0`, inflating Gross Profit to 100% of revenue on P&L reports.
   - **Recommended fix**: Include `unit_cost` (`product.unit_cost ?? 0`) in `POST /api/products/bulk` and include the failing row index in error responses.

8. **Does inventory track batches, expiry dates, or harvest lots? This matters for organic products.** — **[BROKEN]**
   - **What happens today**: `products`, `vendor_orders`, and `inventory_movements` have no `batch_number`, `harvest_date`, or `expiry_date` fields.
   - **What breaks**: Organic supplements and oils cannot be traced back to a supplier harvest batch or monitored for upcoming expiration dates (FEFO).
   - **Recommended fix**: Support optional `batch_number` and `expiry_date` metadata on `vendor_orders` and `inventory_movements`.

---

#### Section 3: Cart and Checkout

1. **A customer’s cart has an item that became out of stock or changed price before checkout. What do they see?** — **[BROKEN]**
   - **What happens today**: `Checkout` loads `cart` from `localStorage` (`asella-cart`) and never compares it against the live `products` returned by `useProducts()`. Worse, `Checkout` submits `POST /api/v1/orders` with `source: 'website/online'`, whereas `CreateOrderSchema` only allows `["telegram", "website", "instagram", "facebook", "phone", "walk-in", "other"]`!
   - **What breaks**: (1) Customers on `/checkout` get a `422 Validation failed` error on every submission because `'website/online'` fails Zod enum validation! (2) Cart items never refresh their price or out-of-stock status before submission.
   - **Recommended fix**: Change `source: 'website/online'` to `source: 'website'` in `Checkout`, and automatically sync cart items with live `products` (updating changed prices with a banner notice and flagging out-of-stock items).

2. **A customer double-clicks “Place order.” Are duplicate orders created?** — **[RISKY]**
   - **What happens today**: The backend has a complete `idempotencyMiddleware` (`idempotency_keys` table keyed on `Idempotency-Key` header), **but no frontend form (`OrderForm`, `Checkout`, `NewOrderPage`, `TelegramStore`) sends an `Idempotency-Key` header**. Only the React `submitting` state disables the button during a single in-flight request.
   - **What breaks**: If a mobile user experiences a connection drop after the server receives the POST and taps "Submit" again, a duplicate order is created.
   - **Recommended fix**: Attach a deterministic per-checkout-attempt `Idempotency-Key` UUID header in `OrderForm`, `Checkout`, `NewOrderPage`, and `TelegramStore`.

3. **The server crashes after the order is created but before payment is recorded.** — **[RISKY]**
   - **What happens today**: In `OrderForm`, if the customer uploads a payment receipt image (`POST /api/upload/receipt`), the file is saved first, and its URL is appended to `orders.notes` inside the `POST /api/orders` transaction. After `POST /api/orders` returns `201`, `OrderForm` calls `GET /api/orders/:id` to render the receipt modal—**which fails with `401 Unauthorized` for public customers because `GET /api/orders/:id` is staff-only**!
   - **What breaks**: Unauthenticated customers placing an order in `OrderForm` trigger a `401` on `GET /api/orders/:id` (triggering unnecessary auth refresh attempts before falling back to local receipt state).
   - **Recommended fix**: Change `OrderForm` to call the public tracking endpoint (or use the order response directly) instead of the staff-only `GET /api/orders/:id`.

4. **A customer is logged out mid-checkout, or logs in on a second device. Is the cart merged or lost?** — **[RISKY]**
   - **What happens today**: Storefront customers check out without accounts; `Checkout` uses `localStorage` (`asella-cart`), while `OrderForm` uses transient React state.
   - **What breaks**: Selecting a product in `OrderForm` and navigating to `/checkout` does not carry the item over.
   - **Recommended fix**: Sync `OrderForm` and `Checkout` with the shared `asella-cart` `localStorage` key.

5. **A coupon expires, hits its usage limit, or gets deactivated while it’s applied in a cart.** — **[RISKY]**
   - **What happens today**: Referral codes (`?ref=...`) are stored in `localStorage`. If an affiliate is deactivated, `POST /api/orders` gracefully skips referral attribution. **However**, `CreateOrderSchema` enforces `.regex(/^ASL[-_\s]?[A-Z0-9]{3,8}$/)` on `referral_code`, whereas seeded affiliate codes (`SELAM10`, `DAWIT10`, `MERON15`) do not start with `ASL`!
   - **What breaks**: A customer with `referral_code = 'SELAM10'` (or any non-`ASL` code) in `localStorage` gets a `422 Validation failed` error and is blocked from placing their order!
   - **Recommended fix**: Relax `referral_code` validation in `CreateOrderSchema` to `/^[A-Z0-9_-]{3,20}$/i` and strip invalid referral codes gracefully rather than failing the customer's order.

---

#### Section 4: Payments and Orders

1. **The payment provider’s webhook arrives twice, late, or never. Is the handler idempotent?** — **[BROKEN]**
   - **What happens today**: While `app.ts` reserves raw body parsing for `/payment/callback` and `schemas/index.ts` defines `CreatePaymentSchema` and `UpdatePaymentStatusSchema`, **neither `PATCH /api/orders/:id/payment` nor `POST /api/orders/payment/callback` is implemented in `orders.ts`**! Calling `orders.updatePayment()` from the frontend returns `404 Not Found`.
   - **What breaks**: Payment status cannot be updated via API, and webhooks have no route handler.
   - **Recommended fix**: Implement `PATCH /api/orders/:id/payment` and an idempotent `POST /api/orders/payment/callback` handler in `orders.ts` that deduplicates by `transaction_id` inside a transaction.

2. **The customer pays but closes the browser before returning to the site. How does the order get confirmed?** — **[RISKY]**
   - **What happens today**: Once `POST /api/orders` reaches the server, the order commits and Telegram notifications are dispatched asynchronously (`sendOrderToAdmin`, `sendToDeliveryGroup`, `sendTelegramToCustomer`). However, SMS notifications (`notifyCustomerBySms`) skip `Pending` status.
   - **What breaks**: Customers without Telegram who close their browser before seeing the confirmation screen have no record of their `ORD-...` ID until staff confirms the order.
   - **Recommended fix**: Save the most recent order confirmation (`asella-last-order`) in `localStorage` so reopening the site surfaces the tracking link.

3. **A partial refund is issued. How do order totals, stock, and accounting records change?** — **[BROKEN]**
   - **What happens today**: Partial returns are performed by editing order items via `PATCH /api/orders/:id/items`. When the order is `Delivered`, `PATCH /api/orders/:id/items` computes item quantity deltas, restores returned units to stock via `recordMovement({ type: 'return' })`, and updates `orders.total`. **However**, it does not update `referral_commissions` or `customer_activity`.
   - **What breaks**: Affiliate commissions remain calculated on the pre-refund order total, and `customer_activity` still reflects the original sale amount.
   - **Recommended fix**: Recalculate pending affiliate commissions and log a `return` adjustment in `customer_activity` when `PATCH /api/orders/:id/items` reduces the total of a `Delivered` order.

4. **What is the order status state machine, and can an admin move an order to an invalid state (for example, Delivered back to Pending)?** — **[BROKEN]**
   - **What happens today**: `PATCH /api/orders/:id/status` validates only that `status` is one of the 10 enum strings—there is **no transition map** checking `current.status → newStatus`.
   - **What breaks**: Moving `Delivered → Pending` is allowed, does **not** restore stock (because stock restoration only checks `status IN ('Cancelled', 'Issue', 'Returned')`), and moving `Pending → Delivered` again deducts stock a **second time**!
   - **Recommended fix**: Enforce a `VALID_ORDER_TRANSITIONS` state machine in `PATCH /api/orders/:id/status` and tie stock restoration to any transition leaving `Delivered` (or block transitioning out of `Delivered` except to `Returned` / `Issue` / `Cancelled`).

5. **An admin edits an order after it’s paid. What happens to totals and invoices?** — **[RISKY]**
   - **What happens today**: `PATCH /api/orders/:id/items` overwrites `order_items` and `orders.total` without logging `old_values` in `audit_log` and without syncing the revised total to Google Sheets.
   - **What breaks**: The previous invoice items and total cannot be audited from `audit_log`.
   - **Recommended fix**: Record `old_values` (previous items and old total) in `audit_log` during `PATCH /api/orders/:id/items`.

---

#### Section 5: ERP, Accounting, and Reporting

1. **A product’s cost price changes. Do historical profit reports change, or are costs snapshotted at sale time?** — **[OK]**
   - **What happens today**: `POST /api/orders` and `PATCH /api/orders/:id/items` snapshot `products.unit_cost` into `order_items.unit_cost` at the time of sale. `GET /api/reports/pl` calculates COGS using `SUM(order_items.quantity * order_items.unit_cost)`.
   - **What breaks**: Historical P&L reports are preserved accurately when `unit_cost` changes later (provided the product matched at order creation).
   - **Recommended fix**: Also match by `product_id` when snapshotting `unit_cost`.

2. **A purchase order is received into stock. Does inventory, supplier balance, and cost update in one transaction?** — **[BROKEN]**
   - **What happens today**: There are two separate endpoints for receiving a Vendor PO:
     1. `PATCH /api/vendor-orders/:id/status` (`status = 'received'`): Updates stock via `recordMovement()`, updates `products.unit_cost` (Moving Average Cost, though errors are swallowed in a nested `try/catch`), and inserts a `'vendor_purchase'` row into `expenses`.
     2. `POST /api/stock/receive/:vendorOrderId`: Updates stock via `recordMovement()` and sets `vendor_orders.status = 'received'`, **but completely skips Moving Average Cost (`unit_cost`) calculation and never inserts an `expenses` record!**
   - **What breaks**: Receiving a PO from the Stock page (`POST /api/stock/receive/:vendorOrderId`) or Telegram webhook leaves `expenses` and `products.unit_cost` unupdated while locking the PO in terminal `received` status!
   - **Recommended fix**: Unify `POST /api/stock/receive/:vendorOrderId` and `PATCH /api/vendor-orders/:id/status` to execute the exact same transactional receipt logic (stock movement + Moving Average Cost update + `expenses` insert).

3. **A sale is recorded but the accounting entry fails. Is it rolled back or left inconsistent?** — **[RISKY]**
   - **What happens today**: In `PATCH /api/orders/:id/status`, `deductOrderStock()` commits its own transaction *before* `UPDATE orders SET status = 'Delivered'`, `INSERT INTO order_status_history`, and `INSERT INTO audit_log` run as separate auto-commit queries.
   - **What breaks**: If the `UPDATE orders` query fails, inventory is already deducted and committed while the order status remains unchanged.
   - **Recommended fix**: Pass a single shared `PoolConnection` transaction across `deductOrderStock()`, `UPDATE orders`, `INSERT INTO order_status_history`, and `INSERT INTO audit_log`.

4. **Is currency and tax stored per order, or computed from current settings? What happens when the VAT rate changes?** — **[RISKY]**
   - **What happens today**: `OrderForm` adds a regional `deliveryFee` (`200` ETB for Addis Ababa, `400` ETB for Other Regions) to the total shown to the user, **but `POST /api/orders` ignores `deliveryFee` and computes `orders.total = SUM(quantity * unit_price)`**!
   - **What breaks**: The customer sees `total + 200 ETB` on the checkout modal, but the database stores `total` without the delivery fee.
   - **Recommended fix**: Include `delivery_fee` in the order total calculation (or store `delivery_fee` on `orders`) so the customer receipt and database total match.

5. **Dashboard numbers vs. raw order data: can they ever disagree, and why?** — **[BROKEN]**
   - **What happens today**: `GET /api/reports/pl`, `GET /api/staff`, and `Dashboard` filter revenue orders using `status NOT IN ('Cancelled', 'CANCELLED')`—which **includes `'Returned'` and `'Issue'` orders in Revenue and Gross Profit**, even though `'Returned'` and `'Issue'` orders have their stock restored and are subtracted as refunds in `vw_customer_insights`!
   - **What breaks**: Returned orders inflate Revenue and Gross Profit on the Dashboard and P&L exports, disagreeing with Customer Insights net value.
   - **Recommended fix**: Exclude `'Returned'` and `'Issue'` alongside `'Cancelled'` in `reports.ts`, `staff.ts`, and `Dashboard.tsx` revenue/profit calculations.

---

#### Section 6: Auth, Roles, and Security

1. **An admin is demoted or deactivated while they have an active session. Is the token still valid?** — **[BROKEN]**
   - **What happens today**: `authenticate()` (`middleware/auth.ts`) verifies the JWT signature (1-hour lifetime) and checks `session_blocklist`, **but never checks `staff_users.active`, `staff_users.deleted_at`, or current `staff_users.role` in the database**. Furthermore, `PATCH /api/staff/:id` does not delete `refresh_tokens` when `active` is set to `false` or `role` is demoted.
   - **What breaks**: A deactivated or demoted admin retains full `admin` API access for up to 1 hour (and indefinitely via refresh token if deactivated via `PATCH /api/staff/:id`).
   - **Recommended fix**: Verify `SELECT role, active, deleted_at FROM staff_users WHERE id = ?` inside `authenticate()`, reject inactive/deleted users immediately with `401`, apply the live `role` from the database to `req.user.role`, and revoke `refresh_tokens` in `PATCH /api/staff/:id` when `active === false` or `role` changes.

2. **Can a staff role call admin API endpoints directly, bypassing the UI?** — **[RISKY]**
   - **What happens today**: Destructive endpoints properly enforce `authorise("admin")` and `require2FA`. However, `POST /api/vendor-orders` allows `employee` role and immediately dispatches `sendVendorPO()` to the supplier on Telegram while the PO is still in `pending` (unapproved) status.
   - **What breaks**: Employees can trigger live supplier purchase messages on Telegram without manager/admin approval.
   - **Recommended fix**: Only dispatch `sendVendorPO()` when a PO is created by `admin`/`manager` or when an `admin`/`manager` transitions the PO to `approved`.

3. **Can a customer access another customer’s order by changing the ID in the URL?** — **[BROKEN]**
   - **What happens today**: `GET /api/orders/track/:id` is public, has no rate limit beyond the global 300 req/min limiter, uses predictable 4-character suffixes (`ORD-YYYYMMDD-XXXX`), and returns full customer PII (`customer_name`, `phone`, `location`, `notes`, `items`).
   - **What breaks**: Attackers can brute-force `ORD-YYYYMMDD-XXXX` to harvest customer names, phone numbers, and home addresses.
   - **Recommended fix**: Mask PII (`phone`, `location`, `notes`) on `GET /api/orders/track/:id` unless the caller provides a matching `?phone=` or last-4-digits verification parameter, and increase new order ID random suffixes from 4 to 8 characters.

4. **A JWT or session secret is rotated. What happens to logged-in users?** — **[OK]**
   - **What happens today**: Existing `access_token` JWTs fail verification with `401`, which causes `frontend/src/services/api.ts` to call `POST /api/auth/refresh` using the opaque `refresh_token` cookie (verified by SHA-256 hash in MySQL), seamlessly issuing a new `access_token` signed with the new `JWT_SECRET`.
   - **What breaks**: Nothing; sessions self-heal unless `refresh_tokens` is also truncated (which should be done if rotating due to key compromise).
   - **Recommended fix**: Keep current behavior; document `TRUNCATE refresh_tokens` for emergency secret rotation.

5. **Are file uploads validated by type, size, and path (product images, documents)?** — **[OK]**
   - **What happens today**: `upload.ts` enforces a 5 MB memory limit via Multer, validates binary magic bytes via `fileTypeFromBuffer` (`image/*` only, blocking SVG/script uploads), and generates random hex filenames (`receipt-<hex>-<timestamp>.<ext>`), preventing path traversal.
   - **What breaks**: Nothing.
   - **Recommended fix**: Keep magic-byte inspection and random filename generation.

---

#### Section 7: Infrastructure and Operations

1. **A database migration fails halfway on production. What is the rollback plan?** — **[RISKY]**
   - **What happens today**: `migrate.cjs` executes `.sql` files in `db/sql/`. Because MySQL implicitly commits on DDL (`ALTER TABLE`, `CREATE TABLE`, `CREATE TRIGGER`), a failure mid-file leaves earlier DDL statements applied without automatic rollback.
   - **What breaks**: Re-running a partially applied migration file can fail with `Duplicate column name` unless written idempotently.
   - **Recommended fix**: Use idempotent DDL (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`) and single-purpose migration files.

2. **A deployment happens while customers are mid-checkout. Any dropped requests or schema mismatch between old and new code?** — **[RISKY]**
   - **What happens today**: `server.ts` traps `SIGTERM`/`SIGINT` for graceful shutdown, but `apiCache` and `readNotificationsByUser` live in process memory.
   - **What breaks**: Container restarts clear in-memory read-notification state if not persisted.
   - **Recommended fix**: Use expand-and-contract schema migrations and keep graceful connection draining.

3. **The database, cache, or email service is down. Which features degrade gracefully and which crash?** — **[RISKY]**
   - **What happens today**: Telegram, Google Sheets, and SMSEthiopia calls are all non-blocking (`void ...` with internal `try/catch`), so order creation and status updates succeed even if all external integrations are down. **However, `/api/health` (`app.ts` line 284) sets `healthy: db && telegram` and returns HTTP `503` whenever Telegram is unreachable or unconfigured!**
   - **What breaks**: A transient Telegram API outage causes `/api/health` to return `503 Service Unavailable`, causing container health checks/load balancers to kill a healthy backend server!
   - **Recommended fix**: Base `/api/health` HTTP `200/503` status on database readiness (`healthy: db`) while reporting `telegram` status as an informational field in the JSON body.

4. **A background job (emails, stock sync, report generation) fails or runs twice. Is it retried safely?** — **[RISKY]**
   - **What happens today**: SMS dispatches use a persistent MySQL queue (`sms_messages`) with cooldowns and attempt tracking, whereas Google Sheets mirroring (`sheets.ts`) is fire-and-forget without retry persistence.
   - **What breaks**: Transient Google API timeouts drop spreadsheet mirror rows silently.
   - **Recommended fix**: Add retry with exponential backoff inside `sheets.ts` helper calls.

5. **What are the slowest queries as products and orders grow 100x? Which indexes are missing?** — **[BROKEN]**
   - **What happens today**: `GET /api/reports/pl` fetches all matching order IDs into Node memory (`SELECT id, total FROM orders WHERE ...`) and then executes `SELECT quantity, unit_cost FROM order_items WHERE order_id IN (?)` with a giant array of IDs! Additionally, `GET /api/staff` runs 3 correlated subqueries per staff member, and `deductOrderStock` joins on `LOWER(oi.item_name) = LOWER(p.name)`.
   - **What breaks**: At 50,000+ orders, `WHERE order_id IN (...)` in `GET /api/reports/pl` exceeds query parameter limits and causes huge memory spikes.
   - **Recommended fix**: Rewrite `GET /api/reports/pl` and `GET /api/reports/pl/export` to compute Revenue and COGS via a direct SQL `JOIN` between `orders` and `order_items` without loading giant ID arrays into memory.

6. **Server timezone vs. Ethiopian time: are timestamps, reports, and “today’s sales” consistent?** — **[RISKY]**
   - **What happens today**: Frontend date selectors use `new Date().toISOString().slice(0, 10)` (UTC), which lags Ethiopian Time (`Africa/Addis_Ababa`, `UTC+3`) by 3 hours between midnight and 3:00 AM EAT.
   - **What breaks**: "Today" filters between 12:00 AM and 2:59 AM Ethiopian time query yesterday's UTC date.
   - **Recommended fix**: Use an Ethiopian timezone (`UTC+3`) date formatter for default "Today / Week / 1M" boundaries on the frontend and backend.

7. **How are backups taken, and has a restore ever been tested?** — **[RISKY]**
   - **What happens today**: No automated backup script is bundled in `backend/scripts/`.
   - **What breaks**: Manual intervention is required before destructive schema changes.
   - **Recommended fix**: Provide a repeatable database snapshot/export utility.

---

#### Section 8: Frontend and SEO

1. **After an admin changes data, how does the storefront find out (cache invalidation, revalidation, polling)?** — **[RISKY]**
   - **What happens today**: `useProducts()` and `BestSellers` fetch once on mount, and backend `apiCache` caches for 60s.
   - **What breaks**: Admin product/price/stock updates take up to 60s to appear on reload, and open tabs do not revalidate when opening `OrderForm`.
   - **Recommended fix**: Clear `apiCache` immediately on backend product/stock writes and re-fetch products when `OrderForm` opens.

2. **A product page is opened with a deleted or unpublished product ID. 404, error, or blank page?** — **[RISKY]**
   - **What happens today**: Unknown routes render `NotFound`, and `/track/:orderId` renders a clean not-found card when `GET /api/orders/track/:id` returns `404`.
   - **What breaks**: Deep-linking to an archived product via query parameter has no user-facing notice.
   - **Recommended fix**: Handle unavailable product references gracefully with a toast notification and fallback catalog view.

3. **Does the site handle slow mobile connections and failed API calls with proper error states?** — **[RISKY]**
   - **What happens today**: `api.ts` enforces a 15-second `AbortController` timeout, but `BestSellers` and `DailyHighlights` swallow fetch errors into `console.error` and render blank sections if the initial request times out.
   - **What breaks**: Users on slow 3G connections see an empty product showcase with no retry button.
   - **Recommended fix**: Add an inline error fallback with a **"Retry"** button in `BestSellers` and `DailyHighlights` when product loading fails.

---

### 3. Additional Custom System Design & Scenario Questions for Asella Organic

Use these **10 Asella-specific architecture scenarios** to further stress-test your platform:

1. **Affiliate Commission Clawback After Payout**:
   - *Question*: An affiliate’s referred order is marked `Delivered` (minting a commission), the admin marks that commission `paid` (`expenses` payout recorded), and 2 days later the customer returns the order (`status = 'Returned'`). Does the system create a clawback balance against future affiliate earnings, or is the payout lost?
2. **First-Touch vs. Multi-Touch Referral Attribution**:
   - *Question*: Customer A places their first order using Affiliate 1’s code (`?ref=ASL-AFF1`), which is later `Cancelled`. Next week, Customer A places a second order using Affiliate 2’s code (`?ref=ASL-AFF2`). Because `customers.referred_by_affiliate_id` was already set on the cancelled first order, does Affiliate 1 get lifetime credit for Customer A even though the first order was cancelled?
3. **Phone Number Normalization Split across Channels**:
   - *Question*: A customer orders on the website as `+251 911 234 567`, on `/checkout` as `0911234567`, and via Telegram Mini App as `251911234567`. Do they create 3 separate rows in `customers` (breaking RFM segmentation in `vw_customer_insights` and bypassing SMS cooldowns), or are phone numbers normalized to E.164 (`+251911234567`) before `INSERT INTO customers`?
4. **Telegram Mini App `initData` Replay Window**:
   - *Question*: When a customer uses the Telegram Store Mini App (`x-telegram-init-data`), does the server verify that `auth_date` inside `initData` is recent (e.g. `< 86400` seconds), or can a captured header be replayed indefinitely?
5. **SMSEthiopia Daily Ceiling Mid-Broadcast Resume**:
   - *Question*: If a 5,000-recipient marketing SMS campaign hits `maxDailyCostEtb` after 1,200 messages, what status do the remaining 3,800 messages get, and how does an admin resume sending only the unsent 3,800 messages tomorrow?
6. **2FA Lockout & Recovery for Solo Admin**:
   - *Question*: Destructive actions (`DELETE /api/orders/:id`, `POST /api/staff`, `PATCH /api/staff/:id`, `POST /api/sms/dispatch`) require `require2FA` (`x-2fa-token`). If an admin loses their authenticator device, are backup recovery codes generated during `POST /api/staff/2fa/setup`?
7. **Dual Stock Adjustment Endpoint Drift**:
   - *Question*: Why do both `POST /api/products/:id/stock` and `POST /api/stock/adjustment` exist, and what happens when `POST /api/products/:id/stock` updates `products.inventory_quantity` without updating `stock_snapshots` or setting `movement_type`?
8. **Branch Stock Request Auto-Fulfillment**:
   - *Question*: When a branch raises a stock request (`POST /api/stock/request`) without a `product_id` (free-text `item` name) and an admin marks it `received` (`PATCH /api/stock/requests/:id/status`), does inventory update or is it silently skipped because `sr.product_id` is `NULL`?
9. **Soft-Deleted Order Revenue Leakage**:
   - *Question*: When an admin soft-deletes a `Delivered` order via `DELETE /api/orders/:id` (`deleted_at = NOW()`), is the deducted inventory restored and is the affiliate commission reversed, or does soft-deleting a delivered order leave stock deducted and commission active?
10. **Google Sheets Rate Limit (429) Under Bulk Order Import**:
    - *Question*: When an employee submits 50 orders rapidly on `BulkOrdersPage`, `POST /api/orders` fires 50 concurrent `mirrorToSheets()` calls. Does Google Sheets return `429 Too Many Requests` and drop rows, or are Sheets writes batched/queued?

---

### 4. Technical Architecture & Remediation Strategy

When you click **Proceed**, we will implement the high-priority fixes across the backend and frontend to resolve the **BROKEN** and critical **RISKY** items identified above:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                        STOREFRONT & ADMIN CLIENTS                            │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌──────────────┐  │
│  │ Checkout & OrderForm    │  │ Public Order Tracking   │  │ Admin Portal │  │
│  │ • Fix source='website'  │  │ • Mask phone/location   │  │ • P&L Report │  │
│  │ • Sync live cart prices │  │   unless phone suffix   │  │ • Stock & PO │  │
│  │ • Send Idempotency-Key  │  │   verified              │  │ • Staff Mgmt │  │
│  │ • Retry UI on timeout   │  │ • Use /track/:id API    │  │              │  │
│  └────────────┬────────────┘  └────────────┬────────────┘  └──────┬───────┘  │
└───────────────┼────────────────────────────┼──────────────────────┼──────────┘
                │                            │                      │
                ▼                            ▼                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                     EXPRESS API & MIDDLEWARE LAYER                           │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌──────────────┐  │
│  │ Auth & RBAC Guard       │  │ Cache & Idempotency     │  │ Health Check │  │
│  │ • Live DB check for     │  │ • Invalidate apiCache   │  │ • HTTP 200   │  │
│  │   active & current role │  │   on product/stock edit │  │   based on   │  │
│  │ • Revoke refresh tokens │  │ • Enforce Idempotency   │  │   DB health  │  │
│  │   on staff demote/deact │  │   on order creation     │  │              │  │
│  └────────────┬────────────┘  └────────────┬────────────┘  └──────┬───────┘  │
└───────────────┼────────────────────────────┼──────────────────────┼──────────┘
                │                            │                      │
                ▼                            ▼                      ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                  TRANSACTIONAL DOMAIN SERVICES & DATABASE                    │
│  ┌─────────────────────────┐  ┌─────────────────────────┐  ┌──────────────┐  │
│  │ Order & Payment Engine  │  │ Inventory & PO Service  │  │ ERP & P&L    │  │
│  │ • Authoritative DB      │  │ • Join order_items by   │  │ • Exclude    │  │
│  │   price & stock check   │  │   product_id first      │  │   Returned & │  │
│  │ • Valid status state    │  │ • Unified PO receipt    │  │   Issue from │  │
│  │   machine transitions   │  │   (Stock + MAC + Exp)   │  │   net sales  │  │
│  │ • PATCH /:id/payment    │  │ • Single-tx delivery    │  │ • SQL JOIN   │  │
│  │   & webhook endpoint    │  │   & single restoration  │  │   COGS calc  │  │
│  └─────────────────────────┘  └─────────────────────────┘  └──────────────┘  │
└──────────────────────────────────────────────────────────────────────────────┘
```

#### Key Remediation Modules

1. **Product Cache Invalidation & Variant Selection**:
   - Export `clearApiCache()` in the API cache middleware and invoke it whenever products or stock levels are created, updated, or archived.
   - Include `featured` per variant in the grouped products endpoint and initialize `BestSellers` to select the featured variant by default.
   - Include `unit_cost` in bulk product creation (`POST /api/products/bulk`).
2. **Checkout, Authoritative Pricing, Stock Check & Idempotency**:
   - Fix `Checkout` to send `source: 'website'`, reconcile `localStorage` cart items against live product prices/availability, and send an `Idempotency-Key` header on order submission.
   - Fix `OrderForm` to fetch receipt details from `/api/orders/track/:id` instead of the staff-only `/api/orders/:id` endpoint.
   - Relax `referral_code` validation in `CreateOrderSchema` so codes like `SELAM10` do not block checkout with `422`.
   - In `POST /api/orders`, verify that ordered products are `active = true`, enforce authoritative database pricing, and validate stock availability.
3. **Order State Machine, Single-Transaction Stock Deduction & Payment Endpoint**:
   - Enforce valid status transitions in `PATCH /api/orders/:id/status` (preventing invalid backward jumps like `Delivered → Pending` without stock restoration) and wrap order status updates + `deductOrderStock` / `restoreOrderStock` in a single atomic transaction.
   - Join `order_items` to `products` by `product_id` first (falling back to case-insensitive `name + package_size` only when `product_id IS NULL`) so renaming a product never breaks stock deduction or restoration.
   - Implement `PATCH /api/orders/:id/payment` and idempotent `POST /api/orders/payment/callback`.
4. **Unified Vendor PO Receipt & Accurate P&L Reporting**:
   - Unify `POST /api/stock/receive/:vendorOrderId` and `PATCH /api/vendor-orders/:id/status` so receiving a PO from either route atomically increments stock, updates Moving Average Cost (`unit_cost`), and records the `vendor_purchase` expense.
   - Exclude `'Returned'` and `'Issue'` orders from net revenue and COGS in `GET /api/reports/pl`, `GET /api/reports/pl/export`, `GET /api/staff`, and `Dashboard`, and optimize `GET /api/reports/pl` to compute COGS via a single SQL `JOIN`.
5. **Immediate Auth Revocation, Public Tracking Privacy & Resilient Health Check**:
   - Verify `active`, `deleted_at`, and current `role` in `authenticate()` middleware and revoke `refresh_tokens` in `PATCH /api/staff/:id` when a user is deactivated or demoted.
   - Mask sensitive customer address/phone details in public `GET /api/orders/track/:id` unless verified (or authenticated as staff), and ensure `/api/health` returns HTTP `200` when the database is healthy even if Telegram is unconfigured or slow.
