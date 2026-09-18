import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

function profileQueries(source: string): string[] {
  const out: string[] = [];
  const re = /from\(\s*['"]user_profiles['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const tail = source.slice(m.index + m[0].length, m.index + 400);
    const next = tail.search(/\.from\(/);
    out.push(next === -1 ? tail : tail.slice(0, next));
  }
  return out;
}

describe('user_profiles is keyed by user_id, not id', () => {
  const files = walk(SRC);

  it('finds the queries it is meant to be guarding', () => {
    const withQueries = files.filter((f) => profileQueries(readFileSync(f, 'utf8')).length > 0);
    expect(withQueries.length).toBeGreaterThan(5);
  });

  it('never filters a user_profiles read on the row PK', () => {
    const offenders: string[] = [];
    for (const file of files) {
      for (const query of profileQueries(readFileSync(file, 'utf8'))) {
        if (/\.(eq|in)\(\s*['"]id['"]/.test(query)) {
          offenders.push(relative(ROOT, file).replace(/\\/g, '/'));
        }
      }
    }
    expect(
      offenders,
      'user_profiles.id (row PK) never equals user_id (the auth uid), so a read filtered on id '
        + 'matches nothing — and .maybeSingle() reports that as success, so the caller renders its '
        + 'fallback forever with no error anywhere. Filter on user_id.',
    ).toEqual([]);
  });
});
