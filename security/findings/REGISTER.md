# Findings register — Asella Organic

Live register of confirmed security findings. New findings are added at the
bottom of the "Open" table with the next free `ASE-YYYY-NNN` ID.

**Status values:** Open · In progress · Fixed · Accepted (with an expiry) · Retest

**Source documents:** [`../SECURITY_REVIEW.md`](../../SECURITY_REVIEW.md) ·
[`../ZAP_MITIGATION_PLAN.md`](../../ZAP_MITIGATION_PLAN.md) ·
[`../TEST_PLAN.md`](../TEST_PLAN.md)

---

## Latest verification

**Run:** 2026-11-26 · **Target:** local development instance
(`http://localhost:3001`) · **Mode:** active, writes enabled ·
**Result:** 137 checks — 96 pass, 21 fail, 14 warn, 6 skip.

| Suite | Checks | Pass | Fail | Warn | Skip |
|---|---:|---:|---:|---:|---:|
| preflight | 12 | 11 | 0 | 0 | 1 |
| passive-headers | 24 | 17 | 0 | 4 | 3 |
| auth-matrix | 26 | 9 | 13 | 3 | 1 |
| jwt-probes | 14 | 10 | 0 | 3 | 1 |
| telegram-initdata | 12 | 11 | 1 | 0 | 0 |
| order-logic | 21 | 13 | 6 | 2 | 0 |
| upload-probes | 15 | 13 | 1 | 1 | 0 |
| exposure-probes | 13 | 12 | 0 | 1 | 0 |
| **All** | **137** | **96** | **21** | **14** | **6** |

The static scan is reported separately: 12 checks — 2 pass, 6 fail, 1 warn,
3 skip (gitleaks, Semgrep, and Trivy are not installed locally).

The suite was executed against a local clone of the application to confirm the
checks behave correctly before they are pointed at staging. Findings
ASE-2026-001, -002, -006, -007, -008, -009, -010, -013, -014, -015, and -017
were reproduced live and are now confirmed rather than inferred from source
review. ASE-2026-003 and ASE-2026-004 are confirmed by the static scan and by
inspecting the working tree.

**Corrections made after an independent review of the write-ups:**

- ASE-2026-026 originally recorded 27 bits of order-id entropy. That figure
  came from a faulty estimator in ASE-BUSL-22 that classified a hex suffix as
  base 10 whenever it contained a digit. The true value is **32 bits**
  (`randomId(4)` is four random bytes). The estimator is fixed, the check now
  passes, and the finding has been re-scoped to Low.
- ASE-2026-022 was originally asserted from source reading. It has since been
  confirmed with a raw byte capture showing the replayed body begins with
  `0x22` (`"`) where the original begins with `0x7B` (`{`).
- ASE-2026-023 was originally asserted from source reading. It has since been
  confirmed empirically: three consecutive `POST /api/auth/refresh` calls with
  one token each returned 200 and each issued a fresh access token.

**False positives in the test suite itself** were found and fixed before the
findings above were accepted:

- The JWT probes replayed the session cookie alongside every forged token, so
  `alg=none`, tampered, and expired tokens all appeared to be accepted. The
  probes are now Bearer-only and are gated on a positive control.
- The exposure probe treated the SPA catch-all response as an exposed file.
  It now compares each response against the shell the server actually serves,
  and is verified against a target that does expose `/package.json`.
- A denied expected role was graded as a failure. A denial is not
  exploitable, so it is now a warning meaning the route was not exercised.
- The idempotency replay body is double-encoded, so order-id comparisons
  silently failed and two findings were reported against the wrong cause.

**Status since that run (2026-11-28).** Thirteen findings have been fixed
and merged to `main` since the verification run above - ASE-2026-001, -002,
-003, -006, -007, -008, -009, -010, -011, -012, -015, -022 and -024. The
pull request each fix landed in, and the regression test that covers it, are
listed in the "Fixed" table below.

ASE-2026-004 and ASE-2026-005 stay open: both are operations tickets rather
than code changes (rotate the Google service-account key; rotate the
credentials that are in the git history and then rewrite it). The
cataloguing findings ASE-2026-013 and -014, the Mini App error-leak
ASE-2026-016, the oversell ASE-2026-017, the upload-handling ASE-2026-025 and
the session-lifecycle findings ASE-2026-018 and -023 are open as well, as
are the Low findings ASE-2026-020, -021, -026, -027 and -028.

---

## Open

| ID | Severity | Finding | Test | Owner | Target | Status |
|---|---|---|---|---|---|---|
| ASE-2026-004 | Critical | A Google service-account private key is present on disk in the working directory | ASE-SC-10 | Operations | Immediate | Open |
| ASE-2026-005 | Critical | Plaintext credentials were committed and removed from the working tree, but remain in git history | ASE-SC-10 | Engineering | Immediate | Open |
| ASE-2026-013 | Medium | The public catalog exposes exact `inventory_quantity` for every product | ASE-BUSL-02 | Engineering | 30 days | Open |
| ASE-2026-014 | Medium | Archived products are enumerable by anyone via `GET /api/products?active=false` | ASE-BUSL-03 | Engineering | 30 days | Open |
| ASE-2026-016 | Medium | Twelve Telegram Mini App route handlers return raw `err.message`, which leaks SQL fragments | ASE-SC-05, ASE-ATHN-31 | Engineering | 30 days | Open |
| ASE-2026-017 | Medium | Orders are accepted above available stock; stock is only deducted at fulfilment | ASE-BUSL-23 | Engineering | 30 days | Open |
| ASE-2026-018 | Medium | Changing a password does not revoke outstanding access tokens | ASE-SESS-17 | Engineering | 30 days | Open |
| ASE-2026-019 | Medium | The affiliate login path has no dedicated affiliate login, so affiliates authenticate through the staff endpoint | ASE-ATHN-01 | Product | 30 days | Open |
| ASE-2026-023 | Medium | Refresh tokens are not single-use; the same token can be exchanged for a new session twice | ASE-SESS-18 | Engineering | 30 days | Open |
| ASE-2026-025 | Medium | Oversized and malformed uploads return 500 instead of a 4xx, because the multer errors are not mapped | ASE-FILE-08, ASE-FILE-09 | Engineering | 30 days | Open |
| ASE-2026-026 | Low | Order identifiers carry exactly 32 bits of entropy, the bare minimum for an identifier that gates customer PII | ASE-BUSL-22 | Engineering | 90 days | Open |
| ASE-2026-020 | Low | `two_factor_secret` is stored in plaintext | ASE-SC-14 | Engineering | 90 days | Open |
| ASE-2026-021 | Low | Password-reset "used token" tracking is in-process and wiped every 20 minutes, so tokens can be replayed across restarts | ASE-MAN-07 | Engineering | 90 days | Open |
| ASE-2026-027 | Low | Access tokens carry no `iss` or `aud` claim, so a token from another environment is accepted | ASE-SESS-02, ASE-SESS-21 | Engineering | 90 days | Open |
| ASE-2026-028 | Low | Unknown routes fall back to the SPA shell with a 200, so scanners and clients cannot distinguish a missing route from a page | ASE-EXPO-02 | Engineering | 90 days | Open |

---

## Accepted

| ID | Severity | Finding | Justification | Compensating control | Owner | Expires |
|---|---|---|---|---|---|---|
| _(none)_ | — | — | — | — | — | — |

---

## Fixed

| ID | Severity | Finding | Fixed on | Verified by |
|---|---|---|---|---|
| ASE-2026-001 | Critical | Order `unit_price` is accepted from the client and drives the total, revenue reporting, and affiliate commission | PR #3 - 2026-11-28 | PR #3 - `backend/tests/integration/order-pricing.test.ts` (7 cases) |
| ASE-2026-002 | Critical | `tech_support` bypasses every `authorise()` check, making it an effective superadmin | PR #2 - 2026-11-28 | PR #2 - `backend/tests/unit/authorise-tech-support.test.ts` (11), `backend/tests/integration/tech-support-rbac.test.ts` (18) |
| ASE-2026-003 | Critical | `JWT_SECRET` has a built-in default; if the variable is unset, the application starts with a published secret | PR #1 - 2026-11-27 | PR #1 - `backend/tests/unit/jwt-secret.test.ts`, `backend/tests/unit/env-boot-guard.test.ts` |
| ASE-2026-006 | High | `idempotencyMiddleware` runs before authentication, so keys are global and cached login responses include tokens | PR #3 - 2026-11-28 | PR #3 - `backend/tests/integration/idempotency-scope.test.ts` (8 cases) |
| ASE-2026-007 | High | A correctly signed Telegram initData payload without `auth_date` is accepted and never expires | PR #4 - 2026-11-28 | PR #4 - `backend/tests/unit/telegram-auth.test.ts` |
| ASE-2026-008 | High | Concurrent `Delivered` transitions can both succeed, risking double stock deduction and double commission | PR #4 - 2026-11-28 | PR #4 - `backend/tests/integration/order-status-concurrency.test.ts` (6 cases) |
| ASE-2026-009 | High | The idempotency key check is not atomic, so parallel retries can create duplicate orders | PR #4 - 2026-11-28 | PR #4 - `backend/tests/integration/idempotency-race.test.ts` (3 rounds of 8 parallel requests) |
| ASE-2026-010 | Medium | The rate limiter keys on a client-supplied `X-Forwarded-For` header | PR #5 - 2026-11-28 | PR #5 - `backend/tests/integration/rate-limit-spoofing.test.ts` (3 cases) |
| ASE-2026-011 | Medium | Non-production CORS trusts any `*.ngrok.io` and `*.trycloudflare.com` origin | PR #5 - 2026-11-28 | PR #5 - `backend/tests/unit/origins.test.ts` (10 cases) |
| ASE-2026-012 | Medium | `require2FA` only enforces a second factor when the caller's own account has one enrolled | PR #2 - 2026-11-28 | PR #2 - `backend/tests/unit/2fa.test.ts`, `backend/tests/integration/tech-support-rbac.test.ts` |
| ASE-2026-015 | Medium | Public order tracking returns the customer's phone, address, and internal notes | already fixed in `a26dbd7` - verified 2026-11-28 | Verification against `main`: `GET /api/orders/track/:id` returns `maskPhone()`, `coarsenLocation()` and `stripReceiptFromNotes()` output |
| ASE-2026-022 | Medium | An idempotency replay returns a double-encoded body, so the client receives a JSON string instead of the response object | PR #3 - 2026-11-28 | PR #3 - `backend/tests/integration/idempotency-scope.test.ts` (replay body is parsed back to an object) |
| ASE-2026-024 | Medium | Login responses omit `Cache-Control: no-store`, so a shared cache may retain them | PR #5 - 2026-11-28 | PR #5 - `backend/tests/integration/auth-cache-control.test.ts` (3 cases) |

---

## Detail

### ASE-2026-001 — Client-controlled order pricing

**Severity:** Critical · **Status:** Fixed

**Fixed in:** PR #3 (2026-11-28). Verified against `main`; the regression test that
covers it is listed in the "Fixed" table above.

`CreateOrderSchema` accepts `unit_price` with `z.coerce.number().min(0)`, and
`POST /api/orders` computes `total` from it. `resolveOrderItems()` copies the
client value through as `unitPrice` while resolving only `unitCost` from the
catalogue. The order total drives revenue reporting and the
`trg_order_delivered_commission` trigger.

**Reproduction**

```bash
curl -X POST "$SECURITY_TARGET/api/orders" \
  -H 'Content-Type: application/json' \
  -H "Origin: $SECURITY_TARGET" \
  -d '{"customer_name":"Price Probe","phone":"+251900000042","city":"Addis Ababa",
       "location":"Probe","source":"other","order_type":"delivery",
       "items":[{"name":"Any product","package_size":"250g","quantity":1,"unit_price":0.01}]}'
```

A `total` of `0.01` confirms the issue.

**Fix:** remove `unit_price` from the request schema and resolve
`products.price` inside the order transaction. This is a pricing behaviour
change, so it needs its own test pass over checkout and affiliate attribution.

**Rollout note.** This fix must ship in lockstep with affiliate commission
recalculation. Orders created while the client-controlled price was accepted
are recorded against the price the client sent, and the commission trigger
fires on that value. Re-pricing historical orders silently will underpay
affiliates whose orders were correctly priced but no longer match
`products.price`; decide explicitly how to reconcile them before changing
the schema. Ship with ASE-2026-006 in the same pull request.

**Regression test:** ASE-BUSL-11, ASE-BUSL-15, ASE-BUSL-10.

---

### ASE-2026-002 — `tech_support` is a superadmin

**Severity:** Critical · **Status:** Fixed

**Fixed in:** PR #2 (2026-11-28). Verified against `main`; the regression test that
covers it is listed in the "Fixed" table above.

`backend/src/middleware/auth.ts` short-circuits `authorise()` for the
`tech_support` role before the role list is checked. The role can be assigned
through `POST /api/staff`, which an admin can reach.

**Impact:** a support account can read the order book, customer PII, stock
valuation, audit logs, and referral configuration, and can change roles.

**Fix:** remove the bypass and list `tech_support` explicitly on the routes it
needs. If the support role genuinely needs broad access, issue it as a
temporary elevation with an expiry and an audit record, not a permanent flag.

**Rollout note.** This is the widest blast radius of the Criticals. Before
deploying, audit which accounts hold the `tech_support` role in production and
decide what each of them actually needs. Removing the bypass will revoke
access that support tooling may be relying on today, and it will fail closed
rather than open, so it is a deliberate breaking change rather than an
incident. Announce it to anyone who holds the role.

**Regression test:** ASE-ATHZ-20.

---

### ASE-2026-003 — Default JWT secret

**Severity:** Critical · **Status:** Fixed

**Fixed in:** PR #1 (2026-11-27). Verified against `main`; the regression test that
covers it is listed in the "Fixed" table above.

`backend/src/config/env.ts` gives `JWT_SECRET` a default value. If the
environment variable is absent, the application starts and signs tokens with a
secret that is published in the repository.

**Fix:** remove the default, refuse to start when `JWT_SECRET` is unset, and
require at least 32 characters of generated entropy. Rotate the secret and
invalidate outstanding sessions when this ships.

**Rollout note.** This is an operations change as much as an engineering one.
Rotating the secret invalidates every issued session, so staff and any
integration holding a token will need to re-authenticate. Schedule it for a
maintenance window with an explicit rollback, and confirm which integrations
authenticate with a long-lived token before the rotation rather than after.

**Regression test:** ASE-SESS-16, ASE-SC-02.

---

### ASE-2026-004 — Service account key on disk

**Severity:** Critical · **Status:** Open

`asella-organic-web-afd3fbe2eab3.json` exists in the working directory with a
live Google service-account private key. It is gitignored, but it is still a
plaintext credential on a developer machine and on any deploy host.

**Fix:** rotate the key in Google Cloud, delete the local copy, and serve the
credential from a secret manager or an environment variable at runtime.

**Rollout note.** This is an operations ticket, not a code change. The key
and the storage path have to be swapped together — rotating in Google Cloud
without deploying the new path breaks whichever service is reading the
credential. Check what the key is actually used for before rotating, so the
replacement is provisioned with the same scopes.

---

### ASE-2026-005 — Credentials in git history

**Severity:** Critical · **Status:** Open

Seed scripts and helper scripts containing plaintext passwords were removed
from the working tree but remain in the git history. Deleting a file does not
change a password.

**Fix, in order:** confirm whether the passwords still work against
production and rotate them; then rewrite the history with `git filter-repo`
or BFG if the repository is private and nobody depends on the commit hashes.
The history rewrite is disruptive and is a separate decision.

**Regression test:** ASE-SC-10 (gitleaks over the full history).

---

### ASE-2026-006 — Global idempotency keys and cached login responses

**Severity:** High · **Status:** Fixed

**Fixed in:** PR #3 (2026-11-28). Verified against `main`; the regression test that
covers it is listed in the "Fixed" table above.

`idempotencyMiddleware` is mounted before authentication, so `req.user` is
always undefined and every key is stored with `user_id = NULL`. The middleware
caches the whole response body, including the access and refresh tokens
returned by `POST /api/auth/login`.

**Impact:** a key collision returns another client's cached response. A
replayed login key returns a previously issued token.

**Confirmed 2026-11-26.** A second client reusing a key received the first
client's cached order rather than creating its own (ASE-BUSL-18). A replayed
login key returned a body containing a valid access token, and that token
opened a working session against `GET /api/auth/me` — the suite reports this
as `replayedTokenOpensSession: true` (ASE-SESS-04). Because the key namespace
is global, any client that guesses or reuses a key can obtain a session for
another user.

**Fix:** scope keys to the authenticated principal, skip `/api/auth/*`
entirely, and stop persisting response bodies for authentication routes.

**Regression test:** ASE-SESS-04, ASE-BUSL-18.

---

### ASE-2026-007 — Telegram initData without `auth_date`

**Severity:** High · **Status:** Fixed

**Fixed in:** PR #4 (2026-11-28). Verified against `main`; the regression test that
covers it is listed in the "Fixed" table above.

`validateTelegramInitData` only applies the freshness window when
`authDate > 0`. A signed payload with no `auth_date` passes verification and
never expires.

**Fix:** require `auth_date` and treat a missing or non-numeric value as
invalid.

**Regression test:** ASE-ATHN-26.

---

### ASE-2026-008 — Concurrent status transitions

**Severity:** High · **Status:** Fixed

**Fixed in:** PR #4 (2026-11-28). Verified against `main`; the regression test that
covers it is listed in the "Fixed" table above.

`PATCH /api/orders/:id/status` reads the current status and then updates it
without a row lock or a conditional write. Two simultaneous requests to
`Delivered` can both observe `Pending` and both succeed, firing the
commission trigger and the inventory deduction twice.

**Fix:** `SELECT ... FOR UPDATE` on the order row, or `UPDATE orders SET
status = ? WHERE id = ? AND status = ?` with the affected-row count checked.

**Regression test:** ASE-BUSL-24.

---

### ASE-2026-009 — Non-atomic idempotency

**Severity:** High · **Status:** Fixed

**Fixed in:** PR #4 (2026-11-28). Verified against `main`; the regression test that
covers it is listed in the "Fixed" table above.

The idempotency lookup and the insert are separate statements, so parallel
requests with the same key can all miss the cache and all execute the
handler.

**Confirmed 2026-11-26.** The race is intermittent, so ASE-BUSL-19 runs three
rounds of eight parallel requests. A single round produced one order; the
failing rounds produced two distinct order ids for the same key. A one-round
test therefore misses this roughly two times in three, which is why the
check runs several rounds before reporting.

**Fix:** reserve the key with an atomic insert against a unique index before
running the handler, and treat a conflict as "already in flight".

**Regression test:** ASE-BUSL-19.

---

### ASE-2026-022 — Idempotency replay returns a double-encoded body

**Severity:** Medium · **Status:** Fixed

**Fixed in:** PR #3 (2026-11-28). Verified against `main`; the regression test that
covers it is listed in the "Fixed" table above.

`backend/src/middleware/idempotency.ts` overrides both `res.json` and
`res.send` to capture the response body. Express implements `res.json` by
serialising the object and calling `this.send(...)`, so the `res.send`
wrapper runs *after* the `res.json` wrapper and overwrites the captured
object with the already-serialised string. `JSON.stringify` is then applied
to that string, and the cached body is stored double-encoded.

**Impact:** the replay path parses the stored value back into a string and
returns it with `res.json`, so the client receives `"{\"success\":true,...}"`
instead of `{"success":true,...}`. Any client that reads `response.data.id`
or `response.data.token` on a replayed request gets `undefined`. The
idempotency contract is broken in exactly the situation it exists to
protect — the retry after a network failure.

**Confirmed 2026-11-26 — raw response capture.** The same key was sent twice
against `POST /api/orders` with an identical body. The first response began
with byte `0x7B` (`{`) and was 67 bytes long; the replayed response began
with byte `0x22` (`"`) and was 79 bytes long:

```
request1: 7B-22-73-75-63-63-65-73-73-22-3A-74-72-75-65-2C
{"success":true,"data":{"id":"ORD-20261126-255BF227","total":3000}}

request2: 22-7B-5C-22-73-75-63-63-65-73-73-5C-22-3A-74-72
"{\"success\":true,\"data\":{\"id\":\"ORD-20261126-255BF227\",\"total\":3000}}"
```

Both responses carry the same order id, so no duplicate order was created —
the defect is purely in the encoding of the replayed body.

**Reproduction**

```bash
KEY="idem-probe-$(date +%s)"
curl -s -X POST "$SECURITY_TARGET/api/orders" \
  -H 'Content-Type: application/json' -H "Origin: $SECURITY_TARGET" \
  -H "Idempotency-Key: $KEY" -d @order.json

# Second call with the same key and body:
curl -si -X POST "$SECURITY_TARGET/api/orders" \
  -H 'Content-Type: application/json' -H "Origin: $SECURITY_TARGET" \
  -H "Idempotency-Key: $KEY" -d @order.json | tail -n 2
```

The second response carries `Idempotency-Replay: true` and a body whose first
character is a quote.

**Fix:** capture the body in the `res.json` wrapper only, and ignore
`res.send` for JSON responses — or capture the object and serialise it once.

**Regression test:** ASE-BUSL-05.

---

### ASE-2026-023 — Refresh tokens are not single-use

**Severity:** Medium · **Status:** Open

`POST /api/auth/refresh` accepts the same refresh token more than once and
issues a new session each time. The token is neither rotated nor revoked on
use.

**Impact:** a refresh token that is captured can be used indefinitely, and a
stolen token can be redeemed in parallel without invalidating the legitimate
client's copy. Reuse cannot be detected, so a stolen token cannot be revoked
in time.

**Confirmed 2026-11-26.** The same refresh token was exchanged three times
in a row. Every call returned 200 and issued a fresh access token:

```
attempt 1: POST /api/auth/refresh -> 200  issuedNewAccessToken=true
attempt 2: POST /api/auth/refresh -> 200  issuedNewAccessToken=true
attempt 3: POST /api/auth/refresh -> 200  issuedNewAccessToken=true
```

The endpoint is `POST`, not `GET` — `GET /api/auth/refresh` returns 404.

**Reproduction**

```bash
# Capture a refresh token from a login.
TOKEN=$(curl -s -X POST "$SECURITY_TARGET/api/auth/login" \
  -H 'Content-Type: application/json' -H "Origin: $SECURITY_TARGET" \
  -d '{"username":"<user>","password":"<pass>"}' \
  | sed -n 's/.*"refreshToken":"\([^"]*\)".*/\1/p')

# Exchange the same token three times.
for i in 1 2 3; do
  curl -s -o /dev/null -w "attempt $i -> %{http_code}\n" \
    -X POST "$SECURITY_TARGET/api/auth/refresh" \
    -H 'Content-Type: application/json' -H "Origin: $SECURITY_TARGET" \
    -d "{\"refreshToken\":\"$TOKEN\"}"
done
```

Three `200` responses confirm the token is not single-use.

**Fix:** rotate the refresh token on every exchange, revoke the presented
token, and treat a replay of an already-rotated token as a compromise and
revoke the whole family.

**Regression test:** ASE-SESS-18.

---

### ASE-2026-024 — Login responses are not marked `no-store`

**Severity:** Medium · **Status:** Fixed

**Fixed in:** PR #5 (2026-11-28). Verified against `main`; the regression test that
covers it is listed in the "Fixed" table above.

`POST /api/auth/login` and `POST /api/auth/refresh` do not set
`Cache-Control: no-store`. The response contains a bearer token and a
refresh token.

**Impact:** an intermediary or a shared proxy may retain a response that
contains live credentials.

**Fix:** set `Cache-Control: no-store, private` and `Pragma: no-cache` on
the authentication routes.

**Regression test:** ASE-SESS-03, ASE-SESS-22.

---

### ASE-2026-025 — Upload size and field errors return 500

**Severity:** Medium · **Status:** Open

An upload that exceeds the size limit, or that uses an unexpected multipart
field name, returns 500. The multer errors (`LIMIT_FILE_SIZE`,
`LIMIT_UNEXPECTED_FILE`) are not mapped to a client error.

**Impact:** the server logs an unhandled exception for what is a client
mistake, and the 500 makes a normal rejection look like a server fault. It
also gives an attacker an unbounded error path to exercise.

**Fix:** map the multer error codes to 413 and 400 in the upload error
handler.

**Regression test:** ASE-FILE-08, ASE-FILE-09.

---

### ASE-2026-026 — Order identifiers are only 32 bits

**Severity:** Low · **Status:** Open

Order ids are built as `ORD-${date}-${randomId(4)}` at
`backend/src/routes/orders.ts:186`, where `randomId(4)` is
`crypto.randomBytes(4).toString("hex").toUpperCase()`
(`backend/src/lib/security.ts:106`). Four random bytes rendered as eight hex
characters is **32 bits**, with the date prefix in public view.

**Correction.** An earlier revision of this register recorded roughly 27 bits.
That figure was wrong: it came from a faulty estimator in ASE-BUSL-22 that
classified a hex suffix as base 10 whenever it contained a digit, understating
the entropy by a quarter. The estimator now detects the alphabet from the
suffix itself, and the check reports `alphabetSize: 16, approxBits: 32`.

**Impact.** 32 bits is not below any practical threshold on its own — the
tracking limiter allows 30 requests per 15 minutes per IP, so enumerating
2^32 is not feasible. The concern is the combination with ASE-2026-015: the
public tracking endpoint returns the customer's phone, address, and notes for
any valid order id. An order id is a database key being used as a capability,
and a 32-bit key is a weak capability.

**Fix:** issue a separate, high-entropy order token for tracking — for example
a UUIDv4 returned only to the ordering customer — and require it in
`GET /api/orders/track/:id`. Raising the id to 128 bits is a reasonable
alternative but does not solve the underlying misuse of the key.

**Regression test:** ASE-BUSL-22.

---

### ASE-2026-027 — Access tokens carry no issuer or audience

**Severity:** Low · **Status:** Open

Issued access tokens contain `id`, `username`, `role`, `jti`, `iat`, and
`exp`, but no `iss` or `aud` claim, and `authenticate()` does not check for
them.

**Impact:** a token minted by another environment that shares the secret is
accepted, and a token issued for one audience works everywhere that secret is
used.

**Fix:** set `iss` and `aud` when issuing, and verify both in
`authenticate()`.

**Regression test:** ASE-SESS-02, ASE-SESS-21.

---

### ASE-2026-028 — Unknown routes fall back to the SPA shell

**Severity:** Low · **Status:** Open

Any unmatched path returns the SPA `index.html` with a 200.

**Impact:** scanners cannot distinguish a missing route from a page, and
crawlers index the fallback. On its own this leaks nothing, but it is the
reason the exposure checks need to compare against the served shell before
reporting an exposure.

**Fix:** serve the shell only for paths that look like application routes,
and return 404 for paths that do not.

**Regression test:** ASE-EXPO-02.

---

### Register conventions

When adding a finding:

1. Give it the next `ASE-YYYY-NNN` ID.
2. Link the test ID that found it, so the finding can be re-tested.
3. Write the reproduction as commands someone else can run.
4. Set the owner and a target date from the severity table in `TEST_PLAN.md`.
5. Move it to **Fixed** only after the automated test reports **pass**.
