import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function findSourceFile(filename: string): string {
  const candidates = [
    path.resolve(__dirname, '../../src/components', filename),
    path.resolve(__dirname, '../components', filename),
    path.resolve(process.cwd(), 'apps/web/src/components', filename),
    path.resolve(process.cwd(), 'src/components', filename)
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`Could not find source component file: ${filename}`);
}

describe('Landing and portal layout', () => {
  const landingHubPath = findSourceFile('LandingPageHub.tsx');
  const landingHubContent = fs.readFileSync(landingHubPath, 'utf8');

  it('has one primary button, and it continues the open project', () => {
    const primaries = landingHubContent.match(/backgroundColor:\s*palette\.jade\[600\]/g);
    assert.strictEqual(primaries?.length, 1, 'The hub has exactly one primary button');
    assert.ok(landingHubContent.includes('Continue “{currentProject.name}”'), 'The primary button continues the current project');
  });

  it('lists projects with the same browser the studio uses', () => {
    assert.ok(landingHubContent.includes('<ProjectBrowser'), 'The hub embeds ProjectBrowser');
    assert.ok(landingHubContent.includes('variant="page"'), 'as a page, not a dialog');
  });

  it('forbids duplicate primary "Open Studio" buttons in the top navbar', () => {
    // Extract header section
    const headerMatch = landingHubContent.match(/<header[\s\S]*?<\/header>/);
    assert.ok(headerMatch, 'LandingPageHub must have a header');
    const headerContent = headerMatch[0];

    // Header must not contain a competing solid Open Studio button
    assert.ok(
      !headerContent.includes('<span>Open Studio</span>'),
      'Top navigation header must not duplicate the "Open Studio" button above the hero'
    );
  });

  it('bans generic AI/wizard slop terminology ("New Simulation (Blank)")', () => {
    assert.ok(
      !landingHubContent.includes('New Simulation (Blank)'),
      'Generic "New Simulation (Blank)" button text must be replaced with professional CAD terminology ("Blank Canvas")'
    );
    assert.ok(
      !landingHubContent.includes('Start Wizard'),
      'Generic "Start Wizard" text must not be present'
    );
  });

  it('verifies essential Hub action handlers are wired in component props', () => {
    const requiredProps = [
      'onNewProject',
      'onOpenProject',
      'onImportFile',
      'onRenameCurrent',
      'onOpenStudio',
      'onOpenForgeHub',
      'onOpenAiModal',
      'onOpenAccountModal'
    ];

    for (const prop of requiredProps) {
      assert.ok(
        landingHubContent.includes(prop),
        `LandingPageHub must support and wire prop handler "${prop}"`
      );
    }
  });

  it('verifies HeaderBar provides clear Hub return navigation', () => {
    const headerBarPath = findSourceFile('HeaderBar.tsx');
    const headerBarContent = fs.readFileSync(headerBarPath, 'utf8');

    assert.ok(
      headerBarContent.includes('onNavigateHome'),
      'HeaderBar must receive onNavigateHome callback'
    );
    assert.ok(
      headerBarContent.includes('Studio Hub'),
      'HeaderBar must display "Studio Hub" dashboard navigation'
    );
  });

  it('verifies HeaderBar omits redundant dock collapse button to prevent canvas jumping', () => {
    const headerBarPath = findSourceFile('HeaderBar.tsx');
    const headerBarContent = fs.readFileSync(headerBarPath, 'utf8');

    assert.ok(
      !headerBarContent.includes('onToggleDockCollapse'),
      'HeaderBar should not render redundant dock collapse toggle'
    );
  });
});
