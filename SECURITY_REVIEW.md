# Security Review — Findings and Fixes

Reviewed 2026-10-15 against the codebase as it stood at commit `2c9932a`.

Every finding below was verified by reading the code, not inferred. Where a
recommendation was **not** applied, the reason is stated — in one case because
applying the "obvious" fix would have broken customer checkout.

---

## Fixed in this pass

### 1. Affiliate could render the admin dashboard *(the reported bug)*

`frontend/src/components/ui/ProtectedRoute.tsx` checked `isAuthenticated` but
never the role. Affiliates are real `staff_users` rows, so their session
satisfied it and every `/dashboard/*` route rendered the full admin shell —
sidebar, page names, layout — with each panel then failing on 403.

The API was **never** breached: `referrals.ts` mounts
`router.use(authenticate, authorise("admin"))`, and `authorise()` does compare
`req.user.role`. This was a UI leak, not a data leak. Now redirects to
`/affiliate`.

### 2. Ordering bounced the customer to the staff login

`services/api.ts` answered any failed token refresh with
`window.location.href = "/login"`, unconditionally, from any page. After
`POST /api/orders` succeeded, `OrderForm` fetches `GET /api/orders/:id` for the
receipt; that route required `authenticate`; the anonymous customer got a 401;
the refresh failed; and they were navigated off their own receipt.

The interceptor now clears the stored session and emits an event. Only a
mounted guard reacts, so staff whose session genuinely died are still
redirected, and public pages are left alone.

### 3. `GET /api/orders/:id` — IDOR, full order book readable

`authenticate` with no `authorise`. The handler projects `o.*`, including
customer name, phone and address. Any authenticated principal could read any
order by id. Now `admin, manager, employee, delivery`.

### 4. `GET /api/orders` — same class

Projected `o.*` for every order, 100 per page, to any authenticated role.
Now role-guarded.

### 5. `PATCH /api/orders/:id/status` — **money out, unauthenticated by role**

Only `authenticate`. The `status` value is caller-controlled. One request with
`status: "Delivered"` fires:

- `trg_order_delivered_commission` — **a real affiliate commission is credited**
- inventory deduction
- customer Telegram + SMS notifications

then flipping it to `Cancelled` reverses all of it. Any logged-in affiliate
could mint and reverse commissions. Now `admin, manager, employee` —
deliberately excluding `delivery`.

### 6. Telegram `/link` — unauthenticated PII takeover *(most severe)*

```ts
if (proofOrderId) { /* verify it matches the phone */ }
```

The ownership check was **optional**. Anyone could type `/link +2519xxxxxxx`
from any Telegram account and take over the customer: their `telegram_chat_id`,
their entire order history (backfilled by the next query), and all future
order-status messages. The only surviving guard protected customers who were
*already* linked — every website checkout has a NULL chat id and was claimable
by anyone who knew the phone number.

The `proof_required` outcome and its explanatory message already existed in the
code; the guard was simply never written. Now mandatory. Two help strings were
updated to advertise the full syntax so customers are not left guessing.

### 7. Three stock routes and one product route leaked COGS

`GET /api/stock` returns `stock_value = quantity × unit_cost` — a full
valuation of the catalogue at cost. `GET /api/stock/summary`,
`GET /api/stock/low`, `POST /api/stock/request` (a write, which fires a Telegram
alert) and `GET /api/products/low-stock` were all `authenticate` only. Now
role-guarded, matching the guard their siblings already had.

### 8. Three staff-management routes had no 2FA

`POST /api/staff` (create a user with **any** role), `PATCH /api/staff/:id`
(`role` is in the updatable set) and `PUT /api/staff/:id/password` (reset any
password) each granted permanent takeover with no TOTP.

This was also internally inconsistent: the sibling `PATCH /:id/password` and
`DELETE /:id` already required 2FA, so the control was one endpoint away from
being meaningless. All three now require it. Tests updated to supply a
freshly generated TOTP per call.

### 9. Receipt upload — unauthenticated 5 MB write

`POST /api/upload/receipt` had no guard and no meaningful limit (the general
budget is 600/min, ≈3 GB/min into the account's web root).

> **This route must stay public.** It is the customer uploading proof of
> payment from checkout (`frontend/src/components/storefront/OrderForm.tsx`),
> before they have any account. Adding `authorise` — the instinctive fix — would
> have broken payment for every customer.

Instead it now has a dedicated per-IP budget: 10 uploads per 5 minutes, which
caps the abuse at ~10 MB / 5 min and is still ample for a customer retrying a
receipt.

---

## Open — needs a decision from you

### A. Affiliates and staff share one login endpoint

`POST /api/auth/login` looks up `(email = ? OR username = ?) AND active = true`
with **no role filter**, so an affiliate gets a session from the staff login.
There is no separate `/api/affiliate/login` — that endpoint does not exist.

Today this is contained, because every staff route is now role-guarded. But the
affiliate's token is byte-identical in shape to an admin's apart from one claim.

**The obvious fix is a trap.** Adding `AND role <> 'affiliate'` to the staff
login would stop affiliates logging in *at all*, since there is nowhere else for
them to go. Doing this properly means building a real affiliate login first.
Recommend it as its own change, with its own testing.

### B. Real credentials were committed in the repo — files now removed

**Status: the files are deleted as of `a1b2c3d`, but the exposure is not yet closed.**

`db/sql/004_dummy_data.sql` (279 KB) seeded 11 named accounts — `dawit.admin`,
`mesay.manager`, `yonas.admin` and so on — all sharing **one** bcrypt hash. The
same shared hash repeated in `027_seed_order_lifecycle.sql` and
`028_seed_affiliates.sql`. Two scripts carried plaintext passwords
(`[redacted]`, `[redacted]`).

Removed on 2026-10-15:

```
004_dummy_data.sql  027_seed_order_lifecycle.sql  028_seed_affiliates.sql
029_seed_engagement_telegram_sms.sql  030_seed_edge_cases.sql
032_verify_seed.sql
fix_columns.js  fix_sql.js  fix_uuids.js       (only existed to repair 004)
reset-dawit-password.js  scripts/reset_pwd.js  (plaintext credentials)
```

**Two things still need doing, and the first is not optional:**

1. **Check whether those passwords still work against production, and rotate if
   they do.** Deleting a file does not change a password. This is the actual
   risk — everything else here is hygiene.
2. Decide about history. They remain in git commits even though they are gone
   from the working tree. Rewriting history (`git filter-repo` / BFG) and
   force-pushing would remove them from the log, but that rewrites every commit
   hash for anyone who has cloned — only worth it if the repo is private and you
   are confident nobody else depends on it.

`.env` files were always correctly gitignored and no API keys or tokens were
committed.

---

## Not fixed — deliberate

### C. Order pricing is client-controlled

`unit_price` is taken from the request with `z.coerce.number().min(0)` and
`total` is computed from it. That total drives revenue reporting **and** the
affiliate commission.

This is a genuine revenue-integrity issue and worth fixing properly by
resolving the price server-side from `products`. It is a behavioural change to
pricing, not a guard, so it was left out of a security pass — flagging rather
than doing it silently.

### D. Rate limiting keys on `X-Forwarded-For`

`rateLimit.ts:57` reads the header directly instead of `req.ip`, so a client
that can reach the origin bypassing Cloudflare can forge a fresh bucket per
request and defeat the login limiter.

Changing it to `req.ip` is **not** obviously correct here: it depends on
`TRUST_PROXY` matching the real hop count, and a misconfiguration would put
every user in one bucket. **Confirm whether the cPanel server's IP is directly
reachable** before touching it.

### E. Telegram callback handlers have no authorization

`handleCallback` trusts `callback_data` entirely. A supplier whose
`vendor_chat_id` is recorded on a purchase order can self-approve it via the
`po_accept_*` button, and the message leaks the internal price and the placing
employee's UUID. This needs per-action ownership checks, not a middleware flag.

---

## Lower severity, worth scheduling

| # | Issue | Where |
|---|---|---|
| F | TOTP verify has no rate limit, lockout or replay protection; a code is reusable inside its ~30s window | `middleware/2fa.ts` |
| G | Password-reset "used token" set is in-process and wiped every 20 min, so tokens replay across restarts; the confirm endpoint is unrated | `auth.ts:33` |
| H | Password change does not revoke outstanding access tokens (1h window survives) | `auth.ts`, `staff.ts` |
| I | Public `GET /api/products` returns `unit_cost`, `inventory_quantity`, `low_stock_threshold`; `?active=false` enumerates archived products | `products.ts:53,130,355` |
| J | `GET /api/orders/track/:id` is public and returns full address + internal notes | `orders.ts:380` |
| K | 12 Mini App route catches return raw `err.message`, leaking SQL fragments | `telegram.ts` |
| L | Idempotency middleware persists whole POST bodies, including login tokens, in plaintext for 24h; keys are global, not per-user | `idempotency.ts` |
| M | `two_factor_secret` stored plaintext | `staff.ts:591` |

---

## What is already sound

Not padding — these were checked and are genuinely fine:

- **No SQL injection anywhere.** Every query is parameterised. The one dynamic
  `ORDER BY` resolves through an allow-list, with sort direction forced to
  `ASC|DESC`.
- **CSP, CORS, cookie flags.** No `unsafe-inline` in `script-src`, `object-src
  'none'`, `frame-ancestors` scoped to Telegram, HSTS with preload, `nosniff`.
  Cookies are `httpOnly`, `secure` in prod, `sameSite: 'strict'`. `ALLOWED_ORIGINS`
  is an explicit list — no wildcard, no reflection.
- **Affiliate portal scoping.** Sealed with `authenticate, affiliateOnly`, and
  scope always resolves from the JWT subject. No IDOR — no route accepts an
  affiliate identifier.
- **Upload type validation** uses magic bytes, not the filename or client MIME,
  and the extension is forced from the detected type — so stored XSS via SVG is
  blocked.
- **`authorise()` is never called with an empty role list** anywhere in the app.

---

## Verification

Full backend suite green against MySQL 8 in Docker:

```
Test Suites: 1 skipped, 34 passed, 34 of 35 total
Tests:       7 skipped, 621 passed, 628 total
```

`typecheck`, `lint` and `build` pass for both packages; both dists audited
complete. Frontend `lint` reports 18 pre-existing errors in files unrelated to
these changes.