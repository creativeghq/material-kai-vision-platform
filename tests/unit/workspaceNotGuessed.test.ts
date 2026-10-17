import { describe, expect, it } from 'vitest';
import { blankedSource, posix, sourceIndex } from '../helpers/sourceIndex';

const INDEX = sourceIndex({ roots: ['src', 'supabase/functions'], exclude: ['__tests__'] });

const NOT_A_GUESS: Record<string, string> = {
  'supabase/functions/_shared/auth.ts#holdsAnyRole':
    'Existence check: "does this user hold one of these roles anywhere" — the row itself is never used as a workspace.',
  'supabase/functions/inbox-api/index.ts#isOperator':
    'Filters to the ROOT workspace, of which there is exactly one — a yes/no on operator membership, not a pick.',
};

interface Hit { file: string; line: number; chain: string }

function guesses(): Hit[] {
  const hits: Hit[] = [];
  for (const [abs] of INDEX.blanked()) {
    const src = blankedSource(abs);
    const re = /\.from\(\s*['"]workspace_members['"]\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src))) {
      const ends = [src.indexOf(';', m.index), src.indexOf('.from(', m.index + 1), m.index + 600].filter((i) => i > m!.index);
      const chain = src.slice(m.index, Math.min(...ends)).replace(/\s+/g, ' ');
      const byUserOnly = /\.eq\(\s*['"]user_id['"]/.test(chain)
        && !/\.(eq|in|match|neq)\(\s*['"]workspace_id['"]/.test(chain);
      const oneRow = /\.(limit\(\s*1\s*\)|single\(\)|maybeSingle\(\))/.test(chain);
      if (byUserOnly && oneRow) {
        hits.push({ file: posix(abs), line: src.slice(0, m.index).split('\n').length, chain });
      }
    }
  }
  return hits;
}

function enclosingFunction(file: string, line: number): string {
  const lines = blankedSource(file).split('\n').slice(0, line).reverse();
  for (const l of lines) {
    const fn = /function\s+(\w+)|const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*(?::[^=]+)?=>/.exec(l);
    if (fn) return fn[1] ?? fn[2];
  }
  return '?';
}

describe('a workspace is never guessed from one membership row (#496)', () => {
  it('no workspace_members read filtered only by user_id reduces to a single row', () => {
    const offenders = guesses()
      .filter((h) => !NOT_A_GUESS[`${h.file}#${enclosingFunction(h.file, h.line)}`])
      .map((h) => `${h.file}:${h.line}  ${h.chain.slice(0, 160)}`);
    expect(offenders, `Use the active workspace, an explicit membership-checked workspace_id, or the row's own workspace:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('every allowlisted exception still exists (shrink-only)', () => {
    const live = new Set(guesses().map((h) => `${h.file}#${enclosingFunction(h.file, h.line)}`));
    const stale = Object.keys(NOT_A_GUESS).filter((k) => !live.has(k));
    expect(stale, 'Remove these NOT_A_GUESS entries — the read they excused is gone').toEqual([]);
  });
});
