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

// 1. If Windows, compile the native one-click installer (.exe)
if (process.platform === 'win32') {
  execSync(`node "${path.join(__dirname, 'build-windows-installer.cjs')}"`, { stdio: 'inherit' });
}

// 2. Build portable Windows folder
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

const batContent = `@echo off\r\necho Starting ProcessForge Industrial Studio...\r\nstart "" "app\\index.html"\r\n`;
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
if exist "%~dp0Start-ProcessForge.bat" copy /Y "%~dp0Start-ProcessForge.bat" "%TARGET%\\" > nul

echo Setting up Desktop shortcut...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('Desktop') + '\\ProcessForge.lnk'); $s.TargetPath = '%TARGET%\\Start-ProcessForge.bat'; $s.IconLocation = '%TARGET%\\icon.ico,0'; $s.Description = 'ProcessForge Industrial Twin Studio'; $s.Save()"

echo Setting up Start Menu shortcut...
powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut([Environment]::GetFolderPath('StartMenu') + '\\Programs\\ProcessForge.lnk'); $s.TargetPath = '%TARGET%\\Start-ProcessForge.bat'; $s.IconLocation = '%TARGET%\\icon.ico,0'; $s.Description = 'ProcessForge Industrial Twin Studio'; $s.Save()"

echo ========================================================
echo   Installation Complete! Launching ProcessForge...
echo ========================================================
start "" "%TARGET%\\Start-ProcessForge.bat"
timeout /t 2 > nul
exit
`;
fs.writeFileSync(path.join(PORTABLE_DIR, 'Install-ProcessForge.cmd'), installCmdContent);

// Zip portable bundle
const portableZip = path.join(RELEASE_DIST, 'process-forge-windows-portable-x64.zip');
if (fs.existsSync(portableZip)) fs.unlinkSync(portableZip);

if (process.platform === 'win32') {
  execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${PORTABLE_DIR}' -DestinationPath '${portableZip}' -Force"`, { stdio: 'inherit' });
} else {
  execSync(`(cd "${RELEASE_DIST}" && zip -r process-forge-windows-portable-x64.zip process-forge-windows-portable)`, { stdio: 'inherit' });
}

// Web distribution tarball
const webTar = path.join(RELEASE_DIST, 'process-forge-web-dist.tar.gz');
execSync(`tar -czf "${webTar}" -C "${WEB_DIST}" .`, { stdio: 'inherit' });

console.log('=== All release bundles packaged successfully ===');
fs.readdirSync(RELEASE_DIST).forEach((f) => {
  const stats = fs.statSync(path.join(RELEASE_DIST, f));
  if (!stats.isDirectory()) {
    console.log(` - ${f} (${(stats.size / 1024).toFixed(1)} KB)`);
  }
});
