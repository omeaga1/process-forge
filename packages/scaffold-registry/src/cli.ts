#!/usr/bin/env node
import * as path from 'node:path';
import { scanProjectForAntiLaziness } from './scanner.js';

function runCli(): void {
  const projectRoot = process.cwd();
  const manifestPath = path.resolve(projectRoot, 'scaffold-manifest.json');

  console.log(`[Anti-Laziness Guard] Scanning ${projectRoot}...`);
  console.log(`[Anti-Laziness Guard] Checking manifest: ${manifestPath}`);

  try {
    const result = scanProjectForAntiLaziness(projectRoot, manifestPath);

    console.log(`[Anti-Laziness Guard] Files scanned: ${result.totalFilesScanned}`);
    console.log(`[Anti-Laziness Guard] Active registered scaffolds: ${result.registeredScaffolds}`);

    if (result.violations.length > 0) {
      console.error(`\n[FAIL] Found ${result.violations.length} anti-laziness policy violation(s):`);
      for (const v of result.violations) {
        console.error(`  • [${v.rule}] ${v.file}:${v.line}`);
        console.error(`    Snippet: "${v.snippet}"`);
        console.error(`    Fix: ${v.message}\n`);
      }
      process.exit(1);
    } else {
      console.log(`\n[PASS] Anti-Laziness Guard passed: zero untracked placeholders found.`);
      process.exit(0);
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`\n[ERROR] Verification failed: ${errorMsg}`);
    process.exit(1);
  }
}

runCli();
