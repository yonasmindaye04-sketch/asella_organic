# Asella Organic — Code & Development Rules

> **MANDATORY PREREQUISITE:** Whenever asked to build, modify, or refactor any feature or page in this codebase, you MUST read and strictly adhere to this `rule.md` file first.

---

## 1. Strict Zero-Emoji Policy
- **No Emojis Anywhere:** Do not use emojis in user-facing UI, notification text, Telegram bot messages, system logs, buttons, dialogs, or documentation.
- **Visual Indicators:** Use clean typography, SVG icons, or Google Material Symbols instead of unicode emojis.
- **Customer Communications:** All automated receipts, alerts, and bot messages must maintain a professional and clean corporate tone without emoji clutter.

---

## 2. Codebase Integrity & Style Guidelines
- **TypeScript First:** Strict type checking must remain enabled. Avoid `any` where possible.
- **No Superficial Patches:** Never mask errors by suppressing exceptions, returning dummy fallbacks silently, or removing unit tests.
- **Documentation Preservation:** Maintain all existing comments and JSDoc annotations unless explicitly rewriting logic.

---

## 3. Strict Responsiveness & Mobile-First Standards
- **Rule First Workflow:** Read and check `rule.md` before designing or writing any code. Every implementation must conform to responsive standards.
- **Fluid Breakpoints:** Every screen, component, modal, and widget must adapt seamlessly across all standard breakpoints:
  - Mobile Phones: 320px – 640px (`sm`)
  - Tablets: 641px – 1023px (`md` / `lg`)
  - Laptops & Desktops: 1024px – 1280px (`lg` / `xl`)
  - Ultra-wide Displays: > 1280px (`2xl`)
- **Zero Horizontal Overflow:** Never introduce unintentional horizontal scrolling on pages. Viewport roots must maintain `overflow-x: hidden`, flex containers must set `min-w-0`, and long text strings must wrap or truncate gracefully.
- **Touch-Friendly Hit Targets:** Interactive elements (buttons, menu triggers, inputs, checkboxes, tabs) must have a minimum target size of 44x44px on touch viewports with comfortable tap padding.
- **Responsive Modals & Dialogs:** Modals must comfortably fit mobile screens (`max-h-[90vh]` or `max-h-screen`, `overflow-y-auto`, `p-3 sm:p-6`). Mobile action footers must stack buttons full-width (`w-full sm:w-auto`) for thumb accessibility.
- **Responsive Data Grids & Tables:** Complex tables (orders, stock, customers, analytics) must provide horizontal scroll containers (`overflow-x-auto`) or mobile card layouts so columns never collide or get clipped.
- **iOS & Mobile Form Zoom Prevention:** Mobile inputs and selects must be legible and formatted (font size at least 14px–16px) to avoid erratic browser auto-zooming on focus.
- **Collapsible Navigation:** Navigation drawers and sidebars must collapse into intuitive mobile drawers with touch-friendly backdrops on screens under 1024px.

---

## 4. UI/UX & Aesthetics Rules
- **Brand Palette:** Respect the brand palette (highland-gold, obsidian, parchment, cream, forest-green). Do not introduce generic primary colors.
- **Button Roundness:** Use `rounded-lg` for storefront buttons for site-wide visual consistency.
- **Micro-Animations:** Use native CSS transitions or the `ScrollReveal` component for scroll-triggered elements. Avoid unnecessary external heavy JS animation libraries.
- **Telegram Mini App Experience:** The Mini App must feel like a native mobile app:
  - Synchronize with Telegram theme parameters (`themeParams`) for light/dark mode.
  - Integrate native `MainButton`, `BackButton`, and `HapticFeedback`.
  - Auto-expand viewport using `WebApp.expand()` on mount.
  - Enable closing confirmation when the user has items in the cart.

---

## 5. API & Security Rules
- **Schema Verification:** All mutation endpoints (POST, PUT, PATCH) must validate input payloads using Zod schemas in `backend/src/schemas/`.
- **Telegram Authentication:** All incoming Telegram Mini App requests must validate cryptographic `initData` using HMAC-SHA256 with the bot token secret. Never trust client-supplied user IDs without cryptographic signature verification.
- **COGS Preservation:** Never overwrite historical `unit_cost` values stored in `order_items`. Moving Average Cost (MAC) changes must only update `products.unit_cost`.
- **Idempotency:** Critical write requests (like order placement) should accept `Idempotency-Key` headers to prevent duplicate processing.
- **Content Security Policy (CSP):** The project root `csp-config.js` is the single source of truth for CSP headers. Never add inline scripts to `frontend/index.html`.

---

## 6. Telegram Integration Rules
- **Universal Regional Routing:** All orders with `order_type === 'delivery'` must be sent to `TELEGRAM_DELIVERY_GROUP_ID` regardless of city/region.
- **Customer Linking:** When orders are created via Telegram Mini App or bot, link `customers.telegram_chat_id` and send instant order confirmation receipts back to the user's private Telegram chat.
- **Staff Verification:** Staff access via Telegram bot must enforce `telegram_username` verification and session binding.
