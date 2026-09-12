import * as fs from 'node:fs';
import * as path from 'node:path';
import type { ScaffoldManifest, ScanResult, ViolationRecord } from './types.js';

const FORBIDDEN_PATTERNS = [
  { regex: /\bTODO\b/i, rule: 'UNTRACKED_TODO', message: 'Untracked TODO comment detected. Convert to tracked scaffold or implement immediately.' },
  { regex: /\bFIXME\b/i, rule: 'UNTRACKED_FIXME', message: 'Untracked FIXME comment detected.' },
  { regex: /\bUNIMPLEMENTED\b/i, rule: 'UNTRACKED_UNIMPLEMENTED', message: 'Untracked UNIMPLEMENTED keyword detected.' },
  { regex: /throw new Error\(["'](?:Not implemented|TODO)["']\)/i, rule: 'UNTRACKED_STUB_ERROR', message: 'Unhandled placeholder stub exception detected.' }
];

const IGNORED_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '.turbo',
  'target',
  'coverage',
  '.next'
]);

const SCANNABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.rs', '.py']);

/**
 * Scans a project directory against the scaffold manifest.
 */
export function scanProjectForAntiLaziness(
  projectRoot: string,
  manifestPath: string
): ScanResult {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Scaffold manifest not found at: ${manifestPath}`);
  }

  const manifestContent = fs.readFileSync(manifestPath, 'utf8');
  const manifest: ScaffoldManifest = JSON.parse(manifestContent);
  const registeredIds = new Set(manifest.scaffolds.map((s) => s.id));

  const violations: ViolationRecord[] = [];
  let totalFilesScanned = 0;

  function walk(currentDir: string): void {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (SCANNABLE_EXTENSIONS.has(ext)) {
          // Do not scan the scanner itself or test fixtures that deliberately test detection
          if (fullPath.includes('scanner.ts') || fullPath.includes('scanner.test.ts')) {
            continue;
          }

          totalFilesScanned++;
          scanFile(fullPath, projectRoot, registeredIds, violations);
        }
      }
    }
  }

  walk(projectRoot);

  return {
    passed: violations.length === 0,
    totalFilesScanned,
    registeredScaffolds: manifest.scaffolds.length,
    violations
  };
}

function scanFile(
  filePath: string,
  projectRoot: string,
  registeredIds: Set<string>,
  violations: ViolationRecord[]
): void {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const relativePath = path.relative(projectRoot, filePath).replace(/\\/g, '/');

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;

    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.regex.test(line)) {
        // Check if this line is explicitly associated with a registered scaffold ID
        const matchedId = Array.from(registeredIds).find((id) => line.includes(id));
        if (!matchedId) {
          violations.push({
            file: relativePath,
            line: lineNum,
            snippet: line.trim(),
            rule: pattern.rule,
            message: pattern.message
          });
        }
      }
    }
  });
}
