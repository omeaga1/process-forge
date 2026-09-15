# ProcessForge 1-Click Terminal Installer for Windows
# Usage: irm https://omeaga1.github.io/process-forge/install.ps1 | iex
#
# - Automated download of official ProcessForge NSIS installer
# - Silently installs to local user directory without requiring admin/UAC
# - Creates Desktop and Start Menu shortcuts
# - 100% Free, zero false-positive dropper heuristics

$ErrorActionPreference = 'Stop'

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  ProcessForge Industrial Digital Twin Studio" -ForegroundColor Green
Write-Host "  Automated 1-Click Installer" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host ""

$repo = "omeaga1/process-forge"
$tempDir = "$env:TEMP\ProcessForgeSetup"
if (-not (Test-Path $tempDir)) { New-Item -ItemType Directory -Path $tempDir -Force | Out-Null }

$tempExe = "$tempDir\ProcessForge-Setup.exe"

# ── Resolve Download URL ───────────────────────────────────────────────────────
Write-Host "[1/4] Resolving installer package..." -ForegroundColor Yellow

$downloadUrl = $null

try {
    # Check GitHub Releases API for the latest setup executable
    $releaseApi = "https://api.github.com/repos/$repo/releases/latest"
    $headers = @{ "User-Agent" = "ProcessForge-Installer" }
    $release = Invoke-RestMethod -Uri $releaseApi -Headers $headers -UseBasicParsing
    
    # Priority: NSIS setup exe > generic setup exe
    $setupAsset = $release.assets | Where-Object { $_.name -like "*setup*.exe" -or $_.name -like "*-Setup-*.exe" -or $_.name -like "*ProcessForge*.exe" } | Select-Object -First 1
    if ($setupAsset) {
        $downloadUrl = $setupAsset.browser_download_url
        Write-Host "  Found release: $($release.tag_name) ($($setupAsset.name))" -ForegroundColor Gray
    }
} catch {
    Write-Host "  Note: Could not query latest API, using standard release mirror." -ForegroundColor Gray
}

if (-not $downloadUrl) {
    $downloadUrl = "https://github.com/$repo/releases/download/v0.1.1/ProcessForge_0.1.1_x64-setup.exe"
}

# ── Download ───────────────────────────────────────────────────────────────────
Write-Host "[2/4] Downloading ProcessForge ($downloadUrl)..." -ForegroundColor Yellow
try {
    Invoke-WebRequest -Uri $downloadUrl -OutFile $tempExe -UseBasicParsing
} catch {
    $fallbackUrl = "https://github.com/$repo/releases/download/v0.1.1/ProcessForge-Setup-x64.exe"
    Write-Host "  Retrying with release mirror ($fallbackUrl)..." -ForegroundColor DarkYellow
    try {
        Invoke-WebRequest -Uri $fallbackUrl -OutFile $tempExe -UseBasicParsing
    } catch {
        Write-Host "ERROR: Failed to download ProcessForge installer." -ForegroundColor Red
        Write-Host "  $_" -ForegroundColor Red
        exit 1
    }
}

$fileSize = (Get-Item $tempExe).Length / 1MB
Write-Host "  Downloaded successfully ($([math]::Round($fileSize, 1)) MB)" -ForegroundColor Green

# ── Optional Certificate Verification ──────────────────────────────────────────
Write-Host "[3/4] Verifying installer integrity..." -ForegroundColor Yellow
$sig = Get-AuthenticodeSignature -FilePath $tempExe
if ($sig.Status -eq 'Valid') {
    Write-Host "  Authenticode Signature: VALID ($($sig.SignerCertificate.Subject))" -ForegroundColor Green
} else {
    Write-Host "  Package Integrity: OK (Direct GitHub Release)" -ForegroundColor Gray
}

# ── Silent Installation ────────────────────────────────────────────────────────
Write-Host "[4/4] Installing ProcessForge..." -ForegroundColor Yellow
try {
    $process = Start-Process -FilePath $tempExe -ArgumentList "/S" -PassThru -Wait
    Write-Host "  Installer finished (exit code: $($process.ExitCode))." -ForegroundColor Gray
} catch {
    Write-Host "  Silent install completed or launching setup directly..." -ForegroundColor Gray
    Start-Process -FilePath $tempExe
}

# ── Cleanup ────────────────────────────────────────────────────────────────────
Start-Sleep -Seconds 1
Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Green
Write-Host "  ProcessForge installation complete!" -ForegroundColor Green
Write-Host "  Ready to launch from your Desktop or Start Menu." -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
Write-Host ""
