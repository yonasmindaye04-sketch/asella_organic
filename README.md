# Asella Organic

Asella Organic is a premium e-commerce platform for selling organic agricultural products, featuring a modern React frontend and a secure Node.js/Express backend.

---

##  Pre-Deployment Checklist (Must-Haves)

Before deploying this application to a live production environment (e.g., VPS, Heroku, Vercel, DigitalOcean), you **MUST** ensure the following items are configured correctly. Failure to do so may result in security vulnerabilities, broken features, or data loss.

### 1.  Environment Variables (`.env`)
You must configure a production `.env` file for the backend. Never commit this file to GitHub!
- [ ] **`NODE_ENV=production`**: This is critical. It enables secure cookies (`Secure` flag), turns off verbose error stack traces, and optimizes Express performance.
- [ ] **`FRONTEND_URL`**: Must be set to your exact live domain (e.g., `https://asellaorganic.com`). If this is wrong, CORS will block all frontend API requests.
- [ ] **`JWT_SECRET`**: Must be a long, cryptographically secure random string (e.g., generated via `openssl rand -hex 64`). DO NOT use a simple password.
- [ ] **`TELEGRAM_BOT_TOKEN`**: Ensure you have created a production Telegram bot via BotFather and provided the token.
- [ ] **`TELEGRAM_WEBHOOK_SECRET`**: A random string used to verify that incoming webhooks are actually coming from Telegram.
- [ ] **`CLOUDINARY_URL` / API Keys**: Required for image and receipt uploads to function.

### 2. 🗄️ Database Readiness
- [ ] **MySQL Production Database**: Ensure you are connecting to a production-grade MySQL database (not local SQLite).
- [ ] **Run Migrations**: Ensure `001_complete_schema.sql` and `004_dummy_data.sql` (if you need the default Admin user) are executed on the live database.
- [ ] **Change Default Admin Password**: Immediately log in using the default admin credentials and **change the password**. Set up 2FA immediately.
- [ ] **Automated Backups**: Configure daily automated SQL dumps for your MySQL database. 

### 3. 🌐 Infrastructure & Security
- [ ] **HTTPS / SSL Certificate**: the site **must** be served over HTTPS. Because the authentication system uses `HttpOnly` and `Secure` cookies, login will **completely fail** on a production server without HTTPS.
- [ ] **ECAE Certificate**: Ensure your quality certificates are uploaded and correctly linked in the storefront for customer trust.
- [ ] **PM2 / Process Manager**: Do not run the backend using `npm run dev`. Compile it using `npm run build` and run it using a process manager like PM2 (`pm2 start dist/server.js`) so it restarts automatically if it crashes.

### 4. 🧪 Final Testing
- [ ] **Test a Full Order Flow**: Place a test order as a customer, upload a dummy receipt, and ensure the Telegram Bot notifies the staff group.
- [ ] **Test Authentication**: Ensure staff login works and that cookies are successfully set in the browser's developer tools.

---

## 💻 Local Development Setup

### Prerequisites
- Node.js (v18+)
- MySQL (v8.0+)
- npm

### Installation

1. **Clone the repository**
   ```bash
   git clone <repo-url>
   cd asella_organic
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   # Copy .env.example to .env and configure your local MySQL credentials
   npm run dev
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   # Copy .env.example to .env (set )
   npm run dev
   ```