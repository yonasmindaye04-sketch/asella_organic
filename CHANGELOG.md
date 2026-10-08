# Asella Organic — Changelog & Activity Log

## [2026-10-07i] — Icon Proportionality Pass & Header Mark Removal

### 1. Pointed header mark removed
The `fa-leaf` mark in the header logo tile had a sharp tip that read as an arrow
rather than a brand mark. The tile and glyph are gone; the header now leads with
the "Asella Organic" wordmark alone.

### 2. Icon scale rebuilt across all four tabs
The Font Awesome glyphs were sized against the old inline SVGs and came out 60-67%
of their containers, which read oversized. Every icon was remeasured in Chromium
(glyph width against host width) and rescaled to a consistent ~52-56% fill.

| Location | Before | After | Fill |
|---|---|---|---|
| Bottom nav chips | 22px / 40px | 15px / 36px | 56% |
| Store category chips | 28px / 56px | 19px / 48px | 53% |
| Discover category tiles | 28px / 44px | 16px / 40px | 53% |
| Header controls | 18px / 36px | 14px / 36px | 52% |
| Account stat cards | 20px | 15px | 19% of card |
| Orders status tick / chevron | 11px | 10px | — |
| Search, filters, sort, clear, trash | 15px | 13-14px | — |

Note that a Font Awesome glyph renders wider than its CSS `font-size` (its
advance width exceeds the em box), so the declared sizes are smaller than the
measured pixel widths above. Sizing was therefore driven by measured fill
ratio, not by eye.

### 3. Verification
13 tests pass, typecheck and lint clean, build and `postbuild.js` guards succeed.
All four tabs screenshot-verified in light and dark.

## [2026-10-07h] — Font Awesome Migration & Discover Affordances

### 1. Clickable affordance on "Shop by category"
Removing the icon plates left no signal that these were tappable. Each tile now
carries a soft `bg-brand-50` tint (which resolves correctly in both themes),
plus `hover:bg-brand-100` and `active:scale-95`.

### 2. Header logo is no longer a control
The brand lockup was a `<button>` that jumped to the Store tab, so hovering drew
a pointer cursor over the logo and implied an action that only a header should
offer. Converted to a non-interactive `<div>`.

### 3. Font Awesome
Installed `@fortawesome/fontawesome-free@7.3.1` and replaced every inline SVG in
the Mini App with `fa-solid` classes — 16 glyphs across the shell, tabs, category
chips, search, sort, filters, orders, cart and account. Imported from
`src/tma.tsx` only, so the website bundle is untouched. Every icon name was
verified against the installed stylesheet before use.

| Purpose | Icon |
|---|---|
| Tabs | `fa-store`, `fa-compass`, `fa-receipt`, `fa-circle-user` |
| Categories | `fa-grip`, `fa-star`, `fa-leaf`, `fa-droplet`, `fa-seedling`, `fa-spa` |
| Shell | `fa-leaf`, `fa-chevron-left`, `fa-sun`, `fa-moon`, `fa-cart-shopping` |
| Actions | `fa-magnifying-glass`, `fa-sliders`, `fa-chevron-down`, `fa-xmark`, `fa-check`, `fa-chevron-right`, `fa-trash-can` |
| Account stats | `fa-box`, `fa-wallet`, `fa-store` |

SVG-specific sizing selectors (`[&>svg]:h-*`) were swapped for `[&>i]:text-*`,
and the sort pill spacing widened so the chevron no longer overlaps the label.

**Bundle cost:** Mini App CSS 118 KB → 184 KB raw (17 KB → 35 KB gzip) and a
116.7 KB `fa-solid-900.woff2`. Total roughly +150 KB gzipped. The 700-glyph font
is shipped whole regardless of how few icons are used, which is the trade-off of
an icon font versus the previous inline SVG.

### 4. Verification
13 tests pass, typecheck and lint clean, build and `postbuild.js` guards succeed.
Chromium confirms all 16 glyphs resolve to "Font Awesome 7 Free", none are
zero-width, and no network requests failed.

## [2026-10-07g] — Discover Tab Restyle & Stock Count Removal

### 1. Discover category icons
Applied the same treatment as the Store chips: the old `rounded-full`
`bg-brand-100` plate and the card border are gone, leaving a bare bold icon at
`h-7 w-7` in full-strength ink above a `font-semibold` label. Press feedback via
`active:scale-95`.

### 2. Stock counts removed
Dropped the "195 in stock" line from the Store product grid and from the
Discover "In high demand" rows. Verified in Chromium that the string "in stock"
no longer appears anywhere in either tab's rendered text.

The Discover rows would have collapsed to a bare product name, so the freed line
now carries the product's category tag instead. Out-of-stock products still
surface through the existing "Unavailable" button state, so the removal costs no
availability signal.

`totalStock()` is retained — it still backs the "in-stock items only" filter
even though it no longer renders.

### 3. Discover typography
Section copy moved from `text-xs` to `text-sm`, tip titles to `font-bold`, tip
bodies back to regular weight (the earlier blanket pass had set them bold, which
read as shouting for long paragraphs), and best-seller card names and prices up
one step.

### 4. Verification
Typecheck and lint clean, 13 tests pass, build and `postbuild.js` guards succeed.
Both tabs screenshot-verified in light and dark.

## [2026-10-07f] — Mini App Icon & Legibility Pass

### 1. Category chips
Removed the resting circle background and border. Icons now sit bare with their
label, and selection is signalled by a soft-edged green plate (`rounded-2xl`,
`bg-brand-solid`, white icon). Icon strokes bumped from 1.7/1.8 to 2.1 and glyph
size to `h-7 w-7` so they read at a glance. Press feedback via `active:scale-90`.

### 2. Bottom navigation
Icons enlarged to `h-6 w-6` with 2.1 strokes. The active tab now gets a solid
green plate with a white icon instead of a faint tint, and every tab has press
motion (`active:scale-90 active:opacity-80` with `duration-200`). The cart badge
gained a `ring-2 ring-panel` so it stays legible over any background.

### 3. Typography
Bumped the smallest type one step across all 10 shop files — `9px -> 10px`,
`10px -> 11px`, `11px -> 12px` — and strengthened weights on meta copy. Chips
were left compact deliberately: the cart badge was returned to `10px` with
`leading-none` and the header language selector to `10px`, because the blanket
bump made both overflow their pills.

### 4. Contrast fix found during verification
The green scale is inverted for dark mode so `g700` becomes a light green usable
as *text*. That left white-on-light-green buttons ("Add to Cart" was washed out
in dark mode). Added a dedicated `--accent-solid` / `brand-solid` token that stays
dark in both themes and converted all 16 accent fills to it, with
`hover:brightness-95` replacing the `hover:bg-brand-800` that would otherwise
lighten the wrong direction. Measured: white on `rgb(47,127,52)` = 4.99:1, which
passes AA.

### 5. Verification
Typecheck and lint clean, 13 tests pass, build and `postbuild.js` guards succeed.
Both themes measured in Chromium: category chip, nav chip and primary buttons all
resolve to the accent fill with white text in light *and* dark.

## [2026-10-07e] — Dark Mode Correctness & Sort Control Styling

### 1. Dark mode: three real defects, found by measuring
Symptom was "dark mode is not working properly". Rather than guess, the rendered
page was probed in Chromium and computed styles were read for both themes.

**a) Duplicate Tailwind colour key pinned every surface to light.**
`tailwind.config.js` already defined `"surface": "#fafaf4"`. The new
`"surface": "var(--surface)"` alias was inserted *earlier* in the same object,
so the later hardcoded key won. `bg-surface` compiled to a fixed `#fafaf4`,
meaning cards, header and tab bar stayed light in dark mode no matter what.
Renamed the alias to `panel` (`var(--surface)`) with a comment explaining the
collision, and updated all 29 usages.

**b) An inline style blocked the dark override.**
`tma.tsx` did `document.documentElement.style.setProperty('--cream', '#f7fdf7')`
to avoid a pre-paint flash. An inline style on `<html>` outranks *any*
stylesheet rule, including `.dark`, so `--cream` never flipped. Measured
before/after confirms it now resolves `#f7fdf7` → `#0c150d`.

**c) Opacity modifiers silently broke on `var()` colours.**
`bg-panel/95` computed to `rgba(0, 0, 0, 0)` — Tailwind cannot inject an alpha
channel into a raw `var(--token)`, so the declaration was dropped and the header
and tab bar rendered transparent. Replaced the four affected classes
(`bg-panel/95`, `bg-brand-100/70`, `bg-brand-50/50`) with solid equivalents and
documented the limitation in `tailwind.config.js`.

Measured result in dark mode: body `rgb(12,21,13)`, header/h1/card/nav all light
text on `rgb(20,31,21)` panels.

### 2. Native dropdown options
`select option` is painted by the OS and ignores page tokens, so the sort and
city pickers opened white-on-white in dark mode. Added explicit
`select option, select optgroup` colours in `tma.css`.

### 3. "Recommended" sort control
It rendered as a bare bordered box with the chevron overlapping the label —
`@tailwindcss/forms` injects its own border and background on `<select>`, which
my `appearance-none` did not fully suppress. Rebuilt it as a pill matching the
Filters control: neutralised the forms styles explicitly (`border-0`,
`focus:ring-0`, `rounded-none`), and pinned both controls to `h-7` so they align.
Measured: sort pill and Filters are now both 26px tall.

### 4. Verification
Typecheck and lint clean, 13 tests pass, build and `postbuild.js` CSP/SDK guards
succeed. Both themes were screenshot-verified in Chromium.

## [2026-10-07d] — Mini App Navigation, Header Cleanup & Universal Theme

### 1. Bug: active icons were invisible (white on white)
Selecting "All products" or the **EN** language toggle left the icon invisible.
The cause was not the components: `tailwind.config.js` had just gained the
`brand-*` colour aliases, but the running Vite dev server had been started
*before* that edit, and Tailwind does not hot-reload `tailwind.config.js`. So
`.bg-brand-700` was never generated, while the `text-white` that sits beside it
was — leaving a white icon on a white chip.

Fix: restart the dev server after any Tailwind config change. Verified the
generated stylesheet now contains `.bg-brand-700`, `.bg-surface`, `.bg-cream`,
`.text-ink`, `.text-muted` and `.border-line`, with no `.bg-amber-700` left.

### 2. Universal back button
Added a history stack of `{ tab, overlay }` entries in `TelegramStore.tsx`, so
both tab switches and overlay pushes are undoable. A header chevron appears
whenever there is somewhere to go back to, and Telegram's native `BackButton`
now replays the same stack, so system back and the in-app button always agree.
Guards prevent dead-ends: no-op navigation is ignored, and the header cart
shortcut is never recorded as a history step.

### 3. Header
Removed the "Highland Ethiopia" eyebrow. The title is now a single
`font-heading` line, which freed enough room for the back button without
crowding the controls on a 360px viewport.

### 4. Universal light/dark theme
Added `useTelegramTheme.ts`. Resolution order: an explicit user choice
(persisted to `localStorage`), else Telegram's `colorScheme`, else the OS
`prefers-color-scheme`. A sun/moon toggle sits in the header.

Because every Mini App colour resolves through the CSS tokens in `tma.css`,
theming is a single `.dark` class on `<html>` — no component holds theme state
and nothing re-renders. Added a `.dark` token block plus a `--surface`
variable, and replaced 29 hardcoded `bg-white` uses across 10 files with
`bg-surface` so cards, the header and the tab bar all flip correctly.

### 5. Tests
Added 4 cases (back-button visibility, product open/return, tab-switch history,
theme toggle persistence) and updated the branding assertion for the removed
eyebrow. 12 TelegramStore tests pass; typecheck and lint are clean, and the
build plus `postbuild.js` CSP/SDK guards succeed.

## [2026-10-07c] — Mini App "Failed to fetch" Fix & Website Design Parity

### 1. Bug: Store tab failed to load products in Telegram
The Account tab worked but the Store tab showed "Failed to fetch". Cause:
`services/api.ts` fell back to an **absolute** base URL:

```ts
const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";
```

Inside Telegram the webview is served from the public tunnel, so
`http://localhost:3001` resolved to the *customer's own device*, where nothing
listens. It happened to work in a desktop browser on the dev machine, which is
why it went unnoticed.

Fix: default to a same-origin relative base URL (`""`). The Vite dev server
proxies `/api` to the backend, and production sets `VITE_API_URL` in
`.env.production`. The Telegram-facing client in `telegram/shop/api.ts` already
used relative paths, which is exactly why the Account tab kept working.

### 2. Design parity with the main website
The Mini App had been built on Tailwind's `amber`/`stone` palette, which does not
appear anywhere on the public site. Rebuilt it on the site's organic green system:

- `src/tma.css` now declares the same tokens as `src/index.css`
  (`--g50`…`--g900`, `--cream`, `--ink`, `--ink2`, `--muted`, `--border`, `--radius`,
  `--shadow-card`) and sets DM Sans / Outfit / DM Mono.
- `tailwind.config.js` gained semantic aliases (`brand-*`, `cream`, `ink`, `ink2`,
  `muted`, `line`) so Mini App components use the site palette directly.
- Remapped **284** class tokens across 11 shop files: `amber-*` → `brand-*`,
  `stone-*` → `ink`/`ink2`/`muted`/`line`/`cream`/`brand-50`, and the
  `emerald`/`blue`/`cyan` status colours onto the green scale.
- Section headings now use `font-heading` (Outfit); prices already resolved to
  DM Mono via the existing `font-mono` mapping.
- Added the website's Google Fonts links to `tma.html`.

### 3. Brand surface override
`miniApp.css` painted `.telegram-mini-app-shell` with Telegram's
`--tg-theme-bg-color`, so a user on a dark Telegram theme got a dark shell with
white cards — visibly off-brand. `tma.css` now overrides the surface with the
brand cream, declared unlayered and imported after `miniApp.css` so it beats both
the Tailwind preflight layer and the unlayered theme rule. `src/tma.tsx` no longer
paints the body from Telegram's `bg_color`.

### 4. Verified
Store, Discover, Orders and Account render with the site palette. `dist/tma.html`
builds clean, `postbuild.js` passes its CSP and SDK assertions, typecheck and lint
are clean, and all 9 frontend tests pass.

## [2026-10-07b] — Standalone Telegram Mini App Entry

### 1. Problem
Opening the Mini App in Telegram loaded the **entire website**: the marketing
storefront, the Redux store, every dashboard route and the PWA service worker.
`/tma` and `/telegram-store` were ordinary client-side routes inside the
website's `BrowserRouter`, so `/tma` was also reachable but only by luck — a
host without the SPA fallback served `index.html` and customers saw the
homepage instead of the store.

### 2. Fix — a second, independent document
- `frontend/tma.html`: standalone entry document loading only the Telegram SDK
  and `/src/tma.tsx`.
- `frontend/src/tma.tsx`: mounts `TelegramStore` with only `TelegramProvider` and
  `LanguageProvider`. No `BrowserRouter`, no Redux `Provider`, no `ToastProvider`,
  no `TopProgressBar`, no Sentry bootstrap, no service worker, no website CSS.
- `frontend/src/tma.css`: minimal stylesheet replacing the 756-line `index.css`.
- `frontend/vite.config.ts`: multi-page build input (`main` + `tma`) and a dev
  middleware rewriting `/tma` and `/telegram-store` to `/tma.html`.
- `frontend/public/.htaccess`: matching Apache rewrite, placed **before** the SPA
  fallback so `/tma` can never fall through to `index.html`.
- `frontend/tailwind.config.js`: added `./tma.html` to the content globs.

Verified against the dev server: `/tma`, `/telegram-store` and `/tma.html` all
serve the Mini App entry; `/` still serves the website.

### 3. Security fix
`public/.htaccess` shipped a hardcoded CSP with `frame-ancestors 'self'`, which
would have blocked Telegram from framing the Mini App in production even though
development worked (Vite does not serve that file). Added
`https://web.telegram.org` and `https://*.telegram.org` to `frame-ancestors`, and
`https://telegram.org` to `script-src`, matching `csp-config.js`.

### 4. Build guard
`scripts/postbuild.js` now also asserts that `dist/tma.html` contains no inline
`<script>` blocks and still references the Telegram WebApp SDK, failing the build
otherwise.

### 5. Bundle
`tma.html` loads 6 chunks and no website pages. The Mini App stylesheet is
116 KB raw / 17.5 KB gzipped; it still contains utility classes generated for
the whole `src/` tree. Scoping it further would need a per-entry PostCSS config,
which was judged too fragile for the benefit — left as a future optimisation.

### 6. Docs
`backend/.env.example` documents `PUBLIC_URL` and `TELEGRAM_MINIAPP_URL`.
`getStoreUrl()` now falls back to `/tma` instead of `/telegram-store`.

## [2026-10-07] — Telegram Mini App Tabbed Store (Store / Discover / Orders / Account)

### 1. Frontend: `frontend/src/telegram/shop/`
Split the previous 1,180-line `TelegramStore.tsx` into composable modules, matching the tabbed layout of the reference Mini App:
- `TmaShell.tsx` / `BottomNav.tsx`: shared chrome and the fixed four-tab bottom bar (Store, Discover, Orders, Account) with cart badge.
- `StoreTab.tsx`: two-column product grid, category circles, sort selector, stock filter, and the Popular ribbon. Exports `useFilteredProducts` and `selectDefaultVariant`.
- `OrdersTab.tsx`: debounced order/product search, status filter chips (All / Processing / Delivered / Refunded), and order cards.
- `AccountTab.tsx`: identity card, order/total-spend stat cards, and an editable profile form.
- `DiscoverTab.tsx`: category browse, best sellers, in-demand ranking, usage guidance, and payment methods.
- `CartView.tsx`, `CheckoutView.tsx`, `DetailView.tsx`, `ConfirmationView.tsx`: full-screen overlays bound to the Telegram MainButton and BackButton.
- `api.ts`, `useCart.ts`, `useMiniAppProfile.ts`, `types.ts`: typed API client, localStorage-backed cart, and profile loader.
- `TelegramStore.tsx` is now a thin router holding shared state and driving the MainButton, BackButton, and closing confirmation.

### 2. Backend: Mini App profile and order history
- `GET /api/telegram/profile` and `PUT /api/telegram/profile`: verified-initData gated. Returns the Telegram identity, the saved profile, and order stats (count, delivered, active, total spent).
- `GET /api/telegram/my-orders` now supports `search`, `status` (including the Processing/Delivered/Refunded groups), `page`, and `limit`, and returns a `meta` block. Search also matches product names inside an order.
- New schema `TelegramProfileSchema` and migration `020_telegram_miniapp_profile.sql` (profile columns plus `customers.telegram_chat_id`, `orders.phone`, and `orders(status, created_at)` indexes).

### 3. Security fixes
- **IDOR removed:** `my-orders` no longer accepts an unauthenticated `?chat_id=` (or `?phone=`) fallback. Chat ids are sequential, so any caller could previously enumerate another customer's orders. A new `authenticateMiniApp` helper verifies the `initData` HMAC before serving any customer data.
- **`/link` ownership check:** `linkCustomerChat` now refuses to reassign a phone number already linked to a different chat, and reports a distinct outcome instead of silently taking over the record.
- The weak `notes LIKE '%tg:<chatId>%'` match used for order lookup was dropped in favour of the `customers.telegram_chat_id` join.

### 4. Bug fix
- Fixed an infinite render loop in the variant-seeding effect: it always returned a new state object, so a changing `groupedProducts` identity on every render retriggered the effect forever. This silently prevented `TelegramStore.test.tsx` from ever executing.

### 5. Tests
- `TelegramStore.test.tsx` extended to 8 cases covering the tab bar, search filtering, cart flow, authenticated order loading (asserting no `chat_id` parameter is sent), status filtering, and profile load/save. All pass.
- Pre-existing unrelated failures remain in `tests/components/KPICards.test.tsx` and `tests/components/OrderTracking.test.tsx` (missing Redux `Provider`); backend Jest suites require `DB_PASSWORD` and a running MySQL.

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


