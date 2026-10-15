// The desktop version must have release notes before it can ship.
//
// Each desktop release says what changed in plain words: a file
// apps/web/src/releaseNotes/<version>.md with a "# " title and at least one
// "- " line. The app shows it after the update ("What's new"), the updater
// shows it before, and the GitHub release carries it. A version bump without
// one fails CI here, rather than shipping an update that says nothing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const conf = JSON.parse(fs.readFileSync(path.join(root, 'apps', 'desktop', 'src-tauri', 'tauri.conf.json'), 'utf8'));
const version = conf.version;
const file = path.join(root, 'apps', 'web', 'src', 'releaseNotes', `${version}.md`);

const fail = (msg) => {
  console.error(`::error file=${path.relative(root, file)}::${msg}`);
  process.exit(1);
};
if (!fs.existsSync(file)) fail(`ProcessForge ${version} has no release notes. Write ${path.relative(root, file)}: a "# " title, then "- " lines of what changed and where to find it.`);
const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim();
if (!text.startsWith('# ')) fail(`${version}.md must start with a "# " title.`);
if (!/^- \S/m.test(text)) fail(`${version}.md has no "- " lines: say what changed.`);
console.log(`release notes for ${version}: ok`);
