# Asella Organic — Code & Development Rules

---

## 1. Strict Zero-Emoji Policy
- **No Emojis Anywhere:** Do not use emojis in user-facing UI, notification text, Telegram bot messages, system logs, buttons, dialogs, or documentation.
- **Visual Indicators:** Use clean typography, SVG icons, or Google Material Symbols instead of unicode emojis.
- **Customer Communications:** All automated receipts, alerts, and bot messages must maintain a professional and clean corporate tone without emoji clutter.

---

## 2. Codebase Integrity & Style Guidelines
- **TypeScript First:** Strict type checking must remain enabled. Avoid any where possible.
- **No Superficial Patches:** Never mask errors by suppressing exceptions, returning dummy fallbacks silently, or removing unit tests.
- **Documentation Preservation:** Maintain all existing comments and JSDoc annotations unless explicitly rewriting logic.

---

## 3. API & Security Rules
- **Schema Verification:** All mutation endpoints (POST, PUT, PATCH) must validate input payloads using Zod schemas in backend/src/schemas/.
- **Telegram Authentication:** All incoming Telegram Mini App requests must validate cryptographic initData using HMAC-SHA256 with the bot token secret. Never trust client-supplied user IDs without cryptographic signature verification.
- **COGS Preservation:** Never overwrite historical unit_cost values stored in order_items. Moving Average Cost (MAC) changes must only update products.unit_cost.
- **Idempotency:** Critical write requests (like order placement) should accept Idempotency-Key headers to prevent duplicate processing.
- **Content Security Policy (CSP):** The project root csp-config.js is the single source of truth for CSP headers. Never add inline scripts to frontend/index.html.

---

## 4. UI/UX & Aesthetics Rules
- **Brand Palette:** Respect the brand palette (highland-gold, obsidian, parchment, cream, forest-green). Do not introduce generic primary colors.
- **Button Roundness:** Use rounded-lg for storefront buttons for site-wide visual consistency.
- **Micro-Animations:** Use native CSS transitions or the ScrollReveal component for scroll-triggered elements. Avoid unnecessary external heavy JS animation libraries.
- **Telegram Mini App Experience:** The Mini App must feel like a native mobile app:
  - Synchronize with Telegram theme parameters (themeParams) for light/dark mode.
  - Integrate native MainButton, BackButton, and HapticFeedback.
  - Auto-expand viewport using WebApp.expand() on mount.
  - Enable closing confirmation when the user has items in the cart.

---

## 5. Telegram Integration Rules
- **Universal Regional Routing:** All orders with order_type === 'delivery' must be sent to TELEGRAM_DELIVERY_GROUP_ID regardless of city/region.
- **Customer Linking:** When orders are created via Telegram Mini App or bot, link customers.telegram_chat_id and send instant order confirmation receipts back to the user's private Telegram chat.
- **Staff Verification:** Staff access via Telegram bot must enforce telegram_username verification and session binding.
