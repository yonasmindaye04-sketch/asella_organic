# Asella Organic — Project Context

---

## Executive Summary
**Asella Organic** is an e-commerce, inventory, and operations platform for a premium Ethiopian organic health products business. The platform connects customer-facing shopping experiences with backend warehouse operations, staff role management, affiliate referrals, and automated Telegram bot dispatching.

---

## Domain Overview & Key Business Processes

1. **Storefront & Catalog:**
   - Customers explore organic products (Moringa, Shilajit, Ashwagandha, Blackseed Oil, Qasil, Frankincense, etc.).
   - Multi-language support (English, Amharic, Afaan Oromo).

2. **Order Lifecycle & Delivery Routing:**
   - Orders can originate from the web storefront, Telegram bot, or manual admin entry.
   - All `delivery` orders are automatically broadcasted to the Telegram delivery driver group.

3. **Accrual Accounting & COGS:**
   - Uses Cost of Goods Sold (COGS) accounting rather than cash-basis.
   - Moving Average Cost (MAC) auto-recalculates when vendor stock is received.
   - Snapshot of `unit_cost` saved with each order item.

4. **Staff Roles & 2FA:**
   - Roles: `admin`, `manager`, `employee`, `delivery`.
   - Supports TOTP 2FA for staff security and Telegram bot identity confirmation.

5. **Internal Stock Transfers & Notifications:**
   - Secondary store staff can issue `stock_requests` specifying item details and `package_size` (e.g. 30ml, 60ml, 250g).
   - In-app notification center alerts managers to low stock, new orders, and stock requests.
