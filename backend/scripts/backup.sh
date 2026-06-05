#!/bin/bash
# =============================================================================
# scripts/backup.sh
# Asella Organic — Automated Backup Script
#
# SETUP:
#   chmod +x scripts/backup.sh
#   Add to crontab:  crontab -e
#   Add this line:   0 2 * * * /path/to/scripts/backup.sh >> /path/to/logs/backup.log 2>&1
#
# This runs at 2:00 AM every day.
# Keeps 7 daily backups (7-day rolling window).
# =============================================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

# Load environment variables
if [ -f "$ROOT_DIR/backend/.env.production" ]; then
  export $(grep -v '^#' "$ROOT_DIR/backend/.env.production" | xargs)
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-3306}"
DB_USER="${DB_USER:?DB_USER not set}"
DB_PASSWORD="${DB_PASSWORD:?DB_PASSWORD not set}"
DB_NAME="${DB_NAME:?DB_NAME not set}"

BACKUP_DIR="$HOME/backups/asella"
RETAIN_DAYS=7
DATE=$(date +"%Y-%m-%d_%H-%M-%S")
LOG_PREFIX="[$(date '+%Y-%m-%d %H:%M:%S')] [backup]"

# ── Create directories ────────────────────────────────────────────────────────
mkdir -p "$BACKUP_DIR/db"
mkdir -p "$BACKUP_DIR/code"
mkdir -p "$ROOT_DIR/logs"

echo "$LOG_PREFIX Starting backup..."

# ── 1. Database backup ────────────────────────────────────────────────────────
DB_FILE="$BACKUP_DIR/db/db_${DATE}.sql.gz"

echo "$LOG_PREFIX Dumping database '$DB_NAME'..."
mysqldump \
  -h "$DB_HOST" \
  -P "$DB_PORT" \
  -u "$DB_USER" \
  -p"$DB_PASSWORD" \
  --single-transaction \
  --routines \
  --triggers \
  --events \
  "$DB_NAME" | gzip -9 > "$DB_FILE"

DB_SIZE=$(du -sh "$DB_FILE" | cut -f1)
echo "$LOG_PREFIX Database backup complete: $DB_FILE ($DB_SIZE)"

# ── 2. Code backup (excluding node_modules and logs) ─────────────────────────
CODE_FILE="$BACKUP_DIR/code/code_${DATE}.tar.gz"

echo "$LOG_PREFIX Archiving application code..."
tar -czf "$CODE_FILE" \
  --exclude='*/node_modules' \
  --exclude='*/dist' \
  --exclude='*/build' \
  --exclude='*/.git' \
  --exclude='*/logs' \
  --exclude='*/coverage' \
  --exclude='*.env.production' \
  -C "$(dirname "$ROOT_DIR")" \
  "$(basename "$ROOT_DIR")"

CODE_SIZE=$(du -sh "$CODE_FILE" | cut -f1)
echo "$LOG_PREFIX Code backup complete: $CODE_FILE ($CODE_SIZE)"

# ── 3. Rotate old backups ─────────────────────────────────────────────────────
echo "$LOG_PREFIX Removing backups older than $RETAIN_DAYS days..."
find "$BACKUP_DIR/db"   -name "*.sql.gz"  -mtime +$RETAIN_DAYS -delete
find "$BACKUP_DIR/code" -name "*.tar.gz"  -mtime +$RETAIN_DAYS -delete
echo "$LOG_PREFIX Rotation complete"

# ── 4. Verify latest backup is readable ──────────────────────────────────────
if gzip -t "$DB_FILE" 2>/dev/null; then
  echo "$LOG_PREFIX ✓ Database backup integrity verified"
else
  echo "$LOG_PREFIX ✗ CRITICAL: Database backup integrity check FAILED" >&2
  exit 1
fi

# ── 5. Summary ────────────────────────────────────────────────────────────────
TOTAL_BACKUPS=$(find "$BACKUP_DIR/db" -name "*.sql.gz" | wc -l)
BACKUP_SPACE=$(du -sh "$BACKUP_DIR" | cut -f1)

echo "$LOG_PREFIX ─────────────────────────────────────"
echo "$LOG_PREFIX Backup complete"
echo "$LOG_PREFIX   DB file:    $DB_FILE ($DB_SIZE)"
echo "$LOG_PREFIX   Code file:  $CODE_FILE ($CODE_SIZE)"
echo "$LOG_PREFIX   Total DBs:  $TOTAL_BACKUPS (keeping last $RETAIN_DAYS)"
echo "$LOG_PREFIX   Disk used:  $BACKUP_SPACE"
echo "$LOG_PREFIX ─────────────────────────────────────"