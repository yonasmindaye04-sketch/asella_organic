<#
.SYNOPSIS
    Start the Asella Organic local stack (MySQL + backend + frontend).

.DESCRIPTION
    One-shot launcher for local development on this machine:

      1. makes sure the XAMPP MySQL service is running (port 3306)
      2. starts the backend dev server on 3001 in its own window, if needed
      3. starts the Vite dev server on 5173 in its own window, if needed
      4. waits until the API answers, then opens the storefront

    Everything it starts is a normal `npm run dev` process, so closing the two
    windows (or Ctrl+C in them) stops the app. MySQL keeps running as a Windows
    service regardless.

.PARAMETER NoBrowser
    Do not open the storefront when the stack is ready.

.EXAMPLE
    .\start-local.ps1

.EXAMPLE
    .\start-local.ps1 -NoBrowser
#>
[CmdletBinding()]
param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$root      = Split-Path -Parent $MyInvocation.MyCommand.Path
$backend   = Join-Path $root "backend"
$frontend  = Join-Path $root "frontend"
$mysqlExe  = "C:\xampp\mysql\bin\mysql.exe"
$service   = "XAMPP_MySQL"
$siteUrl   = "http://localhost:5173"

function Write-Step($n, $msg) { Write-Host ""; Write-Host "[$n] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)       { Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-Bad($msg)      { Write-Host "    !!  $msg" -ForegroundColor Red }
function Write-Note($msg)     { Write-Host "        $msg" -ForegroundColor DarkGray }
function Test-Port($port) {
    # Raw TcpClient instead of Test-NetConnection: TNC is slow and its progress
    # line randomly interleaves with this script's own output.
    $c = New-Object Net.Sockets.TcpClient
    try { $c.Connect("127.0.0.1", $port); $true } catch { $false } finally { $c.Dispose() }
}

# ---------------------------------------------------------------- 1. preflight
Write-Step 1 "Checking the environment"

if (-not (Test-Path -LiteralPath (Join-Path $backend ".env"))) {
    Write-Bad "backend\.env is missing"
    Write-Note "Copy backend\.env.example and fill in DB_PASSWORD / JWT_SECRET, or re-run setup."
    exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $backend "node_modules"))) {
    Write-Bad "backend\node_modules is missing"
    Write-Note "cd backend; npm ci"
    exit 1
}
if (-not (Test-Path -LiteralPath (Join-Path $frontend "node_modules"))) {
    Write-Bad "frontend\node_modules is missing"
    Write-Note "cd frontend; npm install"
    exit 1
}
Write-Ok "backend\.env and both node_modules trees present"

# -------------------------------------------------------------------- 2. MySQL
Write-Step 2 "Making sure MySQL is running"

if (-not (Test-Port 3306)) {
    $svc = Get-Service -Name $service -ErrorAction SilentlyContinue
    if (-not $svc) {
        Write-Bad "MySQL is not listening on 3306 and service '$service' does not exist"
        Write-Note "Start MySQL from C:\xampp\xampp-control.exe, then re-run this script."
        exit 1
    }
    if ($svc.Status -ne "Running") {
        Write-Note "Starting service $service (needs elevation)..."
        try {
            Start-Service -Name $service -ErrorAction Stop
        } catch {
            Write-Bad "Could not start $service : $($_.Exception.Message)"
            Write-Note "Run this script as Administrator, or start MySQL from xampp-control.exe."
            exit 1
        }
        for ($i = 0; $i -lt 20 -and -not (Test-Port 3306); $i++) { Start-Sleep -Seconds 1 }
    }
}

if (-not (Test-Port 3306)) {
    Write-Bad "MySQL never opened port 3306"
    Write-Note "Check C:\xampp\mysql\data\mysql_error.log"
    exit 1
}
Write-Ok "MySQL listening on 3306"

if (Test-Path -LiteralPath $mysqlExe) {
    # Read the credentials the backend will actually use, so this probe cannot
    # drift from backend\.env.
    $envLines = Get-Content -LiteralPath (Join-Path $backend ".env")
    $dbUser = ($envLines | Where-Object { $_ -match '^\s*DB_USER=' } | Select-Object -First 1) -replace '^\s*DB_USER=', ''
    $dbPass = ($envLines | Where-Object { $_ -match '^\s*DB_PASSWORD=' } | Select-Object -First 1) -replace '^\s*DB_PASSWORD=', ''
    $dbName = ($envLines | Where-Object { $_ -match '^\s*DB_NAME=' } | Select-Object -First 1) -replace '^\s*DB_NAME=', ''
    if (-not $dbUser) { $dbUser = "asella" }
    if (-not $dbName) { $dbName = "asella_organic" }

    # Fail early with a readable message instead of letting the backend crash on
    # a bad password three steps later.
    $probe = & $mysqlExe --host=127.0.0.1 --user=$dbUser --password=$dbPass `
                         --database=$dbName --skip-column-names --execute="SELECT 1" 2>&1
    if ($LASTEXITCODE -eq 0) { Write-Ok "$dbName database reachable as user '$dbUser'" }
    else {
        Write-Bad "Database login failed: $probe"
        Write-Note "Does backend\.env match the MySQL user/password you created?"
        exit 1
    }
}

# ------------------------------------------------------------------ 3. backend
Write-Step 3 "Starting the backend on 3001"

if (Test-Port 3001) {
    Write-Ok "Already running - leaving it alone"
} else {
    Start-Process -FilePath "cmd.exe" `
                  -ArgumentList "/c", "title Asella backend  && npm run dev" `
                  -WorkingDirectory $backend
    Write-Ok "Opened a backend window"
}

# ----------------------------------------------------------------- 4. frontend
Write-Step 4 "Starting the frontend on 5173"

if (Test-Port 5173) {
    Write-Ok "Already running - leaving it alone"
} else {
    Start-Process -FilePath "cmd.exe" `
                  -ArgumentList "/c", "title Asella frontend  && npm run dev" `
                  -WorkingDirectory $frontend
    Write-Ok "Opened a frontend window"
}

# ------------------------------------------------------------ 5. wait for API
Write-Step 5 "Waiting for the API and Vite to come up"

$apiOk = $false
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Seconds 2
    if (-not (Test-Port 3001)) { continue }
    try {
        # Health returns 503 when optional integrations (Telegram) are missing,
        # but the body still reports db:true. That is the signal we want.
        $r = Invoke-WebRequest -Uri "http://localhost:3001/api/health" -UseBasicParsing -TimeoutSec 8
        $apiOk = $true
        break
    } catch {
        $body = $_.ErrorDetails.Message
        if ($body -match '"db"\s*:\s*true') { $apiOk = $true; break }
    }
}
if ($apiOk) { Write-Ok "API responding on 3001" }
else {
    Write-Bad "API did not answer on 3001"
    Write-Note "Look at the backend window - it prints the real error there."
}

$viteOk = $false
for ($i = 0; $i -lt 20; $i++) {
    if (Test-Port 5173) { $viteOk = $true; break }
    Start-Sleep -Seconds 1
}
if ($viteOk) { Write-Ok "Vite responding on 5173" }
else         { Write-Bad "Vite did not open 5173 - check the frontend window" }

# --------------------------------------------------------------- 6. summary
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Asella Organic - local stack" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Storefront : $siteUrl"
Write-Host "  Staff login: $siteUrl/login"
Write-Host "  API        : http://localhost:3001/api"
Write-Host "  phpMyAdmin : http://127.0.0.1/phpmyadmin/   (Apache must be running)"
Write-Host ""
Write-Host "  Admin user : admin" -ForegroundColor Yellow
Write-Host "  Password   : AsellaAdmin2026!" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Stop the app : close the backend and frontend windows (Ctrl+C)" -ForegroundColor DarkGray
Write-Host "  Stop MySQL   : Stop-Service XAMPP_MySQL   (or xampp-control.exe)" -ForegroundColor DarkGray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

if (-not $NoBrowser -and $viteOk) { Start-Process $siteUrl }
