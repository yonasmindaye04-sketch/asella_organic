# Asella Organic — Deployment Readiness Report

**Report Date:** 2026-06-10  
**Assessed By:** Automated Code Audit  
**Project Version:** 1.0.0  
**Overall Verdict:** ⚠️ **NOT READY FOR PRODUCTION** — Critical issues must be resolved first

---

## Executive Summary

Asella Organic is a well-architected monorepo e-commerce/inventory system with a robust feature set.
The codebase demonstrates strong engineering practices in many areas — structured logging, Zod validation,
idempotency middleware, security headers, rate limiting, and comprehensive test coverage. However,
**several critical security and configuration issues** must be resolved before the application is
safe for production deployment.

---

## 🔴 CRITICAL ISSUES (Must Fix Before Deployment)

### 1. `.env` File Contains Real Secrets and Is Committed to Git

**Severity:** 🔴 CRITICAL  
**File:** `backend/.env`

The backend `.env` file contains **real production credentials** including:

- **Database password:** `Yo181801@`
- **JWT secrets** (128-char hex strings)
- **Telegram Bot Token:** `8881421683:AAEMA-gR98Y_5-h1U6tesH2SY9TeRBn-tlg`
- **Gmail SMTP App Password:** `bhdc ngml tryp mxov`
- **Google Service Account private key** (full PEM key)
- **Admin credentials:** `admin / test1234`

Although `.gitignore` lists `backend/.env`, the file exists locally and the Google Service Account JSON file
(`asella-organic-web-afd3fbe2eab3.json`) is **also present at the project root** and only recently added to
`.gitignore`. If these were ever committed to Git history, they are permanently exposed.

**Action Required:**
1. **Immediately rotate ALL secrets** listed above (JWT, Telegram, SMTP, Google SA, admin password)
2. Run `git log --all --full-history -- backend/.env asella-organic-web-afd3fbe2eab3.json` to check if secrets
   were ever committed
3. If committed, use `git filter-repo` or BFG Repo-Cleaner to purge from history
4. Ensure `.env` is in `.gitignore` (✅ it is) and verify it is NOT tracked (`git ls-files backend/.env`)

---

### 2. Weak Admin Password in `.env`

**Severity:** 🔴 CRITICAL  
**File:** `backend/.env` (line 58)

```
INITIAL_ADMIN_PASSWORD=test1234
```

This password fails basic security requirements (no uppercase, no special char). Combined with
the username `admin`, this is trivially brute-forceable.

**Action Required:**
- Set a strong password: minimum 16 characters, mixed case, numbers, and special characters
- Consider removing INITIAL_ADMIN_PASSWORD from `.env` after first setup

---

### 3. PM2 `ecosystem.config.cjs` Points to Wrong Script Path

**Severity:** 🔴 CRITICAL  
**File:** `ecosystem.config.cjs` (line 21)

```javascript
script: "./backend/src/server.js",
```

The source file is `server.ts` (TypeScript). The compiled output is at `backend/dist/server.js`.
PM2 will fail to start in production because `backend/src/server.js` does not exist.

**Action Required:**
- Change to: `script: "./backend/dist/server.js"` for compiled builds, OR
- Use `script: "npx tsx ./backend/src/server.ts"` if running uncompiled (not recommended for prod)

---

### 4. `env.ts` Requires `DATABASE_URL` but DB Pool Uses Individual Variables

**Severity:** 🔴 CRITICAL  
**Files:** `backend/src/config/env.ts` (line 23), `backend/src/config/db.ts`

The Zod env schema requires `DATABASE_URL` as a valid URL string:
```typescript
DATABASE_URL: z.string().url("DATABASE_URL must be a valid connection URL"),
```

But `db.ts` uses individual `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` variables.
This creates a confusing dual-config situation. On a fresh deploy without `DATABASE_URL` set,
the app will crash at startup even if all individual DB vars are correctly configured.

**Action Required:**
- Make `DATABASE_URL` optional in `env.ts` if you want fallback to individual vars, OR
- Use `DATABASE_URL` exclusively in `db.ts` and remove individual vars

---

### 5. Auth System Conflict: HttpOnly Cookies vs localStorage

**Severity:** 🔴 CRITICAL  
**Files:** `frontend/src/services/api.ts`, `frontend/src/main.tsx`, `frontend/src/store/slices/authSlice.ts`

The API service (`api.ts`) is correctly built for **HttpOnly cookie-based auth** (`credentials: "include"`),
but there are conflicting legacy patterns:

- `main.tsx` (line 28-34): Axios interceptor reads token from `localStorage` and sets `Authorization` header
- `authSlice.ts` (line 19-21): Initializes auth state from `localStorage.getItem('token')`
- `authSlice.ts` (line 32-33): `setCredentials` stores token in `localStorage`

This means tokens are stored in JavaScript-accessible storage, defeating the security
purpose of HttpOnly cookies (XSS protection).

**Action Required:**
- Remove the Axios interceptor from `main.tsx` (if all API calls use the `api.ts` client)
- Update `authSlice.ts` to remove `localStorage.setItem('token')` — only store `user` profile
- If both Axios and fetch are used, migrate everything to the `api.ts` client

---

## 🟡 WARNINGS (Should Fix Before Deployment)

### 6. env.ts Requires Non-Optional Telegram & Google Sheets Variables

**Severity:** 🟡 HIGH  
**File:** `backend/src/config/env.ts`

The env schema marks `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ADMIN_CHAT_ID`,
`TELEGRAM_DELIVERY_GROUP_ID`, and `GOOGLE_SPREADSHEET_ID` as required. If any of these are missing,
the app crashes at startup.

**Recommendation:** Make these optional with `.optional()` or `.default("")` so the app
can run without Telegram/Google Sheets integration during development or if those services
are temporarily unavailable.

---

### 7. Coverage Thresholds Are Low

**Severity:** 🟡 MEDIUM  
**File:** `backend/jest.config.js`

```javascript
coverageThreshold: {
  global: {
    branches:   41,
    functions:  51,
    lines:      43,
    statements: 43,
  },
},
```

These are notably low for a production deployment. Key business logic
(order creation, payment processing, inventory management) should have
higher coverage.

**Recommendation:** Incrementally raise thresholds to at least 60% across all metrics.

---

### 8. No 404/Catch-All Route in Frontend

**Severity:** 🟡 MEDIUM  
**File:** `frontend/src/App.tsx`

The React Router configuration has no `<Route path="*">` catch-all.
Users navigating to invalid URLs will see a blank page.

**Recommendation:** Add a `<Route path="*" element={<NotFoundPage />} />` at the end of routes.

---

### 9. `code.gs` File Contains 124KB of Google Apps Script

**Severity:** 🟡 MEDIUM  
**File:** `code.gs` (root, 124KB)

This appears to be a legacy Google Apps Script file that may contain
sensitive logic or embedded credentials. It doesn't belong in the
monorepo deployment.

**Recommendation:** Move to a separate repository or archive, and add to `.gitignore`.

---

### 10. Legacy HTML Files at Root

**Severity:** 🟡 LOW  
**Files:** `index.html` (200KB), `ordertracking.html` (57KB)

These large standalone HTML files at the project root appear to be
legacy versions of the storefront and order tracking pages. They are
not part of the React frontend and could cause confusion.

**Recommendation:** Archive or remove them. They may also contain
hardcoded API endpoints or credentials.

---

### 11. Missing PWA Icons

**Severity:** 🟡 LOW  
**File:** `frontend/public/manifest.webmanifest`

The manifest references icon files at `/icons/icon-192.png`, `/icons/icon-512.png`,
and `/icons/icon-512-maskable.png`. Verify these files exist at build time.

**Recommendation:** Ensure the icons directory and files are present in `frontend/public/icons/`.

---

### 12. Frontend CDN Dependencies Without Integrity Hashes

**Severity:** 🟡 MEDIUM  
**File:** `frontend/index.html` (line 27)

```html
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
```

No `integrity` or `crossorigin` attributes. If the CDN is compromised, malicious
CSS could be injected.

**Recommendation:** Add `integrity="sha512-..."` and `crossorigin="anonymous"` attributes,
or self-host the Font Awesome CSS.

---

## ✅ THINGS THAT WORK WELL

| Area | Status | Details |
|------|--------|---------|
| **Project Structure** | ✅ Excellent | Clean monorepo: `backend/`, `frontend/`, `tests/` with clear separation |
| **TypeScript** | ✅ Solid | Strict config, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` enabled |
| **Security Headers** | ✅ Strong | CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy all set |
| **Rate Limiting** | ✅ Good | Dual-tier (IP + user-based), separate limits for login/orders/general |
| **Input Validation** | ✅ Comprehensive | Zod schemas for all API inputs with XSS sanitization via DOMPurify |
| **Request Correlation** | ✅ Professional | UUID-based `x-request-id` propagated through logs and responses |
| **Idempotency** | ✅ Excellent | POST idempotency with hash-based payload matching, DB-backed |
| **Auth System** | ✅ Well-designed | JWT with session blocklist, role-based access, 2FA support |
| **DB Migrations** | ✅ Reliable | Ordered SQL migrations with tracking table, DELIMITER handling |
| **Logging** | ✅ Structured | JSON log format with request ID, scoped per-request loggers |
| **CI/CD** | ✅ Complete | GitHub Actions pipeline with lint, typecheck, test, audit, deploy gate |
| **Graceful Shutdown** | ✅ Proper | SIGTERM/SIGINT handling, DB pool drain, force-exit timeout |
| **Test Coverage** | ✅ Good breadth | 15 unit test files, 8 integration tests, 10+ Playwright E2E specs |
| **API Versioning** | ✅ Forward-thinking | `/api/v1/*` with backward-compat `/api/*` shims |
| **PWA Support** | ✅ Setup | Service worker, offline page, manifest, App Shell |
| **Error Handling** | ✅ Centralized | Global error handler, env-aware error messages |
| **State Management** | ✅ Redux Toolkit | Clean slice architecture with auth, UI, and stock slices |
| **Health Check** | ✅ Comprehensive | Checks DB + Telegram connectivity, returns structured JSON |

---

## Deployment Checklist

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | Rotate all leaked secrets (JWT, Telegram, SMTP, Google SA) | 🔴 CRITICAL | ⬜ |
| 2 | Purge `.env` from Git history if ever committed | 🔴 CRITICAL | ⬜ |
| 3 | Set strong `INITIAL_ADMIN_PASSWORD` | 🔴 CRITICAL | ⬜ |
| 4 | Fix PM2 script path to `./backend/dist/server.js` | 🔴 CRITICAL | ⬜ |
| 5 | Resolve `DATABASE_URL` vs individual DB vars conflict | 🔴 CRITICAL | ⬜ |
| 6 | Remove localStorage token pattern from frontend | 🔴 CRITICAL | ⬜ |
| 7 | Run `npm run build` in both backend and frontend, verify clean builds | 🟡 HIGH | ⬜ |
| 8 | Make Telegram/Google Sheets env vars optional | 🟡 HIGH | ⬜ |
| 9 | Add 404 catch-all route to frontend | 🟡 MEDIUM | ⬜ |
| 10 | Add SRI hashes to CDN resources | 🟡 MEDIUM | ⬜ |
| 11 | Raise test coverage thresholds | 🟡 MEDIUM | ⬜ |
| 12 | Remove or archive `code.gs` and legacy HTML files | 🟡 LOW | ⬜ |
| 13 | Verify PWA icons exist | 🟡 LOW | ⬜ |
| 14 | Set `FRONTEND_URL` to production domain in production `.env` | 🟡 HIGH | ⬜ |
| 15 | Configure ALLOWED_ORIGINS for production domain | 🟡 HIGH | ⬜ |
| 16 | Run `npm audit` and fix any high/critical vulnerabilities | 🟡 HIGH | ⬜ |
| 17 | Set up PM2 log rotation in production | 🟡 MEDIUM | ⬜ |
| 18 | Create production `.env` with all required variables | 🔴 CRITICAL | ⬜ |

---

## Architecture Scorecard

| Category | Score | Notes |
|----------|-------|-------|
| **Security** | 6/10 | Strong in-code security, but critical secret management issues |
| **Code Quality** | 8/10 | Clean TypeScript, good patterns, comprehensive validation |
| **Test Coverage** | 7/10 | Good breadth, but low threshold baselines |
| **DevOps/CI** | 8/10 | Full CI pipeline, PM2 config (needs path fix) |
| **Documentation** | 3/10 | README is essentially empty, no API docs |
| **Error Handling** | 8/10 | Centralized, structured, env-aware |
| **Performance** | 7/10 | Connection pooling, LRU caching, but no Redis |
| **Deployment Readiness** | 4/10 | Critical blockers must be resolved |

**Overall Score: 6.4/10** — Strong foundation, but not safe for production until critical issues are fixed.

---

*This report was generated from a static analysis of the codebase. A full security audit
with penetration testing is recommended before handling real customer data and payments.*
