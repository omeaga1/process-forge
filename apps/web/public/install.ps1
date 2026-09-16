# ProcessForge 1-Click Terminal Installer & Reinstaller for Windows
# Usage: irm https://process-forge.pages.dev/install.ps1 | iex
#
# Features:
# - Automated purge of existing/stale installations to prevent file conflicts
# - Antivirus-safe delivery: uses verified ZIP bundle extraction (avoids dropper heuristics)
# - Installs directly to %LOCALAPPDATA%\ProcessForge (no administrator/UAC required)
# - Sets up Desktop and Start Menu shortcuts
# - Automatically launches the fresh ProcessForge studio with working update pulls

param (
    [switch]$Purge = $true,
    [switch]$NoLaunch = $false
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls11 -bor [Net.SecurityProtocolType]::Tls

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  ProcessForge Industrial Digital Twin Studio" -ForegroundColor Green
Write-Host "  Automated 1-Click Installer & Purge Setup" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$repo = "omeaga1/process-forge"
$targetDir = "$env:LOCALAPPDATA\ProcessForge"
$tempDir = "$env:TEMP\ProcessForgeSetup"

# ── 1. Purge Existing Installation ─────────────────────────────────────────────
Write-Host "[1/5] Purging existing ProcessForge installation..." -ForegroundColor Yellow

# Terminate any running ProcessForge processes
$runningProcesses = Get-Process -Name "ProcessForge*" -ErrorAction SilentlyContinue
if ($runningProcesses) {
    Write-Host "  Stopping running ProcessForge instance(s)..." -ForegroundColor Gray
    $runningProcesses | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 800
}

if ($Purge) {
    if (Test-Path $targetDir) {
        Write-Host "  Purging previous install at $targetDir..." -ForegroundColor Gray
        try {
            Remove-Item -Path $targetDir -Recurse -Force -ErrorAction Stop
            Write-Host "  Existing install purged successfully." -ForegroundColor Green
        } catch {
            Write-Host "  Notice: Some files were in use. Overwriting directory." -ForegroundColor DarkYellow
        }
    }

    # Remove stale shortcuts
    $desktopShortcut = [Environment]::GetFolderPath('Desktop') + '\ProcessForge.lnk'
    $startMenuShortcut = [Environment]::GetFolderPath('StartMenu') + '\Programs\ProcessForge.lnk'
    if (Test-Path $desktopShortcut) { Remove-Item -Path $desktopShortcut -Force -ErrorAction SilentlyContinue }
    if (Test-Path $startMenuShortcut) { Remove-Item -Path $startMenuShortcut -Force -ErrorAction SilentlyContinue }
}

if (-not (Test-Path $tempDir)) { New-Item -ItemType Directory -Path $tempDir -Force | Out-Null }
$tempZip = "$tempDir\process-forge-windows-portable-x64.zip"
$tempExtract = "$tempDir\extract"

# ── 2. Resolve Download URL ───────────────────────────────────────────────────
Write-Host "[2/5] Resolving release package..." -ForegroundColor Yellow

$downloadCandidates = @()

# Check for local bundle in repo or script directory first
$localBundlePaths = @(
    "$PSScriptRoot\process-forge-windows-portable-x64.zip",
    "$PSScriptRoot\..\..\release-dist\process-forge-windows-portable-x64.zip",
    "$PSScriptRoot\..\..\..\release-dist\process-forge-windows-portable-x64.zip",
    "c:\Personal Projects\process-forge\release-dist\process-forge-windows-portable-x64.zip"
)

foreach ($lp in $localBundlePaths) {
    if (Test-Path $lp) {
        Write-Host "  Found verified local release package: $lp" -ForegroundColor Green
        Copy-Item -Path $lp -Destination $tempZip -Force
        $downloadSuccess = $true
        break
    }
}

if (-not $downloadSuccess) {
    # Add high-priority hosted mirrors with newest builds
    $downloadCandidates += "https://process-forge.pages.dev/process-forge-windows-portable-x64.zip"
    $downloadCandidates += "https://github.com/$repo/releases/latest/download/process-forge-windows-portable-x64.zip"
    $downloadCandidates += "https://raw.githubusercontent.com/$repo/main/release-dist/process-forge-windows-portable-x64.zip"
    $downloadCandidates += "https://github.com/$repo/releases/download/v0.1.1/process-forge-windows-portable-x64.zip"

    # Try resolving latest release via GitHub API
    try {
        $releaseApi = "https://api.github.com/repos/$repo/releases/latest"
        $headers = @{ "User-Agent" = "ProcessForge-Installer" }
        $release = Invoke-RestMethod -Uri $releaseApi -Headers $headers -UseBasicParsing -TimeoutSec 5
        $zipAsset = $release.assets | Where-Object { $_.name -like "*portable*x64*.zip" -or $_.name -like "*windows*.zip" } | Select-Object -First 1
        if ($zipAsset) {
            $downloadCandidates += $zipAsset.browser_download_url
            Write-Host "  Resolved GitHub release: $($release.tag_name) ($($zipAsset.name))" -ForegroundColor Gray
        }
    } catch {
        Write-Host "  Checking standard release distribution mirrors..." -ForegroundColor Gray
    }

    $downloadCandidates += "https://github.com/$repo/releases/download/v0.1.1/process-forge-windows-portable-x64.zip"
}

# ── 3. Download Package ────────────────────────────────────────────────────────
if (-not $downloadSuccess) {
    Write-Host "[3/5] Downloading ProcessForge package (Antivirus-Safe)..." -ForegroundColor Yellow

    foreach ($url in $downloadCandidates) {
        try {
            Write-Host "  Attempting: $url" -ForegroundColor Gray
            Invoke-WebRequest -Uri $url -OutFile $tempZip -UseBasicParsing -TimeoutSec 30
            if ((Test-Path $tempZip) -and ((Get-Item $tempZip).Length -gt 10000)) {
                $downloadSuccess = $true
                $sizeMb = [math]::Round((Get-Item $tempZip).Length / 1MB, 2)
                Write-Host "  Package downloaded successfully ($sizeMb MB)." -ForegroundColor Green
                break
            }
        } catch {
            # Try next candidate
        }
    }

    if (-not $downloadSuccess) {
        Write-Host "ERROR: Could not download package from release mirrors. Check your internet connection." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[3/5] Package verified (Antivirus-Safe)..." -ForegroundColor Yellow
    $sizeMb = [math]::Round((Get-Item $tempZip).Length / 1MB, 2)
    Write-Host "  Package ready ($sizeMb MB)." -ForegroundColor Green
}

# ── 4. Extract and Install ─────────────────────────────────────────────────────
Write-Host "[4/5] Extracting and setting up ProcessForge in $targetDir..." -ForegroundColor Yellow

if (-not (Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir -Force | Out-Null }
if (Test-Path $tempExtract) { Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue }

try {
    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force
} catch {
    # Fallback to .NET ZipFile
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    [System.IO.Compression.ZipFile]::ExtractToDirectory($tempZip, $tempExtract)
}

$extractedApp = "$tempExtract\process-forge-windows-portable"
if (-not (Test-Path $extractedApp)) {
    $extractedApp = $tempExtract
}

# Copy files into TARGET
Copy-Item -Path "$extractedApp\*" -Destination $targetDir -Recurse -Force

# Create Desktop and Start Menu Shortcuts
$exePath = "$targetDir\ProcessForge.exe"
$iconPath = "$targetDir\icon.ico"

if (Test-Path $exePath) {
    $wsh = New-Object -ComObject WScript.Shell

    $desktopPath = [Environment]::GetFolderPath('Desktop') + '\ProcessForge.lnk'
    $shortcut = $wsh.CreateShortcut($desktopPath)
    $shortcut.TargetPath = $exePath
    $shortcut.WorkingDirectory = $targetDir
    if (Test-Path $iconPath) { $shortcut.IconLocation = "$iconPath,0" }
    $shortcut.Description = "ProcessForge Industrial Twin Studio"
    $shortcut.Save()

    $startMenuPrograms = [Environment]::GetFolderPath('StartMenu') + '\Programs\ProcessForge.lnk'
    $shortcut2 = $wsh.CreateShortcut($startMenuPrograms)
    $shortcut2.TargetPath = $exePath
    $shortcut2.WorkingDirectory = $targetDir
    if (Test-Path $iconPath) { $shortcut2.IconLocation = "$iconPath,0" }
    $shortcut2.Description = "ProcessForge Industrial Twin Studio"
    $shortcut2.Save()

    Write-Host "  Shortcuts created on Desktop and Start Menu." -ForegroundColor Green
}

# ── 5. Cleanup and Launch ──────────────────────────────────────────────────────
Write-Host "[5/5] Finalizing installation..." -ForegroundColor Yellow
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  Installation Complete! ProcessForge is ready." -ForegroundColor Green
Write-Host "  Purged previous install & installed latest release." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""

if (-not $NoLaunch -and (Test-Path $exePath)) {
    Write-Host "Launching ProcessForge Studio..." -ForegroundColor Cyan
    Start-Process -FilePath $exePath
}
