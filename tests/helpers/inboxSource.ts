import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const INBOX_DIR = join(ROOT, 'src', 'pages', 'Inbox');
const NOT_UI = new Set(['inboxFilters.ts', 'inboxSource.ts', 'inboxSlashCommands.ts']);

function walk(dir: string): string[] {
  return readdirSync(dir).sort().flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.tsx?$/.test(name) && !NOT_UI.has(name) ? [full] : [];
  });
}

export function inboxUiFiles(): string[] {
  return walk(INBOX_DIR).map((f) => relative(ROOT, f).split('\\').join('/'));
}

export function inboxUiSource(): string {
  return inboxUiFiles().map((f) => readFileSync(join(ROOT, f), 'utf8')).join('\n');
}
