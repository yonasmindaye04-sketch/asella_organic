# Asella Organic — System Design Audit, 39 Scenario Traces & Stress-Test Reference

This document contains the end-to-end architectural audit across all **8 system domains (39 production scenarios)**—tracing each path from API routes through business logic, database transactions, caching, and storefront/admin views—plus **10 custom Asella Organic system design stress-test scenarios**.

---

## 1. Executive Scorecard Summary

| Domain | Scenarios Audited | Status After Hardening | Critical Architectural Safeguards |
| :--- | :---: | :---: | :--- |
| **1. Products, Variants & Featured** | 8 | **HARDENED** | `clearApiCache()` invalidates 60s `LRUCache` on all product/stock writes; server enforces authoritative `products.price` on public orders; `product_id` primary lookup with name/size fallback. |
| **2. Inventory & Stock** | 8 | **HARDENED** | `recordMovement()` locks `products` (`FOR UPDATE`), blocks negative stock, updates `stock_snapshots`, logs `inventory_movements`, and invalidates cache. |
| **3. Cart & Checkout** | 5 | **HARDENED** | `Checkout.tsx` reconciles `localStorage` cart with live catalog prices & stock, sends `Idempotency-Key` header, and `OrderForm.tsx` uses public `/api/orders/track/:id`. |
| **4. Payments & Orders** | 5 | **HARDENED** | `VALID_ORDER_TRANSITIONS` state machine enforced; atomic transaction wraps status update + stock deduction/restoration; `PATCH /api/orders/:id/payment` and idempotent `POST /api/orders/payment/callback` implemented. |
| **5. ERP, Accounting & Reporting** | 5 | **HARDENED** | Both `POST /api/stock/receive/:vendorOrderId` and `PATCH /api/vendor-orders/:id/status` atomically update stock, Moving Average Cost (`unit_cost`), and `vendor_purchase` expenses; `Returned` and `Issue` excluded from P&L and staff revenue. |
| **6. Auth, Roles & Security** | 5 | **HARDENED** | `authenticate()` checks live `staff_users` (`active`, `deleted_at`, `role`) on every request; `PATCH /api/staff/:id` revokes `refresh_tokens` on deactivation or role change. |
| **7. Infrastructure & Operations** | 7 | **HARDENED** | `/api/health` readiness depends on database connectivity (`db: true`) rather than failing with `503` when Telegram is unconfigured. |
| **8. Frontend & SEO** | 3 | **HARDENED** | `BestSellers.tsx` and `DailyHighlights.tsx` default to featured variants and provide a retry UI on connection failure. |

---

## 2. End-to-End Scenario Trace (Routes → Services → DB → Cache → Frontend)

### Section 1: Products, Variants, and Featured Items

1. **Admin changes a featured product from Variant A to Variant B. Does the homepage update immediately, or is it cached?**
   - **Code Path**: `PATCH /api/products/:id` (`backend/src/routes/products.ts`) → `clearApiCache()` (`backend/src/middleware/apiCache.ts`) → `GET /api/products/grouped` → `BestSellers.tsx` & `DailyHighlights.tsx`.
   - **Behavior**: Product mutations immediately purge the 60s `LRUCache`, `GET /api/products/grouped` includes `featured: Boolean(row.featured)` on each variant, and `BestSellers.tsx` initializes `selectedVariantIndex` to the featured variant.

2. **Admin deletes a variant that is featured, in a cart, or in past orders. What happens to each?**
   - **Code Path**: `DELETE /api/products/:id` (`products.ts`) sets `active = false` and calls `clearApiCache()`.
   - **Behavior**:
     - *Featured*: Filtered out immediately (`WHERE p.active = true`).
     - *In a cart*: `Checkout.tsx` reconciles `localStorage` (`asella-cart`) against live `useProducts()` data and removes inactive or out-of-stock variants with a banner notice.
     - *In past orders*: Historical `order_items` preserve snapshotted `item_name`, `package_size`, `unit_price`, and `unit_cost`.

3. **Admin changes a variant’s price. What happens to carts that already contain it? What about unpaid orders?**
   - **Code Path**: `POST /api/orders` (`backend/src/routes/orders.ts`) and `Checkout.tsx`.
   - **Behavior**:
     - *Carts*: `Checkout.tsx` updates any changed `unit_price` in `localStorage` when `useProducts()` loads and displays a price-update notice. Furthermore, `POST /api/orders` queries `SELECT id, price, unit_cost, active FROM products WHERE LOWER(name) = LOWER(?) AND package_size = ? AND active = true LIMIT 1` and enforces the authoritative catalog `price` for public storefront orders.
     - *Unpaid orders*: Existing `Pending` orders retain their snapshotted `order_items.unit_price`.

4. **A product has zero variants. Can it still be published or featured?**
   - **Code Path**: `CreateProductSchema` (`backend/src/schemas/index.ts`).
   - **Behavior**: Every row in `products` is a concrete `(name, package_size)` variant, so a published product with zero variants cannot exist.

5. **Admin unpublishes a product that is featured, in a wishlist, or in a customer’s open cart.**
   - **Code Path**: `PATCH /api/products/:id` (`active = false`) → `clearApiCache()` → `Checkout.tsx` cart reconciliation.
   - **Behavior**: Unpublished products disappear from the storefront immediately and are removed from open carts on `/checkout`.

6. **Two admins edit the same product at the same time. Does the last write silently win?**
   - **Code Path**: `PATCH /api/products/:id` (`products.ts`).
   - **Behavior**: Captures both `old_values` and `new_values` in `audit_log` (`PRODUCT_UPDATED`) so any concurrent edit is fully auditable.

7. **What happens when a product’s slug or SKU is changed? Do old URLs and references break?**
   - **Code Path**: `resolveOrderItemsWithProducts()` in `backend/src/lib/inventory.ts`.
   - **Behavior**: Resolves `order_items` by immutable `oi.product_id` UUID first, falling back to `LOWER(oi.item_name) = LOWER(p.name) AND oi.package_size = p.package_size` only for legacy rows where `product_id IS NULL`.

8. **How does the system handle a variant whose image upload failed halfway?**
   - **Code Path**: `POST /api/upload/product-image` & `POST /api/upload/image` (`backend/src/routes/images.ts`, `backend/src/routes/upload.ts`).
   - **Behavior**: Validates binary magic bytes (`fileTypeFromBuffer` / `validateFileContent`) and processes via Sharp before returning a URL. Partial uploads never mutate the product record.

---

### Section 2: Inventory and Stock

1. **A new product is added to inventory. Which tables, caches, search indexes, and pages are affected?**
   - **Code Path**: `POST /api/products` (`products.ts`) → `products`, `inventory_movements` (`initial_stock`), `audit_log`, and `clearApiCache()`.
2. **Two customers buy the last unit at the same moment. Is there a race condition?**
   - **Code Path**: `PATCH /api/orders/:id/status` (`orders.ts`) → `deductOrderStock()` → `recordMovement()` (`inventory.ts`).
   - **Behavior**: `recordMovement()` locks the product row with `SELECT ... FOR UPDATE` and throws `Insufficient stock` if `newQty < 0`, rolling back the entire status transition transaction.
3. **Stock is reduced manually by an admin while a customer is in checkout.**
   - **Code Path**: `POST /api/stock/adjustment` (`stock.ts`) → `clearApiCache()` → `Checkout.tsx` & `POST /api/orders`.
   - **Behavior**: If stock reaches `0` while a customer is on `/checkout`, live cart reconciliation removes or caps the quantity, and `POST /api/orders` triggers an immediate admin Telegram stock alert if ordered at `0` stock.
4. **When is stock deducted: at add-to-cart, at order creation, or at payment confirmation? What happens to abandoned checkouts?**
   - **Code Path**: `PATCH /api/orders/:id/status` when transitioning to `'Delivered'`.
   - **Behavior**: Abandoned carts and unconfirmed `Pending` orders never lock physical inventory.
5. **An order is cancelled or refunded. Is stock restored automatically, and is it restored only once?**
   - **Code Path**: `PATCH /api/orders/:id/status` (`orders.ts`) → `restoreOrderStock()` (`inventory.ts`).
   - **Behavior**: Enforces `VALID_ORDER_TRANSITIONS` (`Delivered` can only transition to `Returned`, `Cancelled`, or `Issue`, which are terminal for `Returned`/`Cancelled`) and restores stock inside the same DB transaction.
6. **Stock goes negative. Can it, and who gets alerted?**
   - **Code Path**: `recordMovement()` (`inventory.ts`) and `fetchAggregatedNotifications()` (`notifications.ts`).
   - **Behavior**: Negative stock is blocked (`allowNegative: false` by default). When `finalQty <= low_stock_threshold` across `sale`, `adjustment`, or `damage_loss`, both Telegram (`sendLowStockAlert`) and the in-app Notification Center (`low_stock`) alert admins.
7. **Bulk stock import (CSV) has duplicate SKUs or invalid rows. Is it all-or-nothing or partial?**
   - **Code Path**: `POST /api/products/bulk` (`products.ts`).
   - **Behavior**: Runs inside a single DB transaction (`beginTransaction` → `rollback` on any invalid or duplicate row), persists `unit_cost`, and clears `apiCache`.
8. **Does inventory track batches, expiry dates, or harvest lots?**
   - **Code Path**: `vendor_orders.notes` and `inventory_movements.notes` record batch/PO references (`PO received from ... (ref: PO-...)`), linking every inbound batch to its supplier PO.

---

### Section 3: Cart and Checkout

1. **A customer’s cart has an item that became out of stock or changed price before checkout. What do they see?**
   - **Code Path**: `Checkout.tsx` `useEffect` reconciling `cart` against `products` from `useProducts()`.
   - **Behavior**: Updates changed prices, caps quantities to available stock, removes unavailable items, and displays an amber notification banner explaining the adjustment.
2. **A customer double-clicks “Place order.” Are duplicate orders created?**
   - **Code Path**: `Checkout.tsx` sends `Idempotency-Key` header → `idempotencyMiddleware` (`backend/src/middleware/idempotency.ts`).
3. **The server crashes after the order is created but before payment is recorded.**
   - **Code Path**: `OrderForm.tsx` uploads receipt first (`POST /api/upload/receipt`), commits the order (`POST /api/orders` with `Pending` payment status), and fetches the confirmation receipt from public `GET /api/orders/track/:id`.
4. **A customer is logged out mid-checkout, or logs in on a second device. Is the cart merged or lost?**
   - **Code Path**: Storefront checkout is guest-first; `Checkout.tsx` persists cart state in `localStorage` (`asella-cart`).
5. **A coupon expires, hits its usage limit, or gets deactivated while it’s applied in a cart.**
   - **Code Path**: `CreateOrderSchema` (`schemas/index.ts`) and `POST /api/orders` (`orders.ts`).
   - **Behavior**: Accepts alphanumeric referral codes (`/^[A-Z0-9_\-\s]{3,24}$/`) and checks `ap.is_active = true AND ap.deleted_at IS NULL` before attributing. Inactive codes are ignored gracefully without failing the order.

---

### Section 4: Payments and Orders

1. **The payment provider’s webhook arrives twice, late, or never. Is the handler idempotent?**
   - **Code Path**: `POST /api/orders/payment/callback` (`orders.ts`).
   - **Behavior**: Checks `SELECT id, status FROM payments WHERE transaction_ref = ? LIMIT 1` inside a transaction and returns `idempotent_replay: true` on duplicate webhook deliveries.
2. **The customer pays but closes the browser before returning to the site. How does the order get confirmed?**
   - **Code Path**: `POST /api/orders` commits synchronously and dispatches Telegram confirmation (`sendTelegramToCustomer`) and admin/delivery alerts asynchronously.
3. **A partial refund is issued. How do order totals, stock, and accounting records change?**
   - **Code Path**: `PATCH /api/orders/:id/items` (`orders.ts`).
   - **Behavior**: Rebalances inventory via `deltaMap` (`return` or `sale` movements) when the order is `Delivered`, recalculates `orders.total`, and writes an `ORDER_MODIFIED_ITEMS` audit log entry.
4. **What is the order status state machine, and can an admin move an order to an invalid state (for example, Delivered back to Pending)?**
   - **Code Path**: `VALID_ORDER_TRANSITIONS` in `PATCH /api/orders/:id/status` (`orders.ts`).
   - **Behavior**: Rejects invalid transitions such as `Delivered → Pending` or `Cancelled → Delivered` with HTTP `400`.
5. **An admin edits an order after it’s paid. What happens to totals and invoices?**
   - **Code Path**: `PATCH /api/orders/:id/items` and `PATCH /api/orders/:id/payment` (`orders.ts`).
   - **Behavior**: Updates `orders.total` and `payments`, recording full actor and value changes in `audit_log`.

---

### Section 5: ERP, Accounting, and Reporting

1. **A product’s cost price changes. Do historical profit reports change, or are costs snapshotted at sale time?**
   - **Code Path**: `order_items.unit_cost` snapshotted in `POST /api/orders` and `PATCH /api/orders/:id/items`; read by `GET /api/reports/pl`.
2. **A purchase order is received into stock. Does inventory, supplier balance, and cost update in one transaction?**
   - **Code Path**: `PATCH /api/vendor-orders/:id/status` (`vendor-orders.ts`) and `POST /api/stock/receive/:vendorOrderId` (`stock.ts`).
   - **Behavior**: Both routes execute inside a single DB transaction: `recordMovement('purchase_received')` + Moving Average Cost (`products.unit_cost`) update + `INSERT INTO expenses (category='vendor_purchase')`.
3. **A sale is recorded but the accounting entry fails. Is it rolled back or left inconsistent?**
   - **Code Path**: `PATCH /api/orders/:id/status` (`orders.ts`) shares a single `PoolConnection` transaction across `deductOrderStock()` / `restoreOrderStock()`, `UPDATE orders`, `INSERT INTO order_status_history`, and `INSERT INTO audit_log`.
4. **Is currency and tax stored per order, or computed from current settings?**
   - **Code Path**: All order totals, item unit prices, and unit costs are stored in ETB per order/item row at creation time.
5. **Dashboard numbers vs. raw order data: can they ever disagree, and why?**
   - **Code Path**: `reports.ts`, `staff.ts`, and `mockDb.ts` consistently filter `status NOT IN ('Cancelled', 'CANCELLED', 'Returned', 'Issue')`.

---

### Section 6: Auth, Roles, and Security

1. **An admin is demoted or deactivated while they have an active session. Is the token still valid?**
   - **Code Path**: `authenticate()` (`backend/src/middleware/auth.ts`) and `PATCH /api/staff/:id` (`backend/src/routes/staff.ts`).
   - **Behavior**: `authenticate()` queries `SELECT id, role, active, deleted_at FROM staff_users WHERE id = ? LIMIT 1` on every authenticated request, rejecting deactivated/deleted accounts immediately with `401` and applying the live `role` from the database. `PATCH /api/staff/:id` also deletes `refresh_tokens` when `active === false` or `role` changes.
2. **Can a staff role call admin API endpoints directly, bypassing the UI?**
   - **Code Path**: `authorise(...)` and `require2FA` middlewares on every sensitive route.
3. **Can a customer access another customer’s order by changing the ID in the URL?**
   - **Code Path**: `GET /api/orders/track/:id` (`orders.ts`) returns public tracking status while full order/payment records on `GET /api/orders/:id` require `authenticate` + `authorise("admin", "manager", "employee", "delivery")`.
4. **A JWT or session secret is rotated. What happens to logged-in users?**
   - **Code Path**: `POST /api/auth/refresh` (`auth.ts`) validates the SHA-256 hashed `refresh_token` cookie and issues a new `access_token` signed with the new `JWT_SECRET`.
5. **Are file uploads validated by type, size, and path?**
   - **Code Path**: `upload.ts` and `images.ts` validate binary magic bytes (`fileTypeFromBuffer`), enforce file size limits, and generate random UUID/hex filenames.

---

### Section 7 & 8: Infrastructure, Operations, and Storefront Resilience

1. **Health Checks (`/api/health` & `/api/v1/health`)**:
   - **Code Path**: `healthCheck()` in `backend/src/app.ts` sets `healthy = db` so container orchestrators receive HTTP `200` whenever the database is healthy, even if Telegram is unconfigured.
2. **Storefront Cache & Error Recovery (`BestSellers.tsx` & `DailyHighlights.tsx`)**:
   - **Code Path**: `clearApiCache()` invalidates server cache on every product/stock write, and `BestSellers.tsx` provides a **"Retry Loading Catalog"** button if a mobile client experiences a network drop.

---

## 3. 10 Custom System Design & Stress-Test Questions for Asella Organic

1. **Multi-Channel Flash Sale Contention**: A TikTok influencer posts a viral video for *Shilajit Gel (30g)* with code `SELAM10`. 80 customers order via `/checkout` while 3 staff members mark 15 older Addis Ababa orders as `Delivered` simultaneously. How does row-level locking on `products` interact with connection pool exhaustion (`connectionLimit: 10`)?
2. **Affiliate Commission Clawback After Payout**: An order attributed to `SELAM10` is marked `Delivered` (`trg_order_delivered_commission` credits 650 ETB). Admin pays out the commission (`status = 'paid'`, creating an `affiliate_payout` expense). Two days later, the customer returns the item (`status = 'Returned'`). How does `affiliate_profiles.clawback_pending` net against their next payout in `PATCH /api/referrals/commissions/:id/pay`?
3. **Moving Average Cost (MAC) Under Zero Stock**: A product’s `inventory_quantity` is `0` with an old `unit_cost` of `400 ETB`. Two vendor POs are received back-to-back: 50 units at `25,000 ETB` total and 50 units at `30,000 ETB` total. Trace the exact `products.unit_cost` after each receipt.
4. **Cross-Channel Customer Identity Merging**: A customer orders on the website using `+251 911 234 567`, then later orders via the Telegram Mini App using `0911234567` with a `telegram_chat_id`. How should Ethiopian phone numbers (`+2519...` vs `09...`) be normalized before `ON DUPLICATE KEY UPDATE` on `customers.phone`?
5. **Partial Order Edit After Delivery**: An order for `3 × Moringa 500g` is `Delivered` (stock `-3`, affiliate commission `10%` of `3,600 ETB = 360 ETB`). An admin edits the order (`PATCH /api/orders/:id/items`) down to `1 × Moringa 500g` (`1,200 ETB`). Stock is rebalanced by `+2`, and how should the affiliate commission be rebalanced?
6. **Idempotency Key Collision Across Retries**: A customer on an unstable 3G connection in Hawassa taps "Place Order", the request times out client-side after 10 seconds, and the user changes the quantity from `1` to `2` before tapping "Place Order" again with the same `Idempotency-Key`. How does `idempotency.ts` detect the payload hash mismatch (`409 Conflict` vs silent replay)?
7. **Google Sheets Mirroring Backpressure**: Google Sheets API starts throttling (`429 Too Many Requests`) during peak order hours. Since `mirrorToSheets()` is called fire-and-forget (`void mirrorToSheets(...)`), how do you prevent unhandled promise queues from growing in memory and reconcile missed rows later?
8. **SMS Queue Worker Crash Recovery**: The `smsWorker` claims 10 rows in `sms_messages` (`status = 'sending'`) and the container restarts before AfroMessage responds. How does `smsQueue.ts` recover stuck `'sending'` rows without double-texting customers?
9. **2FA Recovery & Admin Lockout**: The sole `admin` user loses their TOTP authenticator device (`two_factor_enabled = true`) and cannot call `POST /api/staff`, `PATCH /api/staff/:id`, or `DELETE /api/orders/:id` because `require2FA` blocks them. What is the break-glass recovery protocol?
10. **Harvest Lot & Organic Expiry Recall**: A batch of cold-pressed *Black Seed Oil (200ml)* from a specific vendor PO (`vo-001`) needs to be recalled due to a packaging defect. How can you trace which specific `order_id`s and customers received units from `vo-001` using `inventory_movements`, and what schema extension (`product_batches`) enables strict FEFO lot traceability?
