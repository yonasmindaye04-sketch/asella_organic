# Packaging script for manual upload to cPanel
$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir

Write-Host "Creating deployment archives..." -ForegroundColor Cyan

# 1. Frontend dist (contents without .htaccess, preserving directory hierarchy)
$frontendZip = Join-Path $rootDir "frontend-dist.zip"
Remove-Item -Force -ErrorAction SilentlyContinue $frontendZip
tar.exe -a -c -f $frontendZip --exclude=".htaccess" -C frontend/dist .
Write-Host "Created $frontendZip ($([math]::Round((Get-Item $frontendZip).Length / 1MB, 2)) MB)" -ForegroundColor Green

# 2. Backend dist (built server bundles)
$backendZip = Join-Path $rootDir "backend-dist.zip"
Remove-Item -Force -ErrorAction SilentlyContinue $backendZip
tar.exe -a -c -f $backendZip -C backend/dist .
Write-Host "Created $backendZip ($([math]::Round((Get-Item $backendZip).Length / 1KB, 1)) KB)" -ForegroundColor Green

Write-Host "Done! Archives are ready in project root." -ForegroundColor Green
