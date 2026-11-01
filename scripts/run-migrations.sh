#!/bin/bash
# =============================================================
# run-migrations.sh  —  Asella Organic Migration Runner (SSH)
# =============================================================
# Run this on your cPanel server via SSH after uploading the
# backend/db/sql/ folder.
#
# SETUP:
#   1. Upload the entire project (or at minimum backend/db/sql/)
#      to your server via cPanel File Manager or scp/rsync.
#   2. SSH into the server:
#        ssh yourusername@yourserver.com
#   3. Navigate to the project folder:
#        cd ~/public_html/asella_organic   (adjust path)
#   4. Make this script executable:
#        chmod +x scripts/run-migrations.sh
#   5. Run it:
#        ./scripts/run-migrations.sh
# =============================================================

# ─── CONFIGURE THESE ─────────────────────────────────────────
DB_USER="YOUR_DB_USER"
DB_PASS="YOUR_DB_PASSWORD"
DB_NAME="asellafs_organic_v2"
DB_HOST="localhost"   # Usually localhost on cPanel
SQL_DIR="./backend/db/sql"
# ─────────────────────────────────────────────────────────────

MYSQL_CMD="mysql -h$DB_HOST -u$DB_USER -p$DB_PASS $DB_NAME --default-character-set=utf8mb4 --batch"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

echo ""
echo -e "${YELLOW}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║   Asella Organic — Migration Runner (SSH)        ║${NC}"
echo -e "${YELLOW}╚══════════════════════════════════════════════════╝${NC}"
echo "  DB:   $DB_NAME @ $DB_HOST"
echo "  User: $DB_USER"
echo "  Dir:  $SQL_DIR"
echo ""

# ─── Canonical migration order ────────────────────────────────
MIGRATIONS=(
  "006_clean_products.sql"
  "007_idempotency_keys.sql"
  "008_soft_delete_audit.sql"
  "009_vendor_expenses.sql"
  "010_stock_request_status.sql"
  # 011 — three files, order matters:
  "011_drop_inventory_trigger.sql"
  "011_order_status_history.sql"
  "011_community_videos.sql"
  "012_prod_sync.sql"
  "013_staff_telegram_username.sql"
  "014_employee_tracking.sql"
  "015_telegram_users_roles.sql"
  "016_add_unit_cost.sql"
  "017_expense_void.sql"
  "018_unique_product_constraint.sql"
  "019_fix_shilajit_oil_image.sql"
  "020_telegram_miniapp_profile.sql"
  "021_affiliate_hardening.sql"
  "022_affiliate_reporting.sql"
  "023_telegram_miniapp_state_notifications.sql"
  "024_customer_insights.sql"
  "025_sms.sql"
  # 026 — two files:
  "026_delivery_rejections.sql"
  "026_repair_catalog.sql"
  "030_sms_campaign_recipients.sql"
  "033_site_assets.sql"
  "034_call_center.sql"
  # 035 — two files:
  "035_store_manager.sql"
  "035_v2_product_groups.sql"
  # 036 — two files:
  "036_restore_call_center_role.sql"
  "036_v2_product_aliases.sql"
  "037_v2_legacy_sku_map.sql"
  "038_v2_order_item_columns.sql"
  "039_v2_order_total_audit.sql"
  "040_v2_catalog_import.sql"
  "041_v2_unique_active_variant.sql"
  "042_v2_order_item_fk.sql"
  "043_v2_views.sql"
  "044_store_report_auto_metrics.sql"
  "045_call_center_daily_reports.sql"
  "046_prevent_direct_stock_update.sql"
  "047_used_reset_tokens.sql"
  "048_fix_inventory_summary_value.sql"
  "049_align_catalog_collations.sql"
  "050_complete_legacy_product_sizes.sql"
  "051_repair_smeared_order_item_prices.sql"
  "052_reconcile_april20_orders.sql"
  "053_delete_legacy_products.sql"
  "054_update_staff_data.sql"
  "055_update_v2_products.sql"
)

# ─── Fetch already-applied migrations ────────────────────────
get_applied() {
  $MYSQL_CMD -e "SELECT filename FROM migrations_log;" 2>/dev/null | tail -n +2
}

APPLIED=$(get_applied)

SUCCESS=0; SKIP=0; FAIL=0; FAILED_FILES=()

for FILE in "${MIGRATIONS[@]}"; do
  # Skip comment lines (bash arrays don't skip # lines, but the for loop does handle them if properly quoted)
  [[ "$FILE" == \#* ]] && continue
  [[ -z "$FILE" ]] && continue

  FILEPATH="$SQL_DIR/$FILE"

  # Check file exists
  if [ ! -f "$FILEPATH" ]; then
    echo -e "  ${YELLOW}⚠  MISSING: $FILE${NC}"
    ((SKIP++))
    continue
  fi

  # Check if already applied
  if echo "$APPLIED" | grep -qF "$FILE"; then
    echo -e "  ${NC}–  Already applied: $FILE${NC}"
    ((SKIP++))
    continue
  fi

  echo ""
  echo -e "${CYAN}━━━ Running: $FILE${NC}"

  OUTPUT=$($MYSQL_CMD < "$FILEPATH" 2>&1)
  EXIT_CODE=$?

  if [ $EXIT_CODE -ne 0 ]; then
    echo -e "  ${RED}✗ FAILED${NC}"
    echo "$OUTPUT" | grep -v "^mysql" | while read -r line; do echo "    $line"; done
    ((FAIL++))
    FAILED_FILES+=("$FILE")
    echo -n "  Continue despite failure? (y/N): "
    read -r ANSWER
    if [[ ! "$ANSWER" =~ ^[Yy] ]]; then
      echo -e "${RED}Aborted after failure in: $FILE${NC}"
      break
    fi
  else
    # Print non-trivial output lines
    echo "$OUTPUT" | grep -v "^$" | grep -v "Warning" | while read -r line; do echo -e "  → $line"; done
    echo -e "  ${GREEN}✓ OK${NC}"
    ((SUCCESS++))
  fi
done

echo ""
echo -e "${YELLOW}══════════════════════════════════════════════════${NC}"
echo -e "  DONE"
echo -e "  ${GREEN}Applied : $SUCCESS${NC}"
echo -e "  Skipped : $SKIP"
if [ $FAIL -gt 0 ]; then
  echo -e "  ${RED}Failed  : $FAIL${NC}"
  for f in "${FAILED_FILES[@]}"; do echo -e "  ${RED}  - $f${NC}"; done
else
  echo -e "  Failed  : 0"
fi
echo -e "${YELLOW}══════════════════════════════════════════════════${NC}"

# ─── Post-run verification ────────────────────────────────────
echo ""
echo -e "${CYAN}── Quick Verification ───────────────────────────────${NC}"
$MYSQL_CMD -e "
SELECT 'products total'    AS check_name, COUNT(*) AS value FROM products
UNION ALL
SELECT 'products active',  COUNT(*) FROM products WHERE active=1
UNION ALL
SELECT 'product_groups',   COUNT(*) FROM product_groups
UNION ALL
SELECT 'orders total',     COUNT(*) FROM orders
UNION ALL
SELECT 'order_items total',COUNT(*) FROM order_items
UNION ALL
SELECT 'orphan items',     COUNT(*) FROM order_items oi
  LEFT JOIN products p ON p.id=oi.product_id
  WHERE oi.product_id IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'migrations logged',COUNT(*) FROM migrations_log;
" 2>/dev/null
