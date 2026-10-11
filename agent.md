# Asella Organic — Agent Instructions & Operating Manual

---

## Mission & Scope
This document outlines the operational principles, codebase architecture, and execution standards for automated agents working on the Asella Organic platform. Agents must strictly adhere to these protocols to ensure security, high performance, clean aesthetics, and zero downtime.

---

## Core Principles

### 1. Zero-Emoji Enforcement
- Absolutely no emojis are permitted across the codebase.
- User interfaces, notifications, Telegram messages, bot alerts, console logs, and markdown files must remain completely emoji-free.
- Visual hierarchy and status representations must rely on clean typography, SVG icons, and Google Material Symbols.

### 2. Architecture & Tech Stack
- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS, Redux Toolkit, React Router 7.
- **Backend:** Express 5 on Node.js 24, TypeScript (ESM modules with `.js` extensions in imports), Zod validation, MySQL 8.0 via `mysql2/promise`.
- **Integrations:** Telegram Bot API, Telegram Mini App WebApp SDK, Google Sheets API, Cloudinary.
- **Security:** Helmet CSP with unified `csp-config.js`, rate limiting, strict CSRF origin verification, and HMAC-SHA256 Telegram validation.

### 3. Telegram Mini App Guidelines
- SDK access goes through `frontend/src/context/TelegramContext.tsx`. Platform detection and low-level types live in `frontend/src/telegram/`.
- All Mini App UI lives under `frontend/src/telegram/shop/`, split by concern: `TmaShell`/`BottomNav` (chrome), `StoreTab`, `DiscoverTab`, `OrdersTab`, `AccountTab` (tabs), and `CartView`/`CheckoutView`/`DetailView`/`ConfirmationView` (overlays). `frontend/src/pages/TelegramStore.tsx` stays a thin router that owns shared state.
- The Mini App has its own entry: `frontend/tma.html` + `frontend/src/tma.tsx`. Never import the website's `App.tsx`, `index.css`, Redux `Provider` or service-worker registration into that entry — customers ordering in Telegram must not download the marketing site. `/tma` and `/telegram-store` are rewritten to `tma.html` by both `public/.htaccess` and the Vite dev middleware, and those rewrites must stay ahead of the SPA fallback.
- Communication with Telegram must use `window.Telegram.WebApp`.
- The Mini App must call `WebApp.ready()` and `WebApp.expand()` upon initialization.
- Sync themes with Telegram theme parameters (`themeParams`) for light and dark environments.
- Bind the Telegram `MainButton` to cart and checkout actions, and `BackButton` to navigation history.
- Never trust unverified client data. All requests modifying state must be cryptographically authenticated via `initData` or JWT.
- Customer-facing Mini App endpoints must call `authenticateMiniApp` in `backend/src/routes/telegram.ts` and must never accept a caller-supplied `chat_id` or `phone` as an identity claim.

### 4. Database & Accounting Integrity
- Accrual accounting with Cost of Goods Sold (COGS) requires historical `unit_cost` snapshots on every order line item.
- Never alter existing `unit_cost` values in `order_items`.
- Moving Average Cost (MAC) changes must only update `products.unit_cost` upon vendor inventory receipt.
- Use transactions (`connection.beginTransaction()`, `commit()`, `rollback()`) for all order creation and inventory deduction logic.

### 5. Local Development Ports
- The backend listens on **3001** and the Vite dev server on **5173**. The frontend proxies `/api` to 3001, so run both for any feature work.
- Vite runs with `strictPort: true`. If it prints a port-in-use error, a previous `npm run dev` is still running — find it with `Get-NetTCPConnection -State Listen -LocalPort 5173,5174` and stop it. Do not "fix" the symptom by using the shifted port.
- In development the backend's CSRF check accepts any loopback origin (any `localhost`/`127.0.0.1` port) so a port shift cannot cause a misleading failure. In production the `ALLOWED_ORIGINS` list is matched **exactly** — never by `startsWith`, which would accept `asellaorganic.com.attacker.io`.
- A **403 "CSRF protection: Origin mismatch"** on any POST (including login) means the frontend is running on a port the backend does not expect. Check for stale dev servers before suspecting auth or route code.

---

## Workflow for New Features & Changes
1. **Analyze First:** Inspect existing routes, schemas, hooks, and tests before writing code.
2. **Typecheck & Lint:** Always execute `npm run typecheck` in both `frontend` and `backend` directories.
3. **Verify CSP Compliance:** Run `npm run check-csp` in `frontend` whenever scripts or network resources are added.
4. **Log Activity:** Record notable additions and architecture updates in `CHANGELOG.md`.
