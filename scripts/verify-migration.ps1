# =============================================================
# verify-migration.ps1  —  Asella Organic Post-Migration Verifier
# =============================================================
# Runs a set of sanity checks after migrations complete.
#
# USAGE:
#   .\scripts\verify-migration.ps1 -DbUser "root" -DbPassword "yourpass" -DbName "asella_organic"
# =============================================================

param(
    [Parameter(Mandatory=$true)]  [string]$DbUser,
    [Parameter(Mandatory=$true)]  [string]$DbPassword,
    [Parameter(Mandatory=$true)]  [string]$DbName,
    [string]$DbHost = "localhost",
    [int]   $DbPort = 3306
)

$MYSQL = "C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe"

function Run-Query {
    param([string]$Label, [string]$Query, [string]$Expected = "")
    $result = echo $Query | & $MYSQL -h $DbHost -P $DbPort -u $DbUser "-p$DbPassword" `
        "--batch" "--skip-column-names" $DbName 2>&1
    $val = ($result | Where-Object { $_ -notmatch "Warning" } | Select-Object -First 1).Trim()

    $icon = "✓"
    $color = "Green"
    if ($Expected -ne "" -and $val -ne $Expected) {
        $icon = "✗"
        $color = "Red"
    }
    Write-Host ("  {0}  {1,-50} → {2}" -f $icon, $Label, $val) -ForegroundColor $color
    return $val
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║   Asella Organic — Migration Verification        ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host ""

Write-Host "── Products ─────────────────────────────────────" -ForegroundColor Cyan
Run-Query "Total products"              "SELECT COUNT(*) FROM products;"                 "36"
Run-Query "Active products"             "SELECT COUNT(*) FROM products WHERE active=1;"  "26"
Run-Query "Legacy pr0000 rows (active)" "SELECT COUNT(*) FROM products WHERE id LIKE 'pr0000%' AND active=1;" "0"
Run-Query "Products with no group"      "SELECT COUNT(*) FROM products WHERE product_group_id IS NULL;" "0"

Write-Host ""
Write-Host "── Product Groups ───────────────────────────────" -ForegroundColor Cyan
Run-Query "Total product groups"        "SELECT COUNT(*) FROM product_groups;"           "23"

Write-Host ""
Write-Host "── Orders & Items ───────────────────────────────" -ForegroundColor Cyan
Run-Query "Total orders"               "SELECT COUNT(*) FROM orders;"
Run-Query "Total order items"          "SELECT COUNT(*) FROM order_items;"
Run-Query "Order items with NULL product_id" "SELECT COUNT(*) FROM order_items WHERE product_id IS NULL;"
Run-Query "Orphan product_ids in items" "SELECT COUNT(*) FROM order_items oi LEFT JOIN products p ON p.id=oi.product_id WHERE oi.product_id IS NOT NULL AND p.id IS NULL;" "0"

Write-Host ""
Write-Host "── Staff ────────────────────────────────────────" -ForegroundColor Cyan
Run-Query "Total staff"                "SELECT COUNT(*) FROM staff;"

Write-Host ""
Write-Host "── Migrations Applied ───────────────────────────" -ForegroundColor Cyan
Run-Query "Migrations logged"          "SELECT COUNT(*) FROM migrations_log;"
Write-Host ""
Write-Host "Last 5 migrations applied:"
$last5 = "SELECT filename, applied_at FROM migrations_log ORDER BY id DESC LIMIT 5;" | & $MYSQL -h $DbHost -P $DbPort -u $DbUser "-p$DbPassword" "--batch" $DbName 2>&1
$last5 | Where-Object { $_ -notmatch "Warning" } | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }

Write-Host ""
Write-Host "══════════════════════════════════════════════════" -ForegroundColor Yellow
