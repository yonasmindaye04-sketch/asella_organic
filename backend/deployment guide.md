# Asella Organic — Deployment Guide

Everything we use, how to deploy it, how to check it worked, and what to do when it doesn't.

---

## 1. What we use

| Layer | Technology | Where it lives |
|---|---|---|
| Frontend | React 19 + TypeScript + Vite (PWA with a service worker) | Static files in `~/public_html` |
| Backend | Node/Express + TypeScript, bundled to `dist/server.js` | `~/asella-monorepo/backend` |
| Database | MySQL (database `asellafs_organic`) | Same server, `localhost` |
| Node runtime | Node 24 via CloudLinux Node.js Selector | `~/nodevenv/asella-monorepo/backend/24` |
| App server | Passenger (cPanel → Setup Node.js App) | Runs as `lsnode:` processes |
| Web server | LiteSpeed (Apache-compatible `.htaccess`) | Serves `public_html` |
| CDN / DNS | Cloudflare (proxied) | `www`, apex and `api` records |
| Hosting | Yegarahost / cPanel, account `asellafs`, server `ruby` | |
| Integrations | Telegram bot (webhook), Cloudinary, YouTube embeds | |

**Domains**
- `https://www.asellaorganic.com` is the canonical site. The bare apex redirects to it (301).
- `https://api.asellaorganic.com` is the backend API.
- Telegram webhook: `https://api.asellaorganic.com/api/telegram/webhook` (POST only; a browser GET will always 404, that is normal).

---

## 2. Golden rules (each one came from a real incident)

1. **Never ship `.htaccess` in the frontend zip.** The server copy holds the redirects, CSP, cache and security headers. Overwriting it breaks the site.
2. **Edit env vars in cPanel → Setup Node.js App, never in `.env`.** `.env` is ignored in production.
3. **CORS reads `ALLOWED_ORIGINS`.** Set it to a comma-separated list: `https://www.asellaorganic.com,https://asellaorganic.com`. `FRONTEND_URL` still works but is a **legacy fallback** consulted only when `ALLOWED_ORIGINS` is unset (`lib/origins.ts:4-9`). If neither is set, production falls back to the www + apex pair. Set `ALLOWED_ORIGINS` explicitly — do not rely on either fallback.
4. **Extract with `unzip -o` in the terminal, not File Manager's Extract button.** File Manager fails on non-empty folders ("Directory not empty").
5. **Run `chmod -R u+w` before extracting.** Our Windows zip tool stamps directories `0555` (read-only), which causes "Permission denied" on every create/delete.
6. **Do not delete `public_html/image/`.** It holds product photos, and some filenames were corrected directly on the server. Let `unzip -o` overwrite in place.
7. **No inline `<script>` and no `media="print" onload="this.media='all'"` in `index.html`.** The CSP has no `'unsafe-inline'` for scripts, so these are silently blocked. Put scripts in external files; load fonts and icons as plain `<link rel="stylesheet">`.
8. **Any scheduled job with an external effect must be idempotent.** The server runs more than one backend instance, so a plain `cron.schedule` fires multiple times. Use claim-then-act: `INSERT IGNORE` first, send only if `affectedRows > 0`.
9. **Never delete or `rm -rf` the `node_modules` symlink.** CloudLinux manages it. If `npm` refuses to run, check that `node_modules` is still a symlink.
10. **Never paste tokens, passwords or `dump.pm2` contents anywhere.** Use `read -s` (see §6) so secrets stay out of your shell history and screenshots.

---

## 3. Before you deploy (local machine)

- [ ] `frontend/public/.htaccess` matches the server version (see Appendix A), or you exclude it from the zip.
- [ ] `frontend/index.html` has no inline `<script>` and no `media="print"` / `onload=` on any `<link>`.
- [ ] Any new external domain (images, fonts, API, embeds) is added to the CSP in **both** places: Helmet in the backend (API responses) and `.htaccess` (site pages).
- [ ] `package.json` changes noted (decides whether you need `npm install` on the server).
- [ ] `backend/db/sql/` checked for **new** files. Any schema change ships as a new number, never as an edit to an already-applied file. If anything is new, `migrate.cjs` must be uploaded and run (step 4 in §4) and `migrations_log` verified afterwards.
- [ ] `SMS_DISPATCH_ENABLED` considered before restart. It defaults to `"true"`, so a restart on a box holding a provider credential starts sending real, billed SMS with no operator action. Set `"false"` unless dispatching is intended.
- [ ] Both builds succeed locally:
  ```powershell
  cd <repo>\backend;  npm run build
  cd <repo>\frontend; npm run build
  ```

**Zipping.** The built-in Windows/PowerShell zip tends to stamp read-only permissions. Preferred options, best first:
1. Upload with SFTP (FileZilla/WinSCP). No zip, correct permissions.
2. Zip with 7-Zip: `7z a -tzip dist.zip .\dist\*`
3. Keep the current tool, but always run the `chmod` steps below.

---

## 4. Deploy the backend

1. Zip `backend/dist/` (add `package.json` and `package-lock.json` only if dependencies changed). Upload to `~/asella-monorepo/backend/`.
2. On the server:
   ```bash
   chmod -R u+w ~/asella-monorepo/backend/dist
   cd ~/asella-monorepo/backend
   unzip -o dist.zip
   rm -f dist.zip
   ```
3. **Only if `package.json` changed:**
   ```bash
   source /home/asellafs/nodevenv/asella-monorepo/backend/24/bin/activate
   cd ~/asella-monorepo/backend
   npm install
   npm audit fix
   ```
   Use `npm install` (not `npm ci`) when you changed `overrides`, because `npm ci` ignores overrides that are not already in the lockfile.
4. **If any file in `backend/db/sql/` is new or changed — run the migrations.**
   This step is not optional and was previously missing from this guide, which is
   how a half-migrated production database happened: MySQL commits DDL implicitly,
   so a migration that dies partway leaves its earlier statements applied while
   `migrations_log` never records the file, and it re-fails identically forever.
   `migrate.cjs` tracks applied files by filename, so **an edit to an
   already-applied migration is silently skipped** — schema changes must ship as a
   *new* numbered file, never as a rewrite of an old one.

   ```bash
   source /home/asellafs/nodevenv/asella-monorepo/backend/24/bin/activate
   cd ~/asella-monorepo/backend
   node migrate.cjs
   ```

   `migrate.cjs` lives at `backend/` root, not in `dist/`, so upload it whenever
   `db/sql/` changes. In production it classifies pending files and:

   | Runs | Skipped (needs `--allow-dangerous`) |
   |---|---|
   | Real schema changes — e.g. `033_site_assets.sql` | `seed`, `dummy`, `repair`, `rebuild_inventory`, `verify_seed` — e.g. `026`–`032` |

   Skipped fixtures are **not** recorded as applied, so they are re-attempted and
   re-skipped every run. That is intentional: they are correct against seeded data
   and destructive against live orders. Do not pass `--allow-dangerous` on a
   production box that holds real orders.

   **Verify afterwards** — do not assume the run succeeded:

   ```sql
   SELECT filename, applied_at FROM migrations_log ORDER BY applied_at DESC LIMIT 10;
   ```

   A file that is present on disk but absent from `migrations_log` is half-applied.
5. **Only if env vars changed:** edit them in cPanel → Setup Node.js App.
6. Kill old processes, then restart:
   ```bash
   pkill -9 -f "asella-monorepo/backend"
   ```
   cPanel → Setup Node.js App → **Restart**.

---

## 5. Deploy the frontend

1. Build, then zip the **contents** of `frontend/dist/` **without `.htaccess`**. Upload to `~/public_html/`.
2. On the server:
   ```bash
   find ~/public_html/assets -type d -exec chmod u+w {} \; 2>/dev/null
   find ~/public_html/assets -type f -exec chmod u+w {} \; 2>/dev/null
   find ~/public_html/image  -type d -exec chmod u+w {} \; 2>/dev/null
   find ~/public_html/image  -type f -exec chmod u+w {} \; 2>/dev/null
   cd ~/public_html
   unzip -o dist.zip
   rm -f dist.zip
   ```
   Always delete `dist.zip` afterwards. Left in `public_html` it is publicly downloadable.
3. Purge the Cloudflare cache.

---

## 6. Verify (run all of it)

```bash
# 1. Backend process: PPID must be a live PID, never 1
sleep 20
ps -u asellafs -o pid,ppid,etime,cmd

# 2. API health
curl -s -o /dev/null -w "%{http_code}\n" https://api.asellaorganic.com/api/health     # expect 200

# 3. No missing JS chunks (empty output = good)
cd ~/public_html
grep -o 'assets/[^"]*' index.html | sort -u > /tmp/referenced.txt
ls assets/ | sort | sed 's#^#assets/#' > /tmp/actual.txt
comm -23 /tmp/referenced.txt /tmp/actual.txt

# 4. .htaccess survived (expect 1) and redirects work (expect 301, 301, 200)
grep -c "Content-Security-Policy" ~/public_html/.htaccess
curl -sI http://asellaorganic.com/      | head -3
curl -sI https://asellaorganic.com/     | head -3
curl -sI https://www.asellaorganic.com/ | head -3

# 5. Icon/font regression check: no media="print" or onload= on these tags
grep -A5 "Material+Symbols" ~/public_html/index.html

# 6. Telegram webhook, without pasting the token anywhere
read -s -p "Bot token: " TOKEN; echo
curl -s "https://api.telegram.org/bot$TOKEN/getWebhookInfo"; echo
unset TOKEN
```

**Reading the process list**
- Two `lsnode:` lines sharing the **same live PPID**: normal. This server runs a multi-instance Passenger pool, and a restart briefly shows old and new workers together.
- A `lsnode:` line with **`PPID 1`**: orphaned worker. Kill and restart:
  ```bash
  pkill -9 -f "asella-monorepo/backend"
  ```
  then cPanel → Restart, wait 20 seconds, and recheck.
- No `lsnode:` line right after a kill: normal. Passenger starts a worker on the first request, so hit `/api/health` and check again.

**Browser check.** Open a **fresh incognito window** (an old service worker can serve stale files) on `https://www.asellaorganic.com`:
- Address bar stays on `www`
- Icons are glyphs, not words like `shopping_cart`
- Products and images load; New Sales Order dropdown is clean
- Console has no CORS or CSP errors
- Login and dashboard work

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `503` from the API, no process in `ps` | App crashes on boot | `source` the nodevenv, `cd ~/asella-monorepo/backend`, run `node dist/server.js` and read the error |
| `Cannot find package 'x'` on boot | Dependencies not installed after `package.json` change | `npm install` in the nodevenv (§4 step 3) |
| Crash: `Missing parameter name at index` (`/*`) | New `path-to-regexp` rejects bare `/*` | Use a named wildcard, `/*splat` |
| "Permission denied" on extract or delete; folders show `0555` | Zip carries read-only permissions | `chmod -R u+w` the folder, then `unzip -o`. Fix at source with 7-Zip or SFTP |
| File Manager: "Directory not empty" | GUI can't overwrite non-empty folders | Use `unzip -o` in the terminal |
| Raw LiteSpeed 404 on some pages; "Something went wrong" | Partial extract left missing JS chunks | Run the chunk check (§6.3), re-extract |
| Products/login fail on `www`; CORS error in console | `ALLOWED_ORIGINS` missing the `www` origin, or unset so the legacy `FRONTEND_URL` fallback is in play | Set `ALLOWED_ORIGINS` to both origins in cPanel, restart. The allowed list is printed to the log at boot — check it there first |
| Icons show as words (`info`, `eco`) | Stylesheet stuck at `media="print"` (CSP blocks `onload`) | Remove `media="print"` and `onload=` from the `<link>` |
| Console: "Executing inline script violates CSP" | Inline `<script>` in `index.html` | Move it to an external file in `public/` |
| Thumbnails or embeds blocked (`sw.js` fetch errors) | Domain missing from CSP `connect-src` / `img-src` / `frame-src` | Add it to `.htaccess` **and** Helmet |
| Apex returns `200` instead of `301` | Redirect rule is below the SPA fallback `[L]` rule | Redirects must be first in `.htaccess` |
| Old behavior persists after deploy, `curl` looks fine | Stale service worker | DevTools → Application → Unregister + Clear site data, or open a new incognito window |
| Empty storefront, API returns `total: 0` | Products have `active = 0` | Check `SELECT active, COUNT(*) FROM products GROUP BY active;` |
| Duplicate products in dropdown | Same product present under two naming/ID batches | Audit by name; deactivate the batch with no orders |
| Broken product image | `image_url` doesn't match the real filename, or is a Drive/share link | `ls ~/public_html/image/products/` and fix the DB value |
| Double Telegram messages | Scheduled job fired on 2+ instances, or stray PM2/cron | Claim-then-act pattern; check `crontab -l` and `ps` for PM2 |
| `npm audit fix` loops with high-severity items | Vulnerable package is a deep transitive dependency | Add an `overrides` entry in `package.json`, then `npm install` |
| `~` not expanded | `~` inside double quotes | Use `$HOME` or leave `~` unquoted |

---

## 8. Database notes

- One row per product **size** is intentional. `name` holds the base product; `package_size` holds the size. Never put the size in `name`.
- `tag` is a category (`Herbs`, `Oils`, `Superfood`, `Traditional`), never a status string like `active`.
- `image_url` must be `/image/products/<exact filename>` matching a real file.
- Back up before any bulk change:
  ```bash
  mysqldump -u asellafs_organic -p asellafs_organic products stock_snapshots > ~/products_backup_$(date +%Y%m%d_%H%M).sql
  ```
- Use `INSERT ... ON DUPLICATE KEY UPDATE` in migrations. `INSERT IGNORE` skips existing IDs and will not reactivate rows.
- Check live IDs against the migration before running it, because a reused ID overwrites the wrong product.

---

## 9. Security housekeeping

- [ ] Rotate the Telegram bot token (`/revoke` in BotFather), then update `TELEGRAM_BOT_TOKEN` in cPanel and restart.
- [ ] Rotate the Cloudinary API secret and update it in cPanel.
- [ ] Rotate the DB password, JWT secret and refresh-token secret if they were ever pasted anywhere.
- [ ] Use a different value for `DB_PASSWORD` and `INITIAL_ADMIN_PASSWORD`.
- [ ] Delete old `.env.save*` files and stale `dist.backup-*` folders from the app root.
- [ ] Keep `.htaccess` backups out of the web root when possible (`.htaccess.bak_*` files are dotfiles and blocked, but still clutter).

---

## Appendix A — Canonical `public_html/.htaccess`

Order matters: redirects first, SPA fallback second.

```apache
# ═══════════════════════════════════════════════════════════════════
# Asella Organic — Redirects, Cache Headers & Security
# ═══════════════════════════════════════════════════════════════════

# ── 1. Force HTTPS ──────────────────────────────────────────────────
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{HTTPS} off
  RewriteCond %{HTTP:X-Forwarded-SSL} !on
  RewriteCond %{HTTP_HOST} ^asellaorganic\.com$ [OR]
  RewriteCond %{HTTP_HOST} ^www\.asellaorganic\.com$
  RewriteRule ^(.*)$ "https\:\/\/www\.asellaorganic\.com\/$1" [R=301,L]
</IfModule>

# ── 1b. Apex → www (unconditional — catches HTTPS apex too) ─────────
<IfModule mod_rewrite.c>
  RewriteCond %{HTTP_HOST} ^asellaorganic\.com$ [NC]
  RewriteRule ^(.*)$ https://www.asellaorganic.com/$1 [L,R=301]
</IfModule>

# ── 2. SPA fallback ─────────────────────────────────────────────────
<IfModule mod_rewrite.c>
  RewriteBase /
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]
  RewriteRule . /index.html [L]
</IfModule>

# ── 2b. Custom 404 page ─────────────────────────────────────────────
ErrorDocument 404 /offline.html

# ── 3. Compression ──────────────────────────────────────────────────
<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css text/javascript application/javascript application/json application/xml image/svg+xml font/ttf font/opentype
</IfModule>

# ── 4. Cache-Control ────────────────────────────────────────────────
<IfModule mod_expires.c>
  ExpiresActive On
  ExpiresByType image/webp "access plus 1 year"
  ExpiresByType image/avif "access plus 1 year"
  ExpiresByType image/jpeg "access plus 1 year"
  ExpiresByType image/png  "access plus 1 year"
  ExpiresByType image/gif  "access plus 1 year"
  ExpiresByType image/svg+xml "access plus 1 year"
  ExpiresByType image/x-icon "access plus 1 year"
  ExpiresByType text/css                  "access plus 1 month"
  ExpiresByType text/javascript           "access plus 1 month"
  ExpiresByType application/javascript    "access plus 1 month"
  ExpiresByType font/ttf                  "access plus 1 year"
  ExpiresByType font/opentype             "access plus 1 year"
  ExpiresByType font/woff                 "access plus 1 year"
  ExpiresByType font/woff2                "access plus 1 year"
  ExpiresByType application/font-woff2    "access plus 1 year"
  ExpiresByType text/html                 "access plus 0 seconds"
  ExpiresByType application/json          "access plus 0 seconds"
</IfModule>

<IfModule mod_headers.c>
  <FilesMatch "\.(js|css)\.(map|br|gz)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "\.(webp|avif|jpg|jpeg|png|gif|svg|ico)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "\.(woff2?|ttf|otf|eot)$">
    Header set Cache-Control "public, max-age=31536000, immutable"
  </FilesMatch>
  <FilesMatch "\.(html)$">
    Header set Cache-Control "no-cache, must-revalidate"
  </FilesMatch>
</IfModule>

# ── 5. Security headers + CSP (single block — never duplicate) ──────
<IfModule mod_headers.c>
  Header always set X-Content-Type-Options "nosniff"
  Header always set X-Frame-Options "DENY"
  Header always set Referrer-Policy "strict-origin-when-cross-origin"
  Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
  Header always set Permissions-Policy "geolocation=(), camera=(), microphone=(), payment=(), usb=()"
  Header always set Content-Security-Policy "default-src 'self'; base-uri 'self'; form-action 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; img-src 'self' data: https:; connect-src 'self' https://api.asellaorganic.com https://i.ytimg.com https://lh3.googleusercontent.com; font-src 'self' data: https://fonts.gstatic.com https://cdnjs.cloudflare.com; object-src 'none'; frame-src https://www.youtube.com https://youtube.com https://www.youtube-nocookie.com; frame-ancestors 'self'; upgrade-insecure-requests"
</IfModule>

# ── 6. Block dotfiles ───────────────────────────────────────────────
<FilesMatch "^\.(?!htaccess)">
  Require all denied
</FilesMatch>
```

---

## Appendix B — Quick command reference

| Task | Command |
|---|---|
| Check processes | `ps -u asellafs -o pid,ppid,etime,cmd` |
| Kill backend | `pkill -9 -f "asella-monorepo/backend"` |
| Activate Node env | `source /home/asellafs/nodevenv/asella-monorepo/backend/24/bin/activate` |
| Run backend in foreground (see crash errors) | `cd ~/asella-monorepo/backend && node dist/server.js` |
| API health | `curl -s -o /dev/null -w "%{http_code}\n" https://api.asellaorganic.com/api/health` |
| Check crontab for strays | `crontab -l` |
| Back up `.htaccess` | `cp ~/public_html/.htaccess ~/public_html/.htaccess.bak_$(date +%Y%m%d)` |
| Git push rejected | `git pull --rebase && git push` |