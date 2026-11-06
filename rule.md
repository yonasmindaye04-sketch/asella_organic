# Asella Organic — Code & Development Rules

> **MANDATORY PREREQUISITE:** Whenever asked to build, modify, or refactor any feature or page in this codebase, you MUST read and strictly adhere to this `rule.md` file first. These rules apply to all agents and contributors working on this codebase.

---

## 1. Strict Zero-Emoji & Visual Indicator Policy
- **No Emojis Anywhere:** Never use emoji characters anywhere in the user interface, JSX/TSX files, CSS content, HTML strings, user-facing UI, notification text, Telegram bot messages, system logs, buttons, dialogs, or documentation.
- **Visual Indicators:** Use **FontAwesome icons** (e.g. `<i className="fa-solid fa-envelope" />`), SVG icons, or Google Material Symbols if an icon is needed. If no icon is needed, use clean plain text.
- **Customer Communications:** All automated receipts, alerts, and bot messages must maintain a professional and clean corporate tone without emoji clutter.

---

## 2. Badges, Indicators & Icon Styling
- **No Background or Border on Indicators & Badges:** All indicators, tags, and status badges (e.g. order status, payment status, discount/savings labels) must use **bold colored text only**. No low-opacity background colors, no backgrounds at all, no borders, no padding beyond what is needed for inline flow, and no dot pseudo-elements (`::before`).
  - *Correct:* bold green text for "Delivered" / "Paid", bold red text for "Cancelled" / "Unpaid", bold highland-gold text for "Save 15%".
  - *Wrong:* pill-shaped badge with a light translucent background (e.g., `rgba(x, x, x, 0.12)`) and a colored dot.
- **No Decorative Tag Badges on Section Headings:** Do not place `<Badge>` components or similar decorative tag-style elements beside section or page titles/headings.
  - *Wrong:* `<h2>Receipt Preview <Badge tone="good">Latest Live Transaction</Badge></h2>`
  - *Right:* `<h2>Receipt Preview</h2>` with a descriptive `<p>` below it.
- **No Icon Background Tiles:** Icons render as **bare colored glyphs** — no rounded background squares, no tinted tiles, and no shadows behind icons (stat icons, dashboard cards, system cards). Clean surface backgrounds with bare icons.

---

## 3. UI/UX, Theming & Aesthetics Standards
- **Brand Palette & Tokens:** Respect the brand palette (`highland-gold`, `obsidian`, `parchment`, `cream`, `forest-green`). Do not hardcode hex colors outside design tokens or Tailwind configuration.
- **Button Roundness:** Use `rounded-lg` for storefront buttons for site-wide visual consistency.
- **Dark Mode & Light Mode Support:** Both **Dark Mode** (`[data-theme="dark"]` or `.dark`) and **Light Mode** must be fully supported across the entire application:
  - Never hardcode `#ffffff` card/panel/table backgrounds in dark mode — always use theme CSS variables or theme-aware Tailwind classes (e.g., `var(--card)`, `var(--border)`, `var(--bg-alt)`).
  - Status indicators and table slots must never use colored background tints or thick colored indicator borders — use clean surface backgrounds with bold typography.
- **Theme Toggle Placement:** The theme toggle (moon/sun icon) exists **only** in the primary navigation header/sidebar brand bar. Never add a duplicate theme toggle in the footer or anywhere else on the page.
- **No Intrusive Banners or Comparison Bars:** Do not render trial banners, intrusive popups, or unsolicited comparison bars to end users. Maintain an uncluttered, high-end organic store aesthetic.
- **Compact Date Range Filters:** All date-range filter inputs (`type="date"`) inside toolbars and filter bars must be wrapped in a flex group with explicit width (e.g., `width: 150px` or `w-[150px]`) on each input to prevent them from stretching full-width:
  ```tsx
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    <input className="input-field" type="date" style={{ width: 150 }} ... />
    <span className="text-dim">to</span>
    <input className="input-field" type="date" style={{ width: 150 }} ... />
  </div>
  ```
- **Micro-Animations:** Use native CSS transitions or the `ScrollReveal` component for scroll-triggered elements. Avoid unnecessary external heavy JS animation libraries.
- **Telegram Mini App Experience:** The Mini App must feel like a native mobile app:
  - Synchronize with Telegram theme parameters (`themeParams`) for light/dark mode.
  - Integrate native `MainButton`, `BackButton`, and `HapticFeedback`.
  - Auto-expand viewport using `WebApp.expand()` on mount.
  - Enable closing confirmation when the user has items in the cart.

---

## 4. Strict Responsiveness & Mobile Compaction Standards
- **Rule First Workflow:** Read and check `rule.md` before designing or writing any code. Every implementation must conform to responsive standards.
- **Fluid Breakpoints:** Every screen, component, modal, and widget must adapt seamlessly across all standard breakpoints:
  - Mobile Phones: 320px – 640px (`sm`)
  - Tablets: 641px – 1023px (`md` / `lg`)
  - Laptops & Desktops: 1024px – 1280px (`lg` / `xl`)
  - Ultra-wide Displays: > 1280px (`2xl`)
- **Mobile Compaction Rules:** Pages must stay dense and usable on phones:
  - **KPI Stats:** Render **two per row** at ≤ 640px with compact padding and typography — never one giant card per row. Never set inline `gridTemplateColumns` that defeats responsive CSS.
  - **Page Action Buttons:** Share one row (`flex: 1` or grid) at mobile sizes rather than stacking into giant vertical blocks.
  - **Dashboard Tiles:** Stay **two-across** down to small phones — don't collapse into a single vertical column and don't hide icons to "save space".
- **Zero Horizontal Overflow:** Never introduce unintentional horizontal scrolling on pages. Viewport roots must maintain `overflow-x: hidden`, flex containers must set `min-w-0`, and long text strings must wrap or truncate gracefully.
- **Touch-Friendly Hit Targets:** Interactive elements (buttons, menu triggers, inputs, checkboxes, tabs) must have a minimum target size of 44x44px on touch viewports with comfortable tap padding.
- **Responsive Modals & Dialogs:** Modals must comfortably fit mobile screens (`max-h-[90vh]` or `max-h-screen`, `overflow-y-auto`, `p-3 sm:p-6`). Mobile action footers must stack buttons full-width (`w-full sm:w-auto`) for thumb accessibility.
- **Responsive Data Grids & Tables:** Complex tables (orders, stock, customers, analytics) must provide horizontal scroll containers (`overflow-x-auto`) or mobile card layouts so columns never collide or get clipped.
- **iOS & Mobile Form Zoom Prevention:** Mobile inputs and selects must be legible and formatted (font size at least 14px–16px) to avoid erratic browser auto-zooming on focus.
- **Collapsible Navigation:** Navigation drawers and sidebars must collapse into intuitive mobile drawers with touch-friendly backdrops on screens under 1024px.

---

## 5. Navigation & Reachability
- **Reachability Rule:** Every feature page, report, and admin tool must be **reachable from the UI**. Routes that exist in code but have no navigation entry or button link are considered broken — whenever adding or refactoring a page, ensure navigation entries (sidebar links, tabs, or menus) are also implemented.

---

## 6. Secure-Context Features (Camera & Hardware)
- **HTTPS Enforcement:** Camera features (QR/barcode scanning for inventory, order receipts, or physical packages) require **HTTPS** (or localhost).
- **Graceful Degradation:** Ship friendly error messages for camera permission denial or insecure context, and **always offer a manual fallback** (e.g., typed text input for order numbers or SKU barcodes).

---

## 7. Print & Document Design
- **Formal Document Layouts:** Printable receipts, invoices, stock manifests, and daily store reports must follow a formal layout: dual-tone header, cleanly boxed customer/order info, crisp itemized table, totals calculation, and signature lines where applicable.

---

## 8. Codebase Integrity, Type Safety & Build Verification
- **TypeScript First:** Strict type checking must remain enabled across backend and frontend. Avoid `any` where possible.
- **Typecheck & Build Verification:** Run `npm run typecheck` (`tsc --noEmit` in backend, `tsc -b --noEmit` in frontend) and build verification (`vite build` / `npm run build`) to confirm type safety and build success after backend or frontend changes.
- **No Superficial Patches:** Never mask errors by suppressing exceptions, returning dummy fallbacks silently, or removing unit tests.
- **Documentation Preservation:** Maintain all existing comments and JSDoc annotations unless explicitly rewriting logic.
- **Agent Artifact Discipline:** Never use `ArtifactMetadata` when writing or editing project source files (only use it for artifact documents in the assistant brain directory).

---

## 9. Backend Architecture & Async Handlers
- **Async Route Handlers:** Express 4 does **not** catch unhandled asynchronous rejections. Every async route handler must be wrapped in `asyncHandler` (or an explicit `try/catch` block passing the error to `next(err)`). An unwrapped handler turns any database failure or runtime exception into a hung request or an unhandled process crash.

---

## 10. Database, SQL & Migration Discipline
- **Sequential Codes Are MAX-Based:** Human-facing codes (`ORD-00001`, `REC-00001`, `CUST-00001`, `EXP-00001`) must be generated using `MAX(trailing digits) + 1`:
  - **Never** use `count(*) + 1` — deleting or voiding a record hands that code to the next insert and creates duplicates.
  - Seed scripts must **continue numbering from the existing MAX** in the table, never restart at 1.
  - Both prefix formats (`ORD0042` and `ORD-00042`) must parse by extracting digits; never assume fixed character positions.
- **SQL Column Discipline:**
  - **Qualify every column** when a query has a `JOIN`: `WHERE o.status = ?`, not `WHERE status = ?` (avoid ambiguity crashes when joined tables share column names like `id`, `created_at`, or `status`).
  - **Count/summary side-queries must not reference aliases** defined only in the main query — e.g. `SELECT COUNT(*) FROM orders o WHERE c.id = ?` fails if alias `c` does not exist in the count query.
  - Always verify list endpoints (including their COUNT side-queries and filter variants) against a real database before shipping.
- **Migrations & Seeds:**
  - New migrations get the **next unused sequential number** in `backend/db/sql/` (check the directory first, e.g. `061_...sql`).
  - Migrations must be **strictly idempotent** (`CREATE TABLE IF NOT EXISTS`, conditional column/index additions, `ON DUPLICATE KEY UPDATE`).
  - Every schema-changing migration must be applied to the database before release.
  - Seed scripts must be **re-runnable**: skip existing records and continue code numbering from existing MAX values.
  - Check constraints and ENUMs must cover every value the application inserts.

---

## 11. API, Session & Authentication Security
- **Session Security:**
  - Use short-lived JWT tokens (`JWT_EXPIRES_IN=8h` or appropriate lifetime).
  - Implement a **30-minute client-side inactivity timeout** for authenticated sessions that silently logs the user out (reset timer on `mousemove`, `keydown`, `click`, `scroll`) without disruptive warning popups.
  - Handle `401` responses from the API by immediately clearing authentication state and redirecting to login.
- **Schema Verification:** All mutation endpoints (POST, PUT, PATCH) must validate input payloads using Zod schemas in `backend/src/schemas/`.
- **Telegram Authentication:** All incoming Telegram Mini App requests must validate cryptographic `initData` using HMAC-SHA256 with the bot token secret. Never trust client-supplied user IDs without cryptographic signature verification.
- **COGS Preservation:** Never overwrite historical `unit_cost` values stored in `order_items`. Moving Average Cost (MAC) changes must only update `products.unit_cost`.
- **Idempotency:** Critical write requests (like order placement) should accept `Idempotency-Key` headers to prevent duplicate processing.
- **Content Security Policy (CSP):** The project root `csp-config.js` is the single source of truth for CSP headers. Never add inline scripts to `frontend/index.html`.

---

## 12. Telegram Integration Rules
- **Universal Regional Routing:** All orders with `order_type === 'delivery'` must be sent to `TELEGRAM_DELIVERY_GROUP_ID` regardless of city/region.
- **Customer Linking:** When orders are created via Telegram Mini App or bot, link `customers.telegram_chat_id` and send instant order confirmation receipts back to the user's private Telegram chat.
- **Staff Verification:** Staff access via Telegram bot must enforce `telegram_username` verification and session binding.
