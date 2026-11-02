# Packaging script for manual upload to cPanel
$ErrorActionPreference = "Stop"

$rootDir = Split-Path -Parent $PSScriptRoot
Set-Location $rootDir

python scripts/package-archives.py
