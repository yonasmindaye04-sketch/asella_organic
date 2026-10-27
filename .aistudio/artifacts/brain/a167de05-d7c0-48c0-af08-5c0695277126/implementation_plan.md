# Asella Organic — Full-Stack Dev Server & Resilient Preview Setup

Unify the Asella Organic storefront, admin dashboard, Telegram Mini App, and Express backend onto a single port 3000 server with an intelligent in-memory data layer fallback so the full application boots and runs seamlessly in the preview environment without requiring an external MySQL instance.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following setup decisions were confirmed during the clarification phase and govern how the application boots and handles data in the preview environment:

- **Confirmed Decision 1 — Full-Stack Unified Server on Port 3000**: The root workspace will launch a unified development and production server bound to `0.0.0.0:3000` that serves both the Express REST API (`/api/*`, `/image/*`) and the React + Vite frontend (Storefront, Admin Dashboard, and Telegram Mini App).
- **Confirmed Decision 2 — In-Memory Mock Database Fallback with Seeded Data**: When a live MySQL connection is not configured or unreachable, the database layer will automatically fall back to an in-memory SQL-compatible store pre-populated with realistic Asella Organic products (Moringa, Black Seed Oil, Shilajit, Frankincense, Turmeric, etc.), sample orders, customers, affiliate rules, and a default admin account (`admin` / `admin123`).

---

## 1. Overview & Core Concept

- **What It Does**: Asella Organic is an Ethiopian highland organic health supplement e-commerce storefront, Telegram Mini App store, and operations/inventory management platform. Fixing the dev server enables all three surfaces—public storefront, staff/admin dashboard, and affiliate portal—to run together out-of-the-box.
- **Target Audience / Persona**: Storefront shoppers browsing and ordering natural supplements, operations staff managing orders and inventory, and affiliates tracking referrals.
- **Key Value**: Eliminates boot failures caused by missing root scripts, split ports (`5173` vs `3001`), strict environment exit guards, and unavailable local MySQL services, while preserving existing functionality and visual design.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Public Storefront & Checkout**: Visitors land on the organic storefront, browse featured highland products and daily highlights, add items to their order form, and submit orders with instant receipt generation and order tracking.
  2. **Admin & Staff Dashboard**: Staff sign in at `/login` (using seeded demo credentials when in preview mode) to view KPI cards, revenue charts, inventory alerts, customer insights, affiliate rules, and order logistics.
  3. **Telegram Mini App (`/tma` & `/telegram-store`)**: Mobile shoppers browse the standalone Mini App interface with cart, checkout, order history, and multilingual support.
- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Preserves the existing Asella Organic highland botanical aesthetic with zero restyling.
  - *Color Palette & Mood*: Deep forest greens (`--g900: #0d2e10`, `--g700: #2e7d32`), warm parchment/cream (`--cream: #f7fdf7`), highland gold accents (`--highland-gold: #8B6932`), and high-contrast accessible ink tokens (`--ink: #1a2e1b`).
  - *Typography & Hierarchy*: `Outfit` for bold display headers, `DM Sans` for clean body copy and dashboard controls, and `DM Mono` for order IDs and financial metrics.
  - *Component Styling & Layout*: Existing Tailwind CSS and custom CSS variables across storefront cards, glassmorphic headers, and dashboard data tables.
- **Interactive Feedback & Motion**: Smooth marquee product carousels, top navigation progress bars, toast notifications, and status pill transitions.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Single-Port Full-Stack Architecture (`0.0.0.0:3000`)**
  - *Chosen Approach*: Configure the root workspace scripts to start a unified server on port `3000` where Express handles all `/api` and `/image` routes and delegates frontend asset serving (and `/tma` rewrites) on the same origin.
  - *Why*: The runtime environment exposes only port `3000` externally and runs inside an iframe. Serving both frontend and API from the same origin avoids cross-origin cookie blocking (`SameSite` issues in iframes) and eliminates the need for separate background processes on ports `5173` and `3001`.
  - *Alternatives Considered*: Running Vite alone on port `3000` was passed over because API calls to `/api/products`, `/api/orders`, and `/api/auth` would fail without the Express backend.
- **Decision 2: Resilient MySQL Pool with Seeded In-Memory Fallback**
  - *Chosen Approach*: Provide safe defaults for environment validation (`JWT_SECRET`, `PORT`, `ALLOWED_ORIGINS`) and wrap the database pool so that if MySQL is unreachable, queries are answered by an in-memory store seeded with Asella Organic catalog items, sample orders, customers, notifications, and staff credentials.
  - *Why*: Direct TCP to external MySQL servers is unavailable in the container by default. An intelligent in-memory fallback lets every storefront and dashboard view render real product images, prices, KPIs, and interactive CRUD flows immediately.
  - *Alternatives Considered*: Crashing on boot (`process.exit(1)`) or returning empty arrays for all queries, which would leave the storefront product grid empty and prevent dashboard login.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   Browser / Preview iFrame (Port 3000)                  │
├───────────────────────┬─────────────────────────┬───────────────────────┤
│   Public Storefront   │     Admin Dashboard     │   Telegram Mini App   │
│  (Hero, ProductGrid,  │  (KPICards, Orders,     │  (TmaShell, StoreTab, │
│   Checkout, Tracking) │   Inventory, Affiliates)│   CartView, Orders)   │
└───────────┬───────────┴────────────┬────────────┴───────────┬───────────┘
            │                        │                        │
            └────────────────────────┼────────────────────────┘
                                     │ Same-Origin HTTP (/api/*, /image/*)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                Unified Express + Vite Server (0.0.0.0:3000)             │
├────────────────────────────────────┬────────────────────────────────────┤
│       Express API Middleware       │     Frontend Asset & SPA Router    │
│  (CORS/CSRF Origin Adaptation,     │  (Vite Middleware / Static Build,  │
│   Cookie Auth, Rate Limit, Images) │   /tma & /telegram-store Rewrite)  │
└─────────────────┬──────────────────┴────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                   Resilient Database Layer (Pool Proxy)                 │
├────────────────────────────────────┬────────────────────────────────────┤
│     Live MySQL Connection Pool     │   In-Memory Seeded Store Fallback  │
│  (Used when DB_HOST is reachable)  │  (Products, Orders, Staff,         │
│                                    │   Customers, Affiliates, Analytics)│
└────────────────────────────────────┴────────────────────────────────────┘
```

- **Data Model & State**:
  - **Products & Inventory**: Seeded with Asella Organic's actual catalog matching the local product images (Moringa Powder, Black Seed Oil, Himalaya Shilajit, Frankincense Oil, Erid Turmeric, Ashwagandha, Hibiscus, Qasil Powder, Kerbe Oil, Chia Seed, etc.), including prices in ETB, stock quantities, and featured flags.
  - **Staff & Auth**: Seeded with an active admin account (`username: "admin"`, `password: "admin123"`) and in-memory refresh token tracking so login, session rehydration (`/api/auth/me`), and logout work seamlessly. Also configures cookies (`SameSite=Lax` / `None` in iframe contexts) and CSRF origin checks to accept the preview host.
  - **Orders, Customers & Affiliates**: Seeded with sample Ethiopian orders across Addis Ababa, Adama, Hawassa, and Bahir Dar, customer insights segments, and affiliate commission rules so all dashboard tables and charts populate cleanly.
- **Interactive Component & State Mapping**:
  - **Storefront Product Browsing & Checkout**: Queries `GET /api/products` -> renders product cards with local images -> submits `POST /api/orders` -> appends order to in-memory store, decrements product stock, and returns order receipt for `/track/:orderId`.
  - **Dashboard Authentication & Management**: Submits `POST /api/auth/login` -> validates against seeded staff users -> issues JWT cookie -> unlocks `/dashboard/*` routes -> supports creating/editing products, updating order statuses, adjusting stock, and viewing analytics reports.
