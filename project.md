# Asella Organic � Project Documentation

**Version:** 1.1.0  
**Last Updated:** 2026-07-15  
**License:** ISC (Private)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [Backend API](#backend-api)
6. [Frontend Application](#frontend-application)
7. [Database](#database)
8. [Authentication & Authorization](#authentication--authorization)
9. [Integrations](#integrations)
10. [Testing](#testing)
11. [Development Setup](#development-setup)
12. [Deployment Guide](#deployment-guide)
13. [Environment Variables](#environment-variables)
14. [Security Features](#security-features)
15. [API Endpoints](#api-endpoints)

---

## Overview

Asella Organic is a full-stack e-commerce and inventory management system built for a
premium organic health products company based in Ethiopia. The platform handles:

- **Public storefront** � product catalog, checkout, community videos
- **Customer order tracking** � real-time order status by order ID
- **Admin dashboard** � order management, inventory, stock alerts, analytics
- **Staff management** � user roles, 2FA, permissions
- **Affiliate/referral system** � referral tracking, commissions
- **Vendor purchase tracking** � vendor orders, bulk purchasing
- **Expenses tracking** � business expense management
- **Video management** � community video upload and management (admin)
- **Telegram integration** � order notifications, delivery group alerts
- **Google Sheets sync** � order mirroring for reporting
- **Cloudinary integration** � cloud-based image/file storage
- **PWA support** � offline catalog, install-to-home-screen

---

## Architecture

```
+--------------------------------------------------------------+
�                        CLIENT LAYER                          �
�  +------------------+  +-------------+  +----------------+  �
�  �  React SPA       �  �  Telegram   �  �  Postman/API   �  �
�  �  (Vite + TW)     �  �  Bot Users  �  �  Clients       �  �
�  +------------------+  +-------------+  +----------------+  �
+-----------+--------------------+-----------------+-----------+
            � HTTPS              � Webhook         � Bearer/Cookie
            ?                    ?                 ?
+--------------------------------------------------------------+
�                        API LAYER                             �
�  +------------------------------------------------------+    �
�  �  Express.js (Node.js + TypeScript)                    �    �
�  �  +---------+ +----------+ +-----------+ +--------+  �    �
�  �  � Helmet  � �Rate Limit� � Auth/RBAC � �Validate�  �    �
�  �  � (CSP)   � � (LRU)   � � (JWT+2FA) � � (Zod)  �  �    �
�  �  +---------+ +----------+ +-----------+ +--------+  �    �
�  �  +-------------------------------------------------+ �    �
�  �  � Routes: auth, orders, products, stock, staff,   � �    �
�  �  �         referrals, telegram, upload, vendor,    � �    �
�  �  �         notifications, appointments, admin,     � �    �
�  �  �         expenses, videos                        � �    �
�  �  +-------------------------------------------------+ �    �
�  +------------------------------------------------------+    �
�  API Versioning: /api/v1/* (preferred) + /api/* (compat)     �
+--------------------------------------------------------------+
                               �
            +------------------+------------------+
            ?                  ?                  ?
+----------------+  +----------------+  +----------------+
�   MySQL 8.0    �  �  Telegram API  �  �  Google Sheets �
�   (mysql2)     �  �  (Bot API)     �  �  (googleapis)  �
+----------------+  +----------------+  +----------------+
            ?
+----------------+
�   Cloudinary   �
�  (Image CDN)   �
+----------------+
```

---

## Tech Stack

### Backend
| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 24.x | Runtime |
| TypeScript | 6.x | Type safety |
| Express.js | 5.x | HTTP framework |
| MySQL | 8.0 | Primary database |
| mysql2 | 3.x | MySQL driver (promise-based) |
| Zod | 4.x | Request validation |
| jsonwebtoken | 9.x | JWT authentication |
| bcryptjs | 3.x | Password hashing |
| otplib | 13.x | TOTP 2FA |
| qrcode | 1.x | QR code generation for 2FA setup |
| helmet | 8.x | HTTP security headers (CSP, HSTS, etc.) |
| winston | 3.x | Structured JSON logging |
| nodemailer | 9.x | Email (Gmail SMTP) |
| multer | 2.x | File uploads |
| cloudinary | 2.x | Cloud image/file storage |
| redis | 6.x | Caching layer |
| validator | 13.x | Input validation helpers |
| lru-cache | 11.x | In-memory LRU cache for rate limiting |
| express-rate-limit | 8.x | Rate limiting middleware |
| tsup | 8.x | Build/bundle tool |
| tsx | 4.x | TypeScript execution for dev |
| PM2 | � | Process manager (production) |

### Frontend
| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 19.x | UI library |
| TypeScript | 6.x | Type safety |
| Vite | 8.x | Build tool & dev server |
| Tailwind CSS | 3.x | Utility-first CSS |
| Redux Toolkit | 2.x | State management |
| React Router | 7.x | Client-side routing |
| Axios | 1.x | HTTP client (legacy) |
| Chart.js | 4.x | Data visualization charts |
| react-chartjs-2 | 5.x | React wrapper for Chart.js |
| Vitest | 4.x | Unit testing |

### Testing
| Technology | Purpose |
|-----------|---------|
| Jest | Backend unit & integration tests |
| Supertest | HTTP assertion library |
| Playwright | End-to-end browser tests |
| Vitest | Frontend unit tests |
| Testing Library | React component tests |

### DevOps
| Technology | Purpose |
|-----------|---------|
| GitHub Actions | CI/CD pipeline |
| PM2 | Production process management |
| Husky | Git hooks (pre-commit) |
| ESLint | Code linting |
| Codecov | Coverage reporting |

---

## Project Structure

```
asella_organic/
+-- backend/                    # Express.js API server
�   +-- src/
�   �   +-- app.ts              # Express app configuration
�   �   +-- server.ts           # HTTP server entry point
�   �   +-- config/
�   �   �   +-- db.ts           # MySQL pool configuration
�   �   �   +-- env.ts          # Zod environment validation
�   �   +-- controllers/        # (empty � logic is in routes)
�   �   +-- middleware/
�   �   �   +-- auth.ts         # JWT authentication + RBAC
�   �   �   +-- 2fa.ts          # Two-factor authentication
�   �   �   +-- rateLimit.ts    # Rate limiting (LRU-based)
�   �   �   +-- apiCache.ts     # API response caching middleware
�   �   �   +-- requestId.ts    # Request ID correlation
�   �   �   +-- idempotency.ts  # Idempotency-Key middleware
�   �   �   +-- validate.ts     # Zod + XSS validation
�   �   +-- routes/             # 15 route modules
�   �   �   +-- auth.ts         # Login, logout, refresh, 2FA
�   �   �   +-- orders.ts       # CRUD + status updates
�   �   �   +-- products.ts     # Catalog + inventory
�   �   �   +-- stock.ts        # Stock requests/alerts
�   �   �   +-- staff.ts        # User management
�   �   �   +-- referrals.ts    # Affiliate system
�   �   �   +-- telegram.ts     # Bot webhooks
�   �   �   +-- upload.ts       # File uploads
�   �   �   +-- vendor-orders.ts # Vendor purchasing
�   �   �   +-- notification.ts # In-app notifications
�   �   �   +-- appointments.ts # Customer appointments
�   �   �   +-- admin.ts        # Admin operations
�   �   �   +-- expenses.ts     # Business expense tracking
�   �   �   +-- videos.ts       # Community video management
�   �   �   +-- orders.patch.ts # Order item patching
�   �   +-- schemas/
�   �   �   +-- index.ts        # All Zod validation schemas
�   �   +-- lib/
�   �   �   +-- logger.ts       # Structured JSON logger
�   �   �   +-- security.ts     # XSS, HMAC, sanitization
�   �   �   +-- telegram.ts     # Telegram Bot API client
�   �   �   +-- sheets.ts       # Google Sheets integration
�   �   �   +-- cloudinary.ts   # Cloudinary image/file client
�   �   �   +-- inventory.ts    # Inventory business logic
�   �   �   +-- utils.ts        # Utility functions
�   �   +-- types/
�   �   �   +-- index.ts        # Shared TypeScript types
�   �   +-- scripts/
�   �       +-- telegram-poll.ts # Telegram polling script (dev)
�   +-- db/
�   �   +-- sql/                # 15 ordered migration files
�   �       +-- 001_complete_schema.sql
�   �       +-- 002_affiliate_commission_trigger.sql
�   �       +-- 003_security_and_inventory.sql
�   �       +-- 004_dummy_data.sql
�   �       +-- 005_order_items_product_id.sql
�   �       +-- 006_clean_products.sql
�   �       +-- 007_idempotency_keys.sql
�   �       +-- 008_soft_delete_audit.sql
�   �       +-- 009_vendor_expenses.sql
�   �       +-- 010_stock_request_status.sql
�   �       +-- 011_community_videos.sql
�   �       +-- 011_drop_inventory_trigger.sql
�   �       +-- 011_order_status_history.sql
�   �       +-- 012_prod_sync.sql
�   �       +-- 013_staff_telegram_username.sql
�   +-- tests/
�   �   +-- unit/               # 15 unit test files
�   �   +-- integration/        # 8 integration test files
�   �   +-- setup/              # Test fixtures & setup
�   +-- migrate.cjs             # Database migration runner
�   +-- create-admin.js         # First-time admin seeder
�   +-- package.json
�   +-- tsconfig.json
�   +-- jest.config.js
�   +-- eslint.config.js
�
+-- frontend/                   # React SPA
�   +-- src/
�   �   +-- main.tsx            # App entry point
�   �   +-- App.tsx             # Root component + routing
�   �   +-- App.css             # Global styles
�   �   +-- index.css           # CSS reset + variables
�   �   +-- LanguageContext.tsx  # i18n context
�   �   +-- pages/              # 21 page components
�   �   �   +-- Storefront.tsx
�   �   �   +-- Checkout.tsx
�   �   �   +-- Login.tsx
�   �   �   +-- Dashboard.tsx
�   �   �   +-- OrderTracking.tsx
�   �   �   +-- ProductsPage.tsx
�   �   �   +-- NewOrderPage.tsx
�   �   �   +-- BulkOrdersPage.tsx
�   �   �   +-- VendorPurchasePage.tsx
�   �   �   +-- StockAlertPage.tsx
�   �   �   +-- AnalyticsPage.tsx
�   �   �   +-- Notificationspage.tsx
�   �   �   +-- ChangePasswordPage.tsx
�   �   �   +-- UserManagementPage.tsx
�   �   �   +-- AffiliateControlPage.tsx
�   �   �   +-- CustomerOrderTracking.tsx
�   �   �   +-- AccessDatabasePage.tsx
�   �   �   +-- CommunityVideos.tsx
�   �   �   +-- ExpensesPage.tsx
�   �   �   +-- VideoManagementPage.tsx
�   �   �   +-- Sidebar.tsx
�   �   +-- components/
�   �   �   +-- dashboard/      # Dashboard-specific components
�   �   �   +-- storefront/     # Storefront components
�   �   �   +-- tracking/       # Order tracking components
�   �   �   +-- ui/             # Shared UI (ProtectedRoute, Toast, LoadingSpinner)
�   �   +-- services/
�   �   �   +-- api.ts          # Central API client (fetch-based)
�   �   +-- store/
�   �   �   +-- index.ts        # Redux store config
�   �   �   +-- slices/
�   �   �       +-- authSlice.ts
�   �   �       +-- uiSlice.ts
�   �   �       +-- stockSlice.ts
�   �   +-- hooks/              # Custom React hooks
�   �   +-- layouts/            # Layout components
�   �   +-- lib/                # Utility libraries (Sentry, SW)
�   �   +-- utils/              # Utility functions
�   +-- public/
�   �   +-- manifest.webmanifest # PWA manifest
�   �   +-- sw.js               # Service worker
�   �   +-- offline.html        # Offline fallback page
�   �   +-- image/              # Static images
�   +-- tests/                  # Frontend tests
�   +-- package.json
�   +-- vite.config.ts
�   +-- vitest.config.ts
�   +-- tailwind.config.js
�   +-- tsconfig.json
�
+-- tests/                      # E2E Playwright tests
�   +-- setup/
�   �   +-- auth.setup.ts       # Auth state setup
�   +-- dashboard/              # 10 dashboard spec files
�   +-- auth.spec.ts            # Auth flow tests
�   +-- storefront.spec.ts      # Public page tests
�
+-- .github/workflows/
�   +-- ci.yml                  # CI/CD pipeline
�
+-- ecosystem.config.cjs        # PM2 production config
+-- playwright.config.ts        # Playwright config
+-- package.json                # Root monorepo config
+-- .gitignore
```

---

## Backend API

### Middleware Stack (in order)

1. **Helmet (Security Headers)** � CSP, HSTS, X-Frame-Options, Permissions-Policy, etc.
2. **Static Files** � Serves `public/` directory
3. **CORS** � Configurable origins, credentials support
4. **CSRF Origin Check** � Strict origin validation for mutating requests
5. **Cookie Parser** � HttpOnly cookie support
6. **Request ID** � UUID correlation for logging
7. **Access Logger** � Structured JSON request logging
8. **Raw Body Parser** � For webhook/payment callbacks
9. **JSON Parser** � 1MB limit, strict mode
10. **General Rate Limiter** � 600 req/min per user/IP
11. **Idempotency Middleware** � POST replay protection
12. **Routes** � 14 route modules at `/api/v1/*` and `/api/*`
13. **404 Handler** � JSON not-found response
14. **Global Error Handler** � Catches unhandled errors

### Rate Limiting

| Endpoint | Limit | Window | Key |
|----------|-------|--------|-----|
| General (`/api/*`) | 600 requests | 1 minute | User ID or IP |
| Login (`/api/auth/login`) | 10 attempts | 5 minutes | User ID or IP |
| Order creation | 10 orders | 5 minutes | User ID or IP |

---

## Frontend Application

### Public Pages (no auth)
| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `Storefront` | Product catalog (lazy-loaded sections: DailyHighlights, StorySection, Hero, Bestsellers, AllProducts, Reviews, Footer) |
| `/checkout` | `Checkout` | Order placement |
| `/login` | `Login` | Staff login |
| `/track` | `CustomerOrderTracking` | Order tracking by ID |
| `/track/:orderId` | `CustomerOrderTracking` | Direct order tracking |
| `/community-videos` | `CommunityVideos` | Educational content |

### Dashboard Pages (auth required)
| Route | Component | Description |
|-------|-----------|-------------|
| `/dashboard` | `Dashboard` | Main dashboard |
| `/dashboard/new-order` | `NewOrderPage` | Create new order |
| `/dashboard/tracking` | `OrderTracking` | Order management |
| `/dashboard/bulk-orders` | `BulkOrdersPage` | Bulk order management |
| `/dashboard/vendor` | `VendorPurchasePage` | Vendor orders |
| `/dashboard/stock-alert` | `StockAlertPage` | Low stock alerts |
| `/dashboard/expenses` | `ExpensesPage` | Business expense tracking |
| `/dashboard/analytics` | `AnalyticsPage` | Business analytics (Chart.js) |
| `/dashboard/notifications` | `NotificationsPage` | In-app notifications |
| `/dashboard/change-password` | `ChangePasswordPage` | Password change |
| `/dashboard/users` | `UserManagementPage` | Staff management |
| `/dashboard/affiliates` | `AffiliateControlPage` | Referral/affiliate control |
| `/dashboard/products` | `ProductsPage` | Product catalog management |
| `/dashboard/videos` | `VideoManagementPage` | Community video management |

### State Management (Redux Toolkit)
- **authSlice** � Authentication state (token, user, isAuthenticated)
- **uiSlice** � Theme, sidebar, UI preferences
- **stockSlice** � Stock data and alerts

---

## Database

### Engine: MySQL 8.0

### Connection Pool Configuration
- **Connection limit:** 10
- **Keep-alive:** Enabled (10s initial delay)
- **Connect timeout:** 5s
- **Queue limit:** Unlimited

### Migration System
- SQL files in `backend/db/sql/` run in alphabetical order
- Tracking table: `migrations_log`
- Handles DELIMITER directives and BEGIN...END blocks
- DDL detection to skip transactions for triggers/procedures
- Run: `cd backend && npm run db:migrate`
- Reset: `cd backend && npm run db:migrate:reset`

### Key Tables (from migrations)
- `staff` � User accounts with roles, Telegram username/chat ID for bot RBAC
- `products` � Product catalog with inventory
- `orders` + `order_items` � Customer orders
- `order_status_history` � Audit trail of order status changes
- `payments` � Payment tracking
- `stock_requests` � Inventory restock requests
- `vendor_orders` � Vendor purchase orders
- `vendor_expenses` � Business expense records
- `referrals` + `commissions` � Affiliate system
- `notifications` � In-app notification system
- `appointments` � Customer appointment booking
- `community_videos` � Video metadata for community section
- `session_blocklist` � Revoked JWT sessions
- `idempotency_keys` � POST request deduplication
- `inventory_log` � Stock change audit trail
- `audit_log` � Soft-delete and action audit

---

## Authentication & Authorization

### Auth Flow
1. User submits credentials to `POST /api/auth/login`
2. Server validates via bcrypt, issues JWT + refresh token
3. Tokens stored as HttpOnly cookies (browser) or returned as JSON (API clients)
4. JWT includes: `id`, `username`, `role`, `jti` (session ID)
5. On 401, client auto-attempts silent refresh via `POST /api/auth/refresh`
6. Logout revokes session by adding `jti` to `session_blocklist`

### Roles
| Role | Description |
|------|-------------|
| `superadmin` | Full system access |
| `admin` | Administrative access |
| `manager` | Order and inventory management |
| `employee` | Basic operations |
| `affiliate` | Referral program access |
| `delivery` | Delivery operations |
| `vendor` | Vendor portal access |

### Two-Factor Authentication (2FA)
- TOTP-based (Google Authenticator compatible)
- QR code setup via `POST /api/staff/2fa/setup` (QR generated with `qrcode` library)
- Verification via `POST /api/staff/2fa/verify`
- Required for sensitive operations (e.g., staff deletion)

---

## Integrations

### Telegram Bot
- **Order notifications** � New order alerts to admin chat
- **Delivery group** � Order updates to delivery team
- **Vendor notifications** � Purchase order alerts
- **Webhook support** � Incoming message processing
- **Staff RBAC** � Identity verification, role-specific menus (Employee: track/place; Manager: +view orders; Admin: +dashboard link)
- **Morning briefing** � Daily stats sent once per day with dedup guard (DB-backed, survives PM2 restart)
- **Polling mode** � Alternative to webhooks for development (`npm run telegram:poll`)

### Google Sheets
- **Order mirroring** � Real-time order sync to spreadsheet
- **Service account auth** � Credential-based, no user interaction
- **Optional integration** � Graceful degradation if not configured

### Cloudinary
- **Image/file storage** � Cloud-based media storage for product images and uploads
- **API-based upload** � Files uploaded via `multer` then pushed to Cloudinary
- **Optional integration** � Falls back to local storage if not configured

### Email (SMTP)
- **Gmail SMTP** � Password reset emails
- **App passwords** � Secure authentication
- **Provider:** Nodemailer

---

## Testing

### Backend Tests
```bash
# Run all tests
cd backend && npm test

# Unit tests only
cd backend && npm run test -- --testPathPatterns="tests/unit"

# Integration tests only
cd backend && npm run test:integration

# With coverage
cd backend && npm run test:coverage
```

**Unit Tests (15 files):**
- `auth.test.ts` � Authentication logic
- `middleware.test.ts` � Middleware stack
- `orders.test.ts` � Order CRUD
- `products.test.ts` � Product management
- `inventory.test.ts` � Inventory operations
- `security.test.ts` � Security utilities
- `rate-limit.test.ts` � Rate limiting
- `telegram-lib.test.ts` � Telegram integration
- `vendor-orders.test.ts` � Vendor operations
- `notifications.test.ts` � Notification system
- `notification.test.ts` � Notification delivery (unit)
- `appointments.test.ts` � Appointment booking
- `upload.test.ts` � File upload handling
- `2fa.test.ts` � Two-factor authentication
- `utils.test.ts` � Utility functions

**Integration Tests (8 files):**
- `security.test.ts` � Full security flow
- `staff.test.ts` � Staff CRUD + auth
- `stock.test.ts` � Inventory flow
- `referrals.test.ts` � Affiliate system
- `order-inventory-flow.test.ts` � Order ? inventory
- `orders-patch.test.ts` � Order updates
- `notification.test.ts` � Notification delivery
- `telegram.test.ts` � Telegram webhook flow

### Frontend Tests
```bash
cd frontend && npm test         # Run once
cd frontend && npm run test:watch    # Watch mode
cd frontend && npm run test:coverage # With coverage
```

### End-to-End Tests (Playwright)
```bash
# Run all E2E tests
npm test

# Run with UI
npm run test:ui

# Run headed (visible browser)
npm run test:headed

# Smoke test (navigation only)
npm run test:smoke

# Public pages only
npm run test:public
```

**E2E Test Suites:**
- Auth flow (login, session)
- Storefront (public pages)
- Dashboard navigation
- Order tracking CRUD
- Product management
- User management
- Affiliate/referral system
- Stock alerts
- Vendor purchases
- Notifications
- Bulk orders

---

## Development Setup

### Prerequisites
- Node.js 24.x
- MySQL 8.0
- npm

### Quick Start
```bash
# 1. Clone the repository
git clone <repo-url>
cd asella_organic

# 2. Install dependencies
cd backend && npm install
cd ../frontend && npm install
cd .. && npm install

# 3. Configure environment
cp backend/.env.example backend/.env
# Edit backend/.env with your database credentials and secrets

# 4. Run database migrations
cd backend && npm run db:migrate

# 5. Create initial admin user
cd backend && node create-admin.js

# 6. Start development servers
# Terminal 1 � Backend:
cd backend && npm run dev

# Terminal 2 � Frontend:
cd frontend && npm run dev

# 7. Open http://localhost:5173 in your browser
```

### Telegram Local Development
```bash
# Start the Telegram polling script (forwards Telegram updates to local webhook)
cd backend && npm run telegram:poll
```

### Build for Production
```bash
# Backend
cd backend && npm run build
# Output: backend/dist/server.js

# Frontend
cd frontend && npm run build
# Output: frontend/dist/
```

---

## Deployment Guide

### Production Stack
- **Server:** Node.js behind Nginx reverse proxy
- **Process Manager:** PM2 (see `ecosystem.config.cjs`)
- **Database:** MySQL 8.0
- **Frontend:** Static files served by Nginx or from Express static middleware

### PM2 Commands
```bash
pm2 start ecosystem.config.cjs     # Start
pm2 stop asella-api                # Stop
pm2 restart asella-api             # Restart
pm2 reload asella-api              # Zero-downtime reload
pm2 logs asella-api                # Tail logs
pm2 monit                          # Live CPU/RAM dashboard
pm2 save                           # Save process list
pm2 startup                        # Auto-start on server reboot
```

### Hosting Notes
- Backend API runs on port 3001 (configurable via `PORT` env var)
- Frontend Vite dev server runs on port 5173
- In production, frontend `dist/` is served as static files
- CORS is configured for the production frontend URL
- HSTS headers are only enabled in production mode

---

## Environment Variables

See `backend/.env.example` for the complete template with descriptions.

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `production` |
| `PORT` | API server port | `3001` |
| `DB_HOST` | MySQL host | `localhost` |
| `DB_PORT` | MySQL port | `3306` |
| `DB_USER` | MySQL username | `asella_user` |
| `DB_PASSWORD` | MySQL password | `****` |
| `DB_NAME` | MySQL database name | `asella_organic` |
| `DATABASE_URL` | Full MySQL connection URL | `mysql://user:pass@host:port/db` |
| `JWT_SECRET` | JWT signing secret (64+ chars) | `<128-char hex string>` |
| `FRONTEND_URL` | Frontend origin URL | `https://app.asellaorganic.com` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token | `<from @BotFather>` |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook verification secret | `<64-char hex string>` |
| `TELEGRAM_ADMIN_CHAT_ID` | Admin notification chat | `<numeric chat ID>` |
| `TELEGRAM_DELIVERY_GROUP_ID` | Delivery group chat | `<numeric group ID>` |

### Optional Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REFRESH_TOKEN_SECRET` | Separate refresh token secret | � |
| `SMTP_USER` | Gmail address for emails | � |
| `SMTP_PASS` | Gmail app password | � |
| `GOOGLE_SPREADSHEET_ID` | Google Sheets ID | � |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Service account credentials | � |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name | � |
| `CLOUDINARY_API_KEY` | Cloudinary API key | � |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret | � |
| `SENTRY_DSN` | Sentry error tracking | � |
| `UPLOAD_DIR` | File upload directory | `./uploads` |
| `MAX_FILE_SIZE_MB` | Max upload size | `5` |
| `RETENTION_YEARS` | Data retention period | `2` |

---

## Security Features

| Feature | Implementation | File |
|---------|---------------|------|
| **HTTPS Enforcement** | HSTS with 1-year max-age, preload | `helmet` in `app.ts` |
| **Content Security Policy** | Strict CSP with self-only sources | `helmet` in `app.ts` |
| **Permissions Policy** | Restricts geolocation, camera, mic, payment | `helmet` in `app.ts` |
| **XSS Protection** | DOMPurify sanitization on all inputs | `security.ts`, `validate.ts` |
| **CSRF Protection** | SameSite cookies + strict origin check middleware | `app.ts` |
| **SQL Injection** | Parameterized queries (mysql2) | All routes |
| **Rate Limiting** | Per-user/IP with LRU cache | `rateLimit.ts` |
| **Password Hashing** | bcrypt with auto-generated salt | `auth.ts` route |
| **JWT Security** | Short-lived tokens, session blocklist | `middleware/auth.ts` |
| **2FA** | TOTP (RFC 6238) via otplib | `middleware/2fa.ts` |
| **Request Correlation** | UUID-based request tracing | `requestId.ts` |
| **Idempotency** | Hash-based replay protection | `idempotency.ts` |
| **Clickjacking** | X-Frame-Options: DENY (frameAncestors) | `helmet` in `app.ts` |
| **MIME Sniffing** | X-Content-Type-Options: nosniff | `helmet` in `app.ts` |
| **Server Fingerprint** | X-Powered-By removed | `helmet` in `app.ts` |
| **Timing Attacks** | `crypto.timingSafeEqual` for tokens | `security.ts` |
| **Input Validation** | Zod schemas on all endpoints | `schemas/index.ts` |
| **Cookie Security** | HttpOnly, Secure, SameSite | `auth.ts` route |

---

## API Endpoints

### Authentication
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/v1/auth/login` | ? | Log in with credentials |
| POST | `/api/v1/auth/logout` | ? | Log out (revoke session) |
| POST | `/api/v1/auth/refresh` | Cookie | Refresh access token |
| GET | `/api/v1/auth/me` | ? | Get current user profile |

### Orders
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/orders` | ? | List orders (paginated, filterable) |
| GET | `/api/v1/orders/:id` | ? | Get order by ID |
| POST | `/api/v1/orders` | ? | Create new order |
| PATCH | `/api/v1/orders/:id/status` | ? | Update order status |
| PATCH | `/api/v1/orders/:id/payment` | ? | Update payment info |
| PATCH | `/api/v1/orders/:id/items` | ? | Update order items |
| DELETE | `/api/v1/orders/:id` | ? | Delete order |

### Products
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/products` | ? | List products (public catalog) |
| GET | `/api/v1/products/:id` | ? | Get product details |
| POST | `/api/v1/products` | ? | Create product |
| PATCH | `/api/v1/products/:id` | ? | Update product |
| DELETE | `/api/v1/products/:id` | ? | Delete product |
| PATCH | `/api/v1/products/:id/inventory` | ? | Adjust inventory |
| GET | `/api/v1/products/low-stock` | ? | Low stock alerts |

### Staff
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/staff` | ? | List staff members |
| GET | `/api/v1/staff/:id` | ? | Get staff profile |
| POST | `/api/v1/staff` | ? Admin | Create staff account |
| PATCH | `/api/v1/staff/:id` | ? Admin | Update staff |
| DELETE | `/api/v1/staff/:id` | ? Admin + 2FA | Delete staff |
| POST | `/api/v1/staff/2fa/setup` | ? | Setup 2FA (returns QR code) |
| POST | `/api/v1/staff/2fa/verify` | ? | Verify 2FA token |
| DELETE | `/api/v1/staff/2fa/disable` | ? | Disable 2FA |

### Stock
| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/api/v1/stock` | ? | List stock requests |
| POST | `/api/v1/stock` | ? | Create stock request |
| PATCH | `/api/v1/stock/:id` | ? | Update request status |

### Other Endpoints
| Module | Base Path | Description |
|--------|-----------|-------------|
| Referrals | `/api/v1/referrals` | Affiliate code CRUD, commission tracking |
| Telegram | `/api/v1/telegram` | Bot webhooks, message sending |
| Upload | `/api/v1/upload` | File upload handling (Cloudinary-backed) |
| Vendor Orders | `/api/v1/vendor-orders` | Vendor purchase management |
| Notifications | `/api/v1/notifications` | In-app notification CRUD |
| Appointments | `/api/v1/appointments` | Customer appointment booking |
| Admin | `/api/v1/admin` | Administrative operations |
| Expenses | `/api/v1/expenses` | Business expense tracking |
| Videos | `/api/v1/videos` | Community video management |
| Health | `/api/v1/health` | System health check (DB + Telegram) |

---

## CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs on pushes and PRs to `main` and `develop`:

### Backend Job
1. ? Checkout code
2. ? Setup Node.js 24
3. ? Install dependencies (`npm ci`)
4. ? TypeScript type check (`npm run typecheck`)
5. ? ESLint linting (`npm run lint`)
6. ? Start MySQL service container
7. ? Run database migrations
8. ? Unit tests with coverage
9. ?? Integration tests (continue-on-error)
10. ? Upload coverage to Codecov
11. ? Security audit (`npm audit --audit-level=high`)

### Frontend Job
1. ? Checkout code
2. ? Setup Node.js 24
3. ? Install dependencies
4. ? TypeScript type check
5. ? ESLint linting
6. ? Production build
7. ? Unit tests
8. ? Security audit

### Deploy Gate
- Runs only on `main` branch pushes
- Requires both backend and frontend jobs to pass
- Outputs confirmation message with commit SHA

---

*For questions or support, contact the development team.*
