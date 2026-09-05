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
- All Mini App code resides under `frontend/src/context/TelegramContext.tsx` and `frontend/src/pages/TelegramStore.tsx`.
- Communication with Telegram must use `window.Telegram.WebApp`.
- The Mini App must call `WebApp.ready()` and `WebApp.expand()` upon initialization.
- Sync themes with Telegram theme parameters (`themeParams`) for light and dark environments.
- Bind the Telegram `MainButton` to cart and checkout actions, and `BackButton` to navigation history.
- Never trust unverified client data. All requests modifying state must be cryptographically authenticated via `initData` or JWT.

### 4. Database & Accounting Integrity
- Accrual accounting with Cost of Goods Sold (COGS) requires historical `unit_cost` snapshots on every order line item.
- Never alter existing `unit_cost` values in `order_items`.
- Moving Average Cost (MAC) changes must only update `products.unit_cost` upon vendor inventory receipt.
- Use transactions (`connection.beginTransaction()`, `commit()`, `rollback()`) for all order creation and inventory deduction logic.

---

## Workflow for New Features & Changes
1. **Analyze First:** Inspect existing routes, schemas, hooks, and tests before writing code.
2. **Typecheck & Lint:** Always execute `npm run typecheck` in both `frontend` and `backend` directories.
3. **Verify CSP Compliance:** Run `npm run check-csp` in `frontend` whenever scripts or network resources are added.
4. **Log Activity:** Record notable additions and architecture updates in `CHANGELOG.md`.
