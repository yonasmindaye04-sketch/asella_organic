# Asella Organic — Development, Deployment & Telegram Mini App Setup Guide

---

## 1. Prerequisites
- **Node.js:** 20.x or 24.x LTS
- **npm:** 10.x or higher
- **MySQL:** 8.0+ or MariaDB 10.5+
- **PM2:** For production daemon process management
- **Telegram Account & Bot:** Created via `@BotFather` on Telegram

---

## 2. Environment Configuration

### Backend Environment (`backend/.env`)
Create a `.env` file in the `backend/` directory:

```env
# ── Server Configuration ──────────────────────────────────────
PORT=3001
NODE_ENV=development
PUBLIC_URL=http://localhost:3001

# ── Database (MySQL 8.0) ──────────────────────────────────────
# Option A: Connection URL
DATABASE_URL=mysql://root:your_mysql_password@127.0.0.1:3306/asella_organic

# Option B: Discrete Parameters (Used by migrate.cjs and db pool)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=asella_organic

# ── Security & Authentication ─────────────────────────────────
# Minimum 32 characters
JWT_SECRET=super_secure_jwt_secret_key_change_in_production_min_32_chars
JWT_EXPIRES_IN=7d

# ── CORS & Allowed Origins ────────────────────────────────────
# Comma-separated origins allowed to access the API
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000,http://localhost:3001,https://web.telegram.org

# ── Telegram Bot & Mini App Integration ───────────────────────
# Obtained from @BotFather
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrSTUvwxYZ_your_token

# Secret token used to authenticate Telegram webhook payloads
TELEGRAM_WEBHOOK_SECRET=your_long_random_webhook_secret_key_at_least_16_chars

# Admin chat ID for system alerts and critical updates
TELEGRAM_ADMIN_CHAT_ID=123456789

# Telegram supergroup ID where delivery orders are broadcast to drivers
TELEGRAM_DELIVERY_GROUP_ID=-1001234567890

# Canonical HTTPS URL for the Telegram Mini App Store
# In production: https://asellaorganic.com/telegram-store
# In local dev: use an HTTPS tunnel (e.g., ngrok or cloudflared)
TELEGRAM_MINIAPP_URL=https://asellaorganic.com/telegram-store

# ── Cloudinary Image Hosting ──────────────────────────────────
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# ── Google Sheets Sync (Optional) ─────────────────────────────
GOOGLE_SPREADSHEET_ID=your_google_spreadsheet_id
GOOGLE_SERVICE_ACCOUNT_JSON=
```

### Frontend Environment (`frontend/.env`)
Optional in local development as Vite automatically proxies `/api` to `http://localhost:3001`.

```env
VITE_API_URL=
```

---

## 3. Database Initialization & Migrations

1. **Create the Database in MySQL:**
   ```sql
   CREATE DATABASE asella_organic CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
   ```

2. **Run Migrations:**
   ```bash
   cd backend
   npm install
   node migrate.cjs
   ```
   This executes all `.sql` scripts located in `backend/db/sql/` sequentially and creates tables, indexes, and triggers.

3. **Seed Administrative User:**
   ```bash
   node create-admin.js
   ```

---

## 4. Local Development Walkthrough

To test both the web storefront and the Telegram bot locally, open separate terminal windows:

### Terminal 1: Backend API Server
```bash
cd backend
npm run dev
```
The API server starts on `http://localhost:3001`. Verify with `http://localhost:3001/api/health`.

### Terminal 2: Frontend Web Client
```bash
cd frontend
npm install
npm run dev
```
Vite dev server starts on `http://localhost:5173`. Open `http://localhost:5173/telegram-store` to preview the Mini App in a browser.

### Terminal 3: Telegram Bot Polling (Local Dev Utility)
Because Telegram cannot send incoming webhooks directly to `localhost`, run the local polling daemon:
```bash
cd backend
npm run telegram:poll
```
This utility polls Telegram for updates and forwards them directly to your local backend endpoint (`http://localhost:3001/api/telegram/webhook`).

---

## 5. Telegram Mini App Setup (BotFather Walkthrough)

Telegram Mini Apps run inside Telegram's secure webview. Follow these steps to register and configure the Asella Organic Mini App:

### Step 5.1: Create Your Bot
1. Open Telegram and search for `@BotFather`.
2. Send `/newbot`.
3. Choose a name: `Asella Organic Store`.
4. Choose a username: `AsellaOrganicBot` (must end in `bot`).
5. Copy the generated HTTP API token and paste it into `backend/.env` under `TELEGRAM_BOT_TOKEN`.

### Step 5.2: Configure the Persistent Chat Menu Button & Commands
The bot automatically synchronizes commands, descriptions, and the Chat Menu Button on server startup when `TELEGRAM_BOT_TOKEN` is present and `TELEGRAM_MINIAPP_URL` is an HTTPS URL.

**Option A: Automated on Server Startup or via Backend Endpoint**
The server automatically calls `initBotConfiguration()` on boot. You can also trigger a manual resync anytime:
```bash
curl -X POST http://localhost:3001/api/telegram/configure-bot
```
This automatically registers:
- Menu button pointing to `TELEGRAM_MINIAPP_URL` with label `"Store"`
- Autocompletion commands (`/start`, `/store`, `/shop`, `/track`, `/orders`, `/help`)
- Bot welcome description and profile bio

**Option B: Manual Configuration via BotFather**
1. Send `/setmenubutton` to `@BotFather`.
2. Select your bot.
3. Send the button title: `Store`.
4. Send the Web App URL: `https://asellaorganic.com/telegram-store`.

### Step 5.3: Register Direct App Link (Optional Short Name)
This allows users to open the Mini App via direct links like `t.me/AsellaOrganicBot/store`:
1. Send `/newapp` to `@BotFather`.
2. Select your bot.
3. Provide a title: `Asella Organic Store`.
4. Provide a description: `100% natural organic health products from Ethiopian highlands`.
5. Upload an app icon (640x360 px image).
6. Set short name: `store`.
7. Enter Web App URL: `https://asellaorganic.com/telegram-store`.

### Step 5.4: Bot Health Check & Administration Endpoints
The backend provides dedicated diagnostics and management endpoints:
- `GET /api/telegram/health`: Tests Telegram connection, bot info, and webhook status.
- `GET /api/telegram/info`: Retrieves bot profile details.
- `POST /api/telegram/set-webhook`: Sets the production webhook URL and secret token.
- `POST /api/telegram/delete-webhook`: Removes the webhook and drops pending updates.
- `POST /api/telegram/send-push`: Sends push notifications to a user's Telegram chat.

### Step 5.5: Delivery Driver Group Setup
1. Create a Telegram supergroup for delivery drivers.
2. Add your bot to the group as an Administrator.
3. Obtain the group chat ID (starts with `-100`):
   - Add `@userinfobot` or forward a message from the group to check ID.
4. Set `TELEGRAM_DELIVERY_GROUP_ID` in `backend/.env`.

---

## 6. Testing & Validation

### 1. Verify Telegram HMAC Signature Verification
Run the automated security test:
```bash
cd backend
npx tsx src/scripts/verify-tma-auth.ts
```
Expected output:
```
[PASS] Test 1: Authentic Telegram initData verified successfully.
[PASS] Test 2: Tampered data correctly rejected with signature mismatch.
[PASS] Test 3: Expired initData correctly rejected (replay protection).
[PASS] Test 4: Missing hash correctly rejected.
```

### 2. Verify Frontend Production Build & CSP
```bash
cd frontend
npm run build
npm run check-csp
```
Expected output:
```
CSP config matches dist/.htaccess
```

### 3. Local In-App Testing with Tunnel (e.g. Cloudflare / ngrok)
Telegram requires HTTPS URLs for WebApps. For end-to-end testing inside the Telegram mobile client:
```bash
ngrok http 5173
```
`frontend/vite.config.ts` is pre-configured with `allowedHosts: true`, `host: true`, and `ngrok-skip-browser-warning: true` so the Mini App loads directly inside Telegram's webview without interstitial screens.
Copy the generated HTTPS URL (e.g., `https://xxxx.ngrok-free.app/telegram-store`) and update `TELEGRAM_MINIAPP_URL` in `backend/.env` or trigger:
```bash
curl -X POST http://localhost:3001/api/telegram/configure-bot
```

---

## 7. Production Deployment

### 1. Build Artifacts
```bash
# Build backend
cd backend
npm run build

# Build frontend
cd ../frontend
npm run build
```

### 2. Set Up Webhook
Register your production domain with Telegram Bot API:
```bash
curl "https://api.asellaorganic.com/api/telegram/set-webhook"
```

### 3. Run with PM2
Start the application using `ecosystem.config.cjs`:
```bash
cd ..
pm2 start ecosystem.config.cjs
pm2 save
```

### 4. Reverse Proxy (Nginx / Apache)
Ensure your web server passes the following headers:
- `X-Forwarded-For`
- `X-Forwarded-Proto https`
- Content Security Policy headers from `csp-config.js` (automatically set in `.htaccess` by `postbuild.js`).
