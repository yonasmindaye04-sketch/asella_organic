# Asella Organic — Changelog & Activity Log

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


