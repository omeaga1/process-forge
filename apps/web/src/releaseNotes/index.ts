import { parseNote, sortNotes, type ReleaseNote } from './model.js';

// Every notes file, bundled into the app, so "What's new" works offline.
const files = import.meta.glob('./*.md', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

export const RELEASE_NOTES: ReleaseNote[] = sortNotes(Object.entries(files).map(([file, text]) => parseNote(file.replace(/^\.\/|\.md$/g, ''), text)));
