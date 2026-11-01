# Packaging script for manual upload to cPanel
$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir

Write-Host "Creating deployment archives..." -ForegroundColor Cyan

# 1. Frontend dist (contents without .htaccess)
$frontendZip = Join-Path $rootDir "frontend-dist.zip"
Remove-Item -Force -ErrorAction SilentlyContinue $frontendZip

$frontendFiles = Get-ChildItem -Path "frontend\dist\*" -Exclude ".htaccess"
Compress-Archive -Path $frontendFiles -DestinationPath $frontendZip -Force
Write-Host "Created $frontendZip ($([math]::Round((Get-Item $frontendZip).Length / 1MB, 2)) MB)" -ForegroundColor Green

# 2. Backend dist (built server bundles)
$backendZip = Join-Path $rootDir "backend-dist.zip"
Remove-Item -Force -ErrorAction SilentlyContinue $backendZip

$backendFiles = Get-ChildItem -Path "backend\dist\*"
Compress-Archive -Path $backendFiles -DestinationPath $backendZip -Force
Write-Host "Created $backendZip ($([math]::Round((Get-Item $backendZip).Length / 1KB, 1)) KB)" -ForegroundColor Green

Write-Host "Done! Archives are ready in project root." -ForegroundColor Green
