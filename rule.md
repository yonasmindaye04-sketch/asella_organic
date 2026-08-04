# Asella Organic — Code & Development Rules

---

## 1. Codebase Integrity & Style Guidelines
- **TypeScript First:** Strict type checking must remain enabled. Avoid `any` where possible.
- **No Superficial Patches:** Never mask errors by suppressing exceptions, returning dummy fallbacks silently, or removing unit tests.
- **Documentation Preservation:** Maintain all existing comments and JSDoc annotations unless explicitly rewriting logic.

## 2. API & Data Rules
- **Schema Verification:** All mutation endpoints (`POST`, `PUT`, `PATCH`) must validate input payloads using Zod schemas in `backend/src/schemas/`.
- **COGS Preservation:** Never overwrite historical `unit_cost` values stored in `order_items`. Moving Average Cost (MAC) changes must only update `products.unit_cost`.
- **Idempotency:** Critical write requests (like order placement) should accept `Idempotency-Key` headers to prevent duplicate processing.

## 3. UI/UX & Aesthetics Rules
- **Color Palette Integrity:** Respect the brand palette (`highland-gold`, `obsidian`, `parchment`, `cream`). Do not introduce generic primary colors (e.g. plain `#ff0000`).
- **Button Roundness:** Use `rounded-lg` for storefront buttons for site-wide visual consistency.
- **Micro-Animations:** Use native CSS transitions or the `ScrollReveal` component for scroll-triggered elements. Avoid unnecessary external heavy JS animation libraries.

## 4. Telegram Integration Rules
- **Delivery Broadcasts:** All orders with `order_type === 'delivery'` must be sent to `TELEGRAM_DELIVERY_GROUP_ID` regardless of city/region.
- **Staff Verification:** Staff access via Telegram bot must enforce `telegram_username` verification and session binding.
