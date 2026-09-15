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
    execSync(`"${cscPath}" /target:winexe /optimize+ /win32icon:"${iconSrc}" /out:"${path.join(PORTABLE_DIR, 'ProcessForge.exe')}" "${launcherCsSrc}"`, { stdio: 'ignore' });
  } catch (err) {
    if (fs.existsSync(launcherExeSrc)) {
      fs.copyFileSync(launcherExeSrc, path.join(PORTABLE_DIR, 'ProcessForge.exe'));
    }
  }
} else if (fs.existsSync(launcherExeSrc)) {
  fs.copyFileSync(launcherExeSrc, path.join(PORTABLE_DIR, 'ProcessForge.exe'));
}

const batContent = `@echo off\r\necho Starting ProcessForge Industrial Studio...\r\nif exist "%~dp0ProcessForge.exe" (\r\n  start "" "%~dp0ProcessForge.exe"\r\n) else (\r\n  start "" "app\\index.html"\r\n)\r\n`;
fs.writeFileSync(path.join(PORTABLE_DIR, 'Start-ProcessForge.bat'), batContent);

const installCmdContent = `@echo off
setlocal
title ProcessForge Setup
echo ========================================================
echo   ProcessForge Industrial Digital Twin Studio Setup
echo ========================================================
echo Installing ProcessForge to %LOCALAPPDATA%\\ProcessForge...

set "TARGET=%LOCALAPPDATA%\\ProcessForge"
if not exist "%TARGET%" mkdir "%TARGET%"
if not exist "%TARGET%\\app" mkdir "%TARGET%\\app"

xcopy /E /I /Y "%~dp0app" "%TARGET%\\app" > nul
if exist "%~dp0icon.ico" copy /Y "%~dp0icon.ico" "%TARGET%\\" > nul
if exist "%~dp0ProcessForge.exe" copy /Y "%~dp0ProcessForge.exe" "%TARGET%\\" > nul
if exist "%~dp0Start-ProcessForge.bat" copy /Y "%~dp0Start-ProcessForge.bat" "%TARGET%\\" > nul

echo Setting up Desktop shortcut...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\\ProcessForge.lnk'); $s.TargetPath = '%TARGET%\\ProcessForge.exe'; $s.WorkingDirectory = '%TARGET%'; $s.IconLocation = '%TARGET%\\icon.ico,0'; $s.Description = 'ProcessForge Industrial Twin Studio'; $s.Save()"

echo Setting up Start Menu shortcut...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('StartMenu') + '\\Programs\\ProcessForge.lnk'); $s.TargetPath = '%TARGET%\\ProcessForge.exe'; $s.WorkingDirectory = '%TARGET%'; $s.IconLocation = '%TARGET%\\icon.ico,0'; $s.Description = 'ProcessForge Industrial Twin Studio'; $s.Save()"

echo ========================================================
echo   Installation Complete! Launching ProcessForge...
echo ========================================================
start "" "%TARGET%\\ProcessForge.exe"
timeout /t 2 > nul
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

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
console.log('=== Release bundles packaged successfully ===');
fs.readdirSync(RELEASE_DIST).forEach((f) => {
  const stats = fs.statSync(path.join(RELEASE_DIST, f));
  if (!stats.isDirectory()) {
    console.log(` - ${f} (${(stats.size / 1024).toFixed(1)} KB)`);
  }
});
