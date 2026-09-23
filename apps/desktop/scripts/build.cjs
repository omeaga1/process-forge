// Builds the desktop app when a Rust toolchain is installed; without one the
// build is skipped (the web packages still build). A failing build fails.
const { execSync } = require('node:child_process');
try {
  execSync('cargo --version', { stdio: 'ignore' });
} catch {
  console.log('Skipping the desktop build: Rust (cargo) is not installed. See https://tauri.app/start/prerequisites/');
  process.exit(0);
}
execSync('pnpm exec tauri build', { stdio: 'inherit' });
