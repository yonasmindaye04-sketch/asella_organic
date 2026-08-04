# Asella Organic — System Architecture

## Architectural Blueprint

```
+-------------------------------------------------------------------+
|                        CLIENT LAYER                               |
|  +------------------+   +-------------------+   +---------------+ |
|  |  React SPA       |   |  Telegram Bot     |   |  External API | |
|  |  (Vite+Tailwind) |   |  (Delivery/Staff) |   |  Clients      | |
|  +------------------+   +-------------------+   +---------------+ |
+-----------+-----------------------+---------------------+---------+
            | HTTPS                 | Webhook             | Bearer JWT
            v                       v                     v
+-------------------------------------------------------------------+
|                        API & SECURITY LAYER                       |
|  +-------------------------------------------------------------+  |
|  |  Express.js (Node.js + TypeScript)                          |  |
|  |  +---------+  +------------+  +------------+  +----------+  |  |
|  |  | Helmet  |  | Rate Limit |  | Auth/RBAC  |  | Zod      |  |  |
|  |  | (Security) | (LRU Cache) |  | (JWT+2FA)  |  | (Valid)  |  |  |
|  |  +---------+  +------------+  +------------+  +----------+  |  |
|  |  +-------------------------------------------------------+ |  |
|  |  | Route Modules: auth, orders, products, stock, staff,  | |  |
|  |  |                telegram, vendor, expenses, etc.       | |  |
|  |  +-------------------------------------------------------+ |  |
|  +-------------------------------------------------------------+  |
+-----------------------------------+-------------------------------+
                                    |
            +-----------------------+-----------------------+
            v                       v                       v
+-----------------------+ +-------------------+ +-------------------+
|   MySQL 8.0           | |  Telegram Bot API | |  Cloudinary CDN   |
|   (mysql2 Pool)       | |  (Notifications)  | |  (Image Storage)  |
+-----------------------+ +-------------------+ +-------------------+
```

---

## Core Architectural Layers

### 1. Client Layer (Frontend)
- Built with **React 19**, **TypeScript**, **Vite**, and **Tailwind CSS**.
- State management via **Redux Toolkit** for UI and application state.
- Client-side routing via **React Router 7**.
- Responsive, dark-mode aware UI with **ScrollReveal** and custom CSS animation drivers.

### 2. API & Security Layer (Backend)
- Built with **Express.js** running on **Node.js 24**.
- **Role-Based Access Control (RBAC):** `admin`, `manager`, `staff`, `delivery`.
- **Validation:** Strict runtime request payload validation using **Zod**.
- **Security Middleware:** `Helmet` (CSP/headers), `express-rate-limit` + `lru-cache`, `Idempotency-Key` tracking.

### 3. Business Logic & Domain Services
- **Inventory Engine (`lib/inventory.ts`):** Handles stock allocations, moving average cost (MAC) calculations, and reorder thresholding.
- **Telegram Notifier (`lib/telegram.ts`):** Real-time broadcast engine dispatches order details to delivery channels and staff alerts.
- **Accrual Accounting & COGS:** Order items take a snapshot of `unit_cost` at purchase time to protect historical profit calculations.

### 4. Data Layer & External Integrations
- **MySQL 8.0:** Relational database managed with `mysql2` connection pooling and migration scripts (`db/sql/*.sql`).
- **Cloudinary:** Cloud asset CDN for receipt attachments and product images.
- **Google Sheets API:** Asynchronous reporting synchronization.
