/**
 * Package Release Bundles: Portable ZIP & Web Distribution
 *
 * Produces supplementary release artifacts that complement the primary
 * Tauri NSIS/MSI/DMG/AppImage installers built by tauri-action in CI.
 *
 * Outputs:
 *   - release-dist/process-forge-windows-portable-x64.zip  (portable, no install needed)
 *   - release-dist/process-forge-web-dist.tar.gz            (web studio distribution)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const WEB_DIST = path.join(REPO_ROOT, 'apps/web/dist');
const RELEASE_DIST = path.join(REPO_ROOT, 'release-dist');
const PORTABLE_DIR = path.join(RELEASE_DIST, 'process-forge-windows-portable');

fs.mkdirSync(RELEASE_DIST, { recursive: true });

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDirRecursive(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ── 1. Build Portable Windows Folder ──────────────────────────────────────────
console.log('Building portable Windows distribution...');

if (fs.existsSync(PORTABLE_DIR)) {
  fs.rmSync(PORTABLE_DIR, { recursive: true, force: true });
}
fs.mkdirSync(path.join(PORTABLE_DIR, 'app'), { recursive: true });
copyDirRecursive(WEB_DIST, path.join(PORTABLE_DIR, 'app'));

const readmeSrc = path.join(REPO_ROOT, 'apps/desktop/README.md');
if (fs.existsSync(readmeSrc)) {
  fs.copyFileSync(readmeSrc, path.join(PORTABLE_DIR, 'README.md'));
}

const iconSrc = path.join(REPO_ROOT, 'apps/desktop/src-tauri/icons/icon.ico');
if (fs.existsSync(iconSrc)) {
  fs.copyFileSync(iconSrc, path.join(PORTABLE_DIR, 'icon.ico'));
}

// Copy or compile native launcher
const launcherExeSrc = path.join(REPO_ROOT, 'apps/desktop/launcher/ProcessForge.exe');
const launcherCsSrc = path.join(REPO_ROOT, 'apps/desktop/launcher/ProcessForgeLauncher.cs');
const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';

if (process.platform === 'win32' && fs.existsSync(cscPath) && fs.existsSync(launcherCsSrc)) {
  try {
    console.log('Compiling native Windows launcher ProcessForge.exe with csc.exe...');
    execSync(`"${cscPath}" /target:winexe /optimize+ /r:System.IO.Compression.FileSystem.dll /win32icon:"${iconSrc}" /out:"${path.join(PORTABLE_DIR, 'ProcessForge.exe')}" "${launcherCsSrc}"`, { stdio: 'ignore' });
  } catch (err) {
    if (fs.existsSync(launcherExeSrc)) {
      fs.copyFileSync(launcherExeSrc, path.join(PORTABLE_DIR, 'ProcessForge.exe'));
    }
  }
} else if (fs.existsSync(launcherExeSrc)) {
  fs.copyFileSync(launcherExeSrc, path.join(PORTABLE_DIR, 'ProcessForge.exe'));
}

// Keep launcher binary in sync
if (fs.existsSync(path.join(PORTABLE_DIR, 'ProcessForge.exe'))) {
  fs.copyFileSync(path.join(PORTABLE_DIR, 'ProcessForge.exe'), launcherExeSrc);
}

const batContent = `@echo off\r\necho Starting ProcessForge Industrial Studio...\r\nif exist "%~dp0ProcessForge.exe" (\r\n  start "" "%~dp0ProcessForge.exe"\r\n) else (\r\n  start "" "app\\index.html"\r\n)\r\n`;
fs.writeFileSync(path.join(PORTABLE_DIR, 'Start-ProcessForge.bat'), batContent);

const updateCmdContent = `@echo off
setlocal
title ProcessForge Update Pull
echo ========================================================
echo   ProcessForge - Checking and Pulling Latest Updates
echo ========================================================
echo Terminating running ProcessForge instances...
taskkill /F /IM ProcessForge.exe /T > nul 2>&1
ping 127.0.0.1 -n 2 > nul

set "TARGET=%LOCALAPPDATA%\\ProcessForge"
set "TEMP_ZIP=%TEMP%\\process-forge-update.zip"
set "TEMP_DIR=%TEMP%\\pf-update-extract"

echo Downloading latest release bundle...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$candidates = @('https://github.com/omeaga1/process-forge/releases/latest/download/process-forge-windows-portable-x64.zip','https://github.com/omeaga1/process-forge/releases/download/v0.1.2/process-forge-windows-portable-x64.zip','https://raw.githubusercontent.com/omeaga1/process-forge/main/release-dist/process-forge-windows-portable-x64.zip'); foreach ($u in $candidates) { try { Invoke-WebRequest -Uri $u -OutFile '%TEMP_ZIP%' -UseBasicParsing; if ((Get-Item '%TEMP_ZIP%').Length -gt 1000) { break } } catch {} }"

if not exist "%TEMP_ZIP%" (
  echo Failed to download update. Please check internet connection.
  pause
  exit /b 1
)

echo Extracting updated files...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -Path '%TEMP_ZIP%' -DestinationPath '%TEMP_DIR%' -Force"

if exist "%TEMP_DIR%\\process-forge-windows-portable\\app" (
  xcopy /E /I /Y "%TEMP_DIR%\\process-forge-windows-portable\\app" "%TARGET%\\app" > nul
) else if exist "%TEMP_DIR%\\app" (
  xcopy /E /I /Y "%TEMP_DIR%\\app" "%TARGET%\\app" > nul
)

if exist "%TEMP_DIR%\\process-forge-windows-portable\\ProcessForge.exe" (
  copy /Y "%TEMP_DIR%\\process-forge-windows-portable\\ProcessForge.exe" "%TARGET%\\" > nul
)

rd /s /q "%TEMP_DIR%" > nul 2>&1
del /f /q "%TEMP_ZIP%" > nul 2>&1

echo ========================================================
echo   Update applied successfully! Launching ProcessForge...
echo ========================================================
start "" "%TARGET%\\ProcessForge.exe"
ping 127.0.0.1 -n 2 > nul
exit
`;
fs.writeFileSync(path.join(PORTABLE_DIR, 'Update-ProcessForge.cmd'), updateCmdContent);

const installCmdContent = `@echo off
setlocal
title ProcessForge 1-Click Setup and Purge
echo ========================================================
echo   ProcessForge Industrial Digital Twin Studio Setup
echo ========================================================
echo Stopping any running ProcessForge processes...
taskkill /F /IM ProcessForge.exe /T > nul 2>&1
ping 127.0.0.1 -n 2 > nul

set "TARGET=%LOCALAPPDATA%\\ProcessForge"
echo Purging existing installation at %TARGET%...
if exist "%TARGET%" (
  rd /s /q "%TARGET%" > nul 2>&1
)

echo Creating fresh directory structure...
mkdir "%TARGET%" > nul 2>&1
mkdir "%TARGET%\\app" > nul 2>&1

echo Copying updated studio application files...
xcopy /E /I /Y "%~dp0app" "%TARGET%\\app" > nul
if exist "%~dp0icon.ico" copy /Y "%~dp0icon.ico" "%TARGET%\\" > nul
if exist "%~dp0ProcessForge.exe" copy /Y "%~dp0ProcessForge.exe" "%TARGET%\\" > nul
if exist "%~dp0Start-ProcessForge.bat" copy /Y "%~dp0Start-ProcessForge.bat" "%TARGET%\\" > nul
if exist "%~dp0Update-ProcessForge.cmd" copy /Y "%~dp0Update-ProcessForge.cmd" "%TARGET%\\" > nul
if exist "%~dp0README.md" copy /Y "%~dp0README.md" "%TARGET%\\" > nul

echo Setting up Desktop shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\\ProcessForge.lnk'); $s.TargetPath = '%TARGET%\\ProcessForge.exe'; $s.WorkingDirectory = '%TARGET%'; $s.IconLocation = '%TARGET%\\icon.ico,0'; $s.Description = 'ProcessForge Industrial Twin Studio'; $s.Save()"

echo Setting up Start Menu shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('StartMenu') + '\\Programs\\ProcessForge.lnk'); $s.TargetPath = '%TARGET%\\ProcessForge.exe'; $s.WorkingDirectory = '%TARGET%'; $s.IconLocation = '%TARGET%\\icon.ico,0'; $s.Description = 'ProcessForge Industrial Twin Studio'; $s.Save()"

echo ========================================================
echo   Installation Complete! Launching ProcessForge...
echo ========================================================
start "" "%TARGET%\\ProcessForge.exe"
ping 127.0.0.1 -n 2 > nul
exit
`;
fs.writeFileSync(path.join(PORTABLE_DIR, 'Install-ProcessForge.cmd'), installCmdContent);

// ── 2. Zip Portable Bundle ────────────────────────────────────────────────────
console.log('Compressing portable ZIP...');
const portableZip = path.join(RELEASE_DIST, 'process-forge-windows-portable-x64.zip');
if (fs.existsSync(portableZip)) fs.unlinkSync(portableZip);

if (process.platform === 'win32') {
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${PORTABLE_DIR}' -DestinationPath '${portableZip}' -Force"`, { stdio: 'inherit' });
} else {
  execSync(`(cd "${RELEASE_DIST}" && zip -r process-forge-windows-portable-x64.zip process-forge-windows-portable)`, { stdio: 'inherit' });
}

// ── 3. Web Distribution Tarball ───────────────────────────────────────────────
console.log('Packaging web distribution tarball...');
const webTar = path.join(RELEASE_DIST, 'process-forge-web-dist.tar.gz');
execSync(`tar -czf "${webTar}" -C "${WEB_DIST}" .`, { stdio: 'inherit' });

// Copy to docs-landing public directory so landing page can serve it directly
const landingPublicDir = path.join(REPO_ROOT, 'apps/docs-landing/public');
if (fs.existsSync(landingPublicDir) && fs.existsSync(portableZip)) {
  fs.copyFileSync(portableZip, path.join(landingPublicDir, 'process-forge-windows-portable-x64.zip'));
  console.log('Mirrored portable zip to apps/docs-landing/public/process-forge-windows-portable-x64.zip');
}

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log('=== Release bundles packaged successfully ===');
fs.readdirSync(RELEASE_DIST).forEach((f) => {
  const stats = fs.statSync(path.join(RELEASE_DIST, f));
  if (!stats.isDirectory()) {
    console.log(` - ${f} (${(stats.size / 1024).toFixed(1)} KB)`);
  }
});

