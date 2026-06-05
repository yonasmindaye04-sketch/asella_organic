#!/bin/bash
# =============================================================================
# scripts/deploy.sh
# Asella Organic — YegaraHost Deployment Script
#
# Run this from your LOCAL machine to deploy to YegaraHost via SSH.
#
# FIRST-TIME SETUP:
#   1. Fill in the CONFIGURE section below
#   2. chmod +x scripts/deploy.sh
#   3. Run: ./scripts/deploy.sh
#
# SUBSEQUENT DEPLOYS (code update only):
#   ./scripts/deploy.sh --update-only
#
# WHAT IT DOES:
#   1. Checks local build passes
#   2. SSHs into YegaraHost
#   3. Pulls latest code
#   4. Installs dependencies
#   5. Builds frontend
#   6. Runs DB migrations
#   7. Restarts backend (zero-downtime via PM2 reload)
#   8. Verifies health endpoint
# =============================================================================

set -euo pipefail

# ── CONFIGURE THESE ───────────────────────────────────────────────────────────
SSH_HOST="your-server-ip-or-hostname"
SSH_USER="your-cpanel-username"
SSH_PORT="22"
REMOTE_DIR="/home/${SSH_USER}/public_html/asella-organic"
DOMAIN="https://yourdomain.com"
REPO_URL="https://github.com/yourusername/asella-organic.git"
# ─────────────────────────────────────────────────────────────────────────────

UPDATE_ONLY="${1:-}"
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')] [deploy]"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║   Asella Organic — Deployment        ║"
echo "║   Target: $DOMAIN"
echo "╚══════════════════════════════════════╝"
echo ""

# ── 1. Local pre-flight ────────────────────────────────────────────────────────
echo "$LOG_PREFIX Step 1/8: Local pre-flight checks..."

echo "  Running backend type check..."
cd backend && npx tsc --noEmit && cd ..

echo "  Building frontend..."
cd frontend && npm run build && cd ..
echo "$LOG_PREFIX ✓ Local build passed"

# ── 2. Backup before deploy ────────────────────────────────────────────────────
echo "$LOG_PREFIX Step 2/8: Creating pre-deploy backup on server..."
ssh -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}" "
  set -e
  cd '${REMOTE_DIR}'
  if [ -f scripts/backup.sh ]; then
    bash scripts/backup.sh
  fi
" && echo "$LOG_PREFIX ✓ Backup complete" || echo "$LOG_PREFIX ⚠ Backup skipped (first deploy?)"

# ── 3. Pull latest code ────────────────────────────────────────────────────────
echo "$LOG_PREFIX Step 3/8: Pulling latest code..."
ssh -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}" "
  set -e
  if [ ! -d '${REMOTE_DIR}' ]; then
    echo 'First deploy — cloning repository...'
    git clone '${REPO_URL}' '${REMOTE_DIR}'
  fi
  cd '${REMOTE_DIR}'
  git fetch origin
  git reset --hard origin/main
  echo 'Code pulled: '$(git log --oneline -1)
"
echo "$LOG_PREFIX ✓ Code updated"

# ── 4. Install dependencies ────────────────────────────────────────────────────
echo "$LOG_PREFIX Step 4/8: Installing backend dependencies..."
ssh -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}" "
  set -e
  cd '${REMOTE_DIR}/backend'
  npm ci --production --silent
"
echo "$LOG_PREFIX ✓ Dependencies installed"

# ── 5. Build frontend ─────────────────────────────────────────────────────────
echo "$LOG_PREFIX Step 5/8: Building frontend..."
ssh -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}" "
  set -e
  cd '${REMOTE_DIR}/frontend'
  npm ci --silent
  npm run build
"
echo "$LOG_PREFIX ✓ Frontend built"

# ── 6. Run DB migrations ──────────────────────────────────────────────────────
echo "$LOG_PREFIX Step 6/8: Running database migrations..."
ssh -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}" "
  set -e
  cd '${REMOTE_DIR}/backend'
  NODE_ENV=production node migrate.cjs
"
echo "$LOG_PREFIX ✓ Migrations complete"

# ── 7. Restart backend (zero-downtime) ────────────────────────────────────────
echo "$LOG_PREFIX Step 7/8: Reloading backend (PM2 zero-downtime)..."
ssh -p "$SSH_PORT" "${SSH_USER}@${SSH_HOST}" "
  set -e
  cd '${REMOTE_DIR}'
  if pm2 list | grep -q 'asella-api'; then
    pm2 reload ecosystem.config.cjs --update-env
  else
    pm2 start ecosystem.config.cjs
    pm2 save
  fi
  sleep 3
  pm2 list | grep asella-api
"
echo "$LOG_PREFIX ✓ Backend reloaded"

# ── 8. Health check ───────────────────────────────────────────────────────────
echo "$LOG_PREFIX Step 8/8: Verifying deployment..."
sleep 5

HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${DOMAIN}/api/health" || echo "000")

if [ "$HTTP_STATUS" = "200" ]; then
  echo ""
  echo "╔══════════════════════════════════════╗"
  echo "║  ✅ DEPLOYMENT SUCCESSFUL             ║"
  echo "║  ${DOMAIN}"
  echo "╚══════════════════════════════════════╝"
  echo ""
else
  echo ""
  echo "╔══════════════════════════════════════╗"
  echo "║  ⚠️ !! DEPLOYMENT WARNING   !!       ║"
  echo "║  Health check returned: $HTTP_STATUS  ║"
  echo "║  Check: pm2 logs asella-api           ║"
  echo "╚══════════════════════════════════════╝"
  echo ""
  echo "To rollback: ssh ${SSH_USER}@${SSH_HOST} 'cd ${REMOTE_DIR} && git checkout HEAD~1 && pm2 restart asella-api'"
  exit 1
fi