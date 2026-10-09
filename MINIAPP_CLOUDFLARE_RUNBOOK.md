# Cloudflare Tunnel + Telegram Mini App — Complete Runbook

Self-contained. Follow top to bottom the first time; after that use §9 (Troubleshooting) and §8 (Verification) as the day-to-day reference.

Everything here was verified against the code in this repository on 2026-10-09. File paths and line numbers are exact — use them, don't guess.

**Scope note:** this covers running the Mini App on your own machine behind a Cloudflare Tunnel, and serving it in production. It does **not** cover Cloudflare Workers/Pages hosting — this project has no `wrangler.toml` and no Workers code. See §11.3 for why Pages will not work as-is.

---

## Table of contents

1. [How the system actually fits together](#1-how-the-system-actually-fits-together)
2. [Prerequisites](#2-prerequisites)
3. [One-time setup](#3-one-time-setup)
4. [Running it day to day](#4-running-it-day-to-day)
5. [Choosing a tunnel type](#5-choosing-a-tunnel-type)
6. [Which port the tunnel must point at](#6-which-port-the-tunnel-must-point-at)
7. [Registering the Mini App with Telegram](#7-registering-the-mini-app-with-telegram)
8. [Verification checklist](#8-verification-checklist)
9. [Troubleshooting](#9-troubleshooting)
10. [Production deployment](#10-production-deployment)
11. [Known defects in this repo that will bite you](#11-known-defects-in-this-repo-that-will-bite-you)
12. [Security notes](#12-security-notes)

---

## 1. How the system actually fits together

There are **four** moving parts. None of them is optional.

```
                       ┌─────────────────────────────────────────┐
   Telegram client     │  1. cloudflared  (Cloudflare Tunnel)     │
   (phone / desktop)   │     public HTTPS  ──►  127.0.0.1:5173   │
        │              └─────────────────────────────────────────┘
        │  initData (HMAC-signed)
        ▼
┌───────────────────────────────┐
│ 2. Vite dev server  :5173    │   serves /telegram-store  →  tma.html
│    frontend/                  │   serves /image/*        (static assets)
│                               │   proxies /api/*  ──────┐
└───────────────────────────────┘                         │
                                                          ▼
                                            ┌──────────────────────────┐
                                            │ 3. Express backend :3001 │
                                            │    backend/              │
                                            │    /api/telegram/*       │
                                            │    verifies initData     │
                                            │    MySQL :3306           │
                                            └──────────────────────────┘
                                                          │
┌──────────────────────────────────────────────────────────┴─────┐
│ 4. MySQL / MariaDB  :3306  —  database `asella_organic`          │
└──────────────────────────────────────────────────────────────────┘
```

**Why the tunnel points at the frontend and not the backend** — this is the single most important thing to get right. See §6.

### The two URLs the Mini App answers to

Both of these resolve to the standalone Mini App document, never to the website:

| URL | Rewritten by | Notes |
|---|---|---|
| `/telegram-store` | `frontend/public/.htaccess:16` (Apache)<br>`frontend/vite.config.ts:13,19-22` (Vite dev) | Historical path — the bot has always used it |
| `/tma` | `frontend/public/.htaccess:14` (Apache)<br>`frontend/vite.config.ts:13,19-22` (Vite dev) | Shorter |
| `/tma.html` | Nothing — it's the real file | Always works, including on hosts that ignore `.htaccess` |

`/telegram-store` and `/tma` are rewrites **in front of** the SPA fallback. If either one ever opens the full website instead of the Mini App, the rewrite is missing — see §9.4.

### Where the Mini App URL is stored

`TELEGRAM_MINIAPP_URL` in `backend/.env`. It is consumed in 8 places; the two that matter most are different from each other:

| Consumer | Behaviour if unset |
|---|---|
| `backend/src/lib/telegram.ts:292-298` (`initBotConfiguration`, runs at boot) | **Menu button is silently not set.** Requires the value to start with `https://`. No fallback. |
| `backend/src/routes/telegram.ts:40-46` (`getStoreUrl`) | Falls back to `${PUBLIC_URL}/tma`, then to hardcoded `https://asellaorganic.com/tma` |

That asymmetry is the #1 cause of "the Store button vanished". Detail in §9.1.

---

## 2. Prerequisites

| Requirement | Notes | Verify with |
|---|---|---|
| Node.js 20.x or 24.x LTS | | `node -v` |
| npm 10+ | | `npm -v` |
| MySQL 8.0+ or MariaDB 10.5+ | Must be **running** | `Test-NetConnection 127.0.0.1 -Port 3306` |
| `cloudflared` | **Already installed** on this machine | `cloudflared --version` |
| Cloudflare account | Free tier is enough | — |
| A domain on Cloudflare nameservers | Required for a named tunnel. *Not* required for a quick tunnel | — |
| Telegram account | To talk to `@BotFather` | — |
| `cloudflared` path on this machine | `C:\Program Files (x86)\cloudflared\cloudflared.exe` (v2026.10.0) | `Get-Command cloudflared` |

---

## 3. One-time setup

### 3.1 Cloudflare account and domain

1. Create a Cloudflare account at dash.cloudflare.com.
2. Add your domain. Cloudflare gives you two nameservers; set them at your registrar.
3. Wait for the domain to show **Active**.

You do **not** need to change any DNS records for a quick tunnel (§5.1). For a named tunnel you do — §5.2 creates the record for you.

### 3.2 Install cloudflared

Already done on this machine. To install or reinstall:

```powershell
winget install --id Cloudflare.cloudflared
```

Verify:

```powershell
cloudflared --version
```

### 3.3 Create the Telegram bot

1. Telegram → `@BotFather` → `/newbot`
2. Display name: `Asella Organic Store`
3. Username: must end in `bot`, e.g. `AsellaOrganicBot`
4. Copy the token (format `123456789:AA...`).

**This token is the single most important secret in the system.** It is the root of the HMAC that authenticates every Mini App request (§12.1). If it leaks, anyone can forge Mini App sessions.

### 3.4 Database

```sql
CREATE DATABASE asella_organic CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Then migrations — these create the tables, indexes **and triggers**:

```powershell
cd C:\Users\Yonas\Desktop\projects\asella_organic\backend
npm install
node migrate.cjs
```

Migrations run alphabetically from `backend/db/sql/` and are recorded in `migrations_log`. Highest existing is `023_telegram_miniapp_state_notifications.sql`. **You must run migrations or the Mini App's `/state` and `/notifications` endpoints will 500** — those tables come from `023`.

Seed an admin:

```powershell
node create-admin.js
```

### 3.5 Backend environment — `backend/.env`

```env
# ── Server ────────────────────────────────────────────────
PORT=3001
NODE_ENV=development
PUBLIC_URL=https://tma.asellaorganic.com

# ── Database ──────────────────────────────────────────────
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=asella_organic

# ── Security ──────────────────────────────────────────────
# min 32 chars
JWT_SECRET=<32+ random chars>
JWT_EXPIRES_IN=7d

# ── CORS ──────────────────────────────────────────────────
# Comma-separated. MUST include the tunnel origin.
ALLOWED_ORIGINS=http://localhost:5173,https://tma.asellaorganic.com

# ── Telegram ──────────────────────────────────────────────
# min 20 chars (validated at backend/src/config/env.ts:26)
TELEGRAM_BOT_TOKEN=123456789:AA...

# min 16 chars (validated at env.ts:27-29)
TELEGRAM_WEBHOOK_SECRET=<16+ random chars>

TELEGRAM_ADMIN_CHAT_ID=<your numeric id>
TELEGRAM_DELIVERY_GROUP_ID=-100xxxxxxxxxx

# MUST start with https:// or the menu button is never set.
# No trailing slash.
TELEGRAM_MINIAPP_URL=https://tma.asellaorganic.com/telegram-store
```

Validate all four with:

```powershell
node -e "const fs=require('fs');for(const l of fs.readFileSync('backend/.env','utf8').split(/\r?\n/)){const m=l.match(/^\s*(TELEGRAM_[A-Z_]+|PORT|PUBLIC_URL)\s*=(.*)$/);if(m)console.log(m[1].padEnd(28),'len='+m[2].trim().length)}"
```

> **`DB_PASSWORD` must not be empty.** As of this writing `backend/.env` has `DB_PASSWORD=` blank, which makes the *entire* backend test suite fail at `tests/setup/globalSetup.ts:24` with a misleading "missing env var" message — the variable exists, it's just empty.

### 3.6 Frontend environment — `frontend/.env`

**Do not create this file for tunnel work.** You want same-origin relative API calls. See §6 and §11.1.

---

## 4. Running it day to day

Four terminals. Order matters.

### Terminal 1 — MySQL

Make sure the service is up:

```powershell
Get-Service | Where-Object Name -match 'mysql|maria' | Start-Service
Test-NetConnection 127.0.0.1 -Port 3306
```

### Terminal 2 — Backend

```powershell
cd C:\Users\Yonas\Desktop\projects\asella_organic\backend
npm run dev
```

Listens on `:3001`. On boot it calls `initBotConfiguration()` (`backend/src/server.ts:19`). **Watch the log** — it tells you whether the menu button was set:

```
[telegram] Verified bot @AsellaOrganicBot (ID: 123...). Syncing configuration...
[telegram] Set persistent Chat Menu Button to https://tma.asellaorganic.com/telegram-store
```

If you see `TELEGRAM_MINIAPP_URL is not HTTPS — skipping menu button in local dev`, go fix §3.5 and restart.

Also confirm the backend is healthy — this checks **both** DB and Telegram:

```
GET http://localhost:3001/api/health   →  { "db": ..., "telegram": ..., "healthy": true }
```

### Terminal 3 — Frontend

```powershell
cd C:\Users\Yonas\Desktop\projects\asella_organic\frontend
npm install
npm run dev
```

Listens on `:5173`. Already tunnel-ready (`frontend/vite.config.ts:31-46`):

| Setting | Value | Why |
|---|---|---|
| `host: true` | bind all interfaces | tunnel connects over the network stack |
| `allowedHosts: true` | accept any Host header | `*.trycloudflare.com` is an unknown host |
| `ngrok-skip-browser-warning` | set | suppresses the ngrok/trycloudflare interstitial |
| `X-Frame-Options: ALLOWALL` | set | Telegram renders this in a webview |
| `proxy['/api']` | → `http://localhost:3001` | same-origin API calls reach the backend |

Test it locally first, before involving the tunnel:

```
http://localhost:5173/telegram-store   →  Mini App shell renders
http://localhost:5173/api/health       →  proxied JSON from the backend
```

### Terminal 4 — Cloudflare Tunnel

```powershell
cloudflared tunnel --url http://localhost:5173
```

You'll get a line like:

```
Your quick Tunnel has been created! Visit it at: https://random-words-here.trycloudflare.com
```

**That hostname is random and changes every time you restart the tunnel.** See §5 before you wire it into Telegram.

### Terminal 5 (optional) — local Telegram update bridge

Only if you need the *bot* (not just the Mini App) to respond locally. See §9.2 before you run it — it has a destructive footgun.

```powershell
cd backend
npm run telegram:poll
```

---

## 5. Choosing a tunnel type

### 5.1 Quick tunnel — for throwaway testing

```powershell
cloudflared tunnel --url http://localhost:5173
```

| | |
|---|---|
| Setup | none |
| Hostname | `https://<random>.trycloudflare.com`, **changes every restart** |
| Needs a Cloudflare domain | no |
| Good for | "does the Mini App work on a phone?" |

**Consequence you must accept:** every restart invalidates the URL you registered with Telegram. After restarting the tunnel you must re-publish it:

```powershell
# after updating TELEGRAM_MINIAPP_URL in backend/.env and restarting the backend
curl.exe -X POST http://localhost:3001/api/telegram/configure-bot
```

And if you registered a direct link or menu button manually via BotFather, **redo those steps too** — `configure-bot` only fixes the menu button, not BotFather's `/newapp` short name.

### 5.2 Named tunnel — for a stable hostname

Use this if you want `https://tma.asellaorganic.com` to keep working across restarts, and for anything beyond a quick smoke test.

**One-time:**

```powershell
# 1. Authorises cloudflared against your Cloudflare account (opens a browser)
cloudflared tunnel login

# 2. Create the tunnel
cloudflared tunnel create asella-miniapp

# 3. Create the DNS record pointing at the tunnel
#    (must be a domain already on Cloudflare nameservers)
cloudflared tunnel route dns asella-miniapp tma.asellaorganic.com
```

**Then create `%USERPROFILE%\.cloudflared\config.yml`:**

```yaml
tunnel: asella-miniapp
credentials-file: C:\Users\Yonas\.cloudflared\<TUNNEL-ID>.json

ingress:
  - hostname: tma.asellaorganic.com
    service: http://localhost:5173
    originRequest:
      httpHostHeader: localhost:5173
  - service: http_status:404
```

> The `originRequest.httpHostHeader` line matters. Vite's `allowedHosts: true` tolerates anything, but some proxies reject a Host header that doesn't match the origin. Keep it.

**Run it:**

```powershell
cloudflared tunnel run asella-miniapp
```

**Run it as a Windows service (survives reboots):**

In Cloudflare Zero Trust → Networks → Tunnels → your tunnel → **Install and run a connector** → choose Windows → copy the token, then:

```powershell
cloudflared service install <the-token>
```

### 5.3 Which one to use

| Situation | Use |
|---|---|
| Testing on your own phone, today | Quick tunnel (§5.1) |
| Anything you'll show a client | Named tunnel (§5.2) |
| Production | Cloudflare proxy in front of the origin server — §10 |

---

## 6. Which port the tunnel must point at

**Point the tunnel at `http://localhost:5173` — the frontend. Never at `:3001`.**

The backend does not serve the frontend build. It is an API-only process. If you point the tunnel at `:3001`:

| Result | Why |
|---|---|
| Mini App won't load at all | No HTML is served by the backend |
| Every product image 404s | `backend/src/routes/images.ts:58` resolves from `backend/public/image/`, which contains only `cache/` and `uploads/`. The real images are in `frontend/public/image/` |
| `/telegram-store` and `/tma` don't rewrite | Those rules live in the frontend's Vite middleware and `.htaccess` |

The Vite dev server handles everything the Mini App needs in one process:

- serves `tma.html` at `/telegram-store` and `/tma` (`vite.config.ts:12-27`)
- serves `/image/*` from `frontend/public/`
- proxies `/api/*` to the backend on `:3001` (`vite.config.ts:40-46`)

This is confirmed by `backend/.env.example:62`: *"Route the tunnel to the frontend dev server (5173) so the Vite `/api` proxy forwards API calls."*

Because everything is same-origin, `VITE_API_URL` must be **empty**. See §11.1.

---

## 7. Registering the Mini App with Telegram

Do these **after** the tunnel is up and the URL is final.

### 7.1 Menu button — let the backend do it

Set `TELEGRAM_MINIAPP_URL` in `backend/.env`, restart the backend, and confirm the boot log says it set the button. Or force it:

```powershell
# Admin routes require a staff session. Get one first (see 7.0).
curl.exe -c cookies.txt -X POST http://localhost:3001/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"<admin-email>","password":"<admin-password>"}'

curl.exe -b cookies.txt -X POST http://localhost:3001/api/telegram/configure-bot
```

This registers the persistent "Store" chat-menu button plus the commands `/start /store /shop /track /orders /help` and the bot description.

### 7.0 Authenticating to admin routes

Six mutating Telegram routes require an **admin** staff session. `GET /health` and `GET /info` stay public.

```powershell
curl.exe -c cookies.txt -X POST http://localhost:3001/api/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"<admin-email>","password":"<admin-password>"}'
```

Reuse the cookie jar with `-b cookies.txt` on every admin call. In a browser you are already authenticated — just log in through the dashboard.

Gated routes: `POST /set-menu-button`, `POST /set-webhook`, `GET /set-webhook`, `POST /delete-webhook`, `POST /configure-bot`, `POST /send-push`.

### 7.2 Menu button — via BotFather

```
@BotFather → /setmenubutton → select your bot
→ button text:  Store
→ Web App URL:  https://tma.asellaorganic.com/telegram-store
```

### 7.3 Direct link (`t.me/YourBot/store`)

```
@BotFather → /newapp → select your bot
→ Title:        Asella Organic Store
→ Description:  100% natural organic health products from Ethiopian highlands
→ Icon:         640×360 image
→ Short name:   store
→ Web App URL:  https://tma.asellaorganic.com/telegram-store
```

Yields `https://t.me/AsellaOrganicBot/store`.

**No code in this repo registers the short name.** It is documentation-only (`setup.md:163-171`) and must be set by hand in BotFather. `setMyShortDescription()` in `backend/src/lib/telegram.ts:287` is the *bot profile blurb* — a completely different thing. Don't confuse them.

### 7.4 Which URL form to register

| Form | Use when |
|---|---|
| `https://host/telegram-store` | Normal case. Works on Apache and Vite dev. |
| `https://host/tma` | Same, shorter. |
| `https://host/tma.html` | Only if the host ignores `.htaccess` (e.g. Cloudflare Pages). See §11.3. |

**No trailing slash.** `getStoreUrl()` and BotFather both handle it inconsistently otherwise.

### 7.5 Set the webhook (production only)

```powershell
curl.exe -b cookies.txt -X POST http://localhost:3001/api/telegram/set-webhook `
  -H "Content-Type: application/json" `
  -d "{\"url\":\"https://tma.asellaorganic.com/api/telegram/webhook\"}"
```

⚠️ This **drops any pending Telegram updates** (`backend/src/lib/telegram.ts:217`). Don't re-run it casually.

⚠️ `POST /api/telegram/set-webhook` and `GET /api/telegram/set-webhook` are **two different implementations**. Prefer POST.

---

## 8. Verification checklist

Run in order. Stop at the first failure and go to the matching §9 entry.

**Step 1 — backend is up and talking to Telegram**
```powershell
curl.exe http://localhost:3001/api/health
```
Expect `"healthy": true`. `healthy` requires **both** DB and Telegram (`backend/src/app.ts:182-213`).

**Step 2 — bot token and webhook state**
```powershell
curl.exe http://localhost:3001/api/telegram/health
```
Expect `status: ok`, and inside `webhook`: the correct `url`, `pending_update_count`, `last_error_message`.

**Step 3 — frontend serves the Mini App**
```powershell
curl.exe -o NUL -w "%{http_code}" http://localhost:5173/telegram-store
```
Expect `200`. Then open it in a browser — you should see the Mini App chrome (header, bottom nav). It will not have `initData`, so data calls will 401 — that is expected outside Telegram.

**Step 4 — the tunnel reaches the frontend**
```powershell
curl.exe -o NUL -w "%{http_code}" https://<your-tunnel-host>/telegram-store
```
Expect `200`. Then:
```powershell
curl.exe https://<your-tunnel-host>/api/health
```
Expect the same JSON as Step 1. **If the Mini App loads but `/api/health` through the tunnel fails, the tunnel is pointed at the wrong port (§6).**

**Step 5 — initData HMAC algorithm is intact**
```powershell
cd backend
npx tsx src/scripts/verify-tma-auth.ts
```
Expect `All 4 Telegram Mini App verification checks passed!`

> This validates the **algorithm only**. It uses a hardcoded fake token and never touches Express, your real token, or the database. It can pass while the deployed system is completely broken. It is necessary, not sufficient.

**Step 6 — end-to-end on a real phone**

Open the bot in Telegram → tap **Store** (or send `/store`). You should get the Mini App full-screen, with a populated product grid.

**Step 7 — bot commands respond**
Send `/start`, then `/store`. The bot replies with an "Open Organic Store" button (`backend/src/routes/telegram.ts:1375-1379`).

**Step 8 — production build sanity (before deploying)**
```powershell
cd frontend
npm run build
npm run check-csp
```
Both must pass. `postbuild.js` **fails the build** if `tma.html` is missing its `telegram.org/js/telegram-web-app.js` tag or if any inline `<script>` slipped in (§11.4).

---

## 9. Troubleshooting

### 9.1 The Store button vanished after a restart

**Cause.** `initBotConfiguration()` reads `TELEGRAM_MINIAPP_URL` directly and only sets the menu button if the value **starts with `https://`** (`backend/src/lib/telegram.ts:292-298`). It has no fallback. If the variable is unset, empty, or `http://`, the button is silently skipped — the only trace is this boot log line:

```
[telegram] TELEGRAM_MINIAPP_URL is not HTTPS — skipping menu button in local dev.
```

This differs from `getStoreUrl()` (`backend/src/routes/telegram.ts:40-46`), which *does* fall back to `${PUBLIC_URL}/tma`. So inline "Open Store" buttons keep working while the chat-menu button disappears.

**Fix.**
```powershell
# 1. confirm the value
node -e "console.log(JSON.stringify(process.env.TELEGRAM_MINIAPP_URL))"
# 2. set it in backend/.env — https://, no trailing slash — then restart the backend
# 3. force a resync
curl.exe -X POST http://localhost:3001/api/telegram/configure-bot
```
Also confirm with `curl.exe http://localhost:3001/api/telegram/info` that the button is what you expect.

### 9.2 The bot stopped responding entirely

**Cause.** `npm run telegram:poll` calls `deleteWebhook()` **unconditionally at startup** (`backend/src/scripts/telegram-poll.ts:79-94`) and does not restore it on exit. If you ran it against a production token, you have silently broken the live bot. `POST /api/telegram/set-webhook` also drops pending updates.

**Fix.** Restore the webhook:
```powershell
curl.exe -b cookies.txt -X POST http://localhost:3001/api/telegram/set-webhook `
  -H "Content-Type: application/json" `
  -d '{"url":"https://<your-host>/api/telegram/webhook"}'
```
Then confirm with `curl.exe http://localhost:3001/api/telegram/health` — check `webhook.url` and `webhook.pending_update_count`.

**Rule:** never run `telegram:poll` against a production bot token.

### 9.3 `npm run telegram:poll` logs "Failed to reach local backend"

**Cause.** `backend/src/scripts/telegram-poll.ts:14` defaults the port to **5000**:

```ts
const TARGET_URL = `http://127.0.0.1:${process.env.PORT || 5000}/api/telegram/webhook`;
```

The backend listens on **3001** (`backend/src/config/env.ts:14`). `setup.md:129` claims 3001 — that documentation is wrong.

**Fix.** Make sure `PORT=3001` is set in `backend/.env`.

### 9.4 The Mini App opens the whole website

There are **two different causes**. Work out which one you have.

**Cause A — the registered URL has no path.** If the menu button or direct link points at `https://your-host` or `https://your-host/`, it serves `index.html` — the public website. Only `/telegram-store`, `/tma` and `/tma.html` reach the Mini App.

```powershell
# what is the bot actually pointing at?
node -e "const fs=require('fs');const t=fs.readFileSync('backend/.env','utf8');const tok=(t.match(/TELEGRAM_BOT_TOKEN\s*=\s*(.+)/)||[])[1].trim();fetch('https://api.telegram.org/bot'+tok+'/getChatMenuButton').then(r=>r.json()).then(j=>console.log(JSON.stringify(j.result)))"
```

`TELEGRAM_MINIAPP_URL` **must include a path**. `https://host` alone is wrong, even though it looks valid.

**Cause B — the rewrite is missing.** `/telegram-store` or `/tma` fell through to the SPA fallback. Check what each path really serves:

```powershell
foreach ($p in "/tma","/telegram-store","/tma.html","/") {
  $h = Invoke-WebRequest "https://your-host$p" -UseBasicParsing
  "$p -> " + $(if ($h.Content -match '/assets/miniApp-') { "MINI APP" } else { "website" })
}
```

The first three must report `MINI APP`. `/` reporting `website` is correct and expected.

**Fix for Cause B:**

| Host | Where the rewrite lives | Check |
|---|---|---|
| Vite dev (5173) | `frontend/vite.config.ts:12-27` | automatic — restart `npm run dev` after touching it |
| Apache | `frontend/public/.htaccess:13-16` | must be **above** the SPA fallback at `:19-26` |
| Cloudflare Pages | *nothing* | broken by design — §11.3 |

**Universal workaround:** register `https://<host>/tma.html`. That path needs no rewrite.

> **`setChatMenuButton` lies, briefly.** Telegram accepts the call, returns `ok: true`, and then takes **up to ~20 seconds** to apply it. An immediate read shows the *previous* value, which looks exactly like a rejection. Poll for 30s before concluding it failed. Also, `web_app` must be a nested **object** — passing it as a JSON **string** silently degrades the button to `{"type":"commands"}`.

### 9.5 `window.Telegram` is undefined

**Cause.** The SDK `<script src="https://telegram.org/js/telegram-web-app.js">` (`frontend/tma.html:34`) was blocked. CSP `script-src` allows `'self'` and `https://telegram.org` (`csp-config.js:10`).

**Diagnose.** Browser/webview console will show a `script-src` violation. Also confirm:
```powershell
# the tag must be present in the built file
Select-String -Path dist\tma.html -Pattern 'telegram-web-app.js'
```

**Note the asymmetry:** the Vite **dev** server serves no CSP at all, so this class of bug is invisible locally and only appears in production. This exact trap is documented at `DEPLOYMENT_GOTCHAS.md:43`.

Also note `https://telegram.org` is an exact host — it does **not** cover `https://*.telegram.org` sub-paths. If Telegram ships an SDK update on a subdomain, add it to `csp-config.js:10`.

### 9.6 Every Mini App request returns 401

Read the `error` field — it distinguishes the causes:

| Body | Cause | Fix |
|---|---|---|
| `"Missing initData. Open this page from inside Telegram."` | The SDK didn't supply `initData` — you opened it in a plain browser | Test inside Telegram. Expected outside it. |
| `"Invalid signature: data tampered or forged"` | The backend's `TELEGRAM_BOT_TOKEN` is **not** the token of the bot that owns the Mini App | One bot token, one Mini App. Check for a stale token in `.env`; restart the backend. |
| `"Authentication expired: age Ns exceeds limit"` | `initData` older than 24h | Normal — close and reopen the Mini App |
| `"Authentication timestamp from the future"` | Clock skew > 5 min between client and server | Fix system time / NTP |

Status code `500` with `"Bot token not configured on server"` means `TELEGRAM_BOT_TOKEN` is missing or empty (`backend/src/routes/telegram.ts:152-153`).

Status `401` codes come from `authenticateMiniApp()` (`backend/src/routes/telegram.ts:148-175`); the crypto is `backend/src/lib/telegram-auth.ts:37-132`.

### 9.7 Products load but every image 404s

**Cause.** The tunnel points at the backend (`:3001`) instead of the frontend (`:5173`). See §6.

### 9.8 Store tab says "Failed to fetch" but the Account tab works

**Cause.** `VITE_API_URL` is set to an absolute host. Product data flows through `frontend/src/services/api.ts` (which uses `VITE_API_URL ?? ""`), while `/api/telegram/*` calls go through `frontend/src/telegram/shop/api.ts:17` (`VITE_API_URL || ""`) — inconsistent resolution surfaces as inconsistent failures.

`frontend/.env.production` **contains** `VITE_API_URL=https://api.asellaorganic.com` and it is committed to git. Vite gives `.env.production` precedence over `.env` in a `vite build`.

**Fix.** For tunnel/dev work, neutralize it:
```powershell
# rename it out of the way, or comment the line
Rename-Item ..\frontend\.env.production ..\frontend\.env.production.bak
```
This is a known issue from before — `CHANGELOG.md:231-249`.

### 9.9 Everyone gets "429 Too many requests" at the same time

**Cause.** Rate-limit bucket collapse. `generalRateLimit` is **600 req/min** (`backend/src/middleware/rateLimit.ts:80-87`), keyed by `ip:<addr>` from `x-forwarded-for` (`rateLimit.ts:57-61`). If `cloudflared` isn't forwarding that header, every customer shares one bucket. Each open Mini App alone costs one `unread-count` poll per 60s (`frontend/src/telegram/shop/useNotifications.ts:9`).

**Already handled:** `app.ts` now sets `app.set("trust proxy", …)`, so Express populates `req.ip` correctly through the tunnel. The hop count comes from `TRUST_PROXY` (default `1`, correct for Cloudflare → origin).

**If it still happens:**
1. Log the header to confirm it arrives: `console.log(req.headers['x-forwarded-for'])` at the top of `backend/src/app.ts`.
2. If your origin sits behind a second proxy (Cloudflare → Apache → Node), set `TRUST_PROXY=2`.
3. Set `REDIS_URL` so limits are shared across instances (`rateLimit.ts:20-23`).

**Note:** `orderRateLimit` (10 per 5 min) is now mounted on `POST /api/telegram/app-order` and on the public `POST /api/orders`.

### 9.10 CORS or CSRF 403 on a POST from the Mini App

**Cause.** The CSRF middleware requires a matching `Origin` header unless the request carries `x-telegram-init-data` (`backend/src/app.ts:110-118`). The Mini App does send that header (`frontend/src/telegram/shop/api.ts:35-42`), so its own calls are exempt. But anything not going through that client is not.

**Fix.** Add the tunnel origin to `ALLOWED_ORIGINS` in `backend/.env` and restart. The backend prints the resolved allowlist at startup (`backend/src/app.ts` `logger.info`) — check the log, don't assume.

Gotcha documented at `DEPLOYMENT_GOTCHAS.md:21-26`: this variable was once named `FRONTEND_URL` while the code read `ALLOWED_ORIGINS`, so edits appeared to do nothing. The name is now correct.

### 9.11 Mini App renders blank inside Telegram on one specific client

**Cause.** `frontend/public/.htaccess` used to send `X-Frame-Options: DENY` while `frame-ancestors` in `csp-config.js` explicitly allows `https://web.telegram.org`. Modern browsers prefer `frame-ancestors`, but some older webviews still honour `X-Frame-Options`. The Vite dev server sent the **opposite** (`X-Frame-Options: ALLOWALL`, `vite.config.ts:38`), so this reproduced in production only.

**Fixed** — the header is now `SAMEORIGIN`, which keeps clickjacking protection for the website while letting the CSP `frame-ancestors` rule govern the Mini App. If you still see it, check for a stale `.htaccess` on the server (`dist/.htaccess` is regenerated on every build).

### 9.12 Bot buttons point at the wrong site

**Cause.** `PUBLIC_URL` and `TELEGRAM_MINIAPP_URL` are both unset, so `getStoreUrl()` falls back to the hardcoded `https://asellaorganic.com/tma` (`backend/src/routes/telegram.ts:44`), and `set-webhook` hardcodes the same (`telegram.ts:2343`).

**Fix.** Set both in `backend/.env`.

### 9.13 Menu button works but orders can't be placed

Check in this order:
1. `curl.exe http://localhost:3001/api/telegram/health` — is `TELEGRAM_BOT_TOKEN` reaching Telegram?
2. Is the DB migrated? `node migrate.cjs` — especially migration `023`, which creates the Mini App state/notification tables.
3. Backend log during the failing POST. `422` means schema validation failed (`backend/src/routes/telegram.ts:1649-1653`); `401` means initData (§9.6).

### 9.14 Webhook returns 200 but nothing happens

**By design.** A rejected webhook returns **HTTP 200 with an empty body** so Telegram doesn't retry (`backend/src/routes/telegram.ts:1466`). This is true for all rejection paths: invalid secret token, missing `update_id`, duplicate `update_id`, invalid JSON, replay-DB failure.

**Diagnose from the backend log, not the status code:**
```
[telegram webhook] Rejected: invalid secret token
```
Most common real cause: `TELEGRAM_WEBHOOK_SECRET` in `backend/.env` doesn't match the secret Telegram has registered. Re-register with `POST /api/telegram/set-webhook`.

Also note messages older than **5 minutes** are recorded and skipped (`telegram.ts:1509-1521`), and updates already in the `webhook_events` table are ignored as replays (`telegram.ts:1523-1526`).

---

## 10. Production deployment

### 10.1 Shape

```
Internet ──► Cloudflare (proxy, orange cloud, TLS) ──► Origin server
                                                       ├── Apache  → /var/www/frontend/dist  (static + .htaccess)
                                                       └── Node/PM2 → 127.0.0.1:3001          (API)
                                                            └── MySQL 127.0.0.1:3306
```

`.htaccess` handles the `/telegram-store` → `tma.html` rewrite, cache headers, HSTS, and CSP. Cloudflare provides TLS, DDoS protection, and caching in front.

**`.htaccess` requires `mod_rewrite` and `mod_headers`, and `AllowOverride All` on the document root.** If `mod_headers` is missing, the CSP header is silently absent.

### 10.2 Deploy

```powershell
# backend
cd C:\Users\Yonas\Desktop\projects\asella_organic\backend
npm install --omit=dev
npm run build

# frontend
cd ..\frontend
npm ci
npm run build        # tsc -b && vite build && node scripts/postbuild.js
npm run check-csp    # must print: CSP config matches dist/.htaccess
```

Copy `frontend/dist` to the web root.

```bash
# on the server
pm2 start ecosystem.config.cjs
pm2 save
```

### 10.3 Production environment

```env
NODE_ENV=production
PUBLIC_URL=https://asellaorganic.com
ALLOWED_ORIGINS=https://asellaorganic.com,https://www.asellaorganic.com
TELEGRAM_MINIAPP_URL=https://asellaorganic.com/telegram-store
```

All secrets from §3.5, with production values. **Never commit `.env`.**

There is an existing deployment helper at `backend/scripts/YEGARAHOST_DEPLOY_RUNBOOK.sh` (generates `JWT_SECRET`, `REFRESH_TOKEN_SECRET`, `TELEGRAM_WEBHOOK_SECRET`; run `backend/scripts/deploy.sh` for the SSH push).

### 10.4 After deploying

```powershell
curl.exe -X POST https://asellaorganic.com/api/telegram/set-webhook -H "Content-Type: application/json" -d '{"url":"https://asellaorganic.com/api/telegram/webhook"}'
curl.exe https://asellaorganic.com/api/telegram/health
curl.exe https://asellaorganic.com/api/health
```

Then hard-refresh the Mini App on your phone. The service worker (`frontend/public/sw.js`) caches HTML network-first and `__VERSION__` is rewritten per build (`frontend/scripts/postbuild.js:59-68`), so old content shouldn't stick — but `telegram.org`'s webview cache is outside your control.

---

## 11. Known defects in this repo that will bite you

These are real, verified, and unfixed. Listed so you don't lose an afternoon to each one.

### 11.1 `.env.production` hardcodes an absolute API host — **open, by decision**

`frontend/.env.production` contains `VITE_API_URL=https://api.asellaorganic.com` and is committed. Any `npm run build` bakes it into the bundle, so the app ignores whatever host it's served from. This is **correct for production** (the API is on a separate subdomain) and only wrong for tunnel builds.

Two ways to override, no code change needed — Vite gives real process env the highest priority over `.env` files:

```powershell
# Option A — set it for this build
$env:VITE_API_URL = ""; npm run build

# Option B — rename the file out of the way
Rename-Item .env.production .env.production.bak
```

§9.8.

### 11.2 Duplicate CSP headers — **fixed**

`postbuild.js` used to append a second CSP header on top of the hand-written one in `frontend/public/.htaccess`. Apache emitted both, browsers enforced the **intersection**, and the stricter appended policy silently dropped Cloudflare Insights, the YouTube `frame-src`, and the `i.ytimg.com` / `lh3.googleusercontent.com` `connect-src` entries.

Fixed by folding every needed directive into `csp-config.js` and deleting the hand-written header. `dist/.htaccess` now contains exactly one CSP header, and `npm run check-csp` passes.

> Note `check-csp` still cannot *detect* a duplicate — its regex is `Header set Content-Security-Policy` (`frontend/scripts/check-csp.js:28`), which does not match `Header always set …`. It validates the generated header only. Don't reintroduce a hand-written CSP.

### 11.3 Cloudflare Pages will not work as-is

- `.htaccess` is completely ignored by Pages, so `/telegram-store` and `/tma` never rewrite. Use `/tma.html`, or add a `_redirects` file.
- No `mod_headers`, so the CSP never reaches the browser either. Set it in the Pages `_headers` file, generated from `csp-config.js`.
- `connect-src` (`csp-config.js`) allows only `'self'`, `https://api.asellaorganic.com`, `i.ytimg.com` and `lh3.googleusercontent.com`. Cross-hostname API calls get blocked.
- The HTTPS redirect at `.htaccess:99-103` is host-scoped to `asellaorganic.com` and `www.`, so it's inert on any other hostname.

### 11.4 No inline `<script>` allowed — the build enforces it

`script-src` has no `'unsafe-inline'`. `postbuild.js:70-125` scans `dist/index.html` and `dist/tma.html` for any `<script>` without a `src=` and **fails the build**. To add one, put the file in `frontend/public/` (Vite copies it to the dist root) and reference it with `src=`. See `DEPLOYMENT_GOTCHAS.md:51-55`.

### 11.5 `npm run lint` broken on Windows — **fixed**

The script was `eslint 'src/**/*.ts' --max-warnings 0`. npm on Windows hands that to `cmd.exe`, where single quotes are literal, so ESLint received the string `'src/**/*.ts'` and reported *"No files matching the pattern"*. Now `eslint src --max-warnings 0`, and the backend lints clean.

### 11.6 `initData` replay window is 24 hours — **open, deliberate**

`validateTelegramInitData()` defaults to `maxAgeSeconds = 86400` (`backend/src/lib/telegram-auth.ts:40`) and every `authenticateMiniApp` call site uses that default, so a captured `initData` string is replayable for a day.

Not tightened because a customer who leaves the Mini App open overnight would then be silently signed out mid-checkout. If you want to close it, pass a smaller `maxAgeSeconds` at `backend/src/routes/telegram.ts:165` — but pair it with a client-side re-open prompt.

### 11.7 Unauthenticated Telegram admin routes — **fixed**

Six mutating routes were reachable by anyone, limited only by the global 600 req/min IP limiter:

| Route | Risk | Now |
|---|---|---|
| `POST /send-push` | Message **any** `chatId` from your bot | admin only |
| `GET /set-webhook` | Register a webhook URL derived from `Host` | admin only |
| `POST /set-webhook` | Same, plus drops pending updates | admin only |
| `POST /delete-webhook` | Take the bot offline | admin only |
| `POST /configure-bot` | Mutate bot-global state | admin only |
| `POST /set-menu-button` | Repoint every customer's Store button | admin only |

All six now require `authenticate, authorise("admin")`. `GET /health` and `GET /info` stay public so uptime monitoring keeps working — see §12.5 for what they still leak.

### 11.8 `initData` accepted from the query string — **fixed**

`readInitData()` preferred `?initData=`, and query strings land in proxy and CDN access logs — including Cloudflare's. It now reads only the body and the `x-telegram-init-data` header.

---

## 12. Security notes

### 12.1 The bot token is the root of trust

`initData` is authenticated by HMAC-SHA256 keyed on `TELEGRAM_BOT_TOKEN` (`backend/src/lib/telegram-auth.ts:74-77`). Anyone holding the token can mint a valid `initData` for **any** Telegram user and therefore act as any customer.

- Never commit it. Never paste it into an issue, a log, or a screenshot.
- Rotate it via `@BotFather` → `/revoke` if leaked. Rotation invalidates every Mini App session immediately — users reopen the app.
- It must be the **same** bot that owns the Mini App. Mismatch → 401 on every request (§9.6).

### 12.2 Webhook secret

`TELEGRAM_WEBHOOK_SECRET` (min 16 chars) is compared against the `x-telegram-bot-api-secret-token` header (`backend/src/routes/telegram.ts:48,1463`). Without it, anyone who learns your webhook URL can inject fake updates.

### 12.3 Behind Cloudflare specifically

- Cloudflare terminates TLS. Make sure the origin link is **Full (strict)**, not Flexible, or you'll loop.
- **Do not** enable Cloudflare's Browser Integrity Check / JS challenge on `/api/*`. It breaks the Mini App's `fetch` calls and the Telegram webhook (which must return plain 200).
- Bot Fight Mode will challenge Telegram's webhook IPs. Exclude `/api/telegram/webhook` from any challenge rules.
- Rate-limit `/api/telegram/webhook` loosely — Telegram retries.

### 12.4 CORS is not a security boundary here

`ALLOWED_ORIGINS` is enforced by `cors()`, but the Telegram Mini App endpoints authenticate via `initData`, not cookies. Adding an origin does not grant access to Mini App data. The real boundary is the HMAC.

### 12.5 What the public health endpoints still reveal

`GET /api/telegram/health` and `GET /api/telegram/info` are deliberately unauthenticated so uptime monitoring keeps working. They expose the bot id and username, the full `getMe` profile, and — via `webhook` — the registered webhook URL, `ip_address`, `pending_update_count` and `last_error_message`.

None of that is a credential, and none of it lets anyone act as a customer. But if you would rather not publish it, add a Cloudflare rule restricting `/api/telegram/health` and `/api/telegram/info` to your own monitoring IPs, or gate them with staff auth.

---

## Appendix — command quick reference

```powershell
# ── auth (needed by every admin POST below) ───────────────
curl.exe -c cookies.txt -X POST http://localhost:3001/api/auth/login `
  -H "Content-Type: application/json" -d '{"email":"...","password":"..."}'

# ── health (public) ────────────────────────────────────────
curl.exe http://localhost:3001/api/health
curl.exe http://localhost:3001/api/telegram/health
curl.exe http://localhost:3001/api/telegram/info

# ── bot configuration (admin — pass -b cookies.txt) ───────
curl.exe -b cookies.txt -X POST http://localhost:3001/api/telegram/configure-bot
curl.exe -b cookies.txt -X POST http://localhost:3001/api/telegram/set-menu-button
curl.exe -b cookies.txt -X POST http://localhost:3001/api/telegram/set-webhook -H "Content-Type: application/json" -d '{"url":"https://HOST/api/telegram/webhook"}'
curl.exe -b cookies.txt -X POST http://localhost:3001/api/telegram/delete-webhook

# ── tunnels ───────────────────────────────────────────────
cloudflared tunnel --url http://localhost:5173          # quick, random hostname
cloudflared tunnel run asella-miniapp                  # named, stable hostname
cloudflared tunnel --url http://localhost:5173 --loglevel debug   # see the traffic

# ── verification ──────────────────────────────────────────
cd backend; npx tsx src/scripts/verify-tma-auth.ts
cd backend; npm run lint
cd frontend; npm run build; npm run check-csp
cd frontend; npx eslint .
```

---

## Related documents

| Document | Covers |
|---|---|
| `setup.md` | General dev/prod setup. Its `telegram:poll` section is now corrected; it still recommends ngrok rather than Cloudflare |
| `DEPLOYMENT_GOTCHAS.md` | Seven historical incidents and their fixes. Read before touching CSP or the service worker |
| `csp-config.js` | Single source of truth for CSP, shared by Helmet and the build |
| `architecture.md` | System architecture |
| `CHANGELOG.md` | Per-change detail, including the `VITE_API_URL` incident (§9.8) |