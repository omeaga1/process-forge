import { describe, it } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { scanProjectForAntiLaziness } from '../scanner.js';
import type { ScaffoldManifest } from '../types.js';

describe('Anti-Laziness Scanner', () => {
  it('passes cleanly when no violations are present', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-test-clean-'));
    const manifestPath = path.join(tmpDir, 'scaffold-manifest.json');

    const manifest: ScaffoldManifest = {
      $schema: './schema.json',
      version: '1.0.0',
      updatedAt: '2026-09-12T00:00:00Z',
      project: 'test-project',
      organization: 'test-org',
      policy: {
        zeroUntrackedTodo: true,
        requireExplicitRemovalCondition: true,
        blockOnExpiredMilestone: true
      },
      scaffolds: []
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    // Create a clean source file
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'clean.ts'),
      'export function add(a: number, b: number): number { return a + b; }\n',
      'utf8'
    );

    const result = scanProjectForAntiLaziness(tmpDir, manifestPath);
    assert.equal(result.passed, true);
    assert.equal(result.violations.length, 0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects untracked TODO comments and flags them as violations', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-test-dirty-'));
    const manifestPath = path.join(tmpDir, 'scaffold-manifest.json');

    const manifest: ScaffoldManifest = {
      $schema: './schema.json',
      version: '1.0.0',
      updatedAt: '2026-09-12T00:00:00Z',
      project: 'test-project',
      organization: 'test-org',
      policy: {
        zeroUntrackedTodo: true,
        requireExplicitRemovalCondition: true,
        blockOnExpiredMilestone: true
      },
      scaffolds: []
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    // Create a file with a lazy untracked comment
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'lazy.ts'),
      'export function compute() {\n  // TODO: implement later\n  return 0;\n}\n',
      'utf8'
    );

    const result = scanProjectForAntiLaziness(tmpDir, manifestPath);
    assert.equal(result.passed, false);
    assert.equal(result.violations.length, 1);
    assert.equal(result.violations[0]?.rule, 'UNTRACKED_TODO');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('allows registered scaffolds referenced by ID', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scaffold-test-registered-'));
    const manifestPath = path.join(tmpDir, 'scaffold-manifest.json');

    const manifest: ScaffoldManifest = {
      $schema: './schema.json',
      version: '1.0.0',
      updatedAt: '2026-09-12T00:00:00Z',
      project: 'test-project',
      organization: 'test-org',
      policy: {
        zeroUntrackedTodo: true,
        requireExplicitRemovalCondition: true,
        blockOnExpiredMilestone: true
      },
      scaffolds: [
        {
          id: 'SCAF-TEST-001',
          component: 'src/shim.ts',
          lines: '1-3',
          type: 'MOCK_FALLBACK',
          rationale: 'Temporary shim for testing',
          removalCondition: 'Remove after test passes',
          responsibleAgent: 'Tester',
          blockedMilestone: 'v0.1.0',
          registeredAt: '2026-09-12T00:00:00Z'
        }
      ]
    };

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

    // Create a file referencing the registered scaffold ID
    const srcDir = path.join(tmpDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(
      path.join(srcDir, 'shim.ts'),
      '// SCAF-TEST-001: Temporary fallback\nexport function getMock() { return 42; }\n',
      'utf8'
    );

    const result = scanProjectForAntiLaziness(tmpDir, manifestPath);
    assert.equal(result.passed, true);
    assert.equal(result.violations.length, 0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
