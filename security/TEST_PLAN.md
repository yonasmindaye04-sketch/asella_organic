# Asella Organic — Security Test Plan

| | |
|---|---|
| **Document** | Security Test Plan, Asella Organic web platform |
| **Version** | 1.0 |
| **Owner** | Security owner (engineering lead) |
| **Applies to** | Storefront (`www.asellaorganic.com`), staff dashboard, API (`api.asellaorganic.com`), Telegram Mini App |
| **Cadence** | Static and passive continuously; active on every release; manual quarterly |
| **Last reviewed** | 2026-11-25 |

---

## 1. Purpose

Provide repeatable, evidence-based assurance that the Asella Organic platform
is secure enough to run a business that handles customer orders, staff
credentials, affiliate commissions, and private receipts.

The plan defines:

- what is tested and what is explicitly out of scope,
- how each test is executed and by what,
- the priority of each test,
- the condition under which a release is considered safe to ship,
- what happens to a finding once it is raised.

The program is layered on purpose. No single tool or technique covers this
application:

| Layer | Purpose | Cadence |
|---|---|---|
| L1 Static and supply chain | Catch insecure patterns and leaked secrets before they run | Every commit |
| L2 Passive external | Verify the security posture that the public can observe | Nightly |
| L3 Authenticated authorization | Prove that every role sees only what it should | Every release |
| L4 Active DAST | Find injection, misconfiguration, and framework issues | Every release |
| L5 Business logic and concurrency | Protect money and stock | Every release |
| L6 Manual and browser | Catch what automation cannot model | Quarterly |

---

## 2. Scope

### 2.1 In scope

- **Storefront** — `www.asellaorganic.com`, the React/Vite single-page app,
  its public JSON endpoints, and the `.htaccess` served by Apache.
- **API** — `api.asellaorganic.com`, the Express 5 backend with all routes
  mounted at both `/api/*` and `/api/v1/*`.
- **Staff dashboard** — the authenticated application used by staff and
  affiliates.
- **Telegram Mini App** — `tma.html` and every `/api/telegram/*` route.
- **The data behind them** — orders, order items, customers, products, stock
  movements, staff accounts, affiliate profiles and commissions, receipts,
  and audit logs.
- **The supply chain** — npm dependencies, CI configuration, container and
  server configuration files, and the git history.

### 2.2 Out of scope

- The cPanel host itself and the Cloudflare account configuration beyond
  what is externally observable (SSL mode, HSTS, DNS).
- Google Sheets, Google Cloud, Cloudinary, and Telegram Bot API accounts,
  except where their credentials appear in this repository.
- Physical security, staff background checks, and payment-processor PCI
  attestation.
- Load and performance testing, except where it is needed to demonstrate a
  concurrency defect.

### 2.3 Assumptions

- A staging environment exists that mirrors production: same code, same
  schema, same middleware stack, seeded with representative data.
- Test accounts exist for every staff role, with no shared passwords.
- The staging database is disposable, or at least the `SEC-…` records created
  by the suite can be deleted in one query.

---

## 3. Test environment

| Environment | URL | Purpose | Active testing |
|---|---|---|---|
| Production | `https://www.asellaorganic.com` | The live system | **Never** |
| Staging | `https://staging.<domain>` | Pre-release verification | Allowed |
| Local | `http://localhost:3001` | Development and script development | Allowed |

### 3.1 Test accounts

One account per role. These are not production accounts and never carry
production data access.

| Role | Environment variable | Notes |
|---|---|---|
| admin | `SECURITY_ADMIN_USER` / `_PASS` | 2FA enrolment optional, note which state it is in |
| manager | `SECURITY_MANAGER_USER` / `_PASS` | |
| employee | `SECURITY_EMPLOYEE_USER` / `_PASS` | |
| store_manager | `SECURITY_STORE_MANAGER_USER` / `_PASS` | |
| call_center | `SECURITY_CALL_CENTER_USER` / `_PASS` | |
| delivery | `SECURITY_DELIVERY_USER` / `_PASS` | |
| affiliate | `SECURITY_AFFILIATE_USER` / `_PASS` | Portal scope is JWT-bound |
| vendor | `SECURITY_VENDOR_USER` / `_PASS` | |
| tech_support | `SECURITY_TECH_SUPPORT_USER` / `_PASS` | Deliberately included: this role has a blanket bypass |

### 3.2 Test data

- A catalogue with at least one active product that has stock and a non-zero
  price. The business-logic suite picks it automatically.
- Orders created by the suite are tagged with the customer name
  `Security Probe SEC-<run-id>` and can be removed with:

  ```sql
  DELETE FROM order_items WHERE order_id IN (
    SELECT id FROM orders WHERE customer_name LIKE 'Security Probe SEC-%'
  );
  DELETE FROM orders WHERE customer_name LIKE 'Security Probe SEC-%';
  ```

- Receipts uploaded by the suite are named `receipt-<16 hex>-<epoch>.png` and
  live in `private/receipts/`.

---

## 4. Rules of engagement

1. **Active testing runs against staging only.** The scripts enforce this.
   A run pointed at a production hostname aborts before sending a request.
2. **Production receives passive checks only** — headers, TLS, and public
   metadata. These are the same requests a browser makes.
3. **One scanner at a time.** ZAP, Nuclei, and sqlmap together make staging
   unusable and produce false positives.
4. **Requests are rate limited.** The suite defaults to 5 requests per second
   and rotates the `X-Forwarded-For` value within the documentation ranges so
   each test gets its own limiter bucket. This mirrors how a real attacker
   would behave and is itself one of the tests.
5. **Every run is recorded.** Reports land in `security/reports/` and are the
   evidence for the findings register.
6. **Findings are reproduced by hand before they are raised.** A scanner match
   is a lead. The automated checks in this program are treated as leads only
   for the manual and tool-based layers.
7. **No denial-of-service testing.** No load tests, no resource-exhaustion
   payloads, no unbounded loops.
8. **No third-party targets.** The Telegram Bot API, Cloudinary, and Google
   APIs are contacted only by the application itself, never by the suite.

---

## 5. Test catalogue

Priority definitions:

- **P0** — blocks release. Exploitable, affects money, credentials, or customer data.
- **P1** — fix before the next release. Significant risk, or a control that does not work.
- **P2** — schedule. Hardening and defence in depth.
- **P3** — best practice. Improve when convenient.

Mode definitions: **Passive** (safe on production), **Active** (staging
only), **Write** (staging only, creates records).

### 5.1 L1 — Static and supply chain

`security/scripts/static-scan.mjs`, `security/scanners/`

| ID | Test | Priority | Mode | Expected result | Tool |
|---|---|---|---|---|---|
| ASE-SC-01 | No blanket role bypass in the authorization guard | P0 | Static | No unconditional role bypass in `authorise()` | source check, Semgrep |
| ASE-SC-02 | JWT secret has no built-in default | P0 | Static | Startup fails when `JWT_SECRET` is unset | source check, Semgrep |
| ASE-SC-03 | Rate limiting does not key on a client-supplied header | P1 | Static | The limiter uses `req.ip` with a correct trust-proxy setting | source check, Semgrep |
| ASE-SC-04 | Order unit price is not accepted from the client | P0 | Static | `unit_price` is absent from the request schema | source check, Semgrep |
| ASE-SC-05 | Raw database error messages are not returned to clients | P1 | Static | Generic error responses | source check, Semgrep |
| ASE-SC-06 | CORS does not trust tunnel hostnames | P1 | Static | No `*.ngrok.io` or `*.trycloudflare.com` in the origin list | source check, Semgrep |
| ASE-SC-07 | Idempotency keys are scoped to a principal | P2 | Static | No global (`user_id IS NULL`) idempotency rows | source check, Semgrep |
| ASE-SC-08 | Backend production dependencies have no high or critical CVEs | P0 | Static | `npm audit --omit=dev` is clean for high and critical | npm audit, Trivy |
| ASE-SC-09 | Frontend production dependencies have no high or critical CVEs | P0 | Static | Same, for `frontend/` | npm audit, Trivy |
| ASE-SC-10 | No secrets in the working tree or git history | P0 | Static | gitleaks reports nothing | gitleaks |
| ASE-SC-11 | No insecure patterns in application source | P1 | Static | Semgrep reports nothing at ERROR or WARNING | Semgrep `p/security-audit` |
| ASE-SC-12 | No known vulnerable components or IaC misconfiguration | P1 | Static | Trivy reports nothing at HIGH or CRITICAL | Trivy |
| ASE-SC-13 | Every route that changes credentials or roles requires 2FA | P0 | Static | `require2FA` on staff create, role change, password reset, and order delete | Semgrep, manual |
| ASE-SC-14 | No plaintext second-factor secret at rest | P2 | Static | TOTP secrets are encrypted with a key from the environment | manual review |

### 5.2 L2 — Passive external

`security/scripts/passive-headers.mjs`

| ID | Test | Priority | Mode | Expected result |
|---|---|---|---|---|
| ASE-CFG-01 | HTML entry point reachable | P0 | Passive | 200 on `/` and `/tma.html` |
| ASE-CFG-02 | HSTS on HTML responses | P1 | Passive | `max-age >= 31536000`, `includeSubDomains` |
| ASE-CFG-03 | Content-Security-Policy present on HTML | P1 | Passive | A CSP on every HTML response |
| ASE-CFG-04 | `script-src` free of `unsafe-inline`, `unsafe-eval`, wildcards | P0 | Passive | No unsafe tokens, no `*`, no scheme wildcards |
| ASE-CFG-05 | `style-src` free of `unsafe-inline` and wildcards | P2 | Passive | `'unsafe-hashes'` at most |
| ASE-CFG-06 | CSP baseline directives present | P2 | Passive | `default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `frame-ancestors`, `form-action`, `upgrade-insecure-requests` |
| ASE-CFG-07 | CSP contains no scheme or host wildcards | P2 | Passive | Concrete origins only |
| ASE-CFG-08 | `X-Content-Type-Options: nosniff` | P1 | Passive | On every response |
| ASE-CFG-09 | Clickjacking protection on HTML | P2 | Passive | `frame-ancestors` or `X-Frame-Options` |
| ASE-CFG-10 | `Referrer-Policy` present | P3 | Passive | `strict-origin-when-cross-origin` or stricter |
| ASE-CFG-11 | `Permissions-Policy` present | P3 | Passive | Unused features disabled |
| ASE-CFG-12 | No `Server` or `X-Powered-By` disclosure | P3 | Passive | Neither header present |
| ASE-CFG-13 | `Cross-Origin-Opener-Policy` present | P3 | Passive | `same-origin` where the Mini App allows it |
| ASE-CFG-14 | CORS rejects untrusted origins | P0 | Passive | No `Access-Control-Allow-Origin` for a foreign origin |
| ASE-CFG-15 | CORS preflight rejects untrusted origins | P1 | Passive | No approval in the preflight response |
| ASE-CFG-16 | Plain HTTP redirects to HTTPS | P1 | Passive | 301/308 to an `https://` URL |
| ASE-CFG-17 | TLS handshake and certificate | P1 | Passive | Trusted chain, TLS 1.2+, valid hostname, not expiring |
| ASE-CFG-18 | External scripts and styles have SRI | P2 | Passive | `integrity` on every third-party script and stylesheet |
| ASE-CFG-19 | Dynamic API responses are not cacheable | P3 | Passive | `no-store` on health and authenticated responses |
| ASE-CFG-20 | Cookies use `HttpOnly`, `Secure`, `SameSite` | P1 | Passive | All three on every cookie |
| ASE-CFG-21 | No sensitive HTML comments | P3 | Passive | No TODO, key, or internal notes in the markup |
| ASE-INF-01 | `security.txt` published | P3 | Passive | A monitored contact and an expiry date |
| ASE-INF-02 | `robots.txt` reachable | P3 | Passive | Present, not disclosing private paths |
| ASE-INF-03 | Agent catalog is intentionally public | P3 | Passive | Served with an explicit CORS policy, not `*` |
| ASE-CFG-22 | TLS protocol and cipher matrix | P1 | Passive | TLS 1.2/1.3 only, forward secrecy | testssl.sh (manual) |
| ASE-CFG-23 | HSTS preload eligibility | P3 | Passive | Eligible once every subdomain is HTTPS | hstspreload.org (manual) |
| ASE-CFG-24 | Cloudflare SSL mode is Full (Strict) | P1 | Passive | No Flexible mode | Cloudflare dashboard (manual) |
| ASE-CFG-25 | Origin is not directly reachable around the edge | P1 | Passive | The origin refuses connections from the internet | manual |

### 5.3 L3 — Authentication, authorization, and session

`security/scripts/auth-matrix.mjs`, `security/scripts/jwt-probes.mjs`

| ID | Test | Priority | Mode | Expected result |
|---|---|---|---|---|
| ASE-ATHN-01 | Login succeeds for each role account | P0 | Active | 200 and a token for every configured role |
| ASE-ATHN-02 | Session role matches the configured account | P1 | Active | The role in the session equals the role in the fixture |
| ASE-ATHN-03 | Login is rate limited | P1 | Active | 429 after 10 failures in 5 minutes |
| ASE-ATHN-04 | Rate limiting does not trust a forged `X-Forwarded-For` | P1 | Active | 429 even when every request claims a new IP |
| ASE-ATHN-05 | Username enumeration through response difference | P2 | Active | Identical status and body for unknown user and wrong password |
| ASE-ATHN-06 | Password policy is enforced on staff creation | P2 | Active | Weak passwords rejected |
| ASE-ATHN-07 | Account lockout after repeated failures | P2 | Active | Lockout or exponential backoff |
| ASE-ATHZ-01 | Any authenticated principal can read their own profile | P1 | Active | 200 for every role |
| ASE-ATHZ-02 | Order book limited to fulfilment and finance roles | P0 | Active | 403 for affiliate, vendor, tech_support |
| ASE-ATHZ-03 | Customer PII limited to customer-facing roles | P0 | Active | 403 for delivery, affiliate, vendor, tech_support |
| ASE-ATHZ-04 | Stock valuation limited to inventory roles | P1 | Active | 403 for delivery, affiliate, vendor, tech_support |
| ASE-ATHZ-05 | Staff directory is admin/manager only | P1 | Active | 403 for every other role |
| ASE-ATHZ-06 | Profit and loss is admin/manager only | P0 | Active | 403 for every other role |
| ASE-ATHZ-07 | Audit log is admin/manager only | P1 | Active | 403 for every other role |
| ASE-ATHZ-08 | Cost-bearing catalog is admin/manager only | P1 | Active | 403 for every other role |
| ASE-ATHZ-09 | Expenses are admin/manager only | P1 | Active | 403 for every other role |
| ASE-ATHZ-10 | Affiliate program configuration is admin only | P1 | Active | 403 for every other role |
| ASE-ATHZ-11 | Telegram integration details are admin/manager only | P2 | Active | 403 for every other role |
| ASE-ATHZ-12 | Affiliate portal is affiliate-only and JWT-scoped | P0 | Active | 403 for every other role; scope from the JWT subject |
| ASE-ATHZ-20 | `tech_support` is not an implicit superuser | P0 | Active | 403 on every admin-only route |
| ASE-ATHZ-21 | Protected routes reject anonymous requests | P0 | Active | 401 on every protected route |
| ASE-ATHZ-22 | Writes reject an untrusted `Origin` | P0 | Active | 403 |
| ASE-ATHZ-23 | Writes reject a missing `Origin` and `Referer` | P0 | Active | 403 |
| ASE-ATHZ-24 | Login rejects an untrusted `Origin` | P1 | Active | 403 |
| ASE-ATHZ-25 | Order detail is not readable by unrelated roles | P0 | Active | 403 |
| ASE-ATHZ-26 | Receipts are not readable by unrelated roles | P0 | Active | 403 outside the receipt allow-list |
| ASE-SESS-01 | Session cookies use `HttpOnly`, `Secure`, `SameSite=Strict` | P1 | Active | All three flags |
| ASE-SESS-02 | Access token carries expiry and audience claims | P2 | Active | `exp`, `iat`, `iss`, `aud` |
| ASE-SESS-03 | Login response is not cacheable | P1 | Active | `Cache-Control: no-store` |
| ASE-SESS-04 | Login responses are not cached by the idempotency middleware | P0 | Active | No `Idempotency-Replay` on a login |
| ASE-SESS-05 | Destructive admin routes enforce 2FA | P0 | Active | 403 without `x-2fa-token` |
| ASE-SESS-09 | Bearer-only authentication works (probe baseline) | P1 | Active | A valid token without cookies returns 200 |
| ASE-SESS-10 | Access token is a well-formed JWT | P1 | Active | Three parts, decodable |
| ASE-SESS-11 | Access token uses a signed algorithm | P0 | Active | Not `none` |
| ASE-SESS-12 | `alg=none` tokens are rejected | P0 | Active | 401 |
| ASE-SESS-13 | Tampered signatures are rejected | P0 | Active | 401 |
| ASE-SESS-14 | Access token lifetime is at most one hour | P2 | Active | `exp - iat <= 3600` |
| ASE-SESS-15 | Expired tokens are rejected | P0 | Active | 401 |
| ASE-SESS-16 | Known default JWT secret is rejected | P0 | Active | A token signed with the repository fallback is refused |
| ASE-SESS-17 | Logout revokes the access token | P1 | Active | 401 after logout |
| ASE-SESS-18 | Refresh tokens are single-use | P1 | Active | The second use is rejected |
| ASE-SESS-19 | Refresh token is not accepted as an access token | P0 | Active | 401 |
| ASE-SESS-20 | Access token contains no secrets | P0 | Active | No password hash, TOTP secret, or refresh token |
| ASE-SESS-21 | Access token carries issuer and audience claims | P2 | Active | `iss` and `aud` present |
| ASE-SESS-22 | Login response is marked `no-store` | P1 | Active | `Cache-Control: no-store` |

### 5.4 L3 — Telegram Mini App trust boundary

`security/scripts/telegram-initdata.mjs`

| ID | Test | Priority | Mode | Expected result |
|---|---|---|---|---|
| ASE-ATHN-20 | Missing initData is rejected | P0 | Active | 400 or 401 |
| ASE-ATHN-21 | Malformed initData is rejected | P0 | Active | 400 or 401 |
| ASE-ATHN-22 | Invalid HMAC is rejected | P0 | Active | 401 |
| ASE-ATHN-23 | Tampered user data is rejected | P0 | Active | 401 |
| ASE-ATHN-24 | Expired initData is rejected | P0 | Active | 401 past the 24-hour window |
| ASE-ATHN-25 | Future-dated initData is rejected | P1 | Active | 401 more than five minutes ahead |
| ASE-ATHN-26 | Signed initData without `auth_date` is rejected | P0 | Active | 401 — a missing timestamp must not skip freshness |
| ASE-ATHN-27 | Valid initData authenticates a Mini App read | P1 | Active | 200 |
| ASE-ATHN-28 | initData in the query string is ignored | P1 | Active | 400 — query strings reach access logs |
| ASE-ATHN-29 | Valid initData completes validation | P2 | Write | 200 |
| ASE-ATHN-30 | Mini App endpoints reject missing initData | P0 | Active | 401 on every customer-facing Mini App route |
| ASE-ATHN-31 | initData errors do not leak secrets or stack traces | P2 | Active | Generic message |
| ASE-MAN-01 | The Mini App behaves correctly inside Telegram | P2 | Manual | Checkout, profile, and orders work in Telegram Web and on a phone |
| ASE-MAN-02 | The Mini App opened outside Telegram reveals nothing | P2 | Manual | No customer data without a valid initData |

### 5.5 L5 — Business logic and concurrency

`security/scripts/order-logic.mjs`

| ID | Test | Priority | Mode | Expected result |
|---|---|---|---|---|
| ASE-BUSL-00 | Public catalog returns products | P1 | Active | At least one product with a price |
| ASE-BUSL-01 | Public catalog does not expose cost fields | P1 | Active | No `unit_cost`, no `low_stock_threshold` |
| ASE-BUSL-02 | Public catalog does not expose inventory levels | P2 | Active | A coarse availability flag only |
| ASE-BUSL-03 | Archived products are not enumerable without authentication | P1 | Active | `?active=false` returns nothing to an anonymous caller |
| ASE-BUSL-04 | Order detail requires authentication | P0 | Active | 401 |
| ASE-BUSL-05 | Idempotency replay returns the original response body | P1 | Write | The replayed body parses to the original object |
| ASE-BUSL-10 | Order total matches the catalog price | P0 | Write | Total equals the catalog price |
| ASE-BUSL-11 | Client cannot set the order unit price | P0 | Write | The server price wins |
| ASE-BUSL-12 | Negative unit price is rejected | P1 | Write | 422 |
| ASE-BUSL-13 | Non-positive quantity is rejected | P1 | Write | 422 |
| ASE-BUSL-14 | Unknown product ids are rejected | P1 | Write | 422 |
| ASE-BUSL-15 | Client-supplied total is ignored | P0 | Write | The server computes the total |
| ASE-BUSL-16 | Repeated `Idempotency-Key` does not create a second order | P1 | Write | The same order id, or 409 |
| ASE-BUSL-17 | Reusing an `Idempotency-Key` with a different payload is rejected | P1 | Write | 409 |
| ASE-BUSL-18 | Idempotency keys are scoped to the requesting client | P1 | Write | Two clients with one key do not share a response |
| ASE-BUSL-19 | Concurrent identical requests create one order | P0 | Write | Exactly one distinct order id across three rounds |
| ASE-BUSL-20 | Public order tracking does not expose customer contact details | P1 | Write | No phone, address, or internal notes |
| ASE-BUSL-21 | Receipt paths are stripped from public order notes | P1 | Write | The `receipt:` line is removed |
| ASE-BUSL-22 | Order ids have enough unguessable entropy | P2 | Write | At least 32 bits of randomness, measured from the suffix alphabet |
| ASE-BUSL-23 | Orders above available stock are rejected | P1 | Write | 4xx, or stock reserved at order time |
| ASE-BUSL-24 | Concurrent status transitions are applied once | P0 | Write | One success, one rejection |
| ASE-BUSL-25 | Referral attribution cannot be moved to another affiliate | P0 | Write | The first attribution stands |
| ASE-BUSL-26 | Commission is credited exactly once per delivery | P0 | Write | One commission row after a delivery |
| ASE-MAN-03 | Affiliate commission survives a later price change | P1 | Manual | The commission matches the price at delivery |
| ASE-MAN-04 | Cancellation reverses a delivery exactly once | P1 | Manual | Stock and commission return to their original values |

### 5.6 L4 — File upload

`security/scripts/upload-probes.mjs`

| ID | Test | Priority | Mode | Expected result |
|---|---|---|---|---|
| ASE-FILE-01 | Media upload requires authentication | P1 | Active | 401 or 403 |
| ASE-FILE-02 | Upload without a file is rejected | P2 | Active | 400 |
| ASE-FILE-03 | A valid PNG receipt is accepted | P1 | Write | 200 with a receipt URL |
| ASE-FILE-04 | Stored receipt filenames are server generated | P1 | Write | `receipt-<16 hex>-<epoch>.<ext>` |
| ASE-FILE-05 | A text file with an image extension is rejected | P0 | Write | 400 |
| ASE-FILE-06 | SVG uploads with scripts are rejected | P0 | Write | 400 |
| ASE-FILE-07 | Path traversal in the upload filename is neutralised | P0 | Write | No `..` in the stored path |
| ASE-FILE-08 | Oversized uploads are rejected | P1 | Write | 413 or 400 |
| ASE-FILE-09 | Uploads with an unexpected field name are rejected | P3 | Write | 400 |
| ASE-FILE-10 | Stored receipts are not publicly readable | P0 | Write | 401 or 403 |
| ASE-FILE-11 | Stored receipts are not exposed under the public uploads path | P0 | Write | 404 |
| ASE-FILE-12 | Upload responses do not leak server paths | P2 | Write | A relative URL only |
| ASE-FILE-13 | Stored receipts are served with a safe content type | P1 | Write | Not `text/html`, plus `nosniff` |
| ASE-FILE-14 | Receipt uploads are rate limited | P1 | Write | 429 after 10 uploads per 5 minutes |
| ASE-FILE-15 | Receipt artifact recorded for later suites | P3 | Write | The filename is written to `reports/artifacts.json` |

### 5.7 L4 — Exposure, error handling, and injection

`security/scripts/exposure-probes.mjs`

| ID | Test | Priority | Mode | Expected result |
|---|---|---|---|---|
| ASE-EXPO-01 | Sensitive files and debug endpoints are not web reachable | P0 | Active | 403 or 404 for every path on the list |
| ASE-EXPO-02 | Unknown routes fall back to the SPA shell | P3 | Active | The fallback never serves API data |
| ASE-EXPO-03 | Malformed JSON produces a generic error | P1 | Active | No SQL, no stack trace |
| ASE-EXPO-04 | Invalid query parameters produce a generic error | P1 | Active | No SQL, no stack trace |
| ASE-EXPO-05 | Search input does not trigger time-based SQL injection | P0 | Active | No measurable delay difference |
| ASE-EXPO-06 | Prototype pollution in the JSON body is inert | P1 | Active | No role change, no crash |
| ASE-EXPO-07 | Prototype pollution in the query string is inert | P1 | Active | No pollution |
| ASE-EXPO-08 | TRACE is not enabled | P2 | Active | 405 or 501 |
| ASE-EXPO-09 | Read-only endpoints reject write methods | P2 | Active | 404 or 405 |
| ASE-EXPO-10 | Host header is not reflected into responses | P1 | Active | The response never contains the forged host |
| ASE-EXPO-11 | `X-Forwarded-Host` is not reflected into responses | P1 | Active | The response never contains the forged host |
| ASE-EXPO-12 | Legacy `/api` and versioned `/api/v1` are both mounted | P3 | Active | Both answer, so clients keep working |
| ASE-EXPO-13 | Oversized query parameters are handled | P3 | Active | Truncated or rejected, never a 500 |
| ASE-INPV-01 | SQL injection on every parameter that reaches a query | P0 | Active | Parameterised only — sqlmap regression on the named targets |
| ASE-INPV-02 | Command injection is impossible | P0 | Active | No shell invocation of request data |
| ASE-INPV-03 | Path traversal on every file path parameter | P0 | Active | No request-controlled filesystem path |
| ASE-INPV-04 | No SSRF sink accepts a request-controlled URL | P0 | Active | The image, media, and upload routes resolve locally or use fixed hosts |
| ASE-INPV-05 | Numeric and string ranges are bounded | P1 | Active | Negative, zero, and absurd values rejected |
| ASE-INPV-06 | XSS payloads are stored inert | P0 | Active | Output is encoded and CSP blocks execution |
| ASE-INPV-07 | Upload and request size limits are enforced | P1 | Active | 413 above the limit |
| ASE-INPV-08 | Prototype pollution is inert everywhere | P1 | Active | No merge of request objects into shared state |
| ASE-MAN-05 | Stored XSS is checked in the dashboard | P1 | Manual | A product name with a script payload renders as text |

### 5.8 Manual and tool-based passes

| ID | Test | Priority | Mode | Tool |
|---|---|---|---|---|
| ASE-TOOL-01 | ZAP passive scan and AJAX spider | P1 | Active | ZAP automation plan |
| ASE-TOOL-02 | ZAP active scan | P1 | Active | ZAP automation plan, staging only |
| ASE-TOOL-03 | Nuclei custom templates | P2 | Active | `security/scanners/nuclei/` |
| ASE-TOOL-04 | Nuclei community templates: CVEs, exposures, misconfiguration | P2 | Active | Nuclei |
| ASE-TOOL-05 | Nikto server scan | P3 | Active | Nikto, once, staging only |
| ASE-TOOL-06 | sqlmap targeted injection regression | P1 | Active | sqlmap, named parameters only |
| ASE-TOOL-07 | TLS protocol and cipher matrix | P1 | Passive | testssl.sh |
| ASE-TOOL-08 | CSP evaluation against an external linter | P2 | Passive | CSP Evaluator, Mozilla Observatory |
| ASE-TOOL-09 | Burp authorization matrix replay | P0 | Active | Burp checklist, `scanners/burp/` |
| ASE-TOOL-10 | Burp business logic exploration | P0 | Active | Burp checklist |
| ASE-TOOL-11 | Dependency audit with richer CVE data | P2 | Static | OWASP Dependency-Check |
| ASE-MAN-06 | Telegram bot callback handlers check ownership | P1 | Manual | A supplier must not be able to self-approve a purchase order |
| ASE-MAN-07 | Password reset links use an allow-listed host | P1 | Manual | The link host is not taken from the request |
| ASE-MAN-08 | Audit log records the actor for every privileged action | P1 | Manual | `audit_log` has an actor for staff and referral changes |
| ASE-MAN-09 | Logs do not contain credentials or tokens | P1 | Manual | Grep the staging logs for tokens, passwords, and initData |
| ASE-MAN-10 | Backups and exports are access-controlled | P2 | Manual | A database export is not reachable from the web root |

---

## 6. Phases and exit criteria

### Phase 0 — Preconditions (before any phase)

- [ ] Staging is up and seeded with representative data
- [ ] Test accounts exist for every role
- [ ] `security/.env` is filled in and not committed
- [ ] The staging database is disposable, or cleanup is scripted
- [ ] The suite runs clean once end to end, so the baseline is known

**Exit:** preflight passes; the run produces a baseline report.

### Phase 1 — Static and supply chain

- [ ] ASE-SC-01 through ASE-SC-14

**Exit:** no P0 or P1 static findings; no secrets in the tree or history.

### Phase 2 — Passive external

- [ ] ASE-CFG-01 through ASE-CFG-25, ASE-INF-01 through ASE-INF-03

**Exit:** no missing security headers, no CORS approval for a foreign origin,
TLS 1.2+ with a valid certificate.

### Phase 3 — Authenticated authorization

- [ ] ASE-ATHN-01 through ASE-ATHN-31, ASE-ATHZ-01 through ASE-ATHZ-26,
      ASE-SESS-01 through ASE-SESS-22

**Exit:** every matrix cell matches the expected role; no P0 or P1 session
finding; `tech_support` is not a superuser.

### Phase 4 — Active DAST

- [ ] ASE-TOOL-01 through ASE-TOOL-06, ASE-EXPO-01 through ASE-EXPO-13,
      ASE-INPV-01 through ASE-INPV-08

**Exit:** no unconfirmed critical or high finding; every tool match is either
reproduced and raised, or recorded as an accepted false positive.

### Phase 5 — Business logic and concurrency

- [ ] ASE-BUSL-00 through ASE-BUSL-26, ASE-FILE-01 through ASE-FILE-15

**Exit:** the order total is server-computed; no duplicate order from a
concurrent retry; one commission per delivery; receipts stay private.

### Phase 6 — Manual, browser, and retest

- [ ] ASE-MAN-01 through ASE-MAN-10
- [ ] The storefront, dashboard, and Mini App still work end to end
- [ ] Every P0 and P1 finding from this cycle is fixed and re-tested green

**Exit:** release candidate signed off by the security owner.

### Release gate

A release does not ship when any of these are true:

- a P0 finding is open,
- a P1 finding is open and has no approved exception,
- the static or passive phase fails on a P0 or P1,
- the storefront, dashboard, or Mini App regressed functionally.

---

## 7. Cadence

| Activity | Frequency | Owner | Output |
|---|---|---|---|
| Static and supply chain | Every push and pull request | CI | Build status, SARIF |
| Passive external check | Nightly | CI | `security/reports/latest-passive-headers.md` |
| Full active assessment | Every release candidate | Security owner | Report + findings register update |
| Dependency and secret sweep | Weekly | CI | Trivy and gitleaks report |
| Nuclei and ZAP | Weekly on staging | Security owner | Scanner report |
| Manual Burp and browser review | Quarterly | Security owner | Checklist results |
| TLS assessment | Monthly | Security owner | testssl report |
| sqlmap targeted regression | Quarterly | Security owner | sqlmap report |
| Plan review | Quarterly, and after any incident | Security owner | Updated plan |

---

## 8. Roles and responsibilities

| Role | Responsibility |
|---|---|
| **Security owner** | Owns this plan, runs the active phases, triages findings, signs off releases |
| **Engineering lead** | Fixes findings, keeps the scripts and the plan current |
| **Developer** | Keeps new code free of the patterns in the Semgrep ruleset, adds a test with every fix |
| **Release manager** | Enforces the release gate; does not ship with an open P0 |
| **Operations** | Keeps Cloudflare in Full (Strict) mode, manages DNS and TLS, handles secret rotation |

### Definition of done for a finding

1. The fix is merged.
2. The automated test that would have caught it is added, or the existing test
   that failed is now green.
3. The suite is re-run and the finding is recorded as **Fixed** with the date.
4. The fix is verified in production by the passive checks, and in staging by
   the full suite.

---

## 9. Finding management

### Severity and target remediation

| Severity | Definition | Target |
|---|---|---|
| **Critical** | Direct loss of money, credentials, or customer data; or unauthenticated administrative access | 24 hours |
| **High** | Significant unauthorized access or disclosure, exploitable with a normal account | 7 days |
| **Medium** | Requires a precondition, or weakens a defence that another control depends on | 30 days |
| **Low** | Hardening with limited direct impact | 90 days |
| **Informational** | Best practice, no known exploitation path | Next scheduled review |

### Register

Every confirmed finding goes into `security/findings/REGISTER.md` with:

- a stable ID (`ASE-YYYY-NNN`),
- the test ID that found it,
- a one-sentence description,
- the affected endpoint and file,
- a reproduction,
- the severity and the target date,
- the owner,
- the status: **Open**, **In progress**, **Fixed**, **Accepted**, **Retest**.

### Acceptance

A finding may be marked **Accepted** only with:

- a written justification of why the risk is acceptable,
- the compensating control,
- the named owner,
- an expiry date, after which it is re-reviewed.

Acceptance is a decision, not a deferral. Accepted findings are still
re-tested when the relevant code changes.

### Re-test

Fixed findings are re-tested by re-running the suite that found them. A
finding is closed only when the test that found it reports **pass**.

---

## 10. Metrics

Tracked per quarter and reviewed at the plan review:

| Metric | Target |
|---|---|
| P0 findings open | 0 |
| P1 findings older than their target | 0 |
| Mean time to remediate P0 / P1 | Under 24 h / 7 days |
| Percentage of P0 and P1 findings with an automated regression test | 100% |
| Passive check pass rate over 30 nights | 100% |
| Active suite pass rate at release | No regression against the previous release |
| Percentage of release candidates with a completed active assessment | 100% |
| Age of the oldest accepted exception | Under 90 days |

---

## 11. Exceptions and change control

This plan changes when:

- a new endpoint is added (the test catalogue is extended before it ships),
- a new integration is added (a new entry in the scope table),
- a finding is accepted (an exception is recorded with an expiry date),
- the application stack changes (the tool matrix is reviewed).

Plan changes are reviewed by the security owner and the engineering lead, and
the version number at the top of this document is incremented.

---

## 12. Appendix — test ID scheme

| Prefix | Area |
|---|---|
| `ASE-PRE` | Preflight and safety |
| `ASE-SC` | Static, dependency, and secret analysis |
| `ASE-CFG` | Configuration, headers, CSP, TLS |
| `ASE-INF` | Information disclosure and public metadata |
| `ASE-ATHN` | Authentication |
| `ASE-ATHZ` | Authorization and access control |
| `ASE-SESS` | Session and token management |
| `ASE-BUSL` | Business logic and concurrency |
| `ASE-FILE` | File upload and receipt handling |
| `ASE-EXPO` | Exposure, error handling, and injection |
| `ASE-INPV` | Input validation |
| `ASE-TOOL` | Tool-driven passes |
| `ASE-MAN` | Manual and browser passes |

IDs are stable. A retired test keeps its number and is marked retired, so any
historical report still maps back to this plan.
