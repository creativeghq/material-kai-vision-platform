/** `authenticate()` succeeding does NOT mean there is a user. */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const FN_DIR = 'supabase/functions';

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(join(ROOT, dir)); } catch { return out; }
  for (const name of entries) {
    const rel = `${dir}/${name}`;
    if (rel.includes('node_modules')) continue;
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out);
    else if (name.endsWith('.ts')) out.push(rel);
  }
  return out;
}

/** Non-optional dereferences of the authenticated user in one file. */
function unguardedDerefs(code: string): string[] {
  const hits = [...code.matchAll(/(?<!\?)\bauth\.user\.\w+/g)].map((m) => m[0]);

  // `const user = auth.user;` — the alias form. `(?<![.\w])` keeps `inviteData.user.id` and
  // `newUser.id` out; they are different objects that merely end in the same word.
  const alias = code.match(/const\s+(\w+)\s*=\s*auth\.user\s*;/);
  if (alias) {
    const re = new RegExp(`(?<![.\\w])${alias[1]}\\.\\w+`, 'g');
    hits.push(...[...code.matchAll(re)].map((m) => m[0]));
  }
  return [...new Set(hits)];
}

function isGuarded(code: string): boolean {
  if (/requireUser:\s*true/.test(code)) return true;
  if (/!\s*auth\.user\b/.test(code)) return true;
  const alias = code.match(/const\s+(\w+)\s*=\s*auth\.user\s*;/);
  return !!alias && new RegExp(`!\\s*${alias[1]}\\b`).test(code);
}

describe('edge handlers cannot dereference a possibly-null auth.user', () => {
  it('the premise still holds: authenticate() succeeds without a user', () => {
    // If this ever fails, `_shared/auth.ts` changed shape and the rule below needs revisiting
    // rather than the offending handler being "fixed".
    const auth = readFileSync(join(ROOT, FN_DIR, '_shared/auth.ts'), 'utf8');
    const successWithoutUser = [...auth.matchAll(/success:\s*true,\s*\n\s*level:\s*'(\w+)',\s*\n\s*user:\s*null/g)]
      .map((m) => m[1]);

    expect(
      successWithoutUser.length,
      'authenticate() no longer has success paths that leave `user` null — re-read this test',
    ).toBeGreaterThanOrEqual(3);
    expect(new Set(successWithoutUser)).toContain('api_key');
  });

  it('every dereference is behind requireUser, a null check, or optional chaining', () => {
    const offenders: string[] = [];

    for (const file of walk(FN_DIR)) {
      const raw = readFileSync(join(ROOT, file), 'utf8');
      if (!raw.includes('auth.user')) continue;
      const code = stripComments(raw);
      const derefs = unguardedDerefs(code);
      if (derefs.length === 0 || isGuarded(code)) continue;
      offenders.push(`${file} — ${derefs.join(', ')}`);
    }

    expect(
      offenders,
      'These dereference the authenticated user without establishing there is one. A '
      + 'service-role or partner-key caller reaches them with `auth.user === null` and gets a '
      + 'TypeError 500. Use `auth.userId` (set for api_key too) for an id, optional-chain a '
      + 'field that is genuinely optional, or pass `requireUser: true`:\n'
      + offenders.join('\n'),
    ).toEqual([]);
  });
});
