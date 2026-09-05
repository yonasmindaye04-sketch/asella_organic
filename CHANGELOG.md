# Asella Organic — Changelog & Activity Log

## [2026-09-05] — Yekis TMA Architecture Parity & Bot Management Suite

### 1. Telegram Mini App Frontend Architecture
- Replicated modular structure from the Yekis project (`frontend/src/telegram/`):
  - `frontend/src/telegram/types.ts`: Comprehensive TypeScript definitions supporting latest Bot API 8.0+ features (`SecondaryButton`, `safeAreaInset`, `contentSafeAreaInset`, `isFullscreen`, `requestFullscreen`, `exitFullscreen`, `disableVerticalSwipes`, `enableVerticalSwipes`).
  - `frontend/src/telegram/webApp.ts`: Safe accessor and robust Telegram Mini App platform detector.
  - `frontend/src/telegram/useTelegramMiniApp.ts`: React hook exposing full Telegram WebApp state and controls.
  - `frontend/src/telegram/miniApp.css`: High-contrast Telegram theme CSS system adapting `--tg-theme-*` variables, safe area padding, and zero-emoji glass cards.
  - `frontend/src/api/telegramAuth.ts`: API client functions for Telegram session validation and order retrieval.
- Configured `frontend/vite.config.ts` with `allowedHosts: true`, `host: true`, and tunnel headers (`ngrok-skip-browser-warning: true`, `X-Frame-Options: ALLOWALL`) to prevent Vite host blocking and ngrok interstitial screens.
- Enhanced `TelegramStore.tsx` with vertical swipe protection (`disableVerticalSwipes()`) and safe area styling.

### 2. Bot Startup Pre-flight & Automated Configuration
- Added `initBotConfiguration()` in `backend/src/lib/telegram.ts` triggered automatically on server boot:
  - Validates `TELEGRAM_BOT_TOKEN` via `getMe()`.
  - Automatically registers `setMyCommands` (`start`, `store`, `shop`, `track`, `orders`, `help`).
  - Automatically registers `setMyDescription` and `setMyShortDescription` (zero emojis).
  - Automatically sets persistent `setChatMenuButton` when `TELEGRAM_MINIAPP_URL` is an HTTPS URL.
- Added administration endpoints in `backend/src/routes/telegram.ts`:
  - `GET /api/telegram/health`: Returns bot status, `getMe()` info, and `getWebhookInfo()`.
  - `GET /api/telegram/info`: Returns bot metadata.
  - `POST /api/telegram/set-webhook`: Configures webhook URL and secret.
  - `POST /api/telegram/delete-webhook`: Removes webhook and drops pending updates.
  - `POST /api/telegram/configure-bot`: Re-synchronizes bot commands and description.
  - `POST /api/telegram/send-push`: Sends push notifications to customer or staff chats.

### 3. Project-Wide Zero-Emoji Sweep
- Replaced all legacy unicode cross symbols with clean SVG icons across `BulkOrdersPage.tsx`, `NewOrderPage.tsx`, `OrderTracking.tsx`, and `ProductsPage.tsx`.

## [2026-09-04] — Telegram Mini App Store & Zero-Emoji Policy Implementation

### 1. Telegram Mini App Store
- Added full Telegram Mini App e-commerce store (`/telegram-store`) enabling Telegram users to browse catalog, choose package sizes, add items to cart, and checkout with one tap.
- Implemented cryptographic Telegram `initData` HMAC-SHA256 signature verification in the backend API.
- Integrated Telegram WebApp SDK, native `MainButton`, `BackButton`, and `HapticFeedback`.
- Built in-app order tracking with real-time status history.
- Added `/store` command and dynamic web app launch buttons to Telegram Bot.

### 2. Operational Rules & Governance
- Established strict zero-emoji policy documented in `rule.md` and `agent.md`.
- Updated Content Security Policy (`csp-config.js`) to whitelist Telegram domains (`telegram.org`, `web.telegram.org`).

## [2026-08-16] — CSP Compliance & Image Path Fixes

### 1. CSP Strict Compliance (No `unsafe-inline`)
- **Extracted Inline Scripts**: Moved the `Array.prototype.at` polyfill from an inline `<script>` block in `frontend/index.html` to an external file (`frontend/public/polyfills.js`) to comply with the strict Content-Security-Policy (which blocks `'unsafe-inline'`).
- **Build-Time Regression Check**: Added an automated regex check to `frontend/scripts/postbuild.js` that scans `dist/index.html` post-build and fails if any inline `<script>` blocks (without a `src` attribute) are detected.
- **Documentation**: Added §6 to `DEPLOYMENT_GOTCHAS.md` explaining the strict script-src CSP rules and providing guidelines for future contributors.

### 2. Product Image Path Corrections
- **Fixed Database Records**: Corrected canonical database paths and fallback mappings in `frontend/src/utils/image.ts` for multiple products whose images weren't showing:
  - **Cinnamon**: Assigned dedicated `Cinnamon.png`
  - **Coffee**: Assigned dedicated `Coffee.png`
  - **Cloves**: Fixed broken reference to `Cloves.png`
  - **Asella Frankincense Raw**: Fixed broken reference to `Asella Frankincense Raw.jpeg`
  - **Ashewagenda (Himalya) Tablet**: Fixed case-sensitivity bug on Linux by updating path to use uppercase `Himalaya ashwagandha tablet 120 ( 250 mg ).png`

## [2026-08-04] — Recent Session Updates & Feature Implementations

### 1. UI & Aesthetics Consistency
- **Button Roundness**: Modified [`frontend/src/components/storefront/ProductCarousel/ProductCard.tsx`](file:///c:/Users/Yonas/Desktop/asella_organic/frontend/src/components/storefront/ProductCarousel/ProductCard.tsx) button class from `rounded-full` to `rounded-lg` to match landing page button design language.

### 2. Telegram Delivery Group Integration
- **Universal Regional Routing**: Modified backend order handling in [`backend/src/routes/orders.ts`](file:///c:/Users/Yonas/Desktop/asella_organic/backend/src/routes/orders.ts) and [`backend/src/routes/telegram.ts`](file:///c:/Users/Yonas/Desktop/asella_organic/backend/src/routes/telegram.ts).
- Removed `fields.city.toLowerCase().includes("addis")` restriction. All orders marked as `order_type === 'delivery'` are now posted to the delivery group regardless of location.

### 3. Asset & Performance Optimization
- **Image Compression**: Executed Node.js compression script utilizing `sharp`. Compressed 35 images (PNG/JPEG) across `frontend/public/image/dailyimages`, `products`, and `receipt` directories to boost load performance.

### 4. Comprehensive Loading Animations System
- **Global Nature Loader**: Updated [`frontend/src/components/ui/LoadingSpinner.tsx`](file:///c:/Users/Yonas/Desktop/asella_organic/frontend/src/components/ui/LoadingSpinner.tsx) with a custom SVG leaf breathing animation, gold aura, and brand text.
- **Top Route Progress Bar**: Integrated `nprogress` with [`frontend/src/components/ui/TopProgressBar.tsx`](file:///c:/Users/Yonas/Desktop/asella_organic/frontend/src/components/ui/TopProgressBar.tsx) and attached to `useLocation` in [`frontend/src/App.tsx`](file:///c:/Users/Yonas/Desktop/asella_organic/frontend/src/App.tsx).
- **Form Button Spinner**: Created [`frontend/src/components/ui/ButtonSpinner.tsx`](file:///c:/Users/Yonas/Desktop/asella_organic/frontend/src/components/ui/ButtonSpinner.tsx) and added to submit state in [`frontend/src/components/storefront/OrderForm.tsx`](file:///c:/Users/Yonas/Desktop/asella_organic/frontend/src/components/storefront/OrderForm.tsx).
- **Gold Skeleton Shimmer**: Added keyframes and `shimmer` animation to [`frontend/tailwind.config.js`](file:///c:/Users/Yonas/Desktop/asella_organic/frontend/tailwind.config.js) and updated loading states in [`frontend/src/components/storefront/BestSellers.tsx`](file:///c:/Users/Yonas/Desktop/asella_organic/frontend/src/components/storefront/BestSellers.tsx).

### 5. Scroll Reveal Animation System
- **IntersectionObserver Hook**: Created [`frontend/src/hooks/useScrollReveal.ts`](file:///c:/Users/Yonas/Desktop/asella_organic/frontend/src/hooks/useScrollReveal.ts).
- **ScrollReveal Component**: Created [`frontend/src/components/ui/ScrollReveal.tsx`](file:///c:/Users/Yonas/Desktop/asella_organic/frontend/src/components/ui/ScrollReveal.tsx) with 7 animation variants.
- **Storefront Integration**: Wrapped sections in [`frontend/src/pages/Storefront.tsx`](file:///c:/Users/Yonas/Desktop/asella_organic/frontend/src/pages/Storefront.tsx) (`DailyHighlights`, `BestSellers`, `StorySection`, `Reviews`, `ContactSection`, `Footer`). Added staggered reveals to cards in [`frontend/src/components/storefront/StorySection.tsx`](file:///c:/Users/Yonas/Desktop/asella_organic/frontend/src/components/storefront/StorySection.tsx) and [`frontend/src/components/storefront/Reviews.tsx`](file:///c:/Users/Yonas/Desktop/asella_organic/frontend/src/components/storefront/Reviews.tsx).

### 7. Error Boundary Fallback Screen & Contact Info
- **File**: [`frontend/src/lib/sentry.tsx`](file:///c:/Users/Yonas/Desktop/asella_organic/frontend/src/lib/sentry.tsx)
- **Change**: Updated the "Something went wrong" fallback screen to display clean text directly on the page background (removed card box and emojis) with Asella Organic contact details:
  - Phone: +251 909 122 623 / +251 942 223 999
  - Email: support@asellaorganic.com
  - Telegram: @asella_organic


