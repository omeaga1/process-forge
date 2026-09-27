// Prints the newest migration's name: the schema the deployed API should report.
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
process.stdout.write((files.at(-1) ?? 'none').replace(/\.sql$/, ''));
