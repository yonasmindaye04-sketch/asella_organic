# Asella Organic — Changelog & Activity Log

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


