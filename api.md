# Asella Organic — API Documentation

**Version:** 1.1.0  
**Base URL:** `/api/v1` (preferred) or `/api` (backwards-compatibility)  
**Auth Header:** `Authorization: Bearer <token>` or HTTP-only Session Cookie  

---

## Overview

The Asella Organic API is a RESTful API built on Express.js and Node.js. It features JWT-based authentication, Role-Based Access Control (RBAC), Zod request validation, LRU rate-limiting, and structured JSON responses.

### Common Response Format

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message",
  "requestId": "req_xyz123"
}
```

---

## Endpoint Summary

### 1. Authentication (`/api/auth`)
- `POST /api/auth/login` — Staff login (Email/Password). Returns JWT token & user profile.
- `POST /api/auth/2fa/verify` — Verify 2FA TOTP token.
- `POST /api/auth/2fa/setup` — Generate 2FA secret and QR code.
- `POST /api/auth/refresh` — Refresh expired JWT token.
- `POST /api/auth/logout` — Revoke session cookie/token.
- `GET /api/auth/me` — Get current logged-in user details.

### 2. Orders (`/api/orders`)
- `GET /api/orders` — List orders (Filter by status, date range, pagination).
- `GET /api/orders/:id` — Get single order by ID or order tracking number.
- `POST /api/orders` — Create new customer order (Supports website, bot, and manual).
- `PUT /api/orders/:id` — Update order details (Status, items, delivery fee, tracking).
- `PATCH /api/orders/:id/status` — Update order status (Pending -> Processing -> Delivered/Cancelled).
- `DELETE /api/orders/:id` — Soft-delete order (Admin only).

### 3. Products (`/api/products`)
- `GET /api/products` — List catalog products (Public endpoint).
- `GET /api/products/:id` — Product details.
- `POST /api/products` — Create new product (Admin/Manager).
- `PUT /api/products/:id` — Update product info, price, stock, category.
- `DELETE /api/products/:id` — Soft-delete product.

### 4. Stock & Inventory (`/api/stock`)
- `GET /api/stock/alerts` — Fetch low-stock warnings based on threshold.
- `GET /api/stock/requests` — List internal stock transfer/fulfillment requests.
- `POST /api/stock/requests` — Submit a stock request (Secondary store -> Main inventory).
- `PATCH /api/stock/requests/:id` — Update stock request status (`pending`, `fulfilled`, `rejected`).

### 5. Staff Management (`/api/staff`)
- `GET /api/staff` — List staff members (Admin only).
- `POST /api/staff` — Invite/Create new staff account.
- `PUT /api/staff/:id` — Edit staff role, permissions, or Telegram username.
- `DELETE /api/staff/:id` — Deactivate staff account.

### 6. Vendor Purchases (`/api/vendor-orders`)
- `GET /api/vendor-orders` — List vendor purchase orders.
- `POST /api/vendor-orders` — Record new bulk inventory purchase from vendor.
- `PATCH /api/vendor-orders/:id/status` — Update status (When marked `received`, triggers Moving Average Cost recalculation).

### 7. Business Expenses (`/api/expenses`)
- `GET /api/expenses` — Fetch expense records and summaries.
- `POST /api/expenses` — Log operational expenses (rent, utilities, logistics).

### 8. Referrals & Affiliates (`/api/referrals`)
- `GET /api/referrals/stats` — Affiliate performance dashboard.
- `POST /api/referrals/code` — Generate referral code.

### 9. Telegram Integration (`/api/telegram`)
- `POST /api/telegram/webhook` — Incoming webhook from Telegram Bot API.
- `GET /api/telegram/set-webhook` — Register Telegram webhook URL.

### 10. Notifications (`/api/notification`)
- `GET /api/notification` — In-app notification feed (Low stock, new orders, stock requests).
- `GET /api/notification/count` — Unread notification counter.

---

## Rate Limiting & Security
- **Rate Limit:** 100 requests per 15 minutes for public endpoints; 300 for authenticated staff.
- **Idempotency:** Accepts `Idempotency-Key` header on critical mutation endpoints (`POST /api/orders`).
