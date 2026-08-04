# Asella Organic — Architectural & Design Decisions (ADRs)

---

## ADR 001: Accrual Accounting & Moving Average Cost (MAC)
- **Status:** Approved & Implemented
- **Context:** Cash-basis accounting overstated profits whenever bulk inventory was purchased.
- **Decision:** Switch to **Accrual Accounting** with Cost of Goods Sold (COGS).
- **Implementation:**
  - `products` table maintains `unit_cost` via Moving Average Cost calculation on vendor purchase receipt.
  - `order_items` snapshots `unit_cost` at order creation time to protect historical profit calculations.

## ADR 002: Universal Telegram Delivery Broadcast
- **Status:** Approved & Implemented
- **Context:** Previously, delivery notifications to the Telegram delivery group were restricted to orders in Addis Ababa.
- **Decision:** Remove the city filter (`fields.city.includes("addis")`).
- **Implementation:** All orders with `order_type === 'delivery'` trigger `sendToDeliveryGroup()`, notifying delivery drivers regardless of region.

## ADR 003: Client-Side Scroll Reveal & Animation Driver
- **Status:** Approved & Implemented
- **Context:** The storefront required dynamic scroll animations without adding heavy external animation libraries like Framer Motion or GSAP.
- **Decision:** Build a lightweight native `IntersectionObserver` hook (`useScrollReveal`) and wrapper component (`ScrollReveal`).
- **Impact:** 0 KB added payload, GPU-accelerated CSS animations.

## ADR 004: Lightweight Progress & Loading Indicators
- **Status:** Approved & Implemented
- **Context:** Standard loading spinners were unappealing and provided poor visual feedback.
- **Decision:**
  - Use `nprogress` with a `highland-gold` theme for top page navigation.
  - Implement a nature-inspired SVG leaf pulse for full-page React Suspense loads.
  - Implement a button spinner for form submissions.
  - Implement gold/cream shimmering skeletons for product grid loading.

## ADR 005: Telegram Staff RBAC Authentication
- **Status:** Approved & Implemented
- **Context:** Staff required bot access to manage orders securely via Telegram.
- **Decision:** Store `telegram_username` and `telegram_chat_id` in `staff_users`, enforcing 2FA/Confirm Identity prior to granting role-specific bot commands.
