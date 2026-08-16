# Deployment Gotchas

This document summarizes three common production failure modes in this codebase and how they were fixed. Future contributors should read this to understand why certain configurations (like the Service Worker versioning, CSP shared config, and CORS environment variables) are set up the way they are.

## 1. Service Worker Caching Stale Content
**The Problem**: Previously, the PWA service worker (`frontend/public/sw.js`) lacked a dynamic versioning strategy. After a deployment, users would indefinitely receive the old cached version of the HTML. Because the service worker intercepted all navigation requests, changes to server-side redirects, CSP headers, or routing were silently ignored for returning users.
**The Fix**: 
- The `sw.js` file now contains a `__VERSION__` placeholder.
- During the Vite build (`frontend/scripts/postbuild.js`), this placeholder is replaced with a unique hash of the build (`v-hash`).
- Navigation requests (HTML documents) now use a **network-first** strategy. Cache-first is strictly reserved for fingerprinted static assets (images, JS, CSS, fonts).
- `self.skipWaiting()` and `self.clients.claim()` ensure immediate control upon activation, and old caches are deleted when the version changes.

## 2. CSP (Content-Security-Policy) Configuration Drift
**The Problem**: The CSP was defined in two unrelated places without synchronization: Express backend (via Helmet) and Apache `.htaccess` (for the static frontend). When external domains (like YouTube thumbnails) were added to one but not the other, it caused broken functionality that was hard to diagnose.
**The Fix**:
- A single source of truth was established at the project root: `csp-config.js`.
- The Express backend imports this config directly for Helmet (`backend/src/app.ts`).
- The frontend build process automatically reads this config and appends the appropriate `Content-Security-Policy` header string to `frontend/dist/.htaccess`.
- An npm script `npm run check-csp` can be run to verify that the generated `.htaccess` matches the shared config.

## 3. Dead Environment Variables (ALLOWED_ORIGINS)
**The Problem**: A production incident occurred where updating `ALLOWED_ORIGINS` had zero effect on the CORS allowlist, because the codebase was secretly reading `FRONTEND_URL` instead.
**The Fix**:
- The environment variable was renamed globally to `ALLOWED_ORIGINS` to accurately reflect that it takes a comma-separated list of origins.
- The backend validates this variable via Zod (`backend/src/config/env.ts`).
- At startup, the backend prints the resolved CORS allowlist to the logs (`logger.info` in `backend/src/app.ts`), making any misconfiguration immediately visible.

## 4. Analytics & Site Quality Monitoring False Positives
**The Problem**: SEO and site quality monitors reported 404 errors for subpages, massive image files, Javascript errors (`t.entries.at is not a function`), and dead Facebook links.
**The Fix**:
- **Uptime 404s**: The `postbuild.js` script now generates a Single Page Application (SPA) `RewriteRule` in `dist/.htaccess`, ensuring Apache serves `index.html` for client-side routes instead of returning a 404.
- **Large Images**: The codebase originally contained 1.5MB+ PNG files in `frontend/public/image/products/`. These were manually compressed in the repository using a custom `sharp` script down to ~150KB, ensuring fast loads even if the backend's dynamic image optimizer fails.
- **Javascript Errors**: Added an `Array.prototype.at` polyfill to `index.html` to support older crawler bots.
- **Dead Facebook Links**: Identified as a false positive. Facebook blocks automated SEO bots from scraping share links by returning a 404 or login wall, but the links work correctly for real users.

## 5. Google Drive Image Resolution
**The Problem**: Google Drive sharing URLs (e.g. `.../view?usp=sharing`) failed to render inside `<img>` tags because they link to HTML pages, not image files. Additionally, the frontend was hardcoded to ignore database image URLs for specific product names (like "Ashwagandha").
**The Fix**:
- `frontend/src/utils/image.ts` was updated to prioritize database image URLs over the hardcoded local string matches.
- The code now automatically detects full Google Drive URLs and rewrites them into direct-download URLs (`.../uc?export=view&id=...`) so they render seamlessly on the storefront.

## 6. CSP Blocks Inline `<script>` Tags (No `unsafe-inline`)
**The Problem**: The site's `Content-Security-Policy` (written into `dist/.htaccess` at build time by `postbuild.js`) sets a strict `script-src` that only allows `'self'` and `https://static.cloudflareinsights.com` — **no `'unsafe-inline'`**. An `Array.prototype.at` polyfill was written as an inline `<script>` block directly in `index.html`. This worked fine in local development because the dev server (`vite dev`) does not serve the `.htaccess` file or any CSP header — the policy is only enforced in production via Apache. The polyfill was silently blocked in production, causing JavaScript errors in older browsers and crawler bots.

**The Fix**:
- The inline `<script>` block was extracted verbatim into `frontend/public/polyfills.js`.
- The inline block in `index.html` was replaced with `<script src="/polyfills.js"></script>`.
- Vite copies all files in `frontend/public/` to `dist/` root as-is, so no build config change was needed.
- A **regression check** was added to `scripts/postbuild.js` (step 4). After every build it scans `dist/index.html` for any `<script>` tag without a `src=` attribute and **fails the build with a clear error** if one is found.

**Rule for all future contributors**:
> Any `<script>` added to `frontend/index.html` **must** reference an external file via `src=`.
> Put the file in `frontend/public/` — Vite copies it to the dist root automatically.
> **Never** use an inline `<script>...</script>` block, even for small snippets.
> If a script truly requires runtime/server-rendered values (e.g. a nonce or dynamic config), that is a deployment-config concern and needs a CSP `nonce` or `hash` strategy — raise it before adding the script.

