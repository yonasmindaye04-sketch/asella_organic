<#
.SYNOPSIS
    Start the Asella Organic Telegram Mini App test tunnel, end to end.

.DESCRIPTION
    A Cloudflare *quick* tunnel gets a brand-new random hostname every time it
    starts, and the old one stops resolving immediately. That hostname has to be
    copied into backend/.env AND republished to Telegram's chat menu button, or
    the bot opens a dead page.

    This script does all of that in one shot so the sequence cannot be
    half-forgotten. It does NOT start MySQL, the backend or Vite - run those in
    their own windows first; the script verifies they are up and stops if not.

.PARAMETER Path
    Mini App path served to Telegram. Defaults to /telegram-store. /tma works
    identically (vite.config.ts rewrites both to tma.html).

.PARAMETER KeepExisting
    Do not kill an existing cloudflared process; reuse it and just republish.

.EXAMPLE
    .\start-miniapp.ps1

.EXAMPLE
    .\start-miniapp.ps1 -Path /tma
#>
[CmdletBinding()]
param(
    [string]$MiniAppPath = "/telegram-store",
    [switch]$KeepExisting
)

$ErrorActionPreference = "Stop"
$root      = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile   = Join-Path $root "backend\.env"
$logFile   = Join-Path $root "cloudflared.log"
$helper    = Join-Path $root "scripts\set-store-button.mjs"

function Write-Step($n, $msg) { Write-Host ""; Write-Host "[$n] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)       { Write-Host "    OK  $msg" -ForegroundColor Green }
function Write-Bad($msg)      { Write-Host "    !!  $msg" -ForegroundColor Red }
function Write-Note($msg)     { Write-Host "        $msg" -ForegroundColor DarkGray }
function Test-Port($port) {
    # Raw TcpClient instead of Test-NetConnection: TNC is slow and its progress
    # line ("Test-NetConnection - 127.0.0.1:3001") randomly interleaves with
    # this script's own output.
    $c = New-Object Net.Sockets.TcpClient
    try { $c.Connect("127.0.0.1", $port); $true } catch { $false } finally { $c.Dispose() }
}

# ---------------------------------------------------------------- 1. preflight
Write-Step 1 "Checking MySQL, backend and Vite"

$missing = @()
if (-not (Test-Port 3306)) { $missing += "MySQL    (3306)  -> start your MySQL service" }
if (-not (Test-Port 3001)) { $missing += "backend  (3001)  -> cd backend;   npm run dev" }
if (-not (Test-Port 5173)) { $missing += "frontend (5173)  -> cd frontend;  npm run dev" }
if ($missing.Count) {
    Write-Bad "Not running:"
    $missing | ForEach-Object { Write-Bad "      $_" }
    Write-Host ""
    Write-Host "  Start them in their own windows, then re-run this script." -ForegroundColor Yellow
    exit 1
}
Write-Ok "3306, 3001 and 5173 all responding"

# ------------------------------------------------------------------ 2. tunnel
Write-Step 2 "Starting one Cloudflare tunnel"

$cf = Get-Command cloudflared -ErrorAction SilentlyContinue
$cfPath = if ($cf) { $cf.Source } else { "C:\Program Files (x86)\cloudflared\cloudflared.exe" }
if (-not (Test-Path -LiteralPath $cfPath)) {
    Write-Bad "cloudflared not found.  winget install --id Cloudflare.cloudflared"
    exit 1
}

$running = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($running -and -not $KeepExisting) {
    Write-Ok "Stopping $($running.Count) existing tunnel process(es) - stale hostnames cause 404s"
    $running | Stop-Process -Force
    Start-Sleep -Seconds 3
}

if (-not (Get-Process cloudflared -ErrorAction SilentlyContinue)) {
    # Port 5173 (Vite), never 3001. The backend does not serve the Mini App
    # HTML or the product images.
    #
    # Launched via cmd.exe so cloudflared's stderr banner is captured instead of
    # taking over the console. The redirect target MUST be a *relative* file
    # name: an absolute path inside the quoted argument makes cmd fail to spawn
    # cloudflared at all, and it then exits silently with no log.
    $logName = Split-Path -Leaf $logFile
    if (Test-Path -LiteralPath $logFile) { Remove-Item -LiteralPath $logFile -Force -ErrorAction SilentlyContinue }
    $cmdline = '"' + $cfPath + '" tunnel --url http://localhost:5173 > ' + $logName + ' 2>&1'
    Start-Process -FilePath "cmd.exe" -ArgumentList '/c', $cmdline -WorkingDirectory $root -WindowStyle Hidden | Out-Null

    Start-Sleep -Seconds 3
    if (-not (Get-Process cloudflared -ErrorAction SilentlyContinue)) {
        Write-Bad "cloudflared exited immediately:"
        if (Test-Path -LiteralPath $logFile) { Get-Content -LiteralPath $logFile | Select-Object -First 8 | ForEach-Object { Write-Note $_ } }
        exit 1
    }
    Write-Ok "Tunnel starting (log: $logFile)"
} else {
    Write-Ok "Reusing the running tunnel (-KeepExisting)"
}

# ------------------------------------------------------- 3. discover hostname
Write-Step 3 "Reading the tunnel hostname"

# Two sources, because either can be unavailable:
#   a) cloudflared's metrics endpoint (authoritative, present on most builds)
#   b) the startup banner in the log file
$tunnelHost = $null
for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 2

    foreach ($p in Get-Process cloudflared -ErrorAction SilentlyContinue) {
        $mp = Get-NetTCPConnection -State Listen -OwningProcess $p.Id -ErrorAction SilentlyContinue |
              Select-Object -First 1 -ExpandProperty LocalPort
        if (-not $mp) { continue }
        try {
            $m = Invoke-WebRequest -Uri "http://127.0.0.1:$mp/metrics" -UseBasicParsing -TimeoutSec 5
            $hit = [regex]::Matches($m.Content, '[a-z0-9-]+\.trycloudflare\.com') |
                   ForEach-Object { $_.Value } | Sort-Object -Unique | Select-Object -First 1
            if ($hit) { $tunnelHost = $hit; break }
        } catch { }
    }
    if ($tunnelHost) { break }

    if (Test-Path -LiteralPath $logFile) {
        $banner = [regex]::Match((Get-Content -LiteralPath $logFile -Raw), 'https://([a-z0-9-]+\.trycloudflare\.com)')
        if ($banner.Success) { $tunnelHost = $banner.Groups[1].Value; break }
    }
}

if (-not $tunnelHost) {
    Write-Bad "Could not read the hostname. Check $logFile"
    exit 1
}
$base = "https://$tunnelHost"
Write-Ok "hostname: $base"

# ------------------------------------------------------------ 4. verify + warm
Write-Step 4 "Verifying the tunnel serves the Mini App"

# A brand-new quick tunnel answers 530 / connection-refused for the first while
# Cloudflare's edge dials the local connector. That is not an error, so retry
# through it rather than declaring failure.
#
# DNS race: the hostname is readable from the log about a second after the
# tunnel is created, but the DNS record can take a few more seconds to reach
# this machine's resolver. If the first lookup lands too early it gets
# NXDOMAIN, and the Windows DNS client NEGATIVELY caches that for minutes -
# every retry then fails from cache even though the record is already live.
# So on a DNS error, flush the local resolver cache before trying again.
# Wait 5 seconds to avoid poisoning the upstream DNS cache with an NXDOMAIN
Write-Note "Waiting 8 seconds for DNS propagation..."
Start-Sleep -Seconds 8

$page = $null
$lastErr = ""
$dnsErr  = 'could not be resolved|No such host|getaddrinfo'
for ($i = 0; $i -lt 30; $i++) {
    try {
        $page = Invoke-WebRequest -Uri "$base$MiniAppPath" -UseBasicParsing -TimeoutSec 30
        break
    } catch {
        $lastErr = $_.Exception.Message
        if ($lastErr -match $dnsErr) { try { Clear-DnsClientCache -ErrorAction SilentlyContinue } catch { } }
        Start-Sleep -Seconds 3
    }
}

if (-not $page) {
    Write-Bad "Tunnel never became reachable at $MiniAppPath"
    Write-Note "last error: $lastErr"
    if ($lastErr -match $dnsErr) {
        Write-Note "That is a DNS error on a brand-new hostname - usually just propagation."
        Write-Note "The tunnel itself is fine; re-run this script with -KeepExisting."
    } else {
        Write-Note "Is Vite still on 5173? The tunnel points there, not at 3001."
    }
    exit 1
}

$servesWebsite = $page.Content -match 'Place an Order'
$servesMiniApp = ($page.Content -match 'tma\.tsx') -or ($page.Content -match 'miniApp-')
if ($servesWebsite) { Write-Bad "That path is serving the WEBSITE, not the Mini App."; exit 1 }
if (-not $servesMiniApp) { Write-Bad "Mini App markers missing from the served document."; exit 1 }
Write-Ok "HTTP $($page.StatusCode), Mini App confirmed"

$apiOk = $false
for ($i = 0; $i -lt 10; $i++) {
    try {
        $h = Invoke-WebRequest -Uri "$base/api/health" -UseBasicParsing -TimeoutSec 30
        if ($h.StatusCode -eq 200) { Write-Ok "API: $($h.Content)"; $apiOk = $true; break }
    } catch { Start-Sleep -Seconds 3 }
}
if (-not $apiOk) { Write-Bad "API proxy failed - is the backend up on 3001?" }

# ------------------------------------------------------------------- 5. .env
Write-Step 5 "Updating backend/.env"

if (-not (Test-Path -LiteralPath $envFile)) { Write-Bad "backend\.env not found"; exit 1 }
$envText = Get-Content -LiteralPath $envFile -Raw

if ($envText -match '(?m)^\s*PUBLIC_URL=') {
    $envText = $envText -replace '(?m)^\s*PUBLIC_URL=.*$', "PUBLIC_URL=$base"
} else {
    $envText = $envText -replace '(?m)^(\s*TELEGRAM_MINIAPP_URL=)', "PUBLIC_URL=$base`r`n`$1"
}
if ($envText -match '(?m)^\s*TELEGRAM_MINIAPP_URL=') {
    $envText = $envText -replace '(?m)^\s*TELEGRAM_MINIAPP_URL=.*$', "TELEGRAM_MINIAPP_URL=$base$MiniAppPath"
} else {
    $envText += "`r`nTELEGRAM_MINIAPP_URL=$base$MiniAppPath`r`n"
}
Set-Content -LiteralPath $envFile -Value $envText -NoNewline
Write-Ok "PUBLIC_URL           = $base"
Write-Ok "TELEGRAM_MINIAPP_URL = $base$MiniAppPath"

# ------------------------------------------------------------- 6. reload .env
Write-Step 6 "Reloading the backend so it picks up the new .env"

# `tsx watch` re-runs on any change to a watched source file. Touching the
# entrypoint is the least invasive way to trigger that from outside.
try {
    (Get-Item (Join-Path $root "backend\src\server.ts")).LastWriteTime = Get-Date
    Write-Ok "Triggered tsx watch reload"
} catch {
    Write-Bad "Could not touch backend\src\server.ts"
    Write-Note "Restart the backend yourself: Ctrl+C then npm run dev"
}

$backendUp = $false
for ($i = 0; $i -lt 25; $i++) {
    Start-Sleep -Seconds 2
    if (Test-Port 3001) {
        try {
            $r = Invoke-WebRequest -Uri "http://localhost:3001/api/health" -UseBasicParsing -TimeoutSec 8
            if ($r.StatusCode -eq 200) { $backendUp = $true; break }
        } catch { }
    }
}
if ($backendUp) { Write-Ok "backend healthy on 3001" }
else           { Write-Bad "backend did not come back on 3001" }

# ---------------------------------------------------------------- 7. Telegram
Write-Step 7 "Publishing the Telegram Store button"

# Delegated to Node on purpose: Invoke-RestMethod returned an opaque 400 with an
# empty body for this call, while Node's fetch works and also surfaces
# Telegram's own error description.
if (-not (Test-Path -LiteralPath $helper)) { Write-Bad "missing $helper"; exit 1 }
& node $helper "$base$MiniAppPath"
if ($LASTEXITCODE -eq 0) { Write-Ok "Store button published" }
else {
    Write-Bad "Could not publish automatically."
    Write-Note "BotFather -> /setmenubutton -> Store -> $base$MiniAppPath"
}

# ----------------------------------------------------------------- 8. summary
Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Mini App tunnel is live" -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Store button  : $base$MiniAppPath"
Write-Host "  Bot commands  : need 'npm run telegram:poll' running"
Write-Host ""
Write-Host "  Open the bot in Telegram, tap Store." -ForegroundColor Yellow
Write-Host "  If it shows the website, close the Mini App fully and reopen." -ForegroundColor Yellow
Write-Host "  Still wrong? Clear Telegram cache: Settings > Advanced > Clear Cache."
Write-Host ""
Write-Host "  Stop later with:  Stop-Process -Name cloudflared" -ForegroundColor DarkGray
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""