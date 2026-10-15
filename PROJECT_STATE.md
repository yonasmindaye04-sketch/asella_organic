# Asella Organic — PROJECT STATE REPORT

**Audit date:** 2026-10-10 · **Repo root:** `C:/Users/Yonas/Desktop/projects/asella_organic`
**HEAD at audit time:** `975d5ba` (2026-10-09 23:49:08 +0300)
**Method:** read-only static inspection. No files were modified, no migrations run, no database or server touched.

---

## Executive summary (10 lines)

1. Monorepo is three npm packages — root (Playwright only), `backend/` (Express 5 + TS + MySQL), `frontend/` (React 19 + Vite, PWA) — with no workspace tooling, no `.nvmrc`, and Node 24 pinned only inside `.github/workflows/ci.yml`.
2. The backend is a single 336-line `app.ts` with 18 routers mounted at both `/api/v1/*` and `/api/*`; helmet/CSP, CORS, CSRF Origin check, cookie-parser, request-id, access log, raw-body, JSON, rate limit, idempotency, routes, 404, error handler.
3. Auth is HttpOnly-cookie-first JWT (`access_token` 1h, `refresh_token` 24h scoped to `/api/auth`) with SHA-256-hashed refresh rows, a `session_blocklist`, and TOTP 2FA on destructive routes — solid, and now committed but **not yet deployed**.
4. Input validation is Zod + DOMPurify via `validate()`; however several routes (`POST /api/products/bulk`, telegram Mini App routes) bypass it, and SQL is built by string-concatenated field lists.
5. A duplicate-`(name, package_size)` **unique constraint does exist** (`018`, via a virtual `active_unique` column) but only for `active = 1` rows; several code paths and one seed file still create active duplicates.
6. The two `node-cron` jobs (daily briefing, weekly affiliate report) are **both claim-then-act idempotent**; the one in-memory `setInterval` (reset-token cache) is per-process and harmless.
7. `frontend/public/.htaccess` does **not** match the version described in `backend/deployment guide.md` Appendix A: redirects come *after* the SPA `[L]`, there is **no** `ErrorDocument 404`, and CSP is appended at build time by `postbuild.js`.
8. `frontend/public/sw.js` precaches two icon files that **do not exist** in `public/icons/` (the directory is absent), so `cache.addAll` always rejects and nothing is ever precached; the network-first navigation branch is unreachable dead code.
9. Backend `npm audit` reports **50 vulnerabilities (4 critical, 41 high)**; CI runs integration tests with `continue-on-error: true` and never runs Playwright at all.
10. Working tree has **4 modified files and 1 untracked file** including a security fix to the CORS/CSRF origin matcher in `backend/src/app.ts` — whether production runs this is UNVERIFIED.

---

## 1. Repo overview

### 1.1 Folder structure (2 levels deep)

```
/
├── .github/workflows/          ci.yml (only workflow)
├── .kilo/                      (empty, gitignored)
├── backend/
│   ├── db/{migration,sql}/     two parallel migration systems
│   ├── dist/                   tsup build output (gitignored)
│   ├── public/{cache,uploads}/ image cache + uploads
│   ├── scripts/                11 operator scripts (deploy, backup, fixes)
│   ├── src/{config,controllers,lib,middleware,routes,schemas,scripts,types,__tests__}/
│   ├── tests/{integration,setup,unit}/
│   ├── .env                    (gitignored, present on disk — secrets)
│   ├── migrate.cjs             the runner actually used by CI and deploy docs
│   └── package.json
├── dashboard test/             12-file dead Next.js-style prototype (space in name), tracked
├── frontend/
│   ├── dist/                   vite build output (gitignored)
│   ├── public/                 .htaccess, manifest, sw.js, polyfills.js, image/
│   ├── scripts/                postbuild.js, check-csp.js
│   ├── src/{api,components,hooks,i18n?,lib,pages,services,store,telegram,tma.tsx,...}
│   ├── tests/                  vitest suites + setup.ts
│   ├── index.html, tma.html    two Rollup entry documents
│   ├── .env.production         committed, contains VITE_API_URL
│   └── vite.config.ts
├── playwright-report/          47 tracked artifact files
├── test-results/               43 tracked artifact files
├── scripts/                    EMPTY, 0 tracked files
├── tests/{dashboard,setup}/    auth.spec.ts, storefront.spec.ts, tma-*.mts
├── csp-config.js               single source of truth for CSP
├── ecosystem.config.cjs        PM2 definition (instances: 1, fork)
├── playwright.config.ts
├── package.json / package-lock.json
└── 12 root *.md docs + ~25 one-off root scripts (add_products.ts, fix_*.js/cjs, reset_db.js, …)
```

Notably present at the repo root and tracked: `check_db.cjs`, `fix_columns.js`, `fix_db.cjs`, `fix_images.cjs`, `fix_sql.js`, `fix_uuids.js`, `migrate.cjs`, `replace-icons.cjs`, `reset-dawit-password.js`, `reset_db.js`, `update_images.ts`, `add_products.ts`, `tma.html`, `tma-fa.mts`, `tma-probe.mts`, `tma-shot.mts`.

### 1.2 Package managers

- npm in all three packages. Three separate `package-lock.json` files: root, `backend/`, `frontend/`.
- **No workspaces field** anywhere; root `package.json:1-17` declares only `@playwright/test`.
- `.gitignore:18` ignores `package-lock.json`, but `backend/package-lock.json` and `frontend/package-lock.json` are tracked (required by CI's `npm ci` at `.github/workflows/ci.yml:56` and `:121`). The root lockfile is untracked.

### 1.3 Node version requirements

| Where | Statement | Citation |
|---|---|---|
| CI | `node-version: 24` (duplicated) | `.github/workflows/ci.yml:51`, `:114` |
| `setup.md` | "Node 20.x/24.x LTS, npm 10+" | `setup.md:129` region |
| Runbook | "Node 20.x/24.x" | `MINIAPP_CLOUDFLARE_RUNBOOK.md:85-96` |
| `agent.md` | "Express 5 on Node.js 24" | `agent.md:19` |
| `.nvmrc` / `.node-version` / `engines` / `volta` | **DOES NOT EXIST** in any package.json | — |
| Local machine | `node v24.12.0`, `npm 11.6.2` | observed |

**UNVERIFIED:** the Node version actually selected by the CloudLinux Node.js Selector on the production host.

### 1.4 All package.json scripts

**Root** — `package.json:6-13`

| Script | Command |
|---|---|
| `test` | `playwright test` |
| `test:headed` | `playwright test --headed` |
| `test:ui` | `playwright test --ui` |
| `test:smoke` | `playwright test tests/dashboard/navigation.spec.ts` |
| `test:public` | `playwright test --project=public` |
| `test:report` | `playwright show-report` |

**Backend** — `backend/package.json:7-22`

| Script | Command |
|---|---|
| `build` | `tsup src/server.ts --format esm --out-dir dist --external jsdom --external jest --external supertest` |
| `test` | `node --experimental-vm-modules ./node_modules/jest/bin/jest.js --forceExit` |
| `test:watch` | same, `--watch` |
| `test:coverage` | same, `--coverage --forceExit` |
| `test:security` | same, `tests/integration/security.test.ts --forceExit` |
| `test:integration` | same, `tests/integration/ --forceExit` |
| `test:unit:nodb` | same, `tests/unit --config jest.nodb.config.js --forceExit` |
| `dev` | `tsx watch src/server.ts` |
| `telegram:poll` | `tsx src/scripts/telegram-poll.ts` |
| `db:migrate` | `node migrate.cjs` |
| `db:migrate:reset` | `node migrate.cjs --reset` |
| `prepare` | `""` (empty — husky never bootstraps, see §12.4) |
| `lint` | `eslint src --max-warnings 0` |
| `typecheck` | `tsc --noEmit` |

**Frontend** — `frontend/package.json:6-16`

| Script | Command |
|---|---|
| `dev` | `vite` |
| `build` | `tsc -b && vite build && node scripts/postbuild.js` |
| `check-csp` | `node scripts/check-csp.js` |
| `lint` | `eslint .` |
| `preview` | `vite preview` |
| `test` | `vitest run` |
| `test:watch` | `vitest` |
| `test:coverage` | `vitest run --coverage` |
| `typecheck` | `tsc -b --noEmit` |

**Root scripts/ directory: contains 0 files and 0 tracked files.** `DEPLOYMENT_GOTCHAS.md:49` refers to `scripts/postbuild.js`; the real path is `frontend/scripts/postbuild.js`.

---

## 2. Backend

### 2.1 Entry point and build

- Entry: `backend/src/server.ts` (59 lines). Imports `./config/env.js` first (Zod validation, exits 1 on failure), then `./app.js`, `node-cron`, and the Telegram/report helpers.
- `server.listen(PORT ?? "3001")` at `server.ts:12-14`; calls `void initBotConfiguration()` on boot (`server.ts:19`).
- Build: `tsup` (`backend/package.json:8`), output `backend/dist/server.js` (ESM). `backend/package.json:6` sets `"type": "module"`. TS config: `backend/tsconfig.json`.
- PM2: `ecosystem.config.cjs:20-24` → `script: "./backend/dist/server.js"`, `instances: 1`, `exec_mode: "fork"`, `max_memory_restart: "500M"`, env `NODE_ENV=production`, `PORT=3001`.
- Deployment guide says production actually runs **Passenger** (cPanel), not PM2: `backend/deployment guide.md:18`. **These two are contradictory — UNVERIFIED which is live.**

### 2.2 Middleware order (exact, `backend/src/app.ts`)

| # | Line | Middleware |
|---|---|---|
| 0 | 56-62 | `trust proxy` (from `TRUST_PROXY`, default `1`) |
| 1 | 65-84 | `helmet({ strictTransportSecurity, contentSecurityPolicy: cspConfig, permissionsPolicy })` |
| 2 | 87 | `compression()` |
| 3 | 91 | `/image` → `imageRoutes` (Sharp optimiser, **before** `express.static`) |
| 4 | 92 | `express.static(process.cwd()/public)` |
| 5 | 133-139 | `cors({ origin: allowedOrigins, credentials: true, … })` |
| 6 | 142-173 | Strict Origin/Referer check on all non-GET/HEAD/OPTIONS (CSRF defence-in-depth) |
| 7 | 176 | `cookieParser()` |
| 8 | 179 | `requestId` |
| 9 | 182-188 | Structured access log |
| 10 | 191-200 | `express.raw({ type: "*/*", limit: "1mb" })` **only** for `/payment/callback` and `/telegram/webhook` |
| 11 | 203 | `express.json({ limit: "1mb", strict: true })` |
| 12 | 206 | `generalRateLimit` on `/api` |
| 13 | 214 | `idempotencyMiddleware` on `/api` |
| 14 | 254-272 | `GET /api/v1/health`, `GET /api/health` |
| 15 | 309-317 | `publicAffiliateRouter` at `/api/affiliate` + `/api/v1/affiliate`, then all 18 routers at both prefixes |
| 16 | 320-322 | 404 JSON handler |
| 17 | 325-334 | Global error handler |

### 2.3 Route mounts (`app.ts:283-317`)

Every router below is mounted at **both** `/api/v1<path>` and `/api<path>`. `publicAffiliateRouter` is mounted separately, first, so `POST /track-click` is reachable without a session.

`/auth`, `/staff`, `/orders`, `/products`, `/referrals`, `/affiliate`, `/telegram`, `/stock`, `/upload`, `/vendor-orders`, `/notifications`, `/appointments`, `/admin`, `/expenses`, `/videos`, `/reports`, `/customers`.

### 2.4 Complete API route table

Roles: `admin` / `manager` / `employee` / `affiliate` / `delivery` / `vendor` (`backend/src/middleware/auth.ts:26`).

**auth** — `backend/src/routes/auth.ts`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/login` | public, `loginRateLimit`, `validate(LoginSchema)` | email-or-username + bcrypt; issues access+refresh; sets cookies (L77) |
| POST | `/refresh` | refresh cookie **or** body token | rotates access token (L139) |
| POST | `/logout` | `authenticate` | revokes `jti`, clears cookies (L209) |
| GET | `/me` | `authenticate` | current profile (L247) |
| POST | `/reset-password` | public, `loginRateLimit` | emails a Telegram-based reset token (L275) |
| PUT | `/reset-password` | public, `validate(ResetConfirmSchema)` | consumes HMAC token, sets new password (L316) |
| PATCH | `/change-password` | `authenticate` | authenticated self-service change (L358) |
| POST | `/staff` | `admin` | create staff (L405) — **duplicate of `/api/staff`** |
| GET | `/staff` | `admin`,`manager` | list staff (L434) — **duplicate of `/api/staff`** |
| PATCH | `/staff/:id` | `admin` | update staff (L444) — **duplicate** |
| DELETE | `/staff/:id` | `admin` | delete staff (L480) — **duplicate** |

**staff** — `backend/src/routes/staff.ts` (the canonical one)

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | `admin`,`manager` | paginated/filterable staff list (L40) |
| GET | `/:id/performance` | `admin`,`manager` | per-staff performance rollup (L109) |
| GET | `/:id` | `admin`,`manager` | single staff (L281) |
| POST | `/` | `admin` | create staff (L316) |
| PATCH | `/:id` | `admin` | update staff (L377) |
| PUT | `/:id/password` | `admin` | admin password reset (L434) — **duplicate route with `PATCH /:id/password`** |
| DELETE | `/:id` | `admin` | soft-delete staff (L468) |
| PATCH | `/:id/password` | `admin` | admin password reset (L518) |
| POST | `/2fa/setup` | `authenticate` | generate TOTP secret + QR (L567) |
| POST | `/2fa/verify` | `authenticate` | enable 2FA (L616) |
| DELETE | `/2fa/disable` | `authenticate` + `require2FA` | disable 2FA (L667) |

Note: `DELETE /staff/:id` in `auth.ts:480` does **not** require 2FA; `staff.ts:468` does not show `require2FA` either in the extracted chain. **UNVERIFIED** — needs a manual read of both handlers.

**products** — `backend/src/routes/products.ts`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | public, `apiCache` | paginated list (L52) |
| GET | `/grouped` | public, `apiCache` | name-grouped catalogue for the storefront (L129) |
| GET | `/low-stock` | `authenticate` | at/below threshold (L241) |
| GET | `/health` | `admin` | data-quality report: broken images, invalid tags, near-duplicates (L283) |
| GET | `/:id` | public | single **active** product (L354) |
| POST | `/` | `admin`,`manager` | create (L379) |
| PATCH | `/:id` | `admin`,`manager` | update (L433) |
| DELETE | `/:id` | `admin` + `require2FA` | soft-archive (`active = 0`) (L500) |
| POST | `/:id/stock` | `admin`,`manager` | transactional adjustment + low-stock alert (L530) |
| GET | `/:id/movements` | `admin`,`manager` | last 100 movements (L611) |
| POST | `/bulk` | `admin`,`manager` | all-or-nothing batch create, max 100 (L649) |

**orders** — `backend/src/routes/orders.ts`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/` | public, `orderRateLimit` | create order (L90) |
| GET | `/track/:id` | public | public tracking by order id (L305) |
| GET | `/` | `authenticate` | paginated list (L364) |
| GET | `/:id` | `authenticate` | detail (L444) |
| PATCH | `/:id/status` | `authenticate`, `validate(UpdateStatusSchema)` | status change → inventory, SMS, Telegram, Sheets (L479) |
| PATCH | `/:id/items` | `admin`,`manager` | replace items (L629) |
| DELETE | `/:id` | `admin` (+2FA per file header L9) | soft-delete order (L758) |

**orders** (aux) — `backend/src/routes/orders.patch.ts:127` defines `POST /` with `requireAuth`. **This file is never imported** (grep for `orders.patch` across `backend/src` returns only self-references) → dead code that duplicates `orders.ts:90` with *different* auth.

**stock** — `backend/src/routes/stock.ts`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/` | `authenticate` | stock list (L75) |
| GET | `/summary` | `authenticate` | KPI summary (L150) |
| GET | `/movements` | `admin`,`manager` | movement log (L205) |
| GET | `/low` | `authenticate` | low stock (L281) |
| POST | `/adjustment` | `admin`,`manager` | adjust (L314) |
| POST | `/receive/:vendorOrderId` | `admin`,`manager` | receive PO, bump stock (L364) |
| POST | `/request` | `authenticate` | staff stock request (L483) |
| GET | `/requests` | `admin`,`manager` | list requests (L549) |
| PATCH | `/requests/:id/status` | `admin`,`manager` | update status (L592) |

**affiliate (self-service portal)** — `backend/src/routes/affiliatePortal.ts`; `router.use(authenticate, affiliateOnly)` at L105

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/me` | `authenticate` + role `affiliate` | own profile (L135) |
| GET | `/me/summary` | + `requirePasswordChanged` | dashboard summary (L173) |
| GET | `/me/commissions` | + `requirePasswordChanged` | own commissions (L190) |
| GET | `/me/referrals` | + `requirePasswordChanged` | own referred customers (aggregate only) (L253) |
| POST | `/me/change-password` | + `generalRateLimit` | change own password (L302) |
| GET | `/me/activity` | + `requirePasswordChanged` | own order activity (L358) |
| POST | `/track-click` | **public**, mounted separately (`app.ts:309-310`) | referral click, IP stored as salted SHA-256 |

`middleware/affiliateAuth.ts` documents (L17-23) that the portal accepts **no** `:id` parameter anywhere — scope always comes from the JWT subject. Structurally sound against IDOR.

**referrals (admin)** — `backend/src/routes/referrals.ts`; `router.use(authenticate, authorise("admin"))` at L34

All 21 routes below inherit `admin`:
`GET /config` (L80) · `GET /config/history` (L87) · `POST /config` (L94) · `GET|PUT|DELETE /affiliates/:id/rule` (L133/180/250) · `POST /affiliates` (L289) · `GET /affiliates` (L368) · `GET /affiliates/:id` (L426) · `PATCH /affiliates/:id` (L460) · `POST /affiliates/:id/portal-access` **+2FA** (L502) · `DELETE /affiliates/:id` **+2FA** (L611) · `GET /affiliates/:id/commissions` (L695) · `GET /commissions` (L729) · `PATCH /commissions/:id/pay` **+2FA** (L784) · `POST /commissions/:id/reverse` **+2FA** (L917) · `GET /commissions/:id/events` (L1000) · `GET /stats` (L1015) · `GET /reports/preview` (L1068) · `GET /reports/recipients` (L1091) · `POST /reports/send` **+2FA** (L1115) · `GET /reports/history` (L1176).

**telegram** — `backend/src/routes/telegram.ts`

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/webhook` | `x-telegram-bot-api-secret-token` (timing-safe) | Bot updates (L1466) |
| GET | `/set-webhook` | `admin` | register webhook URL (L1553) |
| POST | `/set-webhook` | `admin` | register webhook URL, POST variant (L2331) |
| POST | `/delete-webhook` | `admin` | remove webhook (L2349) |
| POST | `/configure-bot` | `admin` | sync commands + menu button (L2365) |
| POST | `/set-menu-button` | `admin` | chat menu button (L2270) |
| POST | `/send-push` | `admin` | arbitrary push (L2381) |
| POST | `/validate-init-data` | Mini App HMAC | exchange initData for JWT (L1584) |
| POST | `/app-order` | Mini App HMAC, `orderRateLimit` | create order from Mini App (L1639) |
| GET | `/my-orders` | Mini App HMAC | own orders (L1805) |
| GET/PUT | `/profile` | Mini App HMAC | read/update Mini App profile (L1904/1987) |
| GET/PUT/DELETE | `/state` | Mini App HMAC | per-chat persisted UI state (L2048/2075/2134) |
| GET | `/notifications` | Mini App HMAC | in-app notifications (L2178) |
| POST | `/notifications/read` | Mini App HMAC | mark read (L2221) |
| GET | `/notifications/unread-count` | Mini App HMAC | badge count (L2252) |
| GET | `/health` | **public** | `getWebhookInfo` result (L2286) |
| GET | `/info` | **public** | `getMe` result (L2316) |

**Other routers**

| Router | Routes |
|---|---|
| `customers.ts` | `GET /` (admin,manager L105) · `GET /summary` (L217) · `GET /activity` (L292) · `GET /:id` (L366) · `POST /:id/rating` (L481) · `POST /:id/note` (L558) · `PATCH /:id` (L604) — all `admin`/`manager` |
| `expenses.ts` | `GET /` (L35) · `GET /summary` (L104) · `POST /` (L188) · `PATCH /:id` (L241) — admin/manager; `DELETE /:id` (L309) admin only |
| `notification.ts` | `GET /` (L22) · `GET /summary` (L188) — admin/manager |
| `admin.ts` | `GET /pool-stats` (L18) · `GET /audit-log` (L62) — admin/manager |
| `reports.ts` | `GET /pl` (L10) · `GET /pl/export` (L115) — admin/manager (P&L) |
| `vendor-orders.ts` | `GET /` (L92) · `POST /` (L138) — admin/manager/employee; `PATCH /:id/status` (L233) admin/manager |
| `videos.ts` | `GET /` public + `apiCache` (L18) · `POST /` admin/manager (L37) · `DELETE /:id` admin/manager (L63) |
| `appointments.ts` | `POST /` public, `generalRateLimit` (L11) |
| `upload.ts` | `POST /image` admin/manager, multer, Cloudinary (L26) · `POST /receipt` **unauthenticated**, multer, local disk (L65) |
| `images.ts` | `GET /image/*` — Sharp → WebP, disk-cached, path-traversal guarded (L37) |

### 2.5 Rate limiting — `backend/src/middleware/rateLimit.ts`

| Limiter | Window | Limit | Key | Line |
|---|---|---|---|---|
| `generalRateLimit` | 60 s | 600 | `user:<id>` else `ip:<xff[0]>` | 80-87 |
| `loginRateLimit` | 5 min | 10 | same | 89-96 |
| `orderRateLimit` | 5 min | 10 | same | 98-105 |

Store: `lru-cache` (max 10 000) with an **optional Redis backend** when `REDIS_URL` is set (`rateLimit.ts:20-23`), falling back to memory on error (`rateLimit.ts:44-48`). Without Redis, limits are **per-process** — see §6.3 and §15.

`getIp` reads `x-forwarded-for` directly (`rateLimit.ts:58-59`) in addition to `app.set("trust proxy")`. Unused dependency: `express-rate-limit` is in `backend/package.json:38` but the code uses a hand-rolled implementation.

### 2.6 Error handling

- Global handler `app.ts:325-334`: logs with request-scoped logger, returns 500 with `error: "Internal server error"` in production, `err.message` otherwise. It does **not** distinguish `ZodError`, MySQL error codes (e.g. `ER_DUP_ENTRY`), or `require2FA`/`authenticate` failures — all async route rejections that are not caught locally become an opaque 500.
- Most routes wrap handlers in `try/catch` and return `{ success:false, error:"Internal server error" }`, so the global handler mostly sees programming errors.
- 404 is a terminal JSON handler (`app.ts:320-322`) returning `{ success:false, error:"Not found" }`.
- No `express-async-errors` shim is present; Express 5 handles rejected promises from handlers, so this is acceptable — but several `pool.getConnection()` calls sit **outside** `try` (e.g. `products.ts:539`), so a pool exhaustion error escapes to the global handler with no rollback attempt.

### 2.7 Logging — `backend/src/lib/logger.ts`

- Structured one-line JSON: `{ ts, level, requestId, msg, ...meta }` (`logger.ts:36-54`).
- `createLogger(req)` binds `req.requestId` (`logger.ts:67-84`); `logger` (standalone) hardcodes `requestId: "system"` (`logger.ts:90-101`).
- `Error` instances are unwrapped into `{ error, stack }` (`logger.ts:75-76`).
- **No transports, no file output, no rotation** — output goes to stdout/stderr, which under Passenger lands in the cPanel/Passenger log. `winston` is a dependency (`backend/package.json:55`) but is not imported anywhere in `src/`.
- **Mixed logging styles remain**: raw `console.log`/`console.error` still appear in `server.ts:15-16,25-29,54-58`, `lib/telegram.ts:624,658`, `middleware/2fa.ts:53`, `middleware/affiliateAuth.ts:120`, `routes/upload.ts:60,92`, `middleware/idempotency.ts:81,155`, `middleware/rateLimit.ts:22,45`.
- **The access log at `app.ts:183` runs before `requestId`?** No — `requestId` is L179, access log L182. Correct order.

---

## 3. Auth and security

### 3.1 Login — `backend/src/routes/auth.ts:77-133`

1. `loginRateLimit` (10 / 5 min) → `validate(LoginSchema)` (sanitize + Zod).
2. `SELECT … FROM staff_users WHERE (email = ? OR username = ?) AND active = true`.
3. `bcrypt.compare` against the stored hash, or against a `DUMMY_HASH` constant (`auth.ts:31`) when the user does not exist — constant-time-ish, prevents user enumeration by timing.
4. `audit(username, "LOGIN", …)` writes to `audit_log`; failures swallowed (`auth.ts:71`).
5. `issueTokens()` → access JWT `1h` + refresh = `crypto.randomBytes(40).toString("hex")` (`middleware/auth.ts:143-150`), each carrying a `jti`.
6. Refresh token stored **hashed** (SHA-256) in `refresh_tokens` with a 24 h expiry (`auth.ts:108-115`).
7. Cookies set (`auth.ts:41-55, 118-119`) **and** tokens also returned in the JSON body for API/mobile clients.
8. Affiliates may log in; the portal is role-gated separately.

### 3.2 Access token verification — `backend/src/middleware/auth.ts:56-108`

- Reads `access_token` cookie first, then `Authorization: Bearer` (`auth.ts:61-70`).
- `jwt.verify` with `JWT_SECRET`, mapped to friendly 401s (`auth.ts:80-87`).
- **Session blocklist check** against `session_blocklist` by `jti` where `expires_at > NOW()` (`auth.ts:91-104`); wrapped in `try/catch` that **proceeds on error** ("If table doesn't exist yet, proceed — non-blocking", `auth.ts:103`) — a DB outage silently disables revocation.

### 3.3 Refresh and logout

- `POST /refresh` (`auth.ts:139+`) reads `refresh_token` cookie or `refreshToken` body.
- `POST /logout` (`auth.ts:209`) writes the `jti` into `session_blocklist` and clears both cookies with `CLEAR_OPTS` (path `/`, `auth.ts:57`).

### 3.4 Cookies

| Cookie | httpOnly | secure | sameSite | maxAge | path |
|---|---|---|---|---|---|
| `access_token` | ✅ | `IS_PROD` | **strict** | 1 h | `/` (`auth.ts:41-47`) |
| `refresh_token` | ✅ | `IS_PROD` | **strict** | 24 h | `/api/auth` (`auth.ts:49-55`) |

**Risks:**
- `sameSite: "strict"` on both — the storefront runs on `www.` while the API may run on `api.` (`backend/deployment guide.md` §1). Cross-site cookie delivery is blocked under `strict`, so the cookie path only works if the SPA and API share a site. The frontend also relies on relative `/api/...` URLs (`frontend/src/services/api.ts:33` defaults to `""`), which implies same-origin. **UNVERIFIED** whether production is same-origin or `www` + `api` subdomains.
- Tokens are **also returned in the response body** and `frontend/src/store/slices/stockSlice.ts:138,183` still reads `localStorage.getItem("token")`. Any XSS in the SPA yields the bearer token.
- `secure` is bound to `process.env.NODE_ENV === "production"` at **module load** (`auth.ts:39`). If Passenger starts without `NODE_ENV=production`, cookies are issued insecure.

### 3.5 Roles and 2FA

- Role enum: `admin | manager | employee | affiliate | delivery | vendor` (`middleware/auth.ts:26`, mirrored in `schemas/index.ts:51-58`).
- `authorise(...roles)` — empty list = any authenticated user (`middleware/auth.ts:116-131`).
- `require2FA` (`middleware/2fa.ts:17-63`): reads `x-2fa-token`, loads `two_factor_secret`/`two_factor_enabled` for the **authenticated** user only, `verifySync` via `otplib`. Used on: `DELETE /products/:id`, `DELETE /orders/:id`, `POST /staff/:id/portal-access`, `DELETE /referrals/affiliates/:id`, `PATCH|PUT /referrals/commissions/:id/pay|reverse`, `POST /referrals/reports/send`, `DELETE /staff/2fa/disable`.
- **No TOTP replay window / step counter** is enforced; a code is valid for its whole 30 s step and can be reused inside that window.

### 3.6 Password reset — `backend/src/lib/security.ts:70-102`

- `generateResetToken(userId)`: `{ userId, exp: now + 15 min, nonce: 16 random bytes }` → base64url, HMAC-SHA256 with `JWT_SECRET`, `"<payload>.<sig>"`.
- `verifyResetToken`: constant-time signature compare + expiry check.
- Route side (`auth.ts:275`, `:316`): request takes `username`, pushes a message via **Telegram** (`TELEGRAM_BOT_TOKEN` read at `auth.ts:295`) — there is **no email delivery** for reset.
- Replay protection is an **in-memory `Set`** (`auth.ts:32-33`) cleared every 20 min by `setInterval`. It resets on every process restart and is **not shared across Passenger instances** — a reset token can be redeemed more than once across restarts/instances.
- `ResetConfirmSchema` requires ≥8 chars + upper + lower + digit + special (`schemas/index.ts:30-38`).

### 3.7 Helmet / CSP

`app.ts:65-84`:
- HSTS `max-age=31536000; includeSubDomains; preload` (`app.ts:66-70`).
- `contentSecurityPolicy.directives = cspConfig` — imported from the repo-root **`csp-config.js`** (`app.ts:46-47`).
- `permissionsPolicy`: geolocation/camera/microphone/payment/usb all `[]` (`app.ts:75-83`).
- Helmet's *other* defaults are still active and are **not** overridden: `X-Frame-Options: SAMEORIGIN` (frameguard default), `X-Content-Type-Options: nosniff`, `X-DNS-Prefetch-Control`, `X-Download-Options: noopen`, `X-Permitted-Cross-Domain-Policies: none`, `Origin-Agent-Cluster`, `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`, and removal of `X-Powered-By`.

`csp-config.js` (full, 36 lines, `csp-config.js:15-36`):

| Directive | Value |
|---|---|
| `default-src` | `'self'` |
| `base-uri` | `'self'` |
| `form-action` | `'self'` |
| `script-src` | `'self'`, `https://telegram.org`, `https://static.cloudflareinsights.com` |
| `style-src` | `'self'`, `'unsafe-inline'`, `https://fonts.googleapis.com`, `https://cdnjs.cloudflare.com` |
| `img-src` | `'self'`, `data:`, **`https:`** |
| `connect-src` | `'self'`, `https://api.asellaorganic.com`, `https://i.ytimg.com`, `https://lh3.googleusercontent.com` |
| `font-src` | `'self'`, `data:`, `https://fonts.gstatic.com`, `https://cdnjs.cloudflare.com` |
| `frame-src` | `https://www.youtube.com`, `https://youtube.com`, `https://www.youtube-nocookie.com` |
| `object-src` | `'none'` |
| `frame-ancestors` | `'self'`, `https://web.telegram.org`, `https://*.telegram.org` |
| `upgrade-insecure-requests` | `[]` (emits with an empty/trailing-space value) |

Helmet merges its defaults under these (`backend/node_modules/helmet/index.cjs`, `getDefaultDirectives()`), so the effective header additionally carries **`script-src-attr 'none'`**, which the `.htaccess` version does **not**. No `script-src-elem` is present, so `script-src` governs `<script src>`.

**Dead competing CSP:** `backend/src/middleware/securityHeaders.ts:24-39` defines a much stricter policy (`script-src 'self'` with **no** telegram.org, `frame-src 'none'`, narrow `img-src`). It is **never imported** (grep for `securityHeaders` returns only its own file). Its docstring (`securityHeaders.ts:5-6`) tells you to `app.use(securityHeaders)`. Re-wiring it would re-break the Telegram SDK and every YouTube embed — exactly the incident documented in `DEPLOYMENT_GOTCHAS.md:13-19`.

### 3.8 CORS

- Reads **`ALLOWED_ORIGINS`** (`app.ts:101`). In production the fallback is `https://asellaorganic.com`; in development a fixed list `localhost:5173/3000/3001`.
- `https://web.telegram.org` is force-appended (`app.ts:127-129`).
- `credentials: true`, methods `GET/POST/PATCH/PUT/DELETE/OPTIONS`, allowed headers include `x-2fa-token`, `x-request-id`, `x-telegram-init-data`, exposed `x-request-id` (`app.ts:133-139`).
- **Origin matching is exact** — `allowedOrigins.some(a => origin === a)` — via `isAllowedOrigin()` (`app.ts:122-125`). This is an **uncommitted working-tree change**; `HEAD` used `origin.startsWith(allowed)`, which accepted `https://asellaorganic.com.evil.example` (see the diff and the comment at `app.ts:115-121`).
- Dev-only escape hatch: any `http(s)://localhost|127.0.0.1(:port)` origin is accepted when `NODE_ENV !== "production"` (`app.ts:113, 123`).
- **Doc contradiction:** `backend/deployment guide.md:32` and `:180` and `README.md:14` still say the code reads `FRONTEND_URL`. `DEPLOYMENT_GOTCHAS.md:21-26` records that `FRONTEND_URL` was the original bug and that it was renamed. **The deployment guide is stale and would break CORS if followed.**

### 3.9 CSRF defence-in-depth — `app.ts:142-173`

- Skips `GET/HEAD/OPTIONS`.
- Skips `/payment/callback`, `/telegram/webhook`, and **any request carrying `x-telegram-init-data`** (`app.ts:150-157`).
- Requires `Origin` **or** `Referer`; missing → 403 "CSRF protection: Missing Origin or Referer header".
- Mismatch → 403 "CSRF protection: Origin mismatch".
- **Bypass:** any client that sets an `x-telegram-init-data` header skips the Origin check entirely, regardless of whether the value is valid. Combined with `credentials: true` cookies, an attacker-controlled cross-site request cannot set a custom header without CORS preflight — which the exact-match origin check blocks — so this is mitigated in production but is a latent design smell.

### 3.10 Input validation

- `validate(schema)` (`backend/src/middleware/validate.ts:21-44`): `sanitizeObject(req.body)` (DOMPurify with `ALLOWED_TAGS: []`, `ALLOWED_ATTR: []`, `lib/security.ts:24-27`) → Zod `safeParse` → **replaces `req.body`** → 422 with flattened field errors on failure.
- `sanitizeObject` deliberately **skips sanitization for keys ending in `_url` or named `url`** (`lib/security.ts:33`). That is what allows `image_url` through so `validateProductData` can inspect it.
- Schemas live in one file: `backend/src/schemas/index.ts` (352 lines, 20 exported schemas).
- **Routes with no `validate()`:** `POST /products/bulk` uses `BulkCreateProductsSchema` — OK; but `PATCH /products/:id` builds `UPDATE products SET …` from an allow-list of field names (`products.ts:449-473`), values are parameterised so this is safe. `orders.patch.ts:127` (dead file) has none. Most Telegram Mini App routes and `PATCH /orders/:id/items` do use Zod.

### 3.11 Anything that looks risky

| # | Risk | Evidence |
|---|---|---|
| R1 | Blocklist lookup fails open — a DB error disables JWT revocation entirely | `middleware/auth.ts:102-104` |
| R2 | Reset-token replay set is in-process and cleared every 20 min | `routes/auth.ts:32-33` |
| R3 | Access **and** refresh tokens returned in the JSON body alongside HttpOnly cookies | `routes/auth.ts:124-131` |
| R4 | Legacy `localStorage['token']` + `Authorization: Bearer` path still live in the frontend | `frontend/src/store/slices/stockSlice.ts:138,183` |
| R5 | `POST /api/upload/receipt` is **unauthenticated** and writes to the public web root; only magic-byte sniffing and a 5 MB cap | `routes/upload.ts:65-95`, `:22` |
| R6 | `x-telegram-init-data` presence alone disables the CSRF Origin check | `app.ts:150-157` |
| R7 | `img-src https:` is effectively `img-src *` — any HTTPS host may be used for images, enabling exfiltration via a crafted `image_url` | `csp-config.js:23` |
| R8 | `style-src 'unsafe-inline'` while `script-src` is strict — weaker of the two | `csp-config.js:22` |
| R9 | `securityHeaders.ts` is a live landmine with a stricter, incompatible CSP and an instruction to mount it | `middleware/securityHeaders.ts:5-6,24-39` |
| R10 | `loginRateLimit` keys on IP when unauthenticated; `getIp` trusts `x-forwarded-for` directly | `middleware/rateLimit.ts:58-59, 68-74` |
| R11 | Password hashing is `bcryptjs`; `bcryptjs@^3.0.3` is current | `package.json:30` |
| R12 | Hardcoded literal admin credentials committed in three files | `tests/auth.spec.ts:8-9`, `tests/setup/auth.setup.ts:16-17`, `.env.test.example:5-6` |
| R13 | Hardcoded DB connection string + plaintext password in a tracked script | `backend/reset_pwd.js` (line 4 and 6) — values not reproduced |
| R14 | `backend/scripts/reset_pwd.js` resets a named admin account to a literal password with no confirmation gate | same |
| R15 | `backend/deployment guide.md:18` discloses the hosting account/server and `MINIAPP_CLOUDFLARE_RUNBOOK.md:96` an absolute path with the OS username | — |
| R16 | 90 Playwright artifact files tracked, each containing the absolute Windows path and OS username | `playwright-report/`, `test-results/` |

---

## 4. Database

### 4.1 Two parallel migration systems

1. **`backend/db/sql/*.sql`** — the live one. Run by `backend/migrate.cjs` (`backend/package.json:17-18`; `.github/workflows/ci.yml:69-70`). `migrate.cjs` reads files **alphabetically** (`migrate.cjs:102,109`), records into `migrations_log`, skips applied files (`migrate.cjs:114-117`), strips `DELIMITER` (`:20-40`), splits statements respecting `BEGIN…END` (`:43-64`), and skips transaction wrapping for DDL (`:69-79, 127-131`).
2. **`backend/db/migration/*.js`** (`001_init_schema.js`, `002_coupons_referrals.js`, `003_security_hardening.js`) — JS wrappers around the same SQL, **not referenced by any npm script or CI step**. **Effectively dead.**

### 4.2 Migration files in execution order (alphabetical, `backend/db/sql/`)

| # | File | What it does |
|---|---|---|
| 1 | `001_complete_schema.sql` (18.8 KB) | 23 base tables + indexes (L11-334) |
| 2 | `002_affiliate_commission_trigger.sql` | `DROP TRIGGER IF EXISTS trg_order_delivered_commission` (L11); creates that trigger (L15); `referral_commissions` table (L89) + 2 indexes (L105-106) |
| 3 | `003_security_and_inventory.sql` | `staff_users.two_factor_secret` (L20), `two_factor_enabled` (L29); backfills `stock_snapshots` (L38) |
| 4 | _(removed)_ | `004_dummy_data.sql` — bulk fixture, **deleted 2026-10-15**. Contained 11 named staff accounts sharing one bcrypt hash plus plaintext passwords.
| 5 | `005_order_items_product_id.sql` | adds `order_items.product_id` (L19); `UPDATE order_items …` backfill (L31); index (L39) |
| 6 | `006_clean_products.sql` | **`UPDATE products SET active = false WHERE 1=1` (L13)**; **`DELETE FROM stock_snapshots WHERE 1=1` (L16)**; inserts the canonical 29 products with `INSERT IGNORE` |
| 7 | `007_idempotency_keys.sql` | `idempotency_keys` table (L7) |
| 8 | `008_soft_delete_audit.sql` | `ALTER TABLE orders` (L63) |
| 9 | `009_vendor_expenses.sql` | `ALTER TABLE vendor_orders` (L12); 3 status renames `UPDATE … WHERE status='…'` (L17-19); 3 more ALTERs (L22,27,31); `expenses` table (L36) + 3 indexes (L48-50) |
| 10 | `010_stock_request_status.sql` | `ALTER TABLE stock_requests` (L2) |
| 11 | `011_community_videos.sql` | `community_videos` (L4) |
| 12 | `011_drop_inventory_trigger.sql` | **`DROP TRIGGER IF EXISTS trg_deduct_inventory_on_delivered` (L14)** |
| 13 | `011_order_status_history.sql` | `order_status_history` (L2) — duplicate of the table already created in `001:202` |
| 14 | `012_prod_sync.sql` | `ALTER TABLE stock_requests` (L5, L20) |
| 15 | `013_staff_telegram_username.sql` | `ALTER TABLE staff_users` (L2) + 2 indexes (L6-7) |
| 16 | `014_employee_tracking.sql` | `ALTER TABLE orders` (L1) |
| 17 | `015_telegram_users_roles.sql` | `ALTER TABLE telegram_users` (L4); 2 `UPDATE telegram_users tu …` (L8, L14) |
| 18 | `016_add_unit_cost.sql` | `products.unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0`; `order_items.unit_cost` |
| 19 | `017_expense_void.sql` | `ALTER TABLE expenses` (L1) |
| 20 | `018_unique_product_constraint.sql` | duplicate-guard procedure + `active_unique` virtual column + `UNIQUE INDEX` |
| 21 | `019_fix_shilajit_oil_image.sql` | `UPDATE products SET image_url=… WHERE id='11111111-…-010' AND image_url=…` — correctly WHERE-guarded |
| 22 | `020_telegram_miniapp_profile.sql` | `ALTER TABLE telegram_users` (L12); 3 idempotent indexes (L21-23) |
| 23 | `021_affiliate_hardening.sql` (18.8 KB) | many ALTERs; `affiliate_commission_rules` (L42); `commission_events` (L77); **`DELETE FROM referral_commissions` (L97)**; **`CREATE UNIQUE INDEX uq_commission_order_affiliate` (L128)**; **`UPDATE affiliate_profiles` (L133, L349)**; drops + recreates both commission triggers (L154-158, L276-280); **`INSERT INTO expenses` (L337)** |
| 24 | `022_affiliate_reporting.sql` | `referral_clicks` (L14), `report_runs` (L28), **`report_run_locks` (L47) — PK on `period_start`, the cron lock** |
| 25 | `023_telegram_miniapp_state_notifications.sql` | `telegram_user_state` (L11), `customer_notifications` (L22), `ALTER TABLE orders` (L40), **`UPDATE orders o …` (L47)** |
| 26 | `024_customer_insights.sql` (14.8 KB) | `customer_activity` (L29), `customer_ratings` (L56), 4 ALTERs (L73-89), 2 bulk `INSERT INTO customer_activity` (L274, L297), index (L323) |
| 27 | `025_sms.sql` (14.9 KB) | `sms_templates` (L40), `sms_campaigns` (L72), `sms_messages` (L139), `ALTER TABLE customers` (L228), `sms_campaign_exclusions` (L236), `sms_consent_log` (L265), `sms_daily_spend` (L289) |

### 4.3 Schema inferred from migrations

Base definitions from `001_complete_schema.sql` unless noted. All PKs are `CHAR(36) DEFAULT (UUID())` except `orders.id` (`VARCHAR(50)`).

| Table | Key columns | Indexes | Unique / FKs |
|---|---|---|---|
| `staff_users` (L11) | `username`, `password_hash`, `full_name`, `role ENUM(...)`, `email`, `phone`, `active`, `deleted_at`; **+`two_factor_secret`** (003:L20), **`two_factor_enabled`** (003:L29), **`telegram_username`/`telegram_chat_id`** (013:L2), **`must_change_password`** (021:L71) | `idx_staff_username` (L24), `idx_staff_role` (L25), `idx_staff_tg_username`, `idx_staff_tg_chat_id` (013:L6-7) | `username UNIQUE`, `email UNIQUE` (001:L12, L16) |
| `session_blocklist` (L28) | `jti`, `revoked_at`, `expires_at` | `idx_session_blocklist_expires` (L33) | PK `jti` |
| `rate_limit_log` (L36) | `ip`, `occurred_at` | `idx_rate_limit_ip` (L42) | — |
| `referral_configs` (L45) | `commission_type ENUM('percentage','fixed')`, `commission_value`, `min_order_amount`, `max_commission`, `is_active` | — | CHECK `commission_value >= 0` |
| `affiliate_profiles` (L57) | `referral_code`, `full_name`, `email`, `user_id`, `is_active`, `deleted_at`, `status`; **+`must_change_password`** (021:L31), **+status/tier ALTERs** (021:L31, L133) | `idx_affiliate_code` (L71), `idx_affiliate_user` (L72) | FK `user_id → staff_users.id` |
| `customers` (L75) | `phone`, `name`, `city`, `location`, `gender`, `age_group`, `telegram_chat_id` (020:L12); **+SMS consent columns** (025:L228) | `idx_customer_phone` (L96), `idx_customer_affiliate` (L97), `idx_customers_telegram_chat` (020:L21) | **`phone` UNIQUE** (used with `ON DUPLICATE KEY UPDATE` at `orders.ts:131`) |
| `products` (L100) | `id`, **`name VARCHAR(255) NOT NULL`**, **`package_size VARCHAR(100) NOT NULL`**, `price DECIMAL(12,2) CHECK ≥0`, `description`, `image_url TEXT`, `featured BOOLEAN DEFAULT TRUE`, `tag VARCHAR(100) DEFAULT ''`, `inventory_quantity INT CHECK ≥0`, `low_stock_threshold`, `active BOOLEAN DEFAULT TRUE`, `deleted_at`, timestamps; **+`unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0`** (016:L2); **+`active_unique TINYINT AS (IF(active=1,1,NULL)) VIRTUAL`** (018:L34-35) | `idx_products_name` (L116), `idx_products_active` (L117), **`UNIQUE INDEX idx_unique_active_product (name, package_size, active_unique)`** (018:L37-38) | **No FKs.** |
| `inventory_movements` (L120) | `product_id`, `movement_type ENUM('sale','purchase_received','adjustment','return','damage_loss','initial_stock')`, `change_amount`, `reason`, `performed_by`, `quantity_after`, `notes`, `reference_id`, `reference_type ENUM(...)` | `idx_inv_movements_product`, `_reference`, `_type` (L136-138) | FK `product_id → products ON DELETE RESTRICT`; `performed_by → staff_users ON DELETE SET NULL` |
| `orders` (L141) | `id VARCHAR(50)` PK, `source`, `customer_name`, `phone`, `location`, `city`, `gender`, `age_group`, `order_type`, `franchise_type`, `status`, `payment_status`, `total`, `notes`, `customer_id`, `assigned_to`, `delivery_date`, `delivery_message_id`, `deleted_at`; **+soft-delete cols** (008:L63), **+`created_by_staff_id`** (014:L1), **+Mini App cols** (023:L40) | `idx_orders_status_created`, `idx_orders_phone`, `idx_orders_customer` (L165-167), `idx_orders_customer_id` (024:L323) | FK `customer_id → customers ON DELETE SET NULL` |
| `order_items` (L170) | `order_id`, `product_id`, `item_name`, `package_size`, `quantity CHECK >0`, `unit_price`; **+`unit_cost`** (016:L6), `product_id` added 005:L19 | `idx_order_items_order`, `_product` (L180-181), `idx_order_items_product_id` (005:L39) | FK `order_id → orders ON DELETE CASCADE` |
| `payments` (L184) | `order_id`, `amount`, `payment_method`, `transaction_id`, `status`, `notes` | `idx_payments_order`, `idx_payments_status` (L198-199) | FK `order_id → orders` |
| `order_status_history` (001:L202 **and** 011:L2) | `order_id`, `old_status`, `new_status`, `changed_by`, `note`, `created_at` | `idx_status_history_order` (001:L212) | — |
| `delivery_assignments` (L215) | — | — | — |
| `audit_log` (L225) | `table_name`, `record_id`, `order_id`, `actor`, `action`, `old_values`, `new_values` | `idx_audit_order`, `idx_audit_actor` (L236-237) | — |
| `telegram_users` (L240) | + Mini App profile cols (020:L12); + roles (015:L4) | — | — |
| `vendor_orders` (L251) | + `approved/cancelled/received` status enum (009:L22-31), expense fields (009:L12) | — | — |
| `pending_vendor_messages` (L268) | — | — | — |
| `stock_requests` (L281) | + `status` (010:L2), + `package_size` (012:L20), + sync cols (012:L5) | — | — |
| `stock_snapshots` (L300) | `product_id`, `current_quantity` | — | — |
| `refresh_tokens` (L308) | `id`, `user_id`, `token_hash`, `expires_at` | `idx_refresh_tokens_user`, `_hash`, `_expires` (L316-318) | — |
| `webhook_events` (L321) | `update_id` | `idx_webhook_events_processed_at` (L325) | PK — **also used as the morning-briefing lock** |
| `migrations_log` (L328) | `filename`, `applied_at` | — | — |
| `referral_commissions` (002:L89) | + hardening columns (021:L57) | `idx_commission_affiliate`, `idx_commission_order` (002:L105-106) | **`UNIQUE INDEX uq_commission_order_affiliate`** (021:L128) |
| `idempotency_keys` (007:L7) | `idem_key`, `user_id`, `method`, `path`, `request_hash`, `status`, `response_body`, `response_headers`, `expires_at` | — | PK/unique on `(idem_key, user_id)` |
| `expenses` (009:L36) | + void columns (017:L1) | `idx_expenses_category`, `_vendor`, `_created` (L48-50) | FK `vendor_order_id` |
| `community_videos` (011_community:L4) | — | — | — |
| `affiliate_commission_rules` (021:L42) | — | — | — |
| `commission_events` (021:L77) | — | — | — |
| `referral_clicks` (022:L14) | — | — | — |
| `report_runs` (022:L28) | — | — | — |
| `report_run_locks` (022:L47) | `period_start` | — | **PK on `period_start`** (cron lock) |
| `telegram_user_state` (023:L11) | — | — | — |
| `customer_notifications` (023:L22) | `chat_id`, `order_id`, `type`, `title`, `body` | — | — |
| `customer_activity` (024:L29) | + 4 ALTERs (L73-81) | — | — |
| `customer_ratings` (024:L56) | + 2 ALTERs (L85, L89) | — | — |
| `sms_templates` (025:L40) · `sms_campaigns` (025:L72) · `sms_messages` (025:L139) · `sms_campaign_exclusions` (025:L236) · `sms_consent_log` (025:L265) · `sms_daily_spend` (025:L289) | | | |

**Table count: 41** across `001` (23) + 6 created later + 2 triggers dropped/created.
**No `referrals` table exists** in any migration — but `backend/src/scripts/data-retention.ts:58` runs `UPDATE referrals SET status='expired'`. **That statement targets a non-existent table and the job would fail/roll back.** `backend/scripts/data-retention.ts` has the same defect.

### 4.4 Seed scripts

| Script | Location | Behaviour |
|---|---|---|
| _(removed)_ | — | `004_dummy_data.sql`, `027`–`030`, `032_verify_seed.sql` — **deleted 2026-10-15**. They were bulk fixtures, not schema. `004` held real-looking staff accounts sharing one bcrypt hash; the seeds were already refused in production by the `DANGEROUS_MIGRATION` regex in `migrate.cjs`. |
| `006_clean_products.sql` | `backend/db/sql/006_clean_products.sql` | Deactivates every product, wipes `stock_snapshots`, then `INSERT IGNORE` the canonical 29 SKUs. **Retained** — this is the production catalogue definition, not a fixture. **The seed itself contains near-duplicates:** `Moringa Seed` **and** `Moringa powder` as separate names for the same product (L21-38). |
| `003_security_and_inventory.sql:L38` | migration | backfills `stock_snapshots` |
| `add_products.ts` | `backend/add_products.ts` | 66 lines, 30 hardcoded products. Requires `--force` (L38-42). Normalises name and does a `SELECT … WHERE LOWER(TRIM(name)) = ? AND package_size = ?` pre-check (L46-50) then `INSERT IGNORE`. **It imports `./src/config/db` without the `.js` extension** (L1), which breaks under the repo's `"type": "module"` ESM setup. |
| `create-admin.js` | `backend/create-admin.js` | **The only way to create the first admin** now that the seed is gone. Reads `INITIAL_ADMIN_PASSWORD`, `ADMIN_USERNAME`, `ADMIN_EMAIL`, `ADMIN_FULL_NAME`, `ADMIN_ROLE`; validates role and password strength. Fixed 2026-10-15 — it inserted into `name` (column is `full_name`) and omitted the `NOT NULL` `username`, so it could never have run. |
| _(removed)_ | — | `reset_pwd.js`, `reset-dawit-password.js`, `fix_columns.js`, `fix_sql.js`, `fix_uuids.js` — **deleted 2026-10-15**. The first two reset a named admin to a **hardcoded plaintext password**; the other three existed only to repair `004`. |
| `fix_cogs.ts` | `backend/scripts/fix_cogs.ts` | `UPDATE products SET unit_cost = price * 0.5` and `UPDATE order_items SET unit_cost = unit_price * 0.5` — global, un-guarded. |
| `migrate_cogs.ts` | `backend/scripts/migrate_cogs.ts` | Backfills `unit_cost` from vendor orders; references `vendor_orders.product_id`, a column **not present** in the inferred schema. |
| `migrate.ts` | `backend/scripts/migrate.ts` | Applies only `014_employee_tracking.sql`, splitting on `;`. |
| `optimize-local-images.js` | `backend/scripts/optimize-local-images.js` | Sharp-compresses `frontend/public/image/products` (writes across the repo boundary). |

### 4.5 Destructive migrations — explicit list

| File:line | Statement | Guarded? |
|---|---|---|
| `006_clean_products.sql:13` | `UPDATE products SET active = false WHERE 1=1` | **NO — deactivates the entire catalogue on every run.** Idempotent in effect but destructive to any product added after it last ran. |
| `006_clean_products.sql:16` | `DELETE FROM stock_snapshots WHERE 1=1` | **NO — unconditional wipe of the stock snapshot table.** |
| `021_affiliate_hardening.sql:97` | `DELETE FROM referral_commissions …` | Filtered (commission backfill dedupe) — **partially guarded** |
| `021_affiliate_hardening.sql:133, :349` | `UPDATE affiliate_profiles ap …` | Join-scoped — guarded |
| `023_telegram_miniapp_state_notifications.sql:47` | `UPDATE orders o …` | Needs manual read — **UNVERIFIED guard** |
| `024_customer_insights.sql:274, :297` | `INSERT INTO customer_activity …` (backfill) | Additive, not destructive |
| `009_vendor_expenses.sql:17-19` | 3 status renames `UPDATE vendor_orders SET status=… WHERE status='…'` | Guarded |
| `015_telegram_users_roles.sql:8, :14` | `UPDATE telegram_users tu …` | **UNVERIFIED guard** |
| `005_order_items_product_id.sql:31` | `UPDATE order_items oi …` backfill | Guarded |
| `011_drop_inventory_trigger.sql:14` | `DROP TRIGGER IF EXISTS trg_deduct_inventory_on_delivered` | Drops a trigger created nowhere in `db/sql/` — **orphan drop**; the inventory deduction now lives in app code |
| `002:11`, `021:154, :276` | `DROP TRIGGER IF EXISTS` ×3 | Guarded by `IF EXISTS` |
| `018:26-27` | `CALL check_active_duplicates(); DROP PROCEDURE …` | **Aborts the whole migration** (`SIGNAL SQLSTATE '45000'`) if any active `(name, package_size)` duplicate exists. Deliberate, but a hard stop. |
| `migrate.cjs` | `--reset` flag (`package.json:18`) | **UNVERIFIED** what `--reset` drops — read of `backend/migrate.cjs` needed |

---

## 5. Products data rules

### 5.1 CREATE — `POST /api/products` (`backend/src/routes/products.ts:379-428`)

Layer 1 — Zod, `CreateProductSchema` (`backend/src/schemas/index.ts:154-178`):

| Field | Rule |
|---|---|
| `name` | `string().trim().min(2).max(100)`, then `.transform(v => v.replace(/\s+/g,' '))` — collapses runs of whitespace. **Not lower-cased, not title-cased.** |
| `package_size` | `string().trim().min(1).max(50)` — required |
| `price` | `number().positive()` — must be a JSON number, not a string |
| `unit_cost` | `number().nonnegative().default(0)` |
| `description` | `.trim().max(1000).optional()` |
| `image_url` | `string().trim().max(2048).optional().nullable()` — **length only, no URL/scheme check** |
| `featured` | `z.coerce.boolean().default(false)` |
| `active` | `z.coerce.boolean().default(true)` |
| `tag` | `z.enum(["Traditional","Herbs","Oils","Superfood","Other"]).optional()` |
| `inventory_quantity` | `number().int().nonnegative().default(0)` |
| `low_stock_threshold` | `number().int().nonnegative().default(10)` |

Layer 2 — `validateProductData(name, image_url)` (`products.ts:30-44`):
- Rejects a name matching `/\(\d+\s*(g|ml|kg|pcs|tablet|gummies|pills)\)/i` → *"Size-like pattern found in name…"* (`products.ts:32-35`).
- Rejects an `image_url` containing `drive.google.com` or `dropbox.com` → *"Direct image URL or local upload path is required…"* (`products.ts:37-42`).

Layer 3 — database constraint (§4.3): `UNIQUE (name, package_size, active_unique)` where `active_unique` is `1` only for `active = 1`.

DB write uses an explicit column list and a fresh `crypto.randomUUID()` (`products.ts:395-409`). No `ON DUPLICATE KEY` handling — a duplicate surfaces as a MySQL error → the `catch` at `products.ts:423` returns an opaque **500 "Internal server error"**, not a 409.

### 5.2 UPDATE — `PATCH /api/products/:id` (`products.ts:433-495`)

- Same `UpdateProductSchema` (`schemas/index.ts:180-196`) with every field `.optional()` and a `.refine()` requiring at least one defined field.
- `validateProductData` runs **only on fields present in the payload** (`products.ts:443`) — so a partial update that omits `name` skips the size-in-name check entirely.
- Field allow-list at `products.ts:449-453`; `updates.push(\`${field} = ?\`)` from that fixed array, so no column injection is possible.
- `values.push(fields[field])` — raw values; **`active` is `z.coerce.boolean()`**, so `"false"` → `false`, `0` → `false`, but `""` → `false` too.
- Same opaque-500 problem on a unique-constraint violation.

### 5.3 Is there a unique constraint preventing duplicate `(name, package_size)`?

**Yes, but partial.** `backend/db/sql/018_unique_product_constraint.sql`:

```sql
-- 018:34-38
ALTER TABLE products ADD COLUMN active_unique TINYINT AS (IF(active = 1, 1, NULL)) VIRTUAL;
ALTER TABLE products ADD UNIQUE INDEX idx_unique_active_product (name, package_size, active_unique);
```

Because MySQL unique indexes ignore NULLs, this allows **any number of inactive rows** for the same `(name, package_size)` and forbids duplicates only among `active = 1`. That is the intended design (archived rows must not block re-creation), and it is documented at `018:30-32`.

**Gaps:**
1. **Only `POST /api/products`, `PATCH /api/products/:id` and `POST /bulk` write through the DB.** Other writers do not respect it:
   - `backend/add_products.ts:52` uses `INSERT IGNORE` — silently skips.
   - `006_clean_products.sql` seeds `Moringa Seed` and `Moringa powder` as **distinct names**, which the constraint happily accepts.
   - `backend/scripts/migrate.ts`, `fix_cogs.ts` do not touch names.
2. **Case/collation sensitivity is UNVERIFIED.** `MINIAPP_CLOUDFLARE_RUNBOOK.md:135-137` states the database is created `CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`, which is case-insensitive — under that collation `'Moringa Seed'` and `'moringa seed'` collide. `backend/.env.example` does not pin a collation. **UNVERIFIED** for the live DB.
3. **No application-level pre-check.** There is no `SELECT … WHERE name=? AND package_size=?` before `INSERT` in `products.ts`; the only duplicate detection is the database raising `ER_DUP_ENTRY`, which is swallowed into a 500.
4. **`POST /api/products/bulk` (`products.ts:649-707`)** returns `500 "Bulk creation failed; all changes rolled back"` with `details: err.message` — it does **not** call `validateProductData` at all, so bulk can insert names containing sizes and `drive.google.com` image URLs that the single-create route rejects.

### 5.4 Image URL validation and UI placeholder

**Backend:**
- Schema: max 2048 chars, any string (`schemas/index.ts:164, 187`).
- `validateProductData` blocks only `drive.google.com` and `dropbox.com` substrings (`products.ts:37-42`). Any other host is accepted.
- `_url`-suffixed keys skip DOMPurify sanitisation (`lib/security.ts:33`), so `image_url` is stored verbatim.
- Upload route validates by magic bytes (`file-type`) and 5 MB cap (`routes/upload.ts:33-37, :73-78`), then pushes to **Cloudinary** (`/image`) or writes to `public/uploads/` (`/receipt`).
- Admin-only diagnostic: `GET /api/products/health` returns `brokenImages` (NULL/empty/drive/dropbox/no-extension/non-http), `invalidTags` (outside the 5-value enum), and `nearDuplicates` (normalised `name|size` collisions computed in memory) — `products.ts:283-348`.

**Frontend — `frontend/src/utils/image.ts`:**

| Stage | Line | Behaviour |
|---|---|---|
| `resolveProductImage(dbImageUrl, name, {width=400, quality=78})` | 10-39 | Priority: `/image/` DB path → cloud-URL normaliser → any `http*` passthrough → `getLocalImage(name)` → `''` |
| `convertCloudStorageUrl` | 45-131 | Google Drive → `drive.google.com/uc?export=view&id=`, Dropbox `raw=1`, Box → `app.box.com/api/2.0/files/{id}/content`, Cloudinary passthrough, Imgur → `i.imgur.com/{id}.jpg`, GitHub `blob` → `raw.githubusercontent.com`, S3/GCS/Azure Blob passthrough |
| `optimizeLocalUrl` | 137-140 | appends `?w=&q=` **only** for `/image/` paths |
| **No host allowlist** | 31 | any `http*` URL is rendered as-is |

**Placeholder / fallback matrix:**

| Component | File:line | Fallback |
|---|---|---|
| `OptimizedImage` | `frontend/src/components/ui/OptimizedImage.tsx:40` | inline `data:image/svg+xml` "Image Not Found" SVG; `onError` swaps `src` at `:101` |
| `ProductsPage` (admin) | `frontend/src/pages/ProductsPage.tsx:884-893` | `onError` hides the `<img>` (`display:none`), leaving an empty grey box; a grey `image` icon if `resolveProductImage()` is falsy |
| `BestSellers` (storefront) | `frontend/src/components/storefront/BestSellers.tsx:58` | **hardcoded remote Unsplash vegetable photo** as placeholder |
| Mini App / Checkout | `StoreTab.tsx:133-144`, `DiscoverTab.tsx:99-101,139-141`, `DetailView.tsx:43-44`, `CartView.tsx:63-65`, `Checkout.tsx:253-255` | text-only `<span>Asella</span>`; **no `onError`**, so a broken URL shows the browser's broken-image glyph |
| Service worker | `frontend/public/sw.js:80` | on image fetch failure returns `/offline.html` — **an HTML document into an `<img>`** |

Known-broken local mapping: `utils/image.ts:228` references `Neuherb Shilajit gel 20g.png`; the file on disk is `Neuherb Shilajit Gummies  (30 Gummies ).png` (`018`/`019` corrected the DB row but not the code). `frontend/public/image/products/Shilajit Oil.png` exists but no rule returns it.

---

## 6. Scheduled jobs and background work

### 6.1 Inventory of every timer / queue

| # | What | Where | Schedule | Registered by |
|---|---|---|---|---|
| J1 | `sendMorningBriefing` | `backend/src/lib/telegram.ts:611-660` | `cron.schedule("0 8 * * *", …, { timezone: "Africa/Addis_Ababa" })` | `backend/src/server.ts:40-42` — **module scope, runs on every process start** |
| J2 | `sendWeeklyAffiliateReports` | `backend/src/scripts/affiliate-report-cron.ts:31-109` | `cron.schedule("0 8 * * 1", …, { timezone: "Africa/Addis_Ababa" })` | `backend/src/server.ts:45-49` |
| J3 | `usedResetTokens.clear()` | `backend/src/routes/auth.ts:33` | `setInterval(…, 20 min)` | module scope |
| J4 | `initBotConfiguration()` | `backend/src/lib/telegram.ts:251` | once on boot (`server.ts:19`) | `void`-called |
| J5 | Telegram long-poll | `backend/src/scripts/telegram-poll.ts:34-112` | `setTimeout(poll, 5000)` self-rescheduling (L39, 46, 82) | only via `npm run telegram:poll` |
| J6 | Nightly data retention | `backend/src/scripts/data-retention.ts` and `backend/scripts/data-retention.ts` | **no in-process cron** — documented as a cPanel crontab entry (`src/scripts/data-retention.ts:5-7`) | external cron **UNVERIFIED whether installed** |
| J7 | Nightly DB backup | `backend/scripts/backup.sh` | documented crontab `0 2 * * *` (`backup.sh:11`) | external cron **UNVERIFIED** |

**No queue system exists.** `bull`, `agenda`, `bee-queue` etc. are absent. Redis is used only as an optional rate-limit store (`middleware/rateLimit.ts:20-23`).

### 6.2 What each job does externally

**J1 — Morning briefing** (`lib/telegram.ts:611-660`)
- Reads: `TELEGRAM_ADMIN_CHAT_ID` (L612); returns silently if unset (L613).
- Lock: `INSERT IGNORE INTO webhook_events (update_id)` with `update_id = -abs(YYYYMMDD)` as an int (L615-621); `affectedRows === 0` → skip (L623-626).
- Writes: none to business tables.
- Sends: one Telegram message with yesterday's order count + revenue and current Pending count, plus two inline buttons (`pending_orders`, `analytics_summary`) (L641-654).
- Errors: `catch` + `console.error` (L657-659).

**J2 — Weekly affiliate report** (`src/scripts/affiliate-report-cron.ts`)
- Requires SMTP (`isMailConfigured()`, L34-37) — otherwise it logs and returns.
- Lock: `INSERT IGNORE INTO report_run_locks (period_start)` (L44-47); `affectedRows === 0` → skip (L49-55).
- Reads: active, non-deleted `affiliate_profiles` joined to `staff_users` (L57-65).
- Writes: one `report_runs` row per recipient (L76-82, and via `sendAffiliateReport`).
- Sends: one HTML email per affiliate (SMTP, `lib/mailer.ts:56-75`).

### 6.3 Idempotency under multiple instances

| Job | Idempotent across instances? | Mechanism |
|---|---|---|
| J1 morning briefing | **YES** | `INSERT IGNORE` into `webhook_events`, whose `update_id` is the PK (`001:321-325`). Only one instance can win the insert. |
| J2 weekly report | **YES** | `report_run_locks.period_start` is the PK (`022:47`). Documented at `affiliate-report-cron.ts:8-13`. |
| J3 reset-token cache | N/A | In-memory `Set`, per-process, cleared every 20 min. Not shared — a token can be reused across instances/restarts (§3.6, R2). |
| J4 `initBotConfiguration` | Idempotent in effect | Re-issues `setMyCommands`/`setMyDescription`/`setChatMenuButton` with the same values (`lib/telegram.ts:251`); every instance runs it on boot. |
| J5 telegram-poll | **NO** | Calls `deleteWebhook()` on start; with Telegram, webhook and long-polling are mutually exclusive. Running two pollers or a poller plus production webhook conflicts. |

**Residual multi-instance risk:** both locks are claim-then-act, which is correct. But `deployment guide.md:36` explicitly warns: *"scheduled jobs with external effects must be idempotent — multi-instance Passenger means `cron.schedule` fires repeatedly, use claim-then-act."* — the two in-process crons comply. The **`sendLowStockAlert` fired from `POST /products/:id/stock`** (`products.ts:580-587`) and the **`sendOrderToAdmin` / delivery-group broadcasts inside `POST /orders`** (`orders.ts`, L239-241 reads `TELEGRAM_ADMIN_CHAT_ID`) are request-triggered, not cron, and are protected only by the `Idempotency-Key` middleware (`middleware/idempotency.ts`) — which is **opt-in**: the middleware is a no-op unless the client sends the header (`idempotency.ts:41-46`). **The frontend never sends `Idempotency-Key`** (grep for it across `frontend/src` returns nothing), so double-submitting `POST /api/orders` creates two orders and sends two Telegram broadcasts. This is the documented "double Telegram messages" failure in `deployment guide.md` §7.

---

## 7. Integrations

### 7.1 Telegram Bot

**Webhook** — `POST /api/v1/api…/telegram/webhook` (i.e. `/api/v1/telegram/webhook` and `/api/telegram/webhook`), `backend/src/routes/telegram.ts:1466-1547`.
- Secret verification: reads `x-telegram-bot-api-secret-token` (L1467) → `verifyTelegramWebhook()` (`lib/security.ts:53-60`) which does a length check then `crypto.timingSafeEqual`. **Returns HTTP 200 on every failure** (L1470, 1480, 1488, 1500, 1522, 1533) so Telegram never retries — deliberate.
- Replay protection: `SELECT update_id FROM webhook_events` then `INSERT IGNORE` (L1493-1530).
- Staleness: messages older than **5 minutes** are recorded and dropped (L1513-1525); explicitly **not** applied to `callback_query` (comment L1504-1510).
- Dispatches to `handleCallback` or `handleMessage` (L1538-1542).

**Commands** (`routes/telegram.ts`, message handler):
`/start` · `/help` (L1363) · `/store` · `/shop` (L1378) · `/logout` (L1390) · `/link …` phone-ownership (L1399) · `/order`, `/order\n…` (L1417, L1422) · `/myorders` (L1441) · `/track …` (L1446).

**Callbacks** (`callback_data`, `routes/telegram.ts`):
`role:customer|vendor|staff|driver|back` (L764-790) · `staff:confirm|cancel|track|orders|logout` (L797-845) · `menu_order|menu_myorders|menu_track|menu_help` (L856-874) · `vendor:refresh` (L883) · `city:…` (L890) · `otype:…` (L906) · `page:…` (L923) · `prod:…` (L938) · `size:…` (L954) · `addmore:yes|no` (L983-996) · `order_done_items` (L1007) · `confirm:yes|no` (L1019-1030) · `delivery_accept_<id>` (L1038) · `delivery_reject_<id>` (L1177) · `po_accept_<id>` (L1184) · `po_decline_<id>` (L1194).
Link status codes: `linked` / `already_linked_to_you` / `taken_by_another_chat` / `not_found` / `proof_required` / `bad_proof` (L538-548).

**Mini App auth** — `backend/src/lib/telegram-auth.ts:38-90`
- `validateTelegramInitData(initData, botToken, maxAgeSeconds = 86400)`:
  - `secretKey = HMAC_SHA256("WebAppData", botToken)` (L74-77)
  - `computedHash = HMAC_SHA256(secretKey, dataCheckString)` where `dataCheckString` is sorted `k=v` joined by `\n` (L69-72, L79-83)
  - `timingSafeEqual` compare (L85)
- The bot token is the root of trust for the entire Mini App. `MINIAPP_CLOUDFLARE_RUNBOOK.md` §12.1 states this explicitly.
- **24 h replay window** is a deliberate open defect (`MINIAPP_CLOUDFLARE_RUNBOOK.md` §11.6).

**Bot configuration** — `initBotConfiguration()` (`lib/telegram.ts:251-306`): `setMyCommands`, `setMyDescription`, `setChatMenuButton`, all keyed off `TELEGRAM_MINIAPP_URL`. **Asymmetry:** `lib/telegram.ts:292` has no fallback, while `routes/telegram.ts:43-46` falls back to `` `${PUBLIC_URL}/tma` `` — documented as the "#1 cause of the Store button vanished" (`MINIAPP_CLOUDFLARE_RUNBOOK.md:74-81`).

**Env var names:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_DELIVERY_GROUP_ID`, `TELEGRAM_MINIAPP_URL`, `PUBLIC_URL`, `PORT`.

### 7.2 Cloudinary

- Configured at import time in `backend/src/lib/cloudinary.ts:6-13` from `CLOUDINARY_URL` **or** (`CLOUDINARY_CLOUD_NAME` + `CLOUDINARY_API_KEY` + `CLOUDINARY_API_SECRET`). If absent it logs a warning and uploads will 500.
- **Bug:** the `if` tests `CLOUDINARY_URL` **or** the triple, but `cloudinary.config()` is then called with only the triple fields (`cloudinary.ts:7-10`) — a `CLOUDINARY_URL`-only deployment configures `cloud_name: undefined`.
- Only consumer: `POST /api/upload/image` (`routes/upload.ts:26-63`), admin/manager, `file-type` magic-byte check, folder `asella-organic`.
- **Env var names:** `CLOUDINARY_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`. **Not in `backend/src/config/env.ts`** — no Zod validation.
- Frontend: `VITE_CLOUDINARY_CLOUD_NAME` is documented in `frontend/.env.example:24` but **read nowhere**; `OptimizedImage.tsx:81` branches on the URL hostname instead.

### 7.3 YouTube

- Embed: `frontend/src/components/common/YouTubeFacade.tsx:40` → `https://www.youtube-nocookie.com/embed/{id}?autoplay=1&rel=0`; poster `https://i.ytimg.com/vi/{id}/hqdefault.jpg` (`:55`).
- Management: `frontend/src/pages/VideoManagementPage.tsx:9,13,17` parse `youtube.com/embed`, `youtu.be`, and `youtube.com/shorts`.
- Testimonials: `frontend/src/components/storefront/Reviews.tsx:8-17` — 10 hardcoded Shorts URLs.
- CSP: `frame-src` allows `www.youtube.com`, `youtube.com`, `www.youtube-nocookie.com` (`csp-config.js:32`); `connect-src` allows `i.ytimg.com` (`csp-config.js:27`).
- Backend: `GET/POST/DELETE /api/videos` (`routes/videos.ts:18,37,63`), stored in `community_videos` (`011_community_videos.sql:4`). **No env vars needed.**

### 7.4 Others

| Integration | Where | Env var names |
|---|---|---|
| SMTP (Nodemailer) | `backend/src/lib/mailer.ts:19-40`; used by `routes/appointments.ts` and `lib/affiliateReport.ts` | `SMTP_USER`, `SMTP_PASS`, `SMTP_SERVICE`, `SMTP_FROM` — none validated in `env.ts` |
| Google Sheets | `backend/src/lib/sheets.ts:6-31` (453 lines); mirrored from `routes/orders.ts:34` | `GOOGLE_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SERVICE_ACCOUNT_PATH` |
| SMSEthiopia SMS | `backend/src/lib/sms.ts:59,69,77,81,141,179,285` | `SMSETHIOPIA_API_KEY`, `SMS_SENDER_LABEL`, `SMS_DISPATCH_ENABLED`, `SMS_SEND_TIMEOUT_MS` |
| Redis (rate limits) | `backend/src/middleware/rateLimit.ts:20-23` | `REDIS_URL` — **not in `.env.example`** |
| Sharp (image optimiser) | `backend/src/routes/images.ts` | none |
| QR codes | `backend/src/routes/staff.ts:567` | none |

---

## 8. Frontend

### 8.1 Routing map — `frontend/src/App.tsx`

`<BrowserRouter>` at `App.tsx:46`, **no `basename`**. All pages `React.lazy` (`:11-36`); one `<Suspense>` at `:52`.

| Path | Component | Guard | Line |
|---|---|---|---|
| `/` | `Storefront` | public | 55 |
| `/checkout` | `Checkout` | public | 56 |
| `/telegram-store` | `TelegramStore` | public | 61 |
| `/tma` | `TelegramStore` | public | 62 |
| `/community-videos` | `CommunityVideos` | public | 63 |
| `/login` | `Login` | public | 64 |
| `/affiliate` | `AffiliateDashboard` | `AffiliateRoute` — role `affiliate` | 67 |
| `/privacy`, `/terms` | `PrivacyPolicy`, `TermsOfService` | public | 68-69 |
| `/track`, `/track/:orderId` | `CustomerOrderTracking` | public | 70-71 |
| `/dashboard` | `Dashboard` | `ProtectedRoute` | 74 |
| `/dashboard/new-order` | `NewOrderPage` | `ProtectedRoute` | 75 |
| `/dashboard/tracking` | `OrderTracking` | `ProtectedRoute` | 76 |
| `/dashboard/bulk-orders` | `BulkOrdersPage` | `ProtectedRoute` | 77 |
| `/dashboard/vendor` | `VendorPurchasePage` | `ProtectedRoute` | 78 |
| `/dashboard/stock-alert` | `StockAlertPage` | `ProtectedRoute` | 79 |
| `/dashboard/expenses` | `ExpensesPage` | `ProtectedRoute` | 80 |
| `/dashboard/analytics` | `AnalyticsPage` | `ProtectedRoute` | 81 |
| `/dashboard/notifications` | `Notificationspage` | `ProtectedRoute` | 82 |
| `/dashboard/customers` | `CustomersPage` | `ProtectedRoute` | 83 |
| `/dashboard/change-password` | `ChangePasswordPage` | `ProtectedRoute` | 84 |
| `/dashboard/users` | `UserManagementPage` | `ProtectedRoute` | 85 |
| `/dashboard/affiliates` | `AffiliateControlPage` | `ProtectedRoute` | 86 |
| `/dashboard/videos` | `VideoManagementPage` | `ProtectedRoute` | 87 |
| `/dashboard/products` | `ProductsPage` | `ProtectedRoute` | 90 |
| `/dashboard/audit-log` | `AuditLogPage` | `ProtectedRoute` | 91 |

- `ProtectedRoute` (`frontend/src/components/ui/ProtectedRoute.tsx:11-23`) implements a `requiredRole` prop (`:8,11,18`) that is **never passed at any of the 16 dashboard call sites** (`App.tsx:74-91`). Client-side, `/dashboard/users`, `/dashboard/affiliates`, `/dashboard/audit-log` are reachable by any authenticated role. The server still enforces `admin`, so this is a UX not a security gap.
- **There is no `path="*"` catch-all.** An unmatched URL renders only the `<main>` shell (`App.tsx:47`) — a blank cream page. Apache never returns HTTP 404 for client routes (`.htaccess:22-25`).
- **Second entry point:** `frontend/tma.html` → `frontend/src/tma.tsx:37-45` renders `<TelegramStore/>` with **no router, no Redux `Provider`, and no service-worker registration**. Reached via `RewriteRule ^tma/?$ /tma.html` (`.htaccess:14`) or the Vite dev middleware (`vite.config.ts:12-27`).
- Dead files: `frontend/src/pages/AccessDatabasePage.tsx` and `frontend/src/pages/Sidebar.tsx` are imported by nothing (a second `Sidebar` exists at `components/dashboard/Sidebar.tsx`).

### 8.2 State and data fetching

`frontend/src/store/index.ts:6-10` — `combineReducers({ auth, ui, stock })`, no middleware (`:22`). Provider at `main.tsx:34`.

| Slice | State | Notes |
|---|---|---|
| `authSlice` (`slices/authSlice.ts`) | `{ user, isAuthenticated }` | `initialState` derived from `localStorage['user']` (`:18-19`) — **unguarded `JSON.parse`, throws at module load on corrupt data**. **No async thunks. No boot-time `auth.me()` re-hydration.** `auth.me()` is called lazily only by `ChangePasswordPage.tsx:28` and `AffiliateControlPage.tsx:108`. |
| `uiSlice` | order modal, theme (`light/dark/system`) | Theme persists to `localStorage.theme` (`:19,72`); `matchMedia` used at `:25-33` |
| `stockSlice` | items, summary, movements, requests, adjustment | The only slice with thunks (`:156-250`), all via a private `apiFetch` (`:136-152`) |

- **No React Query / SWR.** All other data is `useEffect` + `fetch` or `api.*`.
- `receiveVendorOrder` thunk (`stockSlice.ts:228-240`) is **never dispatched** and has **no `extraReducers` entry** (`:293-337`) — dead code.

### 8.3 API client and base URL

`frontend/src/services/api.ts` — hand-rolled `fetch` wrapper. **`axios` is in `package.json:20` but never imported in `src/`** (it is `vi.mock`'d in `frontend/tests/setup.ts:10-23`, which is why no test catches it).

- Base URL: `const BASE_URL = import.meta.env.VITE_API_URL ?? ""` (`api.ts:33`) — **empty string means same-origin relative**.
- Every call sets `credentials: "include"` (`api.ts:75`); JSON content-type unless `FormData` (`:72,76-79,83`).
- 401 handling (`api.ts:88-111`): skips `/api/auth/login` and `/api/auth/refresh`; de-duplicates concurrent refreshes via module-level `isRefreshing`/`refreshPromise` (`:50-51,93-99`); on failure does `window.location.href = "/login"` (`:106-110`) — a hard redirect that discards router state and form data. **403 is not handled anywhere.**
- **No `try/catch` around `fetch`** (`:86`) — a network error rejects the promise. Non-2xx JSON responses are returned as-is; callers must check `res.success`.
- Non-2xx that is not JSON → `{ success:false, error: "HTTP <status>" }` (`:113-119`).

**Inconsistent base-URL resolution — 11 different sites:**

| File:line | Expression | Default |
|---|---|---|
| `services/api.ts:33` | `VITE_API_URL ?? ""` | `""` |
| `store/slices/stockSlice.ts:127` | `VITE_API_URL ?? "/api"` | `"/api"` |
| `telegram/shop/api.ts:17` | `VITE_API_URL \|\| ''` | `""` |
| `api/telegramAuth.ts:37` | `VITE_API_URL \|\| ''` | `""` |
| `pages/CommunityVideos.tsx:4` | `VITE_API_URL ?? 'http://localhost:3001'` | **`http://localhost:3001`** |
| `pages/VideoManagementPage.tsx:4` | same | **`http://localhost:3001`** |
| `pages/AnalyticsPage.tsx:48` | same | **`http://localhost:3001`** |
| `pages/Storefront.tsx:23` | same | **`http://localhost:3001`** |
| `pages/CustomerOrderTracking.tsx:7` | bracket form `?? ''` | `""` |
| `pages/ProductsPage.tsx:183, :420` | bracket form `?? ''` | `""` |

Plus three hard-relative `/api/v1/...` fetches that bypass `VITE_API_URL` entirely and **omit `credentials`**: `pages/Checkout.tsx:141`, `pages/CommunityVideos.tsx:17`, `pages/VideoManagementPage.tsx:39`.

Dev proxy: `vite.config.ts:49-55` → `/api` to `http://localhost:3001`, `changeOrigin: true` (**correct option name**), `secure: false`. Dev headers include `X-Frame-Options: ALLOWALL` (`:47`) and `Access-Control-Allow-Origin: *` (`:45`).

### 8.4 Service worker and PWA

**No `vite-plugin-pwa`.** Hand-written `frontend/public/sw.js` (112 lines), copied verbatim to `dist/sw.js`.

**`vite.config.ts` has no PWA config at all** — no `registerType`, `workbox`, `globPatterns`, `runtimeCaching`, `navigateFallback`, `skipWaiting`, `clientsClaim`, or `manifest` (the whole file is 70 lines and was read in full).

`frontend/public/manifest.webmanifest` (34 lines, hand-written): `name`, `short_name`, `start_url: "/"`, `scope: "/"`, `display: standalone`, `orientation: portrait`, `background_color #f0ede6`, `theme_color #0d1f10`, 3 icons at `/icons/icon-192.png`, `/icons/icon-512.png`, `/icons/icon-512-maskable.png` (`:11-30`), `lang: en`, `dir: ltr`.
**`frontend/public/icons/` DOES NOT EXIST** (verified), and neither does `frontend/dist/icons/`.

**`sw.js` internals:**

| Element | Line | Behaviour |
|---|---|---|
| `CACHE_VERSION` | 16 | Literal placeholder `'__VERSION__'` in source |
| `STATIC_CACHE` / `IMAGE_CACHE` / `API_CACHE` | 17-19 | `asella-static-${V}`, `asella-images-${V}`, `asella-api-${V}` |
| `STATIC_ASSETS` | 21-28 | `/`, `/manifest.webmanifest`, `/offline.html`, `/favicon.png`, **`/icons/icon-192.png`**, **`/icons/icon-512.png`** |
| install | 30-35 | `caches.open(STATIC_CACHE).then(c => c.addAll(STATIC_ASSETS))` then **unconditional `self.skipWaiting()`** (34) |
| activate | 37-47 | deletes every cache key not ending in `-${CACHE_VERSION}` (41-44), then **unconditional `self.clients.claim()`** (46) |
| fetch — API | 57-65 | `pathname.startsWith('/api/')` → **network-only**; offline → synthesised `503 {"success":false,"error":"Offline"}` |
| fetch — images | 68-84 | cache-first into `IMAGE_CACHE` when `res.ok`; on failure returns `/offline.html` (80) |
| fetch — same-origin | 87-103 | stale-while-revalidate into `STATIC_CACHE` |
| fetch — navigate | 105-111 | network-first, fallback `/offline.html` |

**Version injection:** `frontend/scripts/postbuild.js:59-68` replaces `__VERSION__` with `` `v-${crypto.randomBytes(4).toString('hex')}` ``. Verified in the built output: `frontend/dist/sw.js:16` = `'v-2176a2dd'`. **The version is random per build, not a content hash** — every deploy invalidates all three caches for every returning visitor.

**Registration:** `frontend/src/lib/sw-register.ts:14-26`, called once from `main.tsx:29`. Guarded by `!import.meta.env.PROD` (`:17`), so **dev builds never register a SW**. `{ scope: "/" }`, `console.log` on success (`:23`), `console.warn` on failure (`:26`).

**Update flow: there is none.** No `onupdatefound`, no update prompt, no reload prompt, no `beforeinstallprompt`. Grep across all `frontend/**/*.{ts,tsx,js}` returns exactly two matches for `skipWaiting`/`clientsClaim`, both inside `sw.js`. A new SW takes over silently on the next navigation.

**Five concrete defects in `sw.js`:**
1. **`cache.addAll` is atomic** — `/icons/icon-192.png` and `/icons/icon-512.png` 404, so the whole `install` `waitUntil` rejects and **nothing is ever precached**, including `/` and `/offline.html`.
2. **The network-first navigation branch (105-111) is unreachable** — the same-origin stale-while-revalidate branch (87-103) is tested first and matches every `mode: 'navigate'` request, so SPA HTML is served cache-first.
3. `API_CACHE` is declared (`:19`) and never opened. The header comment (`:6-7`) claiming a 50-entry API response cache is **false**.
4. Random (not content-based) cache versioning nukes all caches on every deploy.
5. Image failure returns an HTML document into an `<img>` tag.

### 8.5 Product grouping by name

**Grouping is server-side.** The frontend has no grouping reducer; it consumes `GET /api/products/grouped`.

- `GroupedProduct = { name, description, image_url, featured, tag, active, variants: Variant[] }` — `frontend/src/hooks/useProducts.ts:27-35`.
- `useGroupedProducts()` — `hooks/useProducts.ts:65-91`, fetches `/api/products/grouped` (`:73`) once on mount (`useEffect(…, [])`, `:86-88`). Exposes `refreshGroupedProducts` (`:90`) which is **never called**.
- Also consumed by `frontend/src/components/storefront/BestSellers.tsx:9-26` (a duplicated local interface) via `/api/products/grouped?sort=sales` (`:169`).

**The algorithm** — `backend/src/routes/products.ts:129-236`:
1. Query all products, default `ORDER BY featured DESC, name ASC, price ASC` (`:160`); `?sort=sales` LEFT JOINs `order_items` and orders by `SUM(quantity)` (`:162-165`). **No LIMIT/OFFSET** — comment at `:155` says *"< 100 base products, no pagination needed"*.
2. Strip a trailing size from `name` via `/(?:\s*\(?\s*(\d+\s*(?:g|ml|kg|pcs|tablets?|gummies|pills?))\s*\)?)$/i` (`:179`); if `package_size` is empty the extracted size is used (`:182-184`) and the suffix removed from the name (`:185`).
3. Title-Case for the grouping key (`:189-193`).
4. **Two hardcoded name corrections:** `"Hibiscus Kerkede Leafe"` and `"Hibiscus Kerkede"` are forced to `"Hibiscus Dry Leafe"` (`:196-198`).
5. The **first row for a base name wins** `description`, `image_url`, `featured`, `tag`, `active` (`:200-210`). Because of `ORDER BY … price ASC`, the **cheapest variant supplies the group's image and description**.
6. Every row is pushed as a variant with `package_size: extractedSize || 'Standard'` (`:213-221`).

**Client-side identity is the `name` string**, which is why duplicates surface as React key collisions: `BestSellers.tsx:262` `key={product.name}`, `StoreTab.tsx:118` `key={product.name}`, `StoreTab.tsx:85-92` and `TelegramStore.tsx:296-310,367,519` key `selectedVariants` by `product.name`.

**Duplicate `(name, package_size)` rows produce two variants with the same size label.** The Size `<select>` `<option value>` is `package_size`, not `id` (`NewOrderPage.tsx:348`), and every lookup uses `.find(...)` which takes the first match — `NewOrderPage.tsx:337`, `OrderForm.tsx:74,123,350`, `BulkOrdersPage.tsx:257`, `StockAlertPage.tsx:143`, `OrderTracking.tsx:938`. The second duplicate is unselectable and silently carries a different price.

### 8.6 New Sales Order dependent dropdowns

Three surfaces implement it. The canonical one is `/dashboard/new-order` → `frontend/src/pages/NewOrderPage.tsx` (heading "New Sales Order" at `:195`).

**Data source: API, not hardcoded.** `useGroupedProducts()` (`NewOrderPage.tsx:48`) → `GET /api/products/grouped`. Hardcoded option lists do exist for other fields: `SOURCES` (`:42`), `AGE_GROUPS` (`:43`), `CITIES = ['Addis Ababa','Other Regions','Abroad']` (`:44`), `COUNTRY_CODES` (`:9`).

**The one real cascade — Item (name) → Size (package_size):**

| Step | Line | Behaviour |
|---|---|---|
| Item `<select>` | 319-330 | options from `groupedProducts.map(g => <option key={g.name} value={g.name}>)` (`:327-329`); placeholder `— Select Item —` (`:326`) |
| On Item change | 319-325 | resets `package_size = ''`, `product_id = ''`, `unit_price = 0` **in the same handler** |
| Resolve group | 302-303 | `groupedProducts.find(p => p.name === item.name)` → `availableVariants` — **purely client-side, no network refetch** |
| Size `<select>` | 335-350 | options `availableVariants.map(v => <option key={v.id} value={v.package_size}>)` (`:347-349`) — **value is `package_size`, not `id`** |
| On Size change | 335-342 | `availableVariants.find(v => v.package_size === size)` (`:337`) → sets `product_id = variant.id` (`:340`) and `unit_price = Number(variant.price)` (`:341`) **only if a variant matched** |
| Qty | 355 | free number input, `min="1"`, independent |
| Subtotal cell | 359-368 | renders `'—'` when `unit_price === 0` (`:366`) |

**Other derived-but-not-refetched relationships:**
- City → Delivery Fee: `regionalFees = { 'Addis Ababa': 150, 'Other Regions': 400, 'Abroad': 0 }` (`:87-91`); `deliveryFee = (order_type === 'delivery' && hasItems) ? regionalFees[city] || 200 : 0` (`:94`).
- There is **no customer lookup/autocomplete**; customer fields are free text or flat selects (`:213,230,244,236-239,249-251,257-262,266-269,275-278`).

**Empty-selection handling:**
- Empty Item → `availableVariants = []` → the Size select renders only its placeholder, but is `required` (`:335`) so native validation blocks submit.
- Empty Size → `selectedVariant` stays `null` (`:304`), `isOutOfStock` falsy (`:305`), `stockQty` null (`:306`) — **no out-of-stock or low-stock banner fires** (`:383,393`).
- An untouched `EMPTY_ITEM` row (`:34-40`) is still submitted: `payload.items` is an unfiltered `.map` (`:159-165`). It is caught only by the separate zero-price guard (`:121-128`), which names it `'unnamed item'` (`:124`).
- **The computed `deliveryFee` (`:87-94`) is displayed in the footer (`:457-460`) but never sent to the backend.**

**Server-side re-validation instead of dropdown locking** — `handleSubmit` (`:101-186`): out-of-stock pre-check re-resolves the group and variant server-side of the client state (`:106-119`); zero-price abort (`:121-128`); optional `POST /api/upload/receipt` (`:134-141`); `POST /api/orders` (`:168`); success → `/dashboard/tracking` with `state.successMessage` (`:170-172`).

**The other two surfaces behave differently:**
- `OrderForm.tsx` (storefront modal): flat `useProducts()` (`:21`); Item options `new Set(products.map(p => p.name))` (`:364`); **changing Item does NOT reset `packageSize`** (`:362`); explicit empty state `<option disabled>{t('orderForm.chooseItemFirst')}</option>` (`:377-379`); **no price auto-fill** — price resolved by `products.find(p => p.name === item.name && p.package_size === item.packageSize)` (`:350`) and submitted as `Math.max(price, 1)` (`:129`), so an unmatched row is submitted at **1 ETB**; blank names become `'Custom Item'`/`'Standard'` (`:126-127`); only row 0 is guarded (`:102`).
- `BulkOrdersPage.tsx`: flat `useProducts()` (`:14`); Item reset only `packageSize` (`:242-245`); price auto-fills on Size change (`:255-261`); price admin-editable when `state.auth.user.role === 'admin'` (`:16,282-287`).
- `OrderTracking.tsx:903-940`: item-edit cascade with the same `find`-by-`(name, package_size)` behaviour (`:938`).

### 8.7 i18n

**No i18n library.** No `i18next`, `react-i18next`, or `@lingui/*` in `frontend/package.json`. Two hand-rolled, deliberately separate systems, both covering `en | am | or`:

**A. Website** — `frontend/src/LanguageContext.tsx` (635 lines)
- `type Language = 'en' | 'am' | 'or'` (`:3`); flat dotted-key dictionaries (`:13`): `en` `:14-222`, `am` Amharic `:223-410`, `or` Afaan Oromoo `:411-598`.
- Provider `:601-627`; restores from `localStorage['selectedLanguage']` validated against `['en','am','or']` (`:604-610`); sets `document.documentElement.lang` (`:604-610, 612-616`).
- `t(key)` `:618-620` — `translations[lang][key] || translations['en'][key] || key`. **No interpolation, no pluralisation.**
- Mounted at `App.tsx:48`. Switcher: `components/storefront/Header.tsx:29-59, 61-65, 67-70` (globe button; `am` and `or` both use the 🇪🇹 flag).

**B. Mini App** — `frontend/src/telegram/shop/i18n.ts` (681 lines) + `MiniAppI18n.tsx` (80 lines)
- `LANGUAGES` `:17-21`; `EXTRA` per-language `:27-157`; `en` `:159-327`, `am` `:335-489`, `or` `:492-646`; `am`/`or` typed `Partial<Record<TranslationKey,string>>` so missing keys fall back (`:331-334, :491`).
- `translate(language, key, vars)` `:661-675` — **does** interpolate `{name}` via regex (`:671-674`); fallback language → English → raw key (`:666-669`).
- `missingTranslations(language)` `:678-681`, exercised by `i18n.test.ts:59`.
- Provider resolution order (`MiniAppI18n.tsx:34-49`): `forceLanguage` → `localStorage['asella_tma_language']` → Telegram `language_code` (base `am`→`am`, `om`/`or`→`or`, else `en`).
- Mounted only in `tma.tsx:40`. Consumed by 12 components.

**Coverage is partial in both.** English-only UI strings remain in otherwise-i18n'd components: `BestSellers.tsx:179,183`, `TelegramStore.tsx:321,337`, `StoreTab.tsx:142,375`, `NewOrderPage.tsx:298` and the whole `NewOrderPage` form. `i18n.ts:7-12` itself notes that Amharic and Oromo copy should be reviewed by a native speaker before launch.

---

## 9. index.html and CSP audit

### 9.1 `frontend/index.html` (62 lines) — inline scripts

**Inline `<script>` blocks: ZERO.** Every `<script>` has a `src=`:

| Line | Tag | Notes |
|---|---|---|
| 53 | `<script src="/polyfills.js">` | Classic, render-blocking, no `defer`/`async`. `frontend/public/polyfills.js` (12 lines) is an `Array.prototype.at` polyfill guarded by `if (!Array.prototype.at)`. Its comment says it must stay external because CSP has no `'unsafe-inline'`. |
| 56 | `<script src="https://telegram.org/js/telegram-web-app.js">` | **External domain `telegram.org`**, classic, render-blocking, **loaded on every page of the public website**, not just the Mini App. |
| 60 | `<script type="module" src="/src/main.tsx">` | Vite entry; body-level, after `<div id="root">` (`:59`). |

Enforced at build time: `frontend/scripts/postbuild.js:70-125` strips HTML comments (`:90`), matches `/<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi` (`:94`), and `process.exit(1)` on any inline script in `dist/index.html` (`:119`). The same gate runs against `dist/tma.html` (`:127-145`) **and** hard-fails if `telegram.org/js/telegram-web-app.js` is absent (`:146-153`).

### 9.2 `<link>` tags using `media="print"` with `onload`

**ZERO. None in this repository.** No `<link>` in `frontend/index.html` has a `media` attribute or an `onload` attribute. Confirmed by reading all 62 lines.
This matters historically: `backend/deployment guide.md:37` lists as golden rule #7 *"no inline `<script>`, no `media="print" onload=`"*, and `DEPLOYMENT_GOTCHAS.md` §7 lists "icons showing as words → `media="print"` blocked by CSP" as a known incident. The pattern has been fully removed.

All `<link>` tags in `frontend/index.html`:

| Line | rel | href | media | onload | External |
|---|---|---|---|---|---|
| 16 | icon | `/favicon.png` | — | — | no |
| 23 | manifest | `/manifest.webmanifest` | — | — | no |
| 27 | apple-touch-icon | `/icons/icon-192.png` | — | — | no — **404s, `public/icons/` does not exist** |
| 38 | preconnect | `https://fonts.googleapis.com` | — | — | **yes** |
| 39 | preconnect | `https://fonts.gstatic.com` | — | — | **yes** |
| 40-43 | stylesheet | `https://fonts.googleapis.com/css2?family=DM+Sans…&family=DM+Mono…&family=Outfit…` | — | — | **yes**, render-blocking |
| 46-49 | stylesheet | `https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined…` | — | — | **yes** |

The comment at `:45` says Material Symbols is *"deferred so it never blocks first paint"* but it is a plain render-blocking `<link>` — no `media`/`onload` async pattern, no `preload`.

Build output adds 5 more tags — `frontend/dist/index.html:57-61`:
`<script type="module" crossorigin src="/assets/main-B4prYjFq.js">`, `modulepreload` ×2 (`jsx-runtime-DUXOgzKQ.js`, `miniApp-xOj9ayIM.js`), `stylesheet` ×2 (`miniApp-Df51qD2y.css`, `main-CbFsG1H7.css`). All same-origin.

### 9.3 Every external domain used anywhere

| Domain | Where | CSP directive that covers it |
|---|---|---|
| `fonts.googleapis.com` | `index.html:38,41,47`; `tma.html:26,28-31` | `style-src` ✅ (`csp-config.js:22`) |
| `fonts.gstatic.com` | `index.html:39`; `tma.html:27` | `font-src` ✅ (`csp-config.js:30`) |
| `telegram.org` | `index.html:56`; `tma.html:34` | `script-src` ✅ (`csp-config.js:21`) — exact host, does **not** cover `*.telegram.org` |
| `api.asellaorganic.com` | `VITE_API_URL` at build time | `connect-src` ✅ (`csp-config.js:26`) |
| `i.ytimg.com` | `YouTubeFacade.tsx:55` poster | `connect-src` ✅ and `img-src https:` ✅ |
| `lh3.googleusercontent.com` | `StorySection.tsx:37` hardcoded hero image | `connect-src` ✅ and `img-src https:` ✅ |
| `www.youtube-nocookie.com` | `YouTubeFacade.tsx:40` iframe | `frame-src` ✅ (`csp-config.js:32`) |
| `www.youtube.com` | `VideoManagementPage.tsx:9,13` | `frame-src` ✅ |
| `static.cloudflareinsights.com` | Cloudflare RUM auto-injection | `script-src` ✅ (`csp-config.js:21`) |
| `cdnjs.cloudflare.com` | Cloudflare font/asset proxy | `style-src`, `font-src` ✅ |
| `images.unsplash.com` | `BestSellers.tsx:58` **placeholder image** | `img-src https:` ✅ only |
| `drive.google.com`, `app.box.com`, `i.imgur.com`, `raw.githubusercontent.com` | `utils/image.ts:58,80,93,105` (runtime user data) | `img-src https:` ✅ only |
| `t.me`, `wa.me`, `facebook.com`, `instagram.com`, `tiktok.com`, `maps.app.goo.gl`, `afro-tech-et.vercel.app`, `youtu.be` | `Footer.tsx:60,64,72,108-111`, `ContactSection.tsx:94,108`, `Reviews.tsx:8-17` | navigations only, not subresources — **no CSP directive needed** |

**Not covered anywhere in the CSP:** `images.unsplash.com` is a runtime `<img src>` and is permitted only by the `img-src https:` wildcard.

### 9.4 Helmet CSP vs `.htaccess` CSP — differences

Both derive from `csp-config.js`, so the directive **sets are identical**. `frontend/scripts/postbuild.js:14-24` converts camelCase → kebab-case and joins with `; `; `frontend/scripts/check-csp.js:15-20, 28, 37-42` verifies byte equality with the built `.htaccess`.

| Difference | Helmet (backend responses) | `.htaccess` (SPA responses) |
|---|---|---|
| `script-src-attr 'none'` | **PRESENT** — Helmet merges `getDefaultDirectives()` (`backend/node_modules/helmet/index.cjs`), and `csp-config.js` does not override it | **ABSENT** |
| `upgrade-insecure-requests` | rendered with an empty value (`csp-config.js:35`) | rendered with an empty value, **producing a trailing space** in the header string (`dist/.htaccess:118`, length 682) |
| Enforcement surface | Express responses only — the API and `backend/public/` static files. The backend **does not** serve the SPA (`app.ts:92` serves `backend/public`) | All frontend HTML, JS, CSS, images, `sw.js`, `manifest.webmanifest` |
| Duplicate-header risk | N/A | The comment at `.htaccess:86-90` documents that a hand-written CSP here previously coexisted with the generated one; browsers intersect policies, the stricter won, and YouTube broke. `check-csp.js` cannot detect a duplicate because its regex is `Header set Content-Security-Policy` and does not match `Header always set` (`MINIAPP_CLOUDFLARE_RUNBOOK.md` §11.2) |
| `backend/public/.htaccess` | **DOES NOT EXIST** — verified. `backend/public/` holds only `cache/img` and `uploads` | — |

**Domains allowed in one but not the other: none.** Both come from the same object. The *practical* asymmetry is the missing `script-src-attr 'none'` in the Apache policy — inline event handlers on the SPA are blocked by `script-src` only if `'unsafe-inline'` is absent from `script-src`, which it is; so the practical gap is small but real for `style` attributes, where both allow `'unsafe-inline'`.

### 9.5 What is *not* covered by either policy

- `securityHeaders.ts:24-39` (dead) allows `img-src … https://*.googleusercontent.com https://drive.google.com` — neither live policy does. If it were ever mounted, YouTube (`frame-src 'none'`) and the Telegram SDK (`script-src 'self'`) would both break.

---

## 10. Deployment artifacts

### 10.1 `frontend/public/.htaccess` (114 lines) — full contents

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
</IfModule>

# ── 0. Telegram Mini App — standalone document ────────────────────
<IfModule mod_rewrite.c>
  RewriteRule ^tma/?$          /tma.html [END]
  RewriteRule ^telegram-store/?$ /tma.html [END]
</IfModule>

# ── 1. SPA fallback ────────────────────────────────────────────
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]
  RewriteRule . /index.html [L]
</IfModule>

# ── 2. mod_deflate ─────────────────────────────────────────────
AddOutputFilterByType DEFLATE text/html text/css text/javascript application/javascript \
  application/json application/xml image/svg+xml font/ttf font/opentype

# ── 3. mod_expires ─────────────────────────────────────────────
ExpiresActive On  + ExpiresByType for images (1y), text/css + text/javascript +
  application/javascript (1 month), fonts (1y), text/html + application/json (0 seconds)

# Cache-Control via mod_headers
<FilesMatch "\.(js|css)\.(map|br|gz)$">            immutable 1y   (:65-67)
<FilesMatch "\.(webp|avif|jpg|jpeg|png|gif|svg|ico)$"> immutable 1y (:70-72)
<FilesMatch "\.(woff2?|ttf|otf|eot)$">             immutable 1y   (:75-77)
<FilesMatch "\.(html)$">                            no-cache, must-revalidate (:80-82)

# ── 4. Security headers (:91-104)
Header always set X-Content-Type-Options "nosniff"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
Header always set Permissions-Policy "geolocation=(), camera=(), microphone=(), payment=(), usb=()"
Header always set X-Frame-Options "SAMEORIGIN"

# ── 5. Block dotfiles (:106-109)
<FilesMatch "^\.(?!htaccess)"> Require all denied </FilesMatch>

# Redirects — LAST, outside any IfModule (:110-114)
RewriteCond %{HTTPS} off
RewriteCond %{HTTP:X-Forwarded-SSL} !on
RewriteCond %{HTTP_HOST} ^asellaorganic\.com$ [OR]
RewriteCond %{HTTP_HOST} ^www\.asellaorganic\.com$
RewriteRule ^(.*)$ "https\:\/\/www\.asellaorganic\.com\/$1" [R=301,L]
```

### 10.2 Does it match the "documented" version?

`backend/deployment guide.md` Appendix A (`:206-299`) describes: ① Force HTTPS redirect **first**, ①b apex→www, ② SPA fallback, **②b `ErrorDocument 404 /offline.html`**, ③ deflate, ④ expires/headers, ⑤ a single security+CSP block with `X-Frame-Options: DENY`, ⑥ dotfile block.

| Criterion | Shipped `.htaccess` | Verdict |
|---|---|---|
| Redirects **first**, then SPA fallback | Redirects are **last** (`:110-114`), after `RewriteRule . /index.html [L]` (`:25`) | **NO** |
| SPA fallback | Present (`:19-26`) | YES |
| One single CSP block | CSP is **absent** from the source file; it is appended to `dist/.htaccess:116-119` by `postbuild.js:46-51` | YES in the built artifact |
| Apex → www redirect | Present (`:112-114`) but unreachable due to ordering | **Effectively NO** |
| `ErrorDocument 404` | **ABSENT** | **NO** |
| `X-Frame-Options` | `SAMEORIGIN`, not `DENY` | Diverges (deliberately — `.htaccess:97-102`) |

**Ordering defect:** `RewriteRule . /index.html [L]` at `:25` is `[L]`-terminated, so mod_rewrite processing stops there and the HTTPS/www redirect at `:110-114` is never evaluated for any request that falls through to the SPA fallback. `backend/deployment guide.md` §7 records this exact symptom: *"apex returning 200 instead of 301 → redirect rule is below the SPA fallback `[L]`"*.

`dist/.htaccess` is 119 lines — a byte-identical copy of the 114-line source plus the 5-line CSP block appended at `:116-119`.

### 10.3 Build outputs

`frontend/dist/` (present, gitignored):

| Item | Notes |
|---|---|
| `.htaccess` | 6 276 B, 119 lines, generated |
| `index.html` | 3 297 B — 66 lines |
| `tma.html` | 2 160 B |
| `sw.js` | 3 232 B — `CACHE_VERSION = 'v-2176a2dd'` at `:16` |
| `manifest.webmanifest` | 849 B |
| `offline.html` | 947 B |
| `polyfills.js` | 482 B |
| `favicon.png` | 14 127 B |
| `robots.txt` | 71 B — references `/sitemap.xml`, **which is not shipped** |
| `llms.txt` | 260 B |
| `assets/` | 51 files — 49 hashed `.js`, 2 `.css`, 1 `.woff2` |
| `image/` | 35 files in `dailyimages/` (11), `products/` (22), `receipt/` (2) |
| `icons/` | **DOES NOT EXIST** — manifest + apple-touch-icon + SW precache all reference it |

`backend/dist/` also present (gitignored), and `backend/dist.zip` (gitignored).

`frontend/public/`: `.htaccess`, `favicon.png`, `llms.txt`, `manifest.webmanifest`, `offline.html`, `polyfills.js`, `robots.txt`, `sw.js`, `image/{dailyimages,products,receipt}`.

### 10.4 Deploy scripts

| Script | Location | Notes |
|---|---|---|
| `backend/scripts/deploy.sh` | 6 749 B | SSH deploy to YegaraHost: local build check → pull → install deps → build frontend → migrate. **First-time setup requires editing a CONFIGURE block in the file.** |
| `backend/scripts/YEGARAHOST_DEPLOY_RUNBOOK.sh` | 11 199 B | Manual step-by-step runbook; generates secrets via `node -e` and instructs `cp backend/.env.production.example …` |
| `backend/scripts/backup.sh` | 4 567 B | `mysqldump` + 7-day rolling window; documented crontab `0 2 * * *` |
| `backend/scripts/data-retention.ts` | — | Nightly anonymisation (**references a non-existent `referrals` table**) |
| `frontend/scripts/postbuild.js` | 158 lines | Appends the CSP, injects the SW version, and runs the inline-script gate |
| `frontend/scripts/check-csp.js` | 44 lines | `npm run check-csp` — compares `dist/.htaccess` against `csp-config.js` |
| `ecosystem.config.cjs` | root | PM2, `instances: 1`, `fork` |

### 10.5 How `dist/` gets zipped

**UNVERIFIED — no script in the repo performs the zipping.** The procedure is documented only in `backend/deployment guide.md`:
- §2 golden rules (`:28-39`): never ship `.htaccess` in the frontend zip (`:29`); prefer **SFTP > 7-Zip > Windows/PowerShell zip + `chmod`** (`:76`).
- §5 (`:89-103`): zip the **contents** of `dist/` **without `.htaccess`**; `find … chmod u+w` on `assets/` and `image/`; `unzip -o` on the server; **always delete `dist.zip`** because left in `public_html` it is publicly downloadable (`:102`); then purge the Cloudflare cache.
- §4 (`:62-85`): zip `backend/dist/` plus manifests, `chmod -R u+w`, `unzip -o`, `rm -f dist.zip`, `pkill -9 -f "asella-monorepo/backend"`, restart.

`.github/workflows/ci.yml` job 3 (`deploy-check`, `:159-172`) only `echo`s a banner. **CI deploys nothing.**

### 10.6 DEPLOYMENT docs in the repo

| Doc | Size | Content |
|---|---|---|
| `backend/deployment guide.md` | 314 B path, ~314 lines | cPanel/CloudLinux + Passenger + LiteSpeed runbook. **UNTRACKED in git.** §2 golden rules (28-39), §3 pre-deploy checklist (43-58), §4 backend deploy (62-85), §5 frontend deploy (89-103), §6 six-step verify (107-153), §7 18-row troubleshooting table (156-177), §8 DB notes (181-191), §9 security housekeeping (195-202), Appendix A canonical `.htaccess` (206-299), Appendix B commands (303-314). **Contains the stale `FRONTEND_URL` CORS instruction (`:32`) and a stale Appendix-A CSP (`:292`) that lacks `https://telegram.org` in `script-src`.** |
| `DEPLOYMENT_GOTCHAS.md` | 71 lines | 7 documented production incidents: SW stale cache (5-11), CSP drift (13-19), dead `ALLOWED_ORIGINS` (21-26), SEO false positives (28-34), Drive image resolution (36-40), **CSP blocks inline scripts (42-55)**, **the "Ghost" duplicate catalog & data validation (57-71)**. Intro says "three common failure modes" but there are 7 — stale. |
| `MINIAPP_CLOUDFLARE_RUNBOOK.md` | 927 lines | Telegram Mini App + Cloudflare tunnel operations. §11 "Known defects" (784-851) tags 8 items fixed/open. **Stale: `:147` claims the highest migration is `023_…`; the real highest is `025_sms.sql`.** |
| `setup.md` | 9.6 KB | Dev/deploy/Telegram setup. **Stale per `MINIAPP_CLOUDFLARE_RUNBOOK.md:573-583`: `setup.md:129` claims the backend port is 3001 for `telegram:poll`** — `src/scripts/telegram-poll.ts:16` now also defaults to 3001 via `process.env.PORT`, so this specific claim is now correct. Still recommends ngrok (`:923`). |
| `README.md` | 3.4 KB | Pre-deployment checklist + local dev setup. **Stale `FRONTEND_URL` at `:14`.** |
| `architecture.md`, `api.md`, `database.md`, `decision.md`, `project.md`, `project_context.md`, `CHANGELOG.md`, `report.md`, `rule.md`, `agent.md` | — | Architecture / API / schema / ADR / project docs. `database.md` describes `products.id` as `INT AUTO_INCREMENT` — **wrong**, it is `CHAR(36)`. |
| `ecosystem.config.cjs` | — | PM2 definition; contradicts the Passenger-based deployment guide. |

---

## 11. Environment variables

### 11.1 Backend — `process.env.*` read in `backend/src/`

| Variable | Read at | Purpose |
|---|---|---|
| `NODE_ENV` | `app.ts:98`, `app.ts:331`, `routes/auth.ts:39`, `middleware/securityHeaders.ts:42` | production branching |
| `PORT` | `server.ts:12`; `scripts/telegram-poll.ts:16` | listen port |
| `TRUST_PROXY` | `app.ts:56` | express trust proxy hop count |
| `ALLOWED_ORIGINS` | `app.ts:101` | CORS allowlist |
| `JWT_SECRET` | `middleware/auth.ts:42`, `lib/security.ts:17`, `routes/orders.ts:114,116`, `routes/affiliatePortal.ts:77` | JWT sign/verify, reset-token HMAC |
| `DATABASE_URL` | `config/db.ts:8` | fallback DSN |
| `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_PORT` | `config/db.ts:16-20` | pool |
| `REDIS_URL` | `middleware/rateLimit.ts:20-21` | shared rate-limit store |
| `TELEGRAM_BOT_TOKEN` | `app.ts:234`, `lib/telegram.ts:10,252`, `routes/auth.ts:295`, `routes/telegram.ts:153,1555,1587`, `scripts/telegram-poll.ts:12` | bot API + Mini App HMAC root key |
| `TELEGRAM_WEBHOOK_SECRET` | `lib/security.ts:54`, `routes/telegram.ts:50,1556,2334`, `scripts/telegram-poll.ts:13` | webhook header verification |
| `TELEGRAM_ADMIN_CHAT_ID` | `lib/telegram.ts:309,338,512,532,600,612`, `routes/appointments.ts:20`, `routes/orders.ts:239,241` | admin notifications |
| `TELEGRAM_DELIVERY_GROUP_ID` | `lib/telegram.ts:389`, `routes/telegram.ts:1047,1149` | delivery broadcast |
| `TELEGRAM_MINIAPP_URL` | `lib/telegram.ts:292`, `routes/telegram.ts:43,44` | Mini App deep link |
| `PUBLIC_URL` | `routes/telegram.ts:46,1562,2333` | webhook/button base URL |
| `SMTP_USER`, `SMTP_PASS` | `lib/mailer.ts:20,31,32` | SMTP auth |
| `SMTP_SERVICE` | `lib/mailer.ts:29` | Nodemailer service name |
| `SMTP_FROM` | `lib/mailer.ts:40` | From address |
| `GOOGLE_SPREADSHEET_ID` | `lib/sheets.ts:6,29` | Sheets mirror |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | `lib/sheets.ts:6,13,14` | Sheets auth |
| `GOOGLE_SERVICE_ACCOUNT_PATH` | `lib/sheets.ts:6,10,11` | Sheets auth |
| `CLOUDINARY_URL` | `lib/cloudinary.ts:6` | presence check only |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | `lib/cloudinary.ts:6,8,9,10` | upload config |
| `SMSETHIOPIA_API_KEY` | `lib/sms.ts:60,81` | SMS provider |
| `SMS_SENDER_LABEL` | `lib/sms.ts:77` | display label |
| `SMS_DISPATCH_ENABLED` | `lib/sms.ts:69` | kill switch |
| `SMS_SEND_TIMEOUT_MS` | `lib/sms.ts:179` | per-send timeout |
| `RETENTION_YEARS` | `src/scripts/data-retention.ts:12`, `backend/scripts/data-retention.ts:19` | anonymisation window |

**Backend scripts outside `src/`:** `migrate.cjs:84-88` and `scripts/audit_query.cjs:6-10` also read `DB_HOST/DB_USER/DB_PASSWORD/DB_NAME/DB_PORT`. `create-admin.js` reads `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_FULL_NAME`, `ADMIN_ROLE`. `scripts/reset_pwd.js` and root `reset-dawit-password.js` embed credentials in code.

### 11.2 Validated-but-never-read (declared in `config/env.ts`, no reader anywhere in `src/`)

| Variable | Declared | Read? |
|---|---|---|
| `SMS_DISPATCH_INTERVAL_MS` | `env.ts:66` | **NO** — no dispatcher exists |
| `SMS_DISPATCH_BATCH_SIZE` | `env.ts:67` | **NO** |
| `SMS_MAX_CAMPAIGN_COST_ETB` | `env.ts:72` | **NO** |
| `SMS_MAX_DAILY_COST_ETB` | `env.ts:73` | **NO** |
| `SMS_STATUS_COOLDOWN_MINUTES` | `env.ts:77` | **NO** |
| `SMS_MAX_PER_ORDER` | `env.ts:78` | **NO** |

### 11.3 Documented in `.env.example` / docs but never read

| Variable | Documented at | Read? |
|---|---|---|
| `FRONTEND_URL` | `backend/.env.example`, `README.md:14`, `deployment guide.md:32` | **NO** — code reads `ALLOWED_ORIGINS`. This exact mismatch caused a documented production incident (`DEPLOYMENT_GOTCHAS.md:21-26`) and is still present in two docs. |
| `REFRESH_TOKEN_SECRET` | `.env.example`, `YEGARAHOST_DEPLOY_RUNBOOK.sh` step 1.1 | **NO** — refresh tokens are random bytes, not signed (`middleware/auth.ts:148`). |
| `SENTRY_DSN` | `.env.example` | **NO** — no Sentry in the backend |
| `TELEGRAM_VENDOR_CHAT_ID` | `.env.example` | **NO** |
| `UPLOAD_DIR` | `.env.example` | **NO** — hardcoded `public/uploads` (`routes/upload.ts:14`) |
| `MAX_FILE_SIZE_MB` | `.env.example` | **NO** — hardcoded 5 MB (`routes/upload.ts:22`) |
| `GOOGLE_PRIVATE_KEY`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` | `.env.example` | **NO** — only the JSON/PATH variants are used |
| `SMTP_SERVICE`, `SMTP_FROM` | **not in `.env.example`** but read | — (reverse direction: read but undocumented) |
| `TRUST_PROXY`, `REDIS_URL` | read (`app.ts:56`, `rateLimit.ts:20`) but **absent from `.env.example`** | — |

### 11.4 Frontend — `import.meta.env.*`

| Variable | Read at | Default |
|---|---|---|
| `VITE_API_URL` | `services/api.ts:33`, `store/slices/stockSlice.ts:127`, `telegram/shop/api.ts:17`, `api/telegramAuth.ts:37`, `pages/CommunityVideos.tsx:4`, `pages/VideoManagementPage.tsx:4`, `pages/AnalyticsPage.tsx:48`, `pages/Storefront.tsx:23`, `pages/CustomerOrderTracking.tsx:7`, `pages/ProductsPage.tsx:183,420` | see §8.3 — **11 sites, 3 distinct defaults** |
| `VITE_SENTRY_DSN` | `lib/sentry.tsx:57` | none; `initSentry()` returns `null` and no-ops when unset (`:58-61`). The whole init body is commented out (`:63-101`). |
| `VITE_SENTRY_ENVIRONMENT` | `lib/sentry.tsx:79` — **inside a comment block** | **never read** |
| `VITE_SENTRY_RELEASE` | `lib/sentry.tsx:80` — **inside a comment block** | **never read** |
| `import.meta.env.PROD` | `lib/sw-register.ts:17` | Vite built-in |
| `import.meta.env.MODE` | `components/dashboard/KPICards.tsx:32` (`=== 'test'`) | Vite built-in |

`frontend/.env.example` documents two names, **both commented out**: `VITE_API_URL` (`:16`) and `VITE_CLOUDINARY_CLOUD_NAME` (`:24`) — the latter is **read nowhere** in `src/`.

`frontend/.env.production` is **committed to git** (3 lines, containing only `VITE_API_URL`). `frontend/.gitignore` does not ignore `.env*`. Vite gives `.env.production` precedence over `.env`, and a real process env var overrides the file — this is the documented cause of the "Store tab fails, Account works" symptom in `MINIAPP_CLOUDFLARE_RUNBOOK.md` §11.1.

No `envDir`, `envPrefix`, `define`, or `loadEnv` in `vite.config.ts` → defaults (`VITE_`, project root). No `ImportMetaEnv` typing in any `tsconfig`, which is why `CustomerOrderTracking.tsx:7` and `ProductsPage.tsx:183,420` need `as { env: Record<string,string> }` casts.

### 11.5 Summary of the env-var drift

| Direction | Count | Names |
|---|---|---|
| Read in code, **not** in `.env.example` | 4 | `TRUST_PROXY`, `REDIS_URL`, `SMTP_SERVICE`, `SMTP_FROM` |
| In `.env.example`, **never read** | 10 | `FRONTEND_URL`, `REFRESH_TOKEN_SECRET`, `SENTRY_DSN`, `TELEGRAM_VENDOR_CHAT_ID`, `UPLOAD_DIR`, `MAX_FILE_SIZE_MB`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `SMS_DISPATCH_INTERVAL_MS`, `SMS_DISPATCH_BATCH_SIZE`, `SMS_MAX_CAMPAIGN_COST_ETB`, `SMS_MAX_DAILY_COST_ETB`, `SMS_STATUS_COOLDOWN_MINUTES`, `SMS_MAX_PER_ORDER` |
| Validated in `config/env.ts` but read **only** through `process.env` elsewhere, and not in `.env.example` | 4 | `SMSETHIOPIA_API_KEY`, `SMS_SENDER_LABEL`, `SMS_DISPATCH_ENABLED`, `SMS_SEND_TIMEOUT_MS` are read; `CLOUDINARY_*`, `GOOGLE_*`, `SMTP_*`, `PUBLIC_URL`, `TELEGRAM_*` are **not validated at all** |
| Frontend documented but never read | 3 | `VITE_CLOUDINARY_CLOUD_NAME`, `VITE_SENTRY_ENVIRONMENT`, `VITE_SENTRY_RELEASE` |

---

## 12. Tests

### 12.1 Playwright E2E (root)

`playwright.config.ts` (65 lines): `testDir: "./tests"` (`:21`), `fullyParallel: false` (`:22`), `retries: 1` (`:23`), `timeout: 30_000` (`:24`), `expect.timeout: 8_000` (`:25`), reporters `list` + `html → playwright-report` (`:27-30`), **`use.baseURL: "http://localhost:5173"` (`:33`)**, `headless: true`, `screenshot: only-on-failure`, `video: retain-on-failure`, `trace: on-first-retry`. No `globalSetup`/`globalTeardown`, no `workers`, no `webServer`.

**Three projects** (`:42-63`): `setup` (`**/setup/auth.setup.ts`, no device), `dashboard` (`**/dashboard/*.spec.ts`, `dependencies: ["setup"]`, `storageState: tests/setup/.auth.json`, Desktop Chrome), `public` (`**/auth.spec.ts`, `**/storefront.spec.ts`, no auth, Desktop Chrome).

**`tests/tma-fa.mts`, `tests/tma-probe.mts`, `tests/tma-shot.mts`** are standalone probe scripts, not matched by any `testMatch`.

**Do tests run against production data?**

- The Playwright **browser** target is `http://localhost:5173` — **not production**. ✅
- But the **backend** on `:3001` is whatever happens to be running, and Playwright never starts it. Every authenticated spec therefore writes into whatever database that backend points at. **UNVERIFIED** which database that is at test time.
- 9+ specs perform **real writes**: `tests/dashboard/products.spec.ts` creates 2 products (`:70-86`, `:99-109`) and adjusts inventory (`:184-201`); `users.spec.ts` creates and then deactivates a real staff user (`:70-111`, `:113-129`); `vendor.spec.ts` creates 2 vendor orders (`:48-83`, `:85-102`); `tracking.spec.ts` PATCHes a real order to `Delivered` (`:91-134`); `stock-alert.spec.ts` creates a real stock request (`:38-57`); `new-order.spec.ts` creates a real order (`:35-59`); `affiliates.spec.ts` writes a commission rule (`:39-51`) and creates a real affiliate (`:61-103`).

**`tests/storefront.spec.ts`** covers landing page, product grid population, admin controls hidden from anonymous users, no duplicate product cards (`:47-61` — directly relevant to the ghost-catalog incident), order form opening, no crash on direct navigation (filters out `youtube`/`google`/`doubleclick`/`ERR_BLOCKED_BY_CLIENT` errors at `:92-97`), and that the public fetch hits `GET /api/products` not `/api/products/all` (`:101-118`).

**Missing from E2E:**
- No test for the service worker, offline mode, cache invalidation, or update flow.
- No CSP assertion of any kind.
- No test for image rendering / 404 fallbacks.
- No test for the Telegram Mini App (the `.mts` probes are manual scripts).
- No test that duplicate `(name, package_size)` creation is rejected at the API level.
- No test for the affiliate portal beyond the dashboard roster page.
- **Playwright never runs in CI** — `.github/workflows/ci.yml` (172 lines) contains no `playwright install` and no `playwright test`.

**Committed artifacts:** `playwright-report/` (47 files) and `test-results/` (43 files) are tracked by git. `tests/.gitignore` (4 lines) contains `test-results/` and `playwright-report/` **without a leading slash**, so they only match inside `tests/` — and the artifacts live at the repo root. The root `.gitignore` has a `# Testing` section (`:51-53`) containing only `.nyc_output/` and `coverage/`. The committed `error-context.md` files contain the absolute path `C:\Users\Yonas\AppData\Local\ms-playwright\...` — **they reveal the OS username**, and the identical error in all of them shows the last recorded run never launched a browser.

**Hardcoded literal credentials committed:** `tests/auth.spec.ts:8-9`, `tests/setup/auth.setup.ts:16-17`, `.env.test.example:5-6` — admin username and password as string literals in the `??` fallbacks. Values not reproduced here. These are the same credentials `README.md:23` tells you to change on first login.

### 12.2 Backend tests (Jest)

`backend/jest.config.js` (66 lines): ESM preset, `testEnvironment: node`, `moduleNameMapper` strips `.js`, **`testMatch: ["<rootDir>/tests/**/*.test.ts", "<rootDir>/tests/**/*.spec.ts"]` (`:24-27`)**, coverage always on (`:29`) with thresholds 40/38/49/40 (`:40-47`), `testTimeout: 30_000`, `maxWorkers: 1`, `forceExit`, `detectOpenHandles`, **`globalSetup: tests/setup/globalSetup.ts` (`:54`)**, `globalTeardown` (`:55`).

- `backend/tests/unit/` — 20 files.
- `backend/tests/integration/` — 9 files.
- `backend/src/__tests__/health.test.ts` — **NEVER RUNS**, because `testMatch` is rooted at `tests/`.
- `backend/tests/setup/isomorphic-dompurify-mock.mjs` — **orphaned**; not in `setupFiles` or `moduleNameMapper`.
- `frontend/src/setupTests.ts` is tracked but `vitest.config.ts:15` references only `./tests/setup.ts`.

`backend/tests/setup/globalSetup.ts` (43 lines) loads `dotenv/config` (i.e. reads `backend/.env`) and connects using `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME` (`:26-30`), then runs `SELECT 1` (`:35`). **Its docstring at `:3` claims it "Creates a separate test database schema" — it does not.** There is no test schema, no transaction wrapper, and no teardown of created rows beyond per-file `afterAll` DELETEs.

**Classification (29 test files):**

| Class | Files |
|---|---|
| Pure unit, no DB, no network | 7 — `unit/{commission, sms-normalize, security, utils, telegram-auth, middleware, customer-activity}.test.ts` |
| Network mocked via `globalThis.fetch` swap | 2 — `unit/{telegram-lib, sms-lib}.test.ts` |
| Writes to the real filesystem | 1 — `unit/upload.test.ts` (`public/uploads/`, partial cleanup at `:33-43`) |
| **Hits a live DB** | **19 of the 20 `tests/unit/` files + all 9 integration files** |

`unit/commission.test.ts` is the one genuinely well-designed suite (percentage/fixed caps, min-order threshold, DECIMAL(12,2) rounding, safety bounds — `commission.test.ts:22-117`).

`integration/commission-rules.test.ts` (601 lines) is the largest and the most valuable (reversal, precedence, portal isolation, soft-delete).

**Highest-risk test statement:**
```ts
// backend/tests/integration/commission-rules.test.ts:106-108
await pool.query(`UPDATE referral_configs SET is_active = FALSE WHERE is_active = TRUE`);
```
Unguarded, global, non-transactional. `afterAll` (`:142`) only deletes rules it created — it does **not** restore previously-active ones. Pointed at a production `DB_NAME`, this permanently disables affiliate commission.

`backend/tests/setup/isomorphic-dompurify-mock.mjs` exists but is not wired.

### 12.3 Frontend tests (Vitest)

`frontend/vitest.config.ts` (33 lines): `environment: jsdom`, `globals: true`, `setupFiles: ["./tests/setup.ts"]`, v8 coverage with thresholds 65/70/70/70 (`:21-26`), `testTimeout: 10_000`, alias `@ → ./src`.

`frontend/tests/setup.ts` (63 lines): `vi.mock("axios", …)` (`:10-23`), `window.matchMedia` stub (`:26-38`), `window.location` redefined (`:41-51`), `console.error` silenced for `"Warning:"` (`:54-63`).

**11 test files, ~90 `it()` blocks, all axios-mocked, no real network or DB:**
`tests/components/{CustomersPage, KPICards, OrderTracking, StockAlertPage}.test.tsx`, `tests/store/slices.test.ts`, `src/App.test.tsx`, `src/components/affiliates/AffiliateReportPanel.test.tsx`, `src/pages/{AffiliateControlPage, AffiliateControlPage.responsive, TelegramStore}.test.tsx`, `src/telegram/shop/i18n.test.ts`.

Genuinely valuable ones: `users.spec.ts:131-141` (2FA secrets never appear in the DOM), `i18n.test.ts:59` (no untranslated keys in the shipped dictionaries), `slices.test.ts` (auth/ui/stock reducers incl. localStorage persistence).

**Not covered by any frontend test:** `services/api.ts` (the 401-refresh path), `utils/image.ts` (the whole cloud-storage normaliser), `lib/sw-register.ts`, `ProtectedRoute`/`AffiliateRoute` guards, `hooks/useProducts.ts`.

### 12.4 CI — `.github/workflows/ci.yml` (172 lines)

Triggers: `push` and `pull_request` on `main` and `develop` (`:6-10`).

| Job | Lines | What |
|---|---|---|
| `backend` | 14-100 | MySQL 8.0 service (`asella_test`, ephemeral throwaway creds committed at `:22-25`), Node 24, `npm ci`, `typecheck`, `lint`, `log_bin_trust_function_creators=1`, **`node migrate.cjs`** (`:69-70`), unit tests with coverage (`:72-80`), **integration tests with `continue-on-error: true` (`:82-90`)**, codecov `continue-on-error` (`:92-97`), `npm audit --audit-level=high` as a hard gate (`:99-100`) |
| `frontend` | 103-156 | Node 24, `npm ci`, `typecheck`, `lint`, `npm run build` with `VITE_API_URL: http://localhost:3001` (`:138-144`), `npm test`, `npm audit --audit-level=high` |
| `deploy-check` | 159-172 | `needs: [backend, frontend]`; **single `echo` step — deploys nothing** |

Secret used by name: `secrets.JWT_SECRET` at `:41`, with a **64-character fallback literal committed in the workflow** (`${{ secrets.JWT_SECRET || '…_ci_environment_64chars_xyz' }}`).

**Posture:** `npm audit --audit-level=high` is a hard gate while integration tests and codecov are `continue-on-error` — inverted risk weighting. Playwright is absent entirely.

### 12.5 Hooks

`backend/.husky/pre-commit` contains exactly `npm test`. **It is never installed:** `backend/package.json:19` sets `"prepare": ""`, so husky never runs `core.hooksPath`. `lint-staged` is a devDependency (`:78`) with **no configuration anywhere** and no `.lintstagedrc*`. If the hook were ever activated, every commit would require a live MySQL.

---

## 13. Dependencies

### 13.1 `npm audit` summary (run 2026-10-10; no fix applied)

| Package | Total | critical | high | moderate | low |
|---|---|---|---|---|---|
| root | 0 | 0 | 0 | 0 | 0 |
| `backend/` | **50** | **4** | **41** | 4 | 1 |
| `frontend/` | **15** | 0 | **10** | 5 | 0 |

**Backend — direct dependencies flagged:**

| Package | Severity | Range | Fix |
|---|---|---|---|
| `concurrently` | **critical** | `9.2.3-9.2.4 \|\| 10.0.0-10.0.5` | available (non-major) |
| `multer` | high | `<=2.3.0` | available |
| `mysql2` | moderate | `<=3.23.0` | available |
| `nodemailer` | high | `<=10.0.5` | available |
| `sharp` | high | `<=0.35.5-rc.1` | available |
| `compression` | high | `<1.8.2` (installed `^1.8.1`) | available |
| `jest`, `jest-environment-jsdom`, `@types/jest` | high | Jest 29 line | **major only** (30.5.2) |
| `nodemon` | high | `>=1.14.11` | downgrade-only fix |

**Backend — transitive critical/high of note:** `handlebars` (critical, via `googleapis`), `proxy-addr` (critical, via Express 5), `shell-quote` (critical), `brace-expansion`/`braces`/`browserslist`/`js-yaml`/`source-map-js`/`undici`/`dompurify`/`qs`/`ip-address`.

**Frontend — direct dependencies flagged:**

| Package | Severity | Fix |
|---|---|---|
| `axios` | **high** | available (`<=1.19.0` affected). **Also entirely unused in `src/`.** |
| `tailwindcss` | high (3 advisories) | **major only** (4.3.3) |
| `@vitest/coverage-v8`, `vitest` | moderate | available |
| transitive: `undici`, `brace-expansion`, `browserslist`, `source-map-js`, `fast-glob`, `chokidar`, `micromatch`, `braces`, `postcss-selector-parser`, `@vitest/mocker`, `baseline-browser-mapping` | high/moderate | mixed |

### 13.2 `package.json` overrides

Only the backend declares them — `backend/package.json:88-91`:
```json
"overrides": { "js-yaml": "^4.1.2", "esbuild": "^0.25.0" }
```
`js-yaml@^4.1.2` is declared but audit still reports `js-yaml` high in the `4.0.0 - 4.3.1` range — the override may not be reflected in the committed lockfile, or the advisory post-dates it. **UNVERIFIED** without `npm ls js-yaml`.
No overrides in the root or frontend `package.json`.

### 13.3 Notable version observations

- `express@^5.2.1`, `typescript@^6.0.3`, `zod@^4.4.3`, `helmet@^8.2.0`, `express-rate-limit@^8.5.2`, `node-cron@^4.6.0`, `@types/node@^25.6.2` — current majors.
- `eslint@^10.4.1`, `@eslint/js@^10.0.1` in both backend and frontend — duplicated rather than hoisted (no workspaces).
- `jsdom@^29.1.1` in backend `dependencies` (not dev) and externally excluded from the tsup build (`package.json:8`) — a test-only package shipped in the production dependency tree.
- `winston@^3.19.0` in backend `dependencies` but **never imported** (`lib/logger.ts` is hand-rolled).
- `express-rate-limit@^8.5.2` in `dependencies` but **never imported** (`middleware/rateLimit.ts` is hand-rolled).
- `axios@^1.16.1` in frontend `dependencies` but **never imported**.
- `crypto@^1.0.1` and `uuid@^14.0.0` in backend `dependencies`; the code uses Node's built-in `crypto` and `crypto.randomUUID()` — both packages appear unused.

---

## 14. Git state

Captured at audit time (2026-10-10).

### 14.1 Branch

```
## main...origin/main
```
On `main`, tracking `origin/main`, **not ahead, not behind** — local matches the remote-tracking ref. Whether the remote-tracking ref is up to date with the real GitHub remote is **UNVERIFIED** (no `git fetch` was performed).

### 14.2 Working tree — 4 modified, 1 untracked

| File | Change |
|---|---|
| `backend/src/app.ts` | **+34/−4.** Replaces `origin.startsWith(allowed)` with an exact-match `isAllowedOrigin()` (`app.ts:122-125`) and adds a dev-only loopback-origin pattern (`app.ts:113, 123`). The commit message in the code comment (`app.ts:115-121`) states the previous implementation *"would accept `https://asellaorganic.com.evil.example` … a real origin-spoofing hole on the deployment that mattered."* |
| `frontend/vite.config.ts` | **+9.** Adds `strictPort: true` (`vite.config.ts:42`) so a stale dev server on 5173 fails loudly instead of silently moving to 5174. |
| `agent.md` | **+6.** New "§5 Local Development Ports" documenting the ports, `strictPort`, and the 403 "CSRF protection: Origin mismatch" symptom. |
| `frontend/src/pages/AffiliateDashboard.tsx` | **+1/−1.** `text-[10px]` → `text-[11px]` on the referral-code label (`:247`). |
| `backend/deployment guide.md` | **UNTRACKED** — the entire 314-line deployment runbook is not in git. |

### 14.3 Last 15 commits

```
975d5ba  mini app modified,affliate action updated v2,sms embeding started,bot updated
ff96069  mini app added, affliate action fixed
ed59b13  bot configuration and mini app added
95cdee8  data base fix and product naming fix
24e1aea  products card reading and products order and duplication fixed
5ef3eac  package cleaning
149997f  products photo updated and all
ca14c0d  Merge branch 'main' of 'https://github.com/.../asella_organic'
27df4ce  redirect fixed
ce9c1e8  toc,pp added and files are compressed
aaba85a  htaccess modified
afb3a18  patch 2
cca5826  patch
a26b674  we fixed the inventory double deduct bug and also remove the buttons background color to be neutral
51e4b38  order bug fixed
```

Dates: `975d5ba` 2026-10-09 23:49:08 +0300 · `ff96069` 2026-10-08 18:02:08 +0300 · `ed59b13` 2026-09-05 18:45:35 +0300. The remaining twelve have no dates shown in this listing; `report.md` records a commit `633a9ea` dated 2026-07-07, so the history spans roughly July → October 2026.

Commit messages are free-form with typos (`affliate`, `embeding`) and several are literally `patch` / `patch 2`.

### 14.4 Are there undeployed working-tree changes?

`main` is level with `origin/main` at `975d5ba` (2026-10-09). The four modified files and the untracked deployment guide exist **only in the local working tree** and are therefore not in any pushed commit.

**Whether production runs `975d5ba` or an earlier commit is UNVERIFIED** — that requires inspecting the deployed filesystem or the Passenger restart log, neither of which is reachable from a read-only source audit.

The `backend/src/app.ts` change is the material one: **if production is running the committed version, the deployed CORS/CSRF matcher still uses `startsWith` and is origin-spoofable.**

### 14.5 Repo hygiene

- 90 Playwright artifact files tracked (`playwright-report/` 47, `test-results/` 43), each embedding the absolute Windows path and the OS username.
- `project.md` and `report.md` are listed in `.gitignore:65-67` yet are tracked (ignore has no effect on already-tracked files).
- `dashboard test/` — a 12-file dead Next.js-style prototype with a space in its directory name, tracked, referenced by nothing.
- ~25 one-off fix/reset scripts tracked at the repo root (`reset_db.js`, `fix_uuids.js`, `check_db.cjs`, …).
- Root `scripts/` is an empty, untracked directory that `DEPLOYMENT_GOTCHAS.md:49` refers to as if it contained `postbuild.js`.

---

## 15. Known problems and risks

Ordered by severity. Each entry maps to at least one of the five recurring incidents: **duplicate product catalogs**, **tag set to `'active'`**, **broken image URLs**, **CSP-blocked inline scripts**, **double-firing scheduled jobs**, **stale service-worker caches**.

### HIGH

| # | Problem | Evidence | Recurrence |
|---|---|---|---|
| H1 | **Origin-spoofing hole in the committed CORS/CSRF matcher.** `origin.startsWith(allowed)` accepts `https://asellaorganic.com.evil.example`. Fixed in the working tree, not committed, and not necessarily deployed. | `app.ts:115-125` (diff); `git status` | — |
| H2 | **Service-worker precache never succeeds.** `cache.addAll` includes two files in a directory that does not exist; the whole `install` `waitUntil` rejects, so nothing is precached — including `/offline.html`. | `public/sw.js:26-27, 32`; `public/icons/` absent | **stale SW** |
| H3 | **The SW's network-first navigation branch is unreachable.** The same-origin stale-while-revalidate branch is matched first, so SPA HTML is served cache-first and `offline.html` is never used for navigations. | `public/sw.js:87-103` before `:105-111` | **stale SW** |
| H4 | **SW cache version is `crypto.randomBytes(4)`, not a content hash.** Every deploy invalidates all three caches for every returning visitor, and the change is invisible to reviewers. | `scripts/postbuild.js:61`; `dist/sw.js:16` | **stale SW** |
| H5 | **Silent, unprompted SW takeover.** Unconditional `skipWaiting()` + `clientsClaim()` with no `onupdatefound`, no update prompt, no reload prompt anywhere in the app. | `public/sw.js:34, 46`; zero matches outside `sw.js` | **stale SW** |
| H6 | **`006_clean_products.sql` is destructive on every run**: `UPDATE products SET active = false WHERE 1=1` and `DELETE FROM stock_snapshots WHERE 1=1`. Any product added since the last run is silently archived and its stock snapshot wiped. | `006:13, 16` | **duplicate catalog** |
| H7 | **The ghost catalog is still seeded in the canonical migration.** `006` inserts `Moringa Seed` and `Moringa powder` as *different names* for the same product; the unique constraint accepts that. The storefront groups by name, so they render as two products. | `006:21-38`; `products.ts:189-193` | **duplicate catalog** |
| H8 | **Duplicate `(name, package_size)` rows are silently created and silently mis-selected.** No application-level pre-check exists; the only guard is the partial DB index, and its violation surfaces as an opaque 500. The `<option value>` is `package_size`, so `find()` always picks the first duplicate. | `products.ts:397-409, 423`; `NewOrderPage.tsx:337, 348` | **duplicate catalog** |
| H9 | **`POST /api/products/bulk` skips `validateProductData` entirely** — it can insert size-in-name and Drive/Dropbox image URLs that the single-create route rejects. | `products.ts:649-707` vs `:389` | **broken images**, **duplicate catalog** |
| H10 | **`securityHeaders.ts` is a live landmine**: dead code with a stricter, incompatible CSP (`script-src 'self'` without telegram.org, `frame-src 'none'`) and a docstring instructing `app.use(securityHeaders)`. | `middleware/securityHeaders.ts:5-6, 24-39` | **CSP** |
| H11 | **`x-telegram-init-data` presence alone disables the CSRF Origin check**, regardless of validity. | `app.ts:150-157` | — |
| H12 | **JWT revocation fails open.** A DB error on the `session_blocklist` query is swallowed and the request proceeds. | `middleware/auth.ts:102-104` | — |
| H13 | **Hardcoded admin credentials committed in three files**, plus a hardcoded DB connection string and plaintext password in `backend/reset_pwd.js`. | `tests/auth.spec.ts:8-9`, `tests/setup/auth.setup.ts:16-17`, `.env.test.example:5-6`, `reset_pwd.js` | — |
| H14 | **A test performs an unguarded global `UPDATE`** that would permanently disable affiliate commission if pointed at the live database. | `integration/commission-rules.test.ts:106-108` | — |
| H15 | **The `referrals` table referenced by the retention job does not exist**, so the nightly job would fail. Two copies of the script carry the defect. | `src/scripts/data-retention.ts:58`; no `CREATE TABLE referrals` in any migration | — |
| H16 | **`img-src 'self' data: https:` is effectively `img-src *`.** Combined with `_url`-suffixed keys bypassing DOMPurify (`lib/security.ts:33`) and no host allowlist in `resolveProductImage` (`utils/image.ts:31`), any stored `image_url` can exfiltrate data to any HTTPS host. | `csp-config.js:23` | **broken images** |
| H17 | **HTTPS→www redirect is unreachable** — it sits after `RewriteRule . /index.html [L]` and outside any `<IfModule>`. | `public/.htaccess:110-114` vs `:25` | — |

### MEDIUM

| # | Problem | Evidence |
|---|---|---|
| M1 | **PWA icons are entirely missing.** `public/icons/` does not exist; `index.html:27` (`apple-touch-icon`), `index.html:34` (OG image), `manifest.webmanifest:11-30`, and the SW precache all reference files that 404. | — |
| M2 | **`tag` can still be set to `'active'`.** The Zod enum on `POST`/`PATCH` (`schemas/index.ts:167, 190`) prevents it *through those routes only*. `POST /bulk` bypasses it, `006_clean_products.sql` writes raw columns, and `add_products.ts` inserts raw. `GET /products/health` (`products.ts:303-310`) exists to detect it but is admin-only and manual. | — |
| M3 | **Broken image URLs survive migration 019.** `utils/image.ts:228` still references `Neuherb Shilajit gel 20g.png`; the file on disk is `Neuherb Shilajit Gummies  (30 Gummies ).png`. `Shilajit Oil.png` exists but no rule returns it. | — |
| M4 | **The SW returns an HTML document as an image fallback** (`offline.html` at `sw.js:80`), and four Mini App/Checkout `<img>` elements have no `onError` at all. | `sw.js:80`, `StoreTab.tsx:133-144` etc. |
| M5 | **Three pages default their API base to `http://localhost:3001`** — a production build without `VITE_API_URL` makes the end user's browser call their own machine. | `CommunityVideos.tsx:4`, `VideoManagementPage.tsx:4`, `AnalyticsPage.tsx:48`, `Storefront.tsx:23` |
| M6 | **Three authenticated `/api/v1/*` calls omit `credentials`**, so they are unauthenticated under the cookie scheme. | `Checkout.tsx:141`, `CommunityVideos.tsx:17`, `VideoManagementPage.tsx:39` |
| M7 | **`Frontend/.env.production` is committed** and overrides tunnel work. | file is tracked |
| M8 | **No role guard on any dashboard route.** `ProtectedRoute`'s `requiredRole` is implemented but never passed; `/dashboard/users`, `/dashboard/affiliates`, `/dashboard/audit-log` are client-reachable by any role. Server-side enforcement saves this. | `ProtectedRoute.tsx:8,11,18` vs `App.tsx:74-91` |
| M9 | **No 404 route.** Unknown URLs render a blank page; Apache never returns HTTP 404 for client routes. | `App.tsx`, `.htaccess:22-25` |
| M10 | **Client-side auth guard trusts `localStorage['user']`** with no boot-time re-hydration. `JSON.parse` is unguarded and throws at module load on corrupt data. | `authSlice.ts:18-19` |
| M11 | **Duplicate route tables.** `/api/auth/staff` (4 routes) duplicates `/api/staff` (11 routes); `PUT /staff/:id/password` and `PATCH /staff/:id/password` are the same operation. | `routes/auth.ts:405-480` vs `routes/staff.ts` |
| M12 | **Dead route file** `backend/src/routes/orders.patch.ts` (127 lines) with conflicting auth; never imported. | grep |
| M13 | **`notification.test.ts` and `notifications.test.ts` are near-duplicate suites** running against the same DB. | `tests/unit/` |
| M14 | **19 of 20 "unit" tests require a live MySQL**, and `globalSetup`'s docstring falsely claims it creates a test schema. | `tests/setup/globalSetup.ts:3, 29` |
| M15 | **Integration tests are `continue-on-error` in CI; Playwright is not in CI at all.** | `ci.yml:82-90` |
| M16 | **CI deploy job is a no-op echo**; deployment is entirely manual. | `ci.yml:159-172` |
| M17 | **The pre-commit hook is inert** (`"prepare": ""`) and would require a live database if it were active. `lint-staged` has no config. | `package.json:19`, `.husky/pre-commit:1` |
| M18 | **Doc contradicts code on the CORS env var** — `deployment guide.md:32` and `README.md:14` say `FRONTEND_URL`; the code reads `ALLOWED_ORIGINS`. Following the guide breaks production CORS. | — |
| M19 | **Doc contradicts code on the migration ceiling** — `MINIAPP_CLOUDFLARE_RUNBOOK.md:147` says `023_…`; the highest is `025_sms.sql`. | — |
| M20 | **Deployment guide Appendix A CSP is stale** — it lacks `https://telegram.org` in `script-src` and has `frame-ancestors 'self'`, which would break the Mini App SDK and the Telegram webview. | `deployment guide.md:292` |
| M21 | **The entire 314-line deployment guide is untracked in git.** | `git status` |
| M22 | **Cloudinary config bug**: `cloudinary.config()` is called with the triple even when only `CLOUDINARY_URL` is set. | `lib/cloudinary.ts:6-10` |
| M23 | **`POST /api/upload/receipt` is unauthenticated** and writes attacker-supplied files (magic-byte-checked, 5 MB capped) into the public web root. | `routes/upload.ts:65-95` |
| M24 | **The idempotency middleware is opt-in and the frontend never opts in**, so a double-submitted order creates two orders and sends two Telegram broadcasts. | `idempotency.ts:41-46`; no `Idempotency-Key` in `frontend/src` |
| M25 | **`npm audit`: 50 backend (4 critical) + 15 frontend (10 high)**; `axios`, `winston`, `express-rate-limit`, `crypto`, `uuid` are installed but unused. | §13 |
| M26 | **`NewOrderPage` submits blank rows** (`payload.items` is an unfiltered `.map`) and never sends the `deliveryFee` it displays. | `NewOrderPage.tsx:159-165, 87-94, 457-460` |
| M27 | **`OrderForm.tsx` submits unmatched items at 1 ETB** (`Math.max(price, 1)`) and does not reset `packageSize` when the item changes. | `OrderForm.tsx:129, 362` |
| M28 | **Every product `<img>` in the Mini App and Checkout has no `onError`**, so a broken URL renders the browser's broken-image glyph. | `StoreTab.tsx`, `DiscoverTab.tsx`, `DetailView.tsx`, `CartView.tsx`, `Checkout.tsx` |
| M29 | **`authSlice` has no async thunks and no re-hydration**; `stockSlice.receiveVendorOrder` is never dispatched and has no `extraReducers` case. | `stockSlice.ts:228-240, 293-337` |
| M30 | **`robots.txt` points at `/sitemap.xml`, which is not shipped.** | `public/robots.txt:4` |

### LOW

| # | Problem | Evidence |
|---|---|---|
| L1 | `winston`, `express-rate-limit`, `crypto`, `uuid` are dependencies but unused; `axios` is a frontend dependency but unused; `jsdom` is a backend **runtime** dependency excluded from the tsup build. | §13.3 |
| L2 | Logging is split between the structured logger and raw `console.*` in `server.ts`, `lib/telegram.ts:624,658`, `middleware/2fa.ts:53`, `middleware/affiliateAuth.ts:120`, `routes/upload.ts:60,92`, `middleware/idempotency.ts:81,155`, `middleware/rateLimit.ts:22,45`. No transports, no rotation. | — |
| L3 | Mixed console content: the logger writes JSON to stdout while `server.ts:15-16` prints ASCII art and `migrate.cjs` prints emoji. `rule.md:§1` mandates a strict zero-emoji policy, which `tests/setup/auth.setup.ts:33`, `tests/setup/globalSetup.ts:17,36,38`, `migrate.cjs:119,143,148,155` and `ci.yml:169` all violate. | — |
| L4 | `pool.getConnection()` sits outside the `try` in several handlers, so pool exhaustion bypasses the local rollback. | `products.ts:539`, `products.ts:659` |
| L5 | Rate limits are per-process unless `REDIS_URL` is set, and `REDIS_URL` is absent from `.env.example`. | `rateLimit.ts:20-23` |
| L6 | `telegram-poll.ts` self-reschedules with `setTimeout` and calls `deleteWebhook()`; it is now opt-in behind `--delete-webhook` (`telegram-poll.ts:22, 89-98`) — the runbook's warning at `MINIAPP_CLOUDFLARE_RUNBOOK.md:561-571` is now stale. | — |
| L7 | Two hardcoded Hibiscus name corrections in the grouping algorithm; changing a product name silently changes which group wins the image. | `products.ts:196-198` |
| L8 | The group's image/description/featured/tag/active come from the **cheapest** variant because of `ORDER BY price ASC`. | `products.ts:160, 200-210` |
| L9 | `GET /api/products/grouped` has no `LIMIT`/`OFFSET`; the comment says "< 100 base products". | `products.ts:155` |
| L10 | `backend/src/__tests__/health.test.ts` never runs; `backend/tests/setup/isomorphic-dompurify-mock.mjs` and `frontend/src/setupTests.ts` are orphaned. | — |
| L11 | `security.test.ts` exists twice — `tests/integration/security.test.ts` (DB-backed) and `tests/unit/security.test.ts` (pure). Confusing. | — |
| L12 | `database.md` documents `products.id` as `INT AUTO_INCREMENT`; it is `CHAR(36) DEFAULT (UUID())`. | `database.md` |
| L13 | `011_order_status_history.sql` recreates a table `001:202` already creates. | — |
| L14 | `migrate_cogs.ts` references `vendor_orders.product_id`, which is not in the inferred schema. | — |
| L15 | `backend/add_products.ts:1` imports `./src/config/db` without the `.js` extension, breaking ESM. | — |
| L16 | `apiCache` caches up to 100 URLs for 60 s and is applied to public product/video GETs, so a catalogue edit can be invisible for up to a minute. | `middleware/apiCache.ts:5-40` |
| L17 | TOTP codes have no replay/step protection within the 30 s window. | `middleware/2fa.ts:49` |
| L18 | `tma.html:20` sets `user-scalable=no`; the Material Symbols stylesheet is render-blocking despite its comment. | `tma.html:20`, `index.html:45` |
| L19 | Dead frontend pages: `pages/AccessDatabasePage.tsx`, `pages/Sidebar.tsx` (a second Sidebar). | — |
| L20 | Root `scripts/` is empty and untracked but referenced in `DEPLOYMENT_GOTCHAS.md:49`. | — |
| L21 | Commit messages are unpoliced: `patch`, `patch 2`, `affliate`, `embeding`. | §14.3 |
| L22 | `ecosystem.config.cjs` (PM2, `instances: 1`) and `deployment guide.md:18` (Passenger, possibly multi-instance) describe different deployments. `deployment guide.md:36` warns that Passenger multi-instance makes cron double-fire. | — |

---

## 16. Open questions

1. **Is production running `975d5ba`, and does it include the `isAllowedOrigin` fix?** Only the working tree has it. Requires reading the deployed `backend/dist/server.js` or the Passenger restart log.
2. **Is the deployment single-instance or multi-instance?** `deployment guide.md:18` says Passenger on cPanel (which can run multiple `lsnode:` processes) while `ecosystem.config.cjs` says PM2 `instances: 1`. The idempotency of J1/J2 holds either way, but the "double Telegram messages" symptom does not.
3. **Is `crontab` configured** for `scripts/backup.sh` and `scripts/data-retention.ts`? `deployment guide.md` Appendix B has a `crontab -l` check, implying one exists; unverified from the source.
4. **Is the live database created with a case-insensitive collation?** Determines whether the `018` unique index actually blocks `'Moringa Seed'` vs `'moringa seed'`. `MINIAPP_CLOUDFLARE_RUNBOOK.md:135-137` says `utf8mb4_unicode_ci`, but `.env.example` does not pin it.
5. **Has `018_unique_product_constraint.sql` actually been applied to production?** Its pre-check `SIGNAL`s and aborts if any active `(name, package_size)` duplicate exists. Whether it succeeded is invisible in the repo.
6. **Is `src/data-retention.ts` or `backend/scripts/data-retention.ts` the live copy, and has either ever run successfully?** Both target a non-existent `referrals` table.
7. **What is the current live row count and duplicate profile of `products`?** `GET /api/products/health` (`products.ts:283`) would answer this but requires a live DB, which this audit did not touch.
8. **Are there active products with `tag = 'active'` or other non-enum values today?** The health endpoint detects it; the repo cannot.
9. **Is `POST /api/upload/receipt` actually reachable unauthenticated in production, and has the uploads directory ever been examined for abuse?** `routes/upload.ts:65`.
10. **Does production run same-origin (`www` serving both) or split (`www` + `api` subdomains)?** `deployment guide.md` §1 describes an `api.` subdomain, but `frontend/src/services/api.ts:33` defaults to a relative base URL and the cookies are `sameSite: strict`. If they are split, cookie auth does not work cross-site and the app is relying entirely on the bearer fallback.
11. **Which external domains actually load in production?** CSP lists `static.cloudflareinsights.com` and `cdnjs.cloudflare.com`, but nothing in the repo loads them — presumably Cloudflare auto-injection. Unverified whether Cloudflare RUM or the font proxy is actually enabled on the zone.
12. **Is `dist.zip` still sitting in `public_html`?** `deployment guide.md:102` warns that a leftover `dist.zip` is publicly downloadable. `backend/dist.zip` exists locally (gitignored); whether one exists on the server is unverifiable from here.
13. **Is `check-csp` run after every deploy, or only manually?** `MINIAPP_CLOUDFLARE_RUNBOOK.md` §10.2 lists it, but CI does not run it and CI does not deploy.
14. **Are `Sentry` / `VITE_SENTRY_DSN` planned or abandoned?** The whole init is commented out (`lib/sentry.tsx:63-101`), yet `main.tsx:14-20` monkey-patches the global `console.error` at module scope to forward to the no-op shim, and `SENTRY_DSN` sits in `.env.example`.
15. **Which CORS origin variable is actually set in cPanel right now?** The code reads `ALLOWED_ORIGINS`; two docs say `FRONTEND_URL`. If `FRONTEND_URL` is set and `ALLOWED_ORIGINS` is not, production falls back to `https://asellaorganic.com` (`app.ts:101`) — which, combined with the unreachable `.htaccess` apex→www redirect (`H17`), is a plausible live-mismatch.
16. **Is `migrate.cjs --reset` safe?** `backend/package.json:18` exposes `db:migrate:reset`; what it drops is unverified.
17. **Were the 90 committed Playwright artifacts ever scrubbed?** They contain an absolute Windows path with the OS username in at least 33 files. If this repo has ever been public, that is a disclosure that cannot be undone by removing the files.
18. **Is the `dashboard test/` prototype meant to be kept?** It duplicates 10 components that already exist under `frontend/src/components/dashboard/`.

---

*End of report. This document is read-only observational output; no project file, database, or server was modified in producing it. No secret values are reproduced anywhere above — environment variables are listed by name only.*