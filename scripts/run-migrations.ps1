# =============================================================
# run-migrations.ps1  —  Asella Organic Migration Runner
# =============================================================
# Runs all SQL migrations from 006 onwards in the correct order.
# Skips files that are already logged in migrations_log.
#
# USAGE:
#   .\scripts\run-migrations.ps1 -DbUser "root" -DbPassword "yourpass" -DbName "asella_organic" -DbHost "localhost" -DbPort 3306
#
# OPTIONAL FLAGS:
#   -DryRun      Print the order without running anything
#   -StartFrom   Skip files before this name  (e.g. "016_add_unit_cost.sql")
# =============================================================

param(
    [Parameter(Mandatory=$true)]  [string]$DbUser,
    [Parameter(Mandatory=$true)]  [string]$DbPassword,
    [Parameter(Mandatory=$true)]  [string]$DbName,
    [string]$DbHost     = "localhost",
    [int]   $DbPort     = 3306,
    [switch]$DryRun,
    [string]$StartFrom  = ""
)

$MYSQL = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"
$SQL_DIR = Join-Path $PSScriptRoot "..\backend\db\sql"

if (-not (Test-Path $MYSQL)) {
    Write-Error "mysql.exe not found at: $MYSQL"
    exit 1
}

# ---- Canonical migration order --------------------------------
# Files with the same numeric prefix are run in this explicit order.
$ORDER = @(
    "006_clean_products.sql",
    "007_idempotency_keys.sql",
    "008_soft_delete_audit.sql",
    "009_vendor_expenses.sql",
    "010_stock_request_status.sql",
    # 011 — three files, explicit order:
    "011_drop_inventory_trigger.sql",
    "011_order_status_history.sql",
    "011_community_videos.sql",
    "012_prod_sync.sql",
    "013_staff_telegram_username.sql",
    "014_employee_tracking.sql",
    "015_telegram_users_roles.sql",
    "016_add_unit_cost.sql",
    "017_expense_void.sql",
    "018_unique_product_constraint.sql",
    "019_fix_shilajit_oil_image.sql",
    "020_telegram_miniapp_profile.sql",
    "021_affiliate_hardening.sql",
    "022_affiliate_reporting.sql",
    "023_telegram_miniapp_state_notifications.sql",
    "024_customer_insights.sql",
    "025_sms.sql",
    # 026 — two files:
    "026_delivery_rejections.sql",
    "026_repair_catalog.sql",
    "030_sms_campaign_recipients.sql",
    "033_site_assets.sql",
    "034_call_center.sql",
    # 035 — two files:
    "035_store_manager.sql",
    "035_v2_product_groups.sql",
    # 036 — two files:
    "036_restore_call_center_role.sql",
    "036_v2_product_aliases.sql",
    "037_v2_legacy_sku_map.sql",
    "038_v2_order_item_columns.sql",
    "039_v2_order_total_audit.sql",
    "040_v2_catalog_import.sql",
    "041_v2_unique_active_variant.sql",
    "042_v2_order_item_fk.sql",
    "043_v2_views.sql",
    "044_store_report_auto_metrics.sql",
    "045_call_center_daily_reports.sql",
    "046_prevent_direct_stock_update.sql",
    "047_used_reset_tokens.sql",
    "048_fix_inventory_summary_value.sql",
    "049_align_catalog_collations.sql",
    "050_complete_legacy_product_sizes.sql",
    "051_repair_smeared_order_item_prices.sql",
    "052_reconcile_april20_orders.sql",
    "053_delete_legacy_products.sql",
    "054_update_staff_data.sql",
    "055_update_v2_products.sql"
)

# ---- Fetch already-applied migrations from DB -----------------
function Get-AppliedMigrations {
    $query = "SELECT filename FROM migrations_log;"
    $result = & $MYSQL -h $DbHost -P $DbPort -u $DbUser "-p$DbPassword" $DbName -e $query 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Could not query migrations_log (table may not exist yet). Will attempt all migrations."
        return @()
    }
    return $result | Where-Object { $_ -notmatch "^filename" -and $_.Trim() -ne "" }
}

# ---- Run a single SQL file ------------------------------------
function Invoke-Migration {
    param([string]$FilePath, [string]$FileName)

    Write-Host ""
    Write-Host "━━━ Running: $FileName" -ForegroundColor Cyan

    # Use file redirection (most reliable on Windows — avoids SOURCE path issues)
    $output = Get-Content $FilePath -Raw | & $MYSQL -h $DbHost -P $DbPort -u $DbUser "-p$DbPassword" `
        "--default-character-set=utf8mb4" `
        "--batch" `
        $DbName 2>&1

    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ FAILED" -ForegroundColor Red
        $output | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
        return $false
    }

    # Print any SELECT result rows (success messages embedded in SQL)
    $output | Where-Object { $_ -notmatch "^(mysql|Warning)" } |
              ForEach-Object { Write-Host "  → $_" -ForegroundColor Gray }

    Write-Host "  ✓ OK" -ForegroundColor Green
    return $true
}

# ---- Main -----------------------------------------------------
Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║   Asella Organic — Migration Runner              ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host "  DB:   $DbName @ $DbHost`:$DbPort"
Write-Host "  User: $DbUser"
Write-Host "  Mode: $(if ($DryRun) {'DRY RUN (no changes)'} else {'LIVE'})"
Write-Host ""

# Resolve SQL dir to absolute path
$SQL_DIR = Resolve-Path $SQL_DIR

# Fetch already applied
$applied = Get-AppliedMigrations
Write-Host "Already applied: $($applied.Count) migration(s)" -ForegroundColor DarkGray

# Determine start index
$startIdx = 0
if ($StartFrom -ne "") {
    $startIdx = $ORDER.IndexOf($StartFrom)
    if ($startIdx -lt 0) {
        Write-Error "StartFrom file '$StartFrom' not found in migration list."
        exit 1
    }
    Write-Host "Starting from: $StartFrom (index $startIdx)" -ForegroundColor Yellow
}

$success = 0
$skipped = 0
$failed  = 0
$failedList = @()

for ($i = $startIdx; $i -lt $ORDER.Count; $i++) {
    $fileName = $ORDER[$i]
    $filePath = Join-Path $SQL_DIR $fileName

    # Skip if file doesn't exist on disk
    if (-not (Test-Path $filePath)) {
        Write-Host "  ⚠  MISSING on disk, skipping: $fileName" -ForegroundColor DarkYellow
        $skipped++
        continue
    }

    # Skip if already applied
    if ($applied -contains $fileName) {
        Write-Host "  –  Already applied, skipping: $fileName" -ForegroundColor DarkGray
        $skipped++
        continue
    }

    if ($DryRun) {
        Write-Host "  [DRY] Would run: $fileName" -ForegroundColor DarkCyan
        continue
    }

    $ok = Invoke-Migration -FilePath $filePath -FileName $fileName
    if ($ok) {
        $success++
    } else {
        $failed++
        $failedList += $fileName
        $answer = Read-Host "  Continue despite failure? (y/N)"
        if ($answer -notmatch "^[Yy]") {
            Write-Host "`nAborted after failure in: $fileName" -ForegroundColor Red
            break
        }
    }
}

# ---- Summary --------------------------------------------------
Write-Host ""
Write-Host "══════════════════════════════════════════════════" -ForegroundColor Yellow
Write-Host "  DONE" -ForegroundColor Yellow
Write-Host "  Applied : $success" -ForegroundColor Green
Write-Host "  Skipped : $skipped" -ForegroundColor DarkGray
Write-Host "  Failed  : $failed" -ForegroundColor $(if ($failed -gt 0) {"Red"} else {"DarkGray"})
if ($failedList.Count -gt 0) {
    Write-Host "  Failed files:" -ForegroundColor Red
    $failedList | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
}
Write-Host "══════════════════════════════════════════════════" -ForegroundColor Yellow
