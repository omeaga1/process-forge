# ProcessForge 1-Click Automated Installer for Windows
# Usage: irm https://omeaga1.github.io/process-forge/install.ps1 | iex

$ErrorActionPreference = 'Stop'
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  ProcessForge Industrial Digital Twin Studio Installer" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan

$installDir = "$env:LOCALAPPDATA\ProcessForge"
$zipUrl = "https://github.com/omeaga1/process-forge/releases/download/v0.1.1/process-forge-windows-portable-x64.zip"
$tempZip = "$env:TEMP\process-forge-installer.zip"
$tempExtract = "$env:TEMP\pf_unpacked"

Write-Host "Downloading verified ProcessForge release package..." -ForegroundColor Yellow
Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -UseBasicParsing

Write-Host "Installing to $installDir..." -ForegroundColor Yellow
if (-not (Test-Path $installDir)) {
    New-Item -ItemType Directory -Path $installDir -Force | Out-Null
}

# Expand archive
if (Test-Path $tempExtract) {
    Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
}
Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
Copy-Item -Path "$tempExtract\process-forge-windows-portable\*" -Destination $installDir -Recurse -Force
Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue
Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Configuring Desktop and Start Menu shortcuts..." -ForegroundColor Yellow
$ws = New-Object -ComObject WScript.Shell

$exeTarget = "$installDir\Start-ProcessForge.bat"
if (Test-Path "$installDir\ProcessForge.exe") {
    $exeTarget = "$installDir\ProcessForge.exe"
}

# Desktop shortcut
$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcut = $ws.CreateShortcut("$desktopPath\ProcessForge.lnk")
$shortcut.TargetPath = $exeTarget
$shortcut.WorkingDirectory = $installDir
if (Test-Path "$installDir\icon.ico") {
    $shortcut.IconLocation = "$installDir\icon.ico,0"
}
$shortcut.Description = "ProcessForge Industrial Digital Twin Studio"
$shortcut.Save()

# Start Menu shortcut
$startMenuPath = [Environment]::GetFolderPath('StartMenu') + "\Programs"
$smShortcut = $ws.CreateShortcut("$startMenuPath\ProcessForge.lnk")
$smShortcut.TargetPath = $exeTarget
$smShortcut.WorkingDirectory = $installDir
if (Test-Path "$installDir\icon.ico") {
    $smShortcut.IconLocation = "$installDir\icon.ico,0"
}
$smShortcut.Description = "ProcessForge Industrial Digital Twin Studio"
$smShortcut.Save()

Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Installation Complete! Launching ProcessForge Studio..." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

Start-Process $exeTarget
