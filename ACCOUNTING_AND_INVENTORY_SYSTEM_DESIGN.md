# Asella Organic — Accounting, Stock & Inventory Management System Design

This document provides the complete system architecture, database schema, transactional boundaries, mathematical formulas, state machines, API specifications, and production stress-test scenarios for the **Asella Organic ERP, Inventory, Procurement, and Accounting** engine.

---

## 1. High-Level Architecture & Core Financial Invariants

The ERP layer enforces **three strict financial and physical invariants**:

1. **Single Source of Truth for Physical Stock (`recordMovement`)**:
   - No API route executes an ad-hoc `UPDATE products SET inventory_quantity = ...` outside `/backend/src/lib/inventory.ts` (`recordMovement()`).
   - Every stock mutation:
     1. Acquires a row-level lock (`SELECT ... FROM products WHERE id = ? AND active = true FOR UPDATE`).
     2. Guards against negative stock (`newQty < 0` throws `Insufficient stock` unless `allowNegative: true` is explicitly set for `damage_loss`).
     3. Updates `products.inventory_quantity`.
     4. Upserts the fast read-model `stock_snapshots` (`ON DUPLICATE KEY UPDATE`).
     5. Appends an immutable audit row to `inventory_movements`.
     6. Invalidates the server-side `LRUCache` (`clearApiCache()`).
     7. Dispatches non-blocking low-stock alerts to Telegram and mirrors the movement to Google Sheets.

2. **Perpetual Inventory Valuation via Moving Average Cost (MAC)**:
   - Inventory is valued at `products.unit_cost`.
   - When a Vendor Purchase Order (`vendor_orders`) transitions to `'received'`, `products.unit_cost` is recalculated using the **Moving Average Cost (MAC)** formula inside the same database transaction.
   - When a customer order is created (`POST /api/orders`) or its items are modified (`PATCH /api/orders/:id/items`), the product's current `unit_cost` is **snapshotted** onto `order_items.unit_cost`. Subsequent supplier cost changes never retroactively alter historical Cost of Goods Sold (COGS).

3. **Separation of COGS vs. Operating Expenses (`expenses` vs. `order_items`)**:
   - Receiving a Vendor PO books an `expenses` row with `category = 'vendor_purchase'` to track **cash outflow to suppliers**.
   - However, the **Profit & Loss (`GET /api/reports/pl`)** statement excludes `category = 'vendor_purchase'` from Operating Expenses (`category != 'vendor_purchase'`) and instead computes **COGS** from `SUM(order_items.quantity * order_items.unit_cost)`. This prevents double-counting unsold inventory as an immediate P&L loss.

```
┌───────────────────────────────────────────────────────────────────────────────────┐
│                         ASELLA ORGANIC — ERP DATA FLOW                            │
└───────────────────────────────────────────────────────────────────────────────────┘

  [1. PROCUREMENT (Vendor PO)]
   POST /api/vendor-orders (status='pending' → 'approved')
          │
          ▼  On 'received' (PATCH /api/vendor-orders/:id/status OR POST /api/stock/receive/:id)
   ┌────────────────────────────────────────────────────────────────────────────┐
   │ DB TRANSACTION:                                                            │
   │  1. Lock vendor_orders FOR UPDATE                                          │
   │  2. recordMovement(type='purchase_received', +qty)                         │
   │       ├─► Lock products FOR UPDATE                                         │
   │       ├─► products.inventory_quantity += qty                               │
   │       ├─► UPSERT stock_snapshots                                           │
   │       └─► INSERT inventory_movements                                       │
   │  3. Recalculate Moving Average Cost (MAC) ──► UPDATE products.unit_cost    │
   │  4. INSERT expenses (category='vendor_purchase', amount=vo.price)          │
   └────────────────────────────────────────────────────────────────────────────┘
          │
          ▼
  [2. ORDER PLACEMENT & FULFILLMENT]
   POST /api/orders (status='Pending')
   ├─► Snapshots authoritative `price` and current `products.unit_cost` into `order_items`
   └─► Does NOT deduct stock yet (prevents abandoned carts from locking inventory)
          │
          ▼  On status → 'Delivered' (PATCH /api/orders/:id/status)
   ┌────────────────────────────────────────────────────────────────────────────┐
   │ DB TRANSACTION:                                                            │
   │  1. Validate VALID_ORDER_TRANSITIONS state machine                         │
   │  2. deductOrderStock(orderId, actor, conn)                                 │
   │       └─► recordMovement(type='sale', -qty) for each item                  │
   │  3. UPDATE orders SET status='Delivered'                                   │
   │       └─► DB Trigger `trg_order_delivered_commission` credits affiliate    │
   │  4. INSERT order_status_history & audit_log                                │
   └────────────────────────────────────────────────────────────────────────────┘
          │
          ▼  If Voided after Delivery ('Delivered' → 'Returned' | 'Cancelled' | 'Issue')
   ┌────────────────────────────────────────────────────────────────────────────┐
   │ DB TRANSACTION:                                                            │
   │  1. restoreOrderStock(orderId, actor, conn)                                │
   │       └─► recordMovement(type='return', +qty)                              │
   │  2. DB Trigger reverses pending commission OR adds to `clawback_pending`   │
   └────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Database Schema & Ledger Tables

### 2.1 Inventory & Stock Tables
| Table | Primary Key | Key Columns | Role in System |
| :--- | :--- | :--- | :--- |
| **`products`** | `id` (UUID) | `name`, `package_size`, `price`, `unit_cost`, `inventory_quantity`, `low_stock_threshold`, `active`, `featured` | Each row is a **concrete SKU variant** (`(name, package_size)`). Holds current live stock (`inventory_quantity`) and Moving Average Cost (`unit_cost`). |
| **`stock_snapshots`** | `product_id` | `current_quantity`, `last_updated` | Fast 1:1 read model updated via `ON DUPLICATE KEY UPDATE` inside `recordMovement()`. |
| **`inventory_movements`** | `id` (UUID) | `product_id`, `movement_type`, `change_amount`, `quantity_after`, `reference_id`, `reference_type`, `performed_by`, `reason` | Immutable append-only stock audit ledger. Every change records signed `change_amount` (`+` in, `-` out) and resulting `quantity_after`. |
| **`stock_requests`** | `id` (UUID) | `product_id`, `item`, `package_size`, `stock_available`, `qty_needed`, `status`, `requested_by`, `delivery_date` | Internal requisition workflow raised by staff/branches (`pending → ordered → received \| cancelled \| rejected \| returned`). |
| **`vendor_orders`** | `id` (UUID) | `order_id` (`PO-...`), `product_id`, `vendor_name`, `item`, `amount`, `price`, `status`, `received_by`, `received_at` | Purchase Orders sent to suppliers (`pending → approved → received \| cancelled`). |

### 2.2 Accounting, Sales & Commission Tables
| Table | Primary Key | Key Columns | Role in System |
| :--- | :--- | :--- | :--- |
| **`orders`** | `id` (`ORD-...`) | `source`, `status`, `payment_status`, `total`, `customer_id`, `created_by_staff_id`, `deleted_at` | Header record for customer sales. Valid revenue requires `deleted_at IS NULL` and `status NOT IN ('Cancelled', 'Returned', 'Issue')`. |
| **`order_items`** | `id` (UUID) | `order_id`, `product_id`, `item_name`, `package_size`, `quantity`, `unit_price`, `unit_cost` | Line items snapshotting both sale `unit_price` and historical `unit_cost` (COGS) at order creation. |
| **`payments`** | `id` (UUID) | `order_id`, `amount`, `method`, `status`, `transaction_ref`, `recorded_by` | Payment ledger linked to `orders.id`. Deduplicated on `transaction_ref` for webhook idempotency. |
| **`expenses`** | `id` (UUID) | `category`, `description`, `amount`, `vendor_order_id`, `recorded_by`, `voided_at` | General expense ledger. Categories: `'vendor_purchase'`, `'operational'`, `'salary'`, `'affiliate_payout'`, `'other'`. Soft-voided via `voided_at`. |
| **`referral_commissions`** | `id` (UUID) | `affiliate_id`, `order_id`, `order_total`, `commission_amount`, `status`, `clawback_settled` | Tracks affiliate earnings (`'pending' → 'paid' \| 'reversed'`). Linked to `affiliate_profiles.clawback_pending`. |

---

## 3. Stock & Inventory Management Lifecycle

### 3.1 Stock Health Classification
Across `GET /api/stock`, `GET /api/stock/summary`, and `GET /api/stock/low` (`/backend/src/routes/stock.ts`), every active SKU is classified into one of 4 health tiers based on `inventory_quantity` ($Q$) and `low_stock_threshold` ($T$):

- **`out_of_stock`**: $Q = 0$
- **`critical`**: $0 < Q \le \frac{T}{2}$
- **`low`**: $\frac{T}{2} < Q \le T$
- **`ok`**: $Q > T$

Total inventory asset value on the balance sheet is computed in `GET /api/stock/summary` as:

$$\text{Total Stock Value} = \sum_{p \in \text{active}} \left( p.\text{inventory\_quantity} \times \text{COALESCE}(p.\text{unit\_cost}, 0) \right)$$

### 3.2 The 6 Stock Movement Types (`MovementType`)
All stock mutations call `recordMovement(options, existingConn)` in `/backend/src/lib/inventory.ts`:

| `movement_type` | `reference_type` | Sign | Triggering Endpoint / Action | Negative Stock Allowed? |
| :--- | :--- | :---: | :--- | :---: |
| **`initial_stock`** | `manual` | `+` | `POST /api/products` (when initial qty > 0) or `POST /api/stock/adjustment` | No |
| **`purchase_received`** | `vendor_order` | `+` | `PATCH /api/vendor-orders/:id/status` (`status='received'`) or `POST /api/stock/receive/:vendorOrderId` | No |
| **`sale`** | `order` | `-` | `PATCH /api/orders/:id/status` (`status='Delivered'`) or `PATCH /api/orders/:id/items` (qty increased on Delivered order) | **No** (throws `Insufficient stock`) |
| **`return`** | `order` / `manual` | `+` | `PATCH /api/orders/:id/status` (leaving `'Delivered'` to `'Returned' \| 'Cancelled' \| 'Issue'`) or `PATCH /api/orders/:id/items` (qty reduced) | No |
| **`adjustment`** | `manual` | `+` / `-` | `POST /api/stock/adjustment` or `POST /api/products/:id/stock` | **No** |
| **`damage_loss`** | `manual` | `-` | `POST /api/stock/adjustment` (`movement_type='damage_loss'`) | **Yes** (`allowNegative: true`, clamped to `0` in `products.inventory_quantity`) |

### 3.3 Why Stock is Deducted at `Delivered` (Not at `Pending`)
- Customers place orders across Website, Telegram Mini App, TikTok, Instagram, and Phone. Many orders require phone verification or courier scheduling before fulfillment.
- Deducting stock at `POST /api/orders` (`Pending`) would allow unconfirmed or abandoned checkouts to lock up inventory and cause artificial stockouts.
- **Lifecycle**:
  1. **At `POST /api/orders` (`Pending`)**: Authoritative `price` and `unit_cost` are snapshotted into `order_items`. If an ordered item has `inventory_quantity === 0` or `<= low_stock_threshold`, a real-time `*Stock Alert — New Order*` message is dispatched to `TELEGRAM_ADMIN_CHAT_ID`.
  2. **At `PATCH /api/orders/:id/status` (`Delivered`)**: The server opens a transaction, verifies `inventory_quantity >= item.quantity`, and calls `deductOrderStock(orderId, userId, conn)` which locks each `products` row (`FOR UPDATE`) and deducts the stock atomically.
  3. **Transitioning Away from `Delivered` (`Returned`, `Cancelled`, `Issue`)**: `restoreOrderStock(orderId, userId, conn)` credits the quantities back (`movement_type = 'return'`) inside the same transaction.
  4. **Mid-Delivery Order Item Edits (`PATCH /api/orders/:id/items`)**:
     - If the order is not yet `Delivered`, replacing `order_items` updates what *will* be deducted when delivered.
     - If the order is **already `Delivered`**, `PATCH /api/orders/:id/items` computes a `deltaMap` (`oldQty - newQty`) per `product_id` and records `'return'` (`delta > 0`) or `'sale'` (`delta < 0`) movements inside the same transaction.

---

## 4. Procurement & Moving Average Cost (MAC) Engine

### 4.1 Vendor Purchase Order State Machine
Defined in `/backend/src/routes/vendor-orders.ts`:
- `pending` $\rightarrow$ `approved` | `cancelled`
- `approved` $\rightarrow$ `received` | `cancelled`
- `received` $\rightarrow$ *(terminal)*
- `cancelled` $\rightarrow$ *(terminal)*

### 4.2 Moving Average Cost (MAC) Formula on PO Receipt
When a Vendor PO transitions to `received` (either via `PATCH /api/vendor-orders/:id/status` or `POST /api/stock/receive/:vendorOrderId`), the backend executes a single MySQL transaction:

1. **Parse Received Quantity ($Q_{\text{added}}$)**: Extracted from `vendor_orders.amount` (e.g., `"50 units"` $\rightarrow 50$).
2. **Increment Stock**: `recordMovement({ type: 'purchase_received', changeAmount: Q_added }, conn)` updates `products.inventory_quantity` to $Q_{\text{new}}$.
3. **Compute New Moving Average Unit Cost ($\text{MAC}_{\text{new}}$)**:
   - $Q_{\text{before}} = \max(0, Q_{\text{new}} - Q_{\text{added}})$
   - $C_{\text{before}} = \text{products.unit\_cost}$
   - $\text{TotalPOPrice} = \text{vendor\_orders.price}$ (total ETB paid for the PO batch)

   $$\text{MAC}_{\text{new}} = \frac{(Q_{\text{before}} \times C_{\text{before}}) + \text{TotalPOPrice}}{Q_{\text{new}}}$$

   The product row is updated immediately inside the transaction:
   ```sql
   UPDATE products SET unit_cost = ? WHERE id = ?
   ```
4. **Book Cash Outflow Expense**:
   An immutable expense row is inserted into `expenses` with `category = 'vendor_purchase'` and `amount = vo.price`, linked via `vendor_order_id`.

---

## 5. Accounting, Expense Ledger & Affiliate Clawbacks

### 5.1 Expense Categories & Immutability Controls (`/backend/src/routes/expenses.ts`)
The `expenses` table classifies every cash outflow into one of 5 categories:

| Category | How It Is Created | Editable / Voidable via `/api/expenses/:id`? | Included in P&L Operating Expenses? |
| :--- | :--- | :--- | :--- |
| **`vendor_purchase`** | **System-generated** when a `vendor_orders` PO is marked `received`. | **Locked** (`400 Cannot edit/void system-generated expenses`) | **No** — Inventory cost is recognized as **COGS** via `order_items.unit_cost` when sold. |
| **`affiliate_payout`** | **System-generated** when `PATCH /api/referrals/commissions/:id/pay` is called. | **Locked** from manual edit (`400 Cannot edit system-generated expenses`) | **Yes** — Deducted from Gross Profit as an Operating Expense. |
| **`operational`** | Manually recorded by Admin/Manager (`POST /api/expenses`) — e.g., packaging, courier fuel, rent. | **Yes** (`PATCH /api/expenses/:id`, `DELETE /api/expenses/:id` sets `voided_at = NOW()`) | **Yes** |
| **`salary`** | Manually recorded by Admin/Manager (`POST /api/expenses`). | **Yes** | **Yes** |
| **`other`** | Manually recorded by Admin/Manager (`POST /api/expenses`). | **Yes** | **Yes** |

### 5.2 Affiliate Commission Accrual, Reversal & Clawback Accounting (`/backend/src/routes/referrals.ts`)
1. **Attribution on First Order Only**:
   - In `POST /api/orders`, if `referral_code` matches an active affiliate, `customers.referred_by_affiliate_id` is set **only if `referred_by_affiliate_id IS NULL`**. Lifetime attribution cannot be hijacked by a later code.
2. **Accrual at Delivery**:
   - Commissions are **never** created on `Pending` orders. When `orders.status` transitions to `'Delivered'`, the database trigger `trg_order_delivered_commission` calculates the commission (using individual `affiliate_commission_rules` or global `referral_configs`) and inserts a `'pending'` row into `referral_commissions`.
3. **Order Return / Cancellation After Delivery**:
   - If a `Delivered` order is later moved to `'Cancelled'`, `'Returned'`, or `'Issue'`:
     - If the commission is still `'pending'`, it is marked `'reversed'` (`reversed_at = NOW()`).
     - If the commission was **already `'paid'`**, the paid amount is added to `affiliate_profiles.clawback_pending`.
4. **Clawback Netting at Next Payout (`PATCH /api/referrals/commissions/:id/pay`)**:
   - When an admin (with 2FA) pays a pending commission of amount $A$ for an affiliate who owes $C = \text{clawback\_pending}$:
     $$\text{Net Payout} = \max(0, A - C)$$
   - Only $\text{Net Payout}$ is booked into `expenses` (`category = 'affiliate_payout'`), and `affiliate_profiles.clawback_pending` is reset to `0` within the same transaction.

---

## 6. Profit & Loss (P&L) Statement Calculation (`/backend/src/routes/reports.ts`)

When `GET /api/reports/pl?from=YYYY-MM-DD&to=YYYY-MM-DD` (or `/api/reports/pl/export`) runs, it computes the financial statement for the period using these exact equations:

1. **Qualifying Orders ($O_{\text{valid}}$)**:
   ```sql
   SELECT id, total FROM orders
   WHERE deleted_at IS NULL
     AND status NOT IN ('Cancelled', 'CANCELLED', 'Returned', 'Issue')
     AND created_at BETWEEN :from AND :to
   ```
2. **Gross Revenue**:
   $$\text{Revenue} = \sum_{o \in O_{\text{valid}}} o.\text{total}$$
3. **Cost of Goods Sold (COGS)**:
   Queries `order_items` for all $o \in O_{\text{valid}}$ using the historical `unit_cost` snapshotted at the time of sale:
   $$\text{COGS} = \sum_{i \in \text{items}(O_{\text{valid}})} \left( i.\text{quantity} \times i.\text{unit\_cost} \right)$$
4. **Gross Profit & Gross Margin %**:
   $$\text{Gross Profit} = \text{Revenue} - \text{COGS}$$
   $$\text{Gross Margin \%} = \begin{cases} \left(\frac{\text{Gross Profit}}{\text{Revenue}}\right) \times 100 & \text{if Revenue} > 0 \\ 0 & \text{otherwise} \end{cases}$$
5. **Operating Expenses ($\text{OpEx}$)**:
   Queries non-voided expenses excluding raw inventory purchases (`voided_at IS NULL AND category != 'vendor_purchase'`):
   $$\text{OpEx}_{\text{total}} = \text{OpEx}_{\text{operational}} + \text{OpEx}_{\text{salary}} + \text{OpEx}_{\text{affiliate\_payout}} + \text{OpEx}_{\text{other}}$$
6. **Net Profit & Net Margin %**:
   $$\text{Net Profit} = \text{Gross Profit} - \text{OpEx}_{\text{total}}$$
   $$\text{Net Margin \%} = \begin{cases} \left(\frac{\text{Net Profit}}{\text{Revenue}}\right) \times 100 & \text{if Revenue} > 0 \\ 0 & \text{otherwise} \end{cases}$$

---

## 7. Order Status State Machine (`VALID_ORDER_TRANSITIONS`)

Enforced in `PATCH /api/orders/:id/status` (`/backend/src/routes/orders.ts`):

| Current Status | Allowed Next Statuses | Stock Impact |
| :--- | :--- | :--- |
| **`Pending`** | `Confirmed`, `Processing`, `In Transit`, `Delivered`, `Cancelled`, `Issue` | Deducts stock (`sale`) only if jumping directly to `Delivered`. |
| **`Confirmed`** | `Processing`, `In Transit`, `Delivered`, `Cancelled`, `Issue` | Deducts stock (`sale`) if moving to `Delivered`. |
| **`Processing`** | `In Transit`, `Delivered`, `Cancelled`, `Issue` | Deducts stock (`sale`) if moving to `Delivered`. |
| **`In Transit`** | `Delivered`, `Cancelled`, `Issue`, `Returned` | Deducts stock (`sale`) if moving to `Delivered`. |
| **`Delivered`** | `Returned`, `Cancelled`, `Issue` | **Restores stock (`return`)** atomically inside the transaction. Cannot jump back to `Pending`. |
| **`Issue`** | `Pending`, `Confirmed`, `Processing`, `In Transit`, `Delivered`, `Cancelled`, `Returned` | Deducts stock (`sale`) if resolved to `Delivered`. |
| **`Returned`** | *(Terminal)* | None |
| **`Cancelled`** | *(Terminal)* | None |

---

## 8. Role-Based Access Control (RBAC) Matrix for Stock & Accounting

| Endpoint | Admin | Manager | Employee | Delivery | Affiliate | 2FA Required? |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `GET /api/stock` & `/api/stock/summary` | ✅ | ✅ | ✅ | ❌ | ❌ | No |
| `GET /api/stock/movements` | ✅ | ✅ | ❌ | ❌ | ❌ | No |
| `POST /api/stock/adjustment` | ✅ | ✅ | ❌ | ❌ | ❌ | No |
| `POST /api/stock/receive/:vendorOrderId` | ✅ | ✅ | ❌ | ❌ | ❌ | No |
| `POST /api/stock/request` & `GET /requests` | ✅ | ✅ | ✅ | ❌ | ❌ | No |
| `PATCH /api/stock/requests/:id/status` | ✅ | ✅ | ❌ | ❌ | ❌ | No |
| `GET /api/vendor-orders` & `POST /` | ✅ | ✅ | ✅ | ❌ | ❌ | No |
| `PATCH /api/vendor-orders/:id/status` | ✅ | ✅ | ❌ | ❌ | ❌ | No |
| `GET /api/expenses` & `POST /api/expenses` | ✅ | ✅ | ❌ | ❌ | ❌ | No |
| `DELETE /api/expenses/:id` (Void expense) | ✅ | ❌ | ❌ | ❌ | ❌ | No |
| `PATCH /api/referrals/commissions/:id/pay` | ✅ | ❌ | ❌ | ❌ | ❌ | **Yes (`require2FA`)** |
| `GET /api/reports/pl` & `/pl/export` | ✅ | ✅ | ❌ | ❌ | ❌ | No |
