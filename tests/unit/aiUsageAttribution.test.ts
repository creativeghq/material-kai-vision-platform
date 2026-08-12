/**
 * AI-usage attribution guard.
 *
 * The bug this exists to stop: `ai_usage_logs` has a `workspace_id` column and an RLS policy that
 * reads it — `auth.uid() = user_id OR is_workspace_admin(workspace_id)` — and 19 of the 31 edge
 * insert sites never set it. The credits were always debited correctly; only the reporting was
 * blind, in two ways that both look like nothing:
 *
 *   • no per-tenant cost view could see the spend, so "what is this workspace costing us"
 *     answered with a fraction of the truth and looked like a complete answer;
 *   • neither RLS branch can match when both columns are null, so a workspace admin who was not
 *     personally the billed user saw NONE of their own workspace's AI usage — the rows existed,
 *     were correct, and were invisible to the people paying for them.
 *
 * Nothing raises. A missing column in an insert is valid TypeScript, a valid insert, and a
 * perfectly consistent row. It was found by counting, not by anything failing.
 *
 * WHY A TEST AND NOT A CONVENTION. The 19 sites did not drift in one bad week — they accumulated,
 * each one written by someone who had `workspace_id` in a variable four lines above the insert.
 * A rule with no enforcement is exactly the prose CLAUDE.md warns does not survive contact with a
 * large codebase.
 *
 * SCOPE. This scans the edge functions only. MIVAA (`mivaa-pdf-extractor`) is a separate
 * repository with its own writers — its `log_ai_call` and `CostAttribution` both already accept a
 * workspace and its embedding service does not pass one, which is not visible from here. A green
 * run says nothing about that half.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const FN_DIR = join(ROOT, 'supabase', 'functions');

/**
 * Sites that legitimately have no workspace, each with the reason it is true.
 *
 * SHRINK-ONLY. Every entry is asserted to still exist below, so a stale one fails rather than
 * quietly widening the exemption; and an entry may only be added for a call that genuinely has no
 * tenant to name, never for one where threading the id is merely inconvenient. Attribution that is
 * absent is a gap. Attribution that is WRONG — a cost line pointing at a tenant that did not spend
 * it — is worse, which is the only thing that makes this list defensible at all.
 */
const NO_WORKSPACE_EXISTS: Record<string, string> = {
  'supabase/functions/generate-moodboard-sheet-pdf/create-sheet.ts':
    'moodboards are user-scoped: `moodboards` has user_id and no workspace_id column, and the '
    + 'sheet row carries only created_by. The debit says the same thing (p_workspace_id: null).',
  'supabase/functions/generate-moodboard-sheet-pdf/index.ts':
    'same — the PDF render is billed to the sheet\'s created_by, and no workspace exists to name.',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

interface Site {
  file: string;
  line: number;
  body: string;
}

/**
 * Every `from('ai_usage_logs').insert({ … })` with its argument body.
 *
 * Brace/paren matching rather than a regex over the object: these bodies contain nested objects,
 * template literals and ternaries, and a regex that stops at the first `}` reports a short body
 * and silently passes a site it never read — a guard that reports clean because it looked at
 * nothing is the failure mode this whole file is about.
 */
function insertSites(): Site[] {
  const sites: Site[] = [];
  for (const file of walk(FN_DIR)) {
    const src = readFileSync(file, 'utf8');
    const re = /from\(['"]ai_usage_logs['"]\)\s*\.insert\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) {
      let depth = 1;
      let i = m.index + m[0].length;
      while (i < src.length && depth > 0) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')') depth--;
        i++;
      }
      sites.push({
        file: relative(ROOT, file).replace(/\\/g, '/'),
        line: src.slice(0, m.index).split('\n').length,
        body: src.slice(m.index + m[0].length, i),
      });
    }
  }
  return sites;
}

describe('ai_usage_logs attribution', () => {
  it('finds the insert sites at all', () => {
    // A parser that silently matches nothing would make every assertion below vacuous.
    expect(insertSites().length, 'no ai_usage_logs inserts parsed — did the client API change?')
      .toBeGreaterThan(20);
  });

  it('every insert sets workspace_id, or is a listed exemption', () => {
    const offenders = insertSites()
      .filter((s) => !/\bworkspace_id\s*:/.test(s.body))
      .filter((s) => !(s.file in NO_WORKSPACE_EXISTS))
      .map((s) => `${s.file}:${s.line}`);

    expect(
      offenders,
      'These ai_usage_logs inserts do not set workspace_id, so their rows are invisible to '
        + 'per-tenant cost views AND to the table\'s own is_workspace_admin(workspace_id) policy. '
        + 'Pass the workspace the debit already used. If the call genuinely has no tenant, add the '
        + 'file to NO_WORKSPACE_EXISTS with the reason:\n  ' + offenders.join('\n  '),
    ).toEqual([]);
  });

  it('every insert sets user_id, or is a listed exemption', () => {
    // The other half of the same policy. A row with neither id is owned by nobody and matches
    // neither branch — which is how 1435 embedding rows became invisible to everyone.
    const offenders = insertSites()
      .filter((s) => !/\buser_id\s*:/.test(s.body))
      .map((s) => `${s.file}:${s.line}`);

    expect(
      offenders,
      'These ai_usage_logs inserts set no user_id:\n  ' + offenders.join('\n  '),
    ).toEqual([]);
  });

  it('the exemption list only shrinks', () => {
    const filesWithSites = new Set(insertSites().map((s) => s.file));
    const stale = Object.keys(NO_WORKSPACE_EXISTS).filter((f) => !filesWithSites.has(f));

    expect(
      stale,
      'NO_WORKSPACE_EXISTS names files that no longer insert into ai_usage_logs. Remove them — a '
        + 'stale exemption is a hole waiting for the next file with that path:\n  ' + stale.join('\n  '),
    ).toEqual([]);
  });

  it('every exemption states a reason', () => {
    const unexplained = Object.entries(NO_WORKSPACE_EXISTS)
      .filter(([, reason]) => reason.trim().length < 30)
      .map(([file]) => file);

    expect(unexplained, 'An exemption without a stated reason is an exemption nobody can review')
      .toEqual([]);
  });
});
