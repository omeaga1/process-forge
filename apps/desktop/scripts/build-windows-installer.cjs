/**
 * Build Script: ProcessForge Native Windows One-Click Installer
 * Compiles a standalone native C# WinForms installer embedding all studio assets.
 * Produces: ProcessForge-Setup-x64.exe
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '../../..');
const WEB_DIST = path.join(REPO_ROOT, 'apps/web/dist');
const ICON_PATH = path.join(REPO_ROOT, 'apps/desktop/src-tauri/icons/icon.ico');
const INSTALLER_SRC = path.join(REPO_ROOT, 'apps/desktop/installer/src');
const STAGING_DIR = path.join(REPO_ROOT, 'apps/desktop/installer/staging');
const PAYLOAD_ZIP = path.join(REPO_ROOT, 'apps/desktop/installer/payload.zip');
const RELEASE_DIST = path.join(REPO_ROOT, 'release-dist');
const DESKTOP_DIST = path.join(REPO_ROOT, 'apps/desktop/dist');
const RELEASES_DIR = path.join(REPO_ROOT, 'releases');

function findCsc() {
  const candidates = [
    'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe',
    'C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error('Microsoft .NET C# compiler (csc.exe) not found on this Windows system.');
}

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function main() {
  console.log('=== Building ProcessForge Windows One-Click Installer ===');

  if (process.platform !== 'win32') {
    console.log('Skipping Windows installer build on non-Windows platform:', process.platform);
    return;
  }

  const csc = findCsc();
  console.log('Found C# compiler:', csc);

  // 1. Verify web app dist exists
  if (!fs.existsSync(path.join(WEB_DIST, 'index.html'))) {
    console.log('Web dist missing, building @process-forge/web...');
    execSync('pnpm --filter @process-forge/web build', { cwd: REPO_ROOT, stdio: 'inherit' });
  }

  // 2. Prepare staging directories
  if (fs.existsSync(STAGING_DIR)) {
    fs.rmSync(STAGING_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(STAGING_DIR, { recursive: true });
  fs.mkdirSync(RELEASE_DIST, { recursive: true });
  fs.mkdirSync(DESKTOP_DIST, { recursive: true });
  fs.mkdirSync(RELEASES_DIR, { recursive: true });

  // 3. Copy web app files to staging/app
  const stagingApp = path.join(STAGING_DIR, 'app');
  console.log('Copying web assets to staging/app...');
  copyDirRecursive(WEB_DIST, stagingApp);

  // 4. Copy icon to staging
  fs.copyFileSync(ICON_PATH, path.join(STAGING_DIR, 'icon.ico'));

  // 5. Compile Launcher.cs -> staging/ProcessForge.exe
  console.log('Compiling ProcessForge.exe launcher...');
  const launcherCs = path.join(INSTALLER_SRC, 'Launcher.cs');
  const launcherExe = path.join(STAGING_DIR, 'ProcessForge.exe');
  execSync(
    `"${csc}" /target:winexe /optimize+ /platform:x64 /win32icon:"${ICON_PATH}" /r:System.Windows.Forms.dll,System.Drawing.dll /out:"${launcherExe}" "${launcherCs}"`,
    { stdio: 'inherit' }
  );

  // 6. Compile Uninstaller.cs -> staging/Uninstall.exe
  console.log('Compiling Uninstall.exe...');
  const uninstallerCs = path.join(INSTALLER_SRC, 'Uninstaller.cs');
  const uninstallerExe = path.join(STAGING_DIR, 'Uninstall.exe');
  execSync(
    `"${csc}" /target:winexe /optimize+ /platform:x64 /win32icon:"${ICON_PATH}" /r:System.Windows.Forms.dll,System.Drawing.dll /out:"${uninstallerExe}" "${uninstallerCs}"`,
    { stdio: 'inherit' }
  );

  // 7. Compress staging contents into payload.zip
  console.log('Packaging payload.zip...');
  if (fs.existsSync(PAYLOAD_ZIP)) {
    fs.unlinkSync(PAYLOAD_ZIP);
  }
  execSync(
    `powershell -NoProfile -Command "Compress-Archive -Path '${STAGING_DIR}\\*' -DestinationPath '${PAYLOAD_ZIP}' -Force"`,
    { stdio: 'inherit' }
  );
  const zipStats = fs.statSync(PAYLOAD_ZIP);
  console.log(`Payload archive created: ${(zipStats.size / (1024 * 1024)).toFixed(2)} MB`);

  // 8. Compile Installer.cs embedding payload.zip -> ProcessForge-Setup-x64.exe
  console.log('Compiling ProcessForge-Setup-x64.exe (One-Click Installer)...');
  const installerCs = path.join(INSTALLER_SRC, 'Installer.cs');
  const setupExe = path.join(RELEASE_DIST, 'ProcessForge-Setup-x64.exe');
  execSync(
    `"${csc}" /target:winexe /optimize+ /platform:x64 /win32icon:"${ICON_PATH}" /resource:"${PAYLOAD_ZIP}",payload.zip /r:System.Windows.Forms.dll,System.Drawing.dll,System.IO.Compression.dll,System.IO.Compression.FileSystem.dll /out:"${setupExe}" "${installerCs}"`,
    { stdio: 'inherit' }
  );

  // 9. Copy to desktop dist and releases directory
  fs.copyFileSync(setupExe, path.join(DESKTOP_DIST, 'ProcessForge-Setup-x64.exe'));
  fs.copyFileSync(setupExe, path.join(RELEASES_DIR, 'ProcessForge-Setup-x64.exe'));

  // Cleanup temporary staging payload zip to keep workspace clean
  if (fs.existsSync(PAYLOAD_ZIP)) {
    fs.unlinkSync(PAYLOAD_ZIP);
  }

  const finalStats = fs.statSync(setupExe);
  console.log('======================================================');
  console.log(' SUCCESS: ProcessForge One-Click Installer Created!');
  console.log(` Location: ${setupExe}`);
  console.log(` Size:     ${(finalStats.size / (1024 * 1024)).toFixed(2)} MB`);
  console.log('======================================================');
}

main().catch((err) => {
  console.error('Build failed:', err);
  process.exit(1);
});
