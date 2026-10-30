# Asella Organic

Asella Organic is a full-stack e-commerce, inventory, and operations platform for premium organic agricultural products, featuring a modern React 19 frontend, an Express 5 backend, automated Telegram bot delivery dispatches, and accrual accounting.

---

## Documentation Catalog & Index

To keep the codebase maintainable and organized, technical documentation is categorized below:

### Architecture & System Design
- [Architecture Overview](file:///c:/Users/MrYoYo/Desktop/project/asella_organic/architecture.md): High-level system topology, module interaction, and request lifecycle.
- [Database Schema (v2)](file:///c:/Users/MrYoYo/Desktop/project/asella_organic/database.md): Entity definitions, relations, parent-variant catalog structure, and views.
- [Accounting & Inventory Design](file:///c:/Users/MrYoYo/Desktop/project/asella_organic/ACCOUNTING_AND_INVENTORY_SYSTEM_DESIGN.md): Cost of Goods Sold (COGS), Moving Average Cost (MAC), and double-entry stock movement ledger.
- [Architecture Decision Records](file:///c:/Users/MrYoYo/Desktop/project/asella_organic/decision.md): Historical architectural decisions and rationales.

### Deployment & Runbooks
- [Production Deployment Guide](file:///c:/Users/MrYoYo/Desktop/project/asella_organic/backend/deployment%20guide.md): The authoritative production runbook for cPanel, Node 24 Selector, Passenger, and LiteSpeed.
- [Deployment Gotchas & Incidents](file:///c:/Users/MrYoYo/Desktop/project/asella_organic/DEPLOYMENT_GOTCHAS.md): Documented historical deployment traps, CSP rules, and service worker cache policies.
- [Telegram Mini App & Cloudflare Runbook](file:///c:/Users/MrYoYo/Desktop/project/asella_organic/MINIAPP_CLOUDFLARE_RUNBOOK.md): Tunnel configuration, Telegram bot registration, and webhook handling.

### Development, Standards & Operations
- [Development Setup Guide](file:///c:/Users/MrYoYo/Desktop/project/asella_organic/setup.md): Local development environment configuration, database seeding, and bot testing.
- [Agent Operating Manual](file:///c:/Users/MrYoYo/Desktop/project/asella_organic/agent.md): Operating instructions, safety protocols, and port rules for AI assistants.
- [Code Rules & Standards](file:///c:/Users/MrYoYo/Desktop/project/asella_organic/rule.md): Coding guidelines, strict zero-emoji policy, and security conventions.
- [Customer Service Guide](file:///c:/Users/MrYoYo/Desktop/project/asella_organic/CUSTOMER_SERVICE_GUIDE.md): Operational guide for call center agents and support staff.
- [Security Review](file:///c:/Users/MrYoYo/Desktop/project/asella_organic/SECURITY_REVIEW.md): Audit findings, RBAC matrix, and vulnerability remediations.
- [Changelog](file:///c:/Users/MrYoYo/Desktop/project/asella_organic/CHANGELOG.md): Historical record of platform changes.

---

## Pre-Deployment Checklist

Before deploying this application to the production server, ensure the following items are configured:

### 1. Environment Variables (cPanel Node.js App)
Configure environment variables in **cPanel -> Setup Node.js App** (not in `.env` directly):
- `NODE_ENV=production`: Enables secure cookies, suppresses verbose stack traces, and optimizes Express.
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins (e.g. `https://www.asellaorganic.com,https://asellaorganic.com`).
- `JWT_SECRET`: Minimum 32-character cryptographically secure random string.
- `TELEGRAM_BOT_TOKEN`: Production Telegram bot token from BotFather.
- `TELEGRAM_WEBHOOK_SECRET`: Secret token used to authenticate Telegram webhook payloads.
- `CLOUDINARY_URL` / Cloudinary credentials: Required for product photography and receipt uploads.

### 2. Database Readiness
- Connect to MariaDB 10.11+ using character set `utf8mb3` / `utf8mb3_unicode_ci`.
- Execute migrations in `backend/db/sql/` following the production deployment guide.
- Bootstrap the first admin explicitly:
  ```bash
  cd backend
  INITIAL_ADMIN_PASSWORD='<strong-password>' ADMIN_USERNAME=your_admin ADMIN_EMAIL=you@example.com node create-admin.js
  ```
  Set up TOTP two-factor authentication immediately upon initial sign-in.

### 3. Infrastructure & Security
- **HTTPS Enforcement:** The site must be served strictly over HTTPS. Session cookies use `Secure` and `SameSite=Strict`.
- **Process Manager:** Production backend is executed by Passenger (`dist/server.js`) under CloudLinux Node.js Selector (Node 24).
- **Static Frontend:** Frontend build artifacts reside in `~/public_html/`. Never overwrite `public_html/.htaccess`.

---

## Local Development Setup

### Prerequisites
- Node.js (v20.x or v24.x LTS)
- MySQL 8.0+ or MariaDB 10.5+
- npm (v10+)

### Installation

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd asella_organic
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   # Configure backend/.env
   npm run dev
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
