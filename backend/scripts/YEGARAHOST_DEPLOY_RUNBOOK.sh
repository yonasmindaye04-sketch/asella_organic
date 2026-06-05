# Asella Organic — YegaraHost Deployment Runbook
# Complete step-by-step for a first-time production deployment.
# Copy and run each command block exactly as shown.

# ══════════════════════════════════════════════════════════════════════
# PHASE 1 — Pre-deployment (do this on YOUR LOCAL machine)
# ══════════════════════════════════════════════════════════════════════

# 1.1  Generate production secrets (run once — save the output somewhere safe)
node -e "
  const c = require('crypto');
  console.log('JWT_SECRET=' + c.randomBytes(64).toString('hex'));
  console.log('REFRESH_TOKEN_SECRET=' + c.randomBytes(64).toString('hex'));
  console.log('TELEGRAM_WEBHOOK_SECRET=' + c.randomBytes(32).toString('hex'));
"

# 1.2  Create your production env file
cp backend/.env.production.example backend/.env.production
# Edit backend/.env.production and fill in:
#   DB_HOST, DB_USER, DB_PASSWORD, DB_NAME  (from YegaraHost DirectAdmin)
#   JWT_SECRET, REFRESH_TOKEN_SECRET        (from step 1.1)
#   FRONTEND_URL, ALLOWED_ORIGINS           (your domain, e.g. https://asella.com)
#   TELEGRAM_BOT_TOKEN                      (from BotFather)
nano backend/.env.production   # or use your text editor

# 1.3  Verify local build is clean
cd backend  && npm run build --if-present && npx tsc --noEmit
cd ../frontend && npm run build
cd ..
echo "✓ Local build passed"

# 1.4  Run tests locally (must all pass before deploy)
cd backend && npm test
echo "✓ Tests passed"
cd ..

# ══════════════════════════════════════════════════════════════════════
# PHASE 2 — YegaraHost DirectAdmin setup (do this in the browser)
# ══════════════════════════════════════════════════════════════════════

# 2.1  Log into DirectAdmin at https://yourdomain.com:2222
# 2.2  Go to: MySQL Management → Create Database
#       Database name: asella_organic  (will become cpanel_user_asella_organic)
#       Username:      asella_user     (will become cpanel_user_asella_user)
#       Password:      <strong password — save this>
#       Privileges:    ALL
# 2.3  Go to: Advanced Features → Node.js (or cPanel → Setup Node.js App)
#       - Enable Node.js for your account
#       - Note the Node.js version (choose 20.x if available)
# 2.4  Go to: DNS Management
#       - Confirm your domain points to the server IP
#       - Add A record: @ → server IP  (TTL 300)
#       - Add A record: www → server IP

# ══════════════════════════════════════════════════════════════════════
# PHASE 3 — Server setup (SSH into YegaraHost)
# ══════════════════════════════════════════════════════════════════════

# 3.1  SSH in (get host/credentials from DirectAdmin → SSH Access)
ssh your_username@your_server_ip

# 3.2  Create directory structure
mkdir -p ~/public_html/asella-organic
mkdir -p ~/logs
mkdir -p ~/backups/asella/db
mkdir -p ~/backups/asella/code
cd ~/public_html/asella-organic

# 3.3  Clone your repository
git clone https://github.com/yourusername/asella-organic.git .
# Or if private repo, use personal access token:
# git clone https://YOUR_TOKEN@github.com/yourusername/asella-organic.git .

# 3.4  Upload production env file (from your LOCAL machine — run in new terminal)
scp backend/.env.production your_username@your_server_ip:~/public_html/asella-organic/backend/.env.production
# Then back in SSH:
chmod 600 ~/public_html/asella-organic/backend/.env.production

# 3.5  Install Node.js dependencies
cd ~/public_html/asella-organic/backend
npm ci --production
cd ..

# 3.6  Build frontend
cd ~/public_html/asella-organic/frontend
npm ci
VITE_API_URL=https://yourdomain.com npm run build
cd ..

# 3.7  Copy built frontend to web root (so DirectAdmin serves it)
cp -r ~/public_html/asella-organic/frontend/dist/* ~/public_html/

# 3.8  Create .htaccess for React Router (SPA routing)
cat > ~/public_html/.htaccess << 'EOF'
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /

  # Don't rewrite existing files or directories
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d

  # Don't rewrite API calls — proxy to backend
  RewriteCond %{REQUEST_URI} !^/api/

  # Route everything else to index.html (React Router)
  RewriteRule . /index.html [L]
</IfModule>

# Security headers
Header always set X-Content-Type-Options "nosniff"
Header always set X-Frame-Options "DENY"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
<IfModule mod_headers.c>
  Header always unset X-Powered-By
</IfModule>
EOF

# ══════════════════════════════════════════════════════════════════════
# PHASE 4 — Database setup
# ══════════════════════════════════════════════════════════════════════

# 4.1  Load env vars from .env.production
export $(grep -v '^#' ~/public_html/asella-organic/backend/.env.production | xargs)

# 4.2  Run migrations
cd ~/public_html/asella-organic/backend
NODE_ENV=production node migrate.cjs

# 4.3  Verify tables were created
mysql -h "$DB_HOST" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SHOW TABLES;"
# Expected: 15+ tables listed

# 4.4  Create admin user (replace values)
node -e "
require('dotenv').config({ path: '.env.production' });
const bcrypt = require('bcryptjs');
const mysql  = require('mysql2/promise');

(async () => {
  const pool = await mysql.createConnection({
    host: process.env.DB_HOST, user: process.env.DB_USER,
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME,
  });
  const hash = await bcrypt.hash('CHANGE_THIS_PASSWORD', 12);
  await pool.execute(
    \`INSERT INTO staff_users (id, username, password_hash, full_name, role, active)
     VALUES (UUID(), 'admin', ?, 'Asella Admin', 'admin', true)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash)\`,
    [hash]
  );
  console.log('✓ Admin user created: admin / CHANGE_THIS_PASSWORD');
  await pool.end();
})();
"

# ══════════════════════════════════════════════════════════════════════
# PHASE 5 — Process manager (PM2)
# ══════════════════════════════════════════════════════════════════════

# 5.1  Install PM2 globally
npm install -g pm2

# 5.2  Copy ecosystem config to server root
cp ~/public_html/asella-organic/config/ecosystem.config.cjs ~/public_html/asella-organic/

# 5.3  Start the application
cd ~/public_html/asella-organic
pm2 start ecosystem.config.cjs

# 5.4  Save process list (survives reboot)
pm2 save

# 5.5  Enable auto-start on server reboot
pm2 startup
# Follow the instruction PM2 prints — copy and run the sudo command it shows

# 5.6  Verify it's running
pm2 list
pm2 logs asella-api --lines 20

# ══════════════════════════════════════════════════════════════════════
# PHASE 6 — SSL/HTTPS (in DirectAdmin browser)
# ══════════════════════════════════════════════════════════════════════

# 6.1  Go to DirectAdmin → SSL Certificates
# 6.2  Select "Free & automatic certificate from Let's Encrypt"
# 6.3  Click "Save" — SSL provisions in 1-5 minutes
# 6.4  Test: https://yourdomain.com should load with padlock

# ══════════════════════════════════════════════════════════════════════
# PHASE 7 — Configure API proxy (DirectAdmin / .htaccess)
# ══════════════════════════════════════════════════════════════════════

# Add API proxy to .htaccess (routes /api/* to backend on port 3001)
cat >> ~/public_html/.htaccess << 'EOF'

# Proxy API requests to Node.js backend
<IfModule mod_proxy.c>
  ProxyRequests Off
  ProxyPreserveHost On
  ProxyPass        /api  http://127.0.0.1:3001/api
  ProxyPassReverse /api  http://127.0.0.1:3001/api
</IfModule>
EOF

# If mod_proxy is not available, ask YegaraHost support to enable it,
# OR configure the backend to serve static files directly.

# ══════════════════════════════════════════════════════════════════════
# PHASE 8 — Post-deployment verification
# ══════════════════════════════════════════════════════════════════════

# 8.1  Health check (must return {"db":true,"telegram":true})
curl https://yourdomain.com/api/health

# 8.2  Test login
curl -s -X POST https://yourdomain.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"CHANGE_THIS_PASSWORD"}' \
  | python3 -m json.tool

# 8.3  Test products endpoint
curl -s https://yourdomain.com/api/products | python3 -m json.tool | head -30

# 8.4  Set up cron for backups
crontab -e
# Add this line (backup at 2 AM daily):
# 0 2 * * * /home/your_username/public_html/asella-organic/scripts/backup.sh >> /home/your_username/logs/backup.log 2>&1

# 8.5  Check PM2 status one last time
pm2 list
pm2 logs asella-api --lines 50

echo ""
echo "✅ Deployment complete!"
echo "   Frontend: https://yourdomain.com"
echo "   API:      https://yourdomain.com/api/health"
echo "   PM2:      pm2 logs asella-api"
echo "   Backups:  ~/backups/asella/"
