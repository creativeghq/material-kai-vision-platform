/**
 * Ratchet on Supabase writes whose error is never checked (#347 audit).
 *
 * **supabase-js RESOLVES on an RLS denial — it does not throw.** A discarded result therefore
 * flows straight past the enclosing try/catch into whatever comes next, which in UI code is
 * usually a success toast. `PriceLookupDrawer` documents this in a comment because it already
 * cost us once: the user saw "Price confirmed", the catalog was unchanged, and no second signal
 * existed anywhere.
 *
 * A platform sweep found the same shape in the prompts admin — `handleSave` discarded BOTH the
 * `prompt_history` insert and the `prompts` update, then unconditionally toasted
 * "updated successfully" and closed the editor. Since #347 phase 3P loads every prompt from that
 * table with no code fallback, a silently-rejected edit means the admin believes a prompt changed
 * while the model is still being sent the old one. Two reminder crons had it too: the email goes
 * out, the `reminded_at` stamp write is unchecked, and an unstamped row re-sends on every tick.
 *
 * ── Why a ratchet and not a hard zero ──────────────────────────────────────────────────────
 * There are ~325 unchecked writes in the tree. Most are genuinely fire-and-forget (telemetry,
 * best-effort cache stamps) and converting them wholesale would be a large, risky change with no
 * user-visible benefit. Sample verification also puts the true-positive rate at roughly one in
 * four — this scanner has real signal but is not precise enough to auto-fix from.
 *
 * So this test does what `.github/edge-typecheck-baseline.json` does for edge types: it pins the
 * current numbers and fails when they RISE. Fix sites opportunistically and ratchet the constants
 * down; never edit them upward to make a build pass.
 *
 * The second number is the one that matters. `CLAIMS_SUCCESS` counts unchecked writes followed by
 * a success signal — a toast, `onSuccess`, a dialog close, `return true`. Those are the ones that
 * lie to the user; a bare unchecked write that reports nothing is merely undiagnosable.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const ROOTS = ['src', 'supabase/functions', 'api'];
const SKIP = ['node_modules', 'integrations/supabase/types.ts', '_generated', '.deno'];

/** Ratchet down as sites are fixed. NEVER raise these to make a build pass. */
const BASELINE_TOTAL = 325;
const BASELINE_CLAIMS_SUCCESS = 38;

const WRITE = /\.(insert|update|upsert|delete)\s*\(/;
/** The code goes on to tell someone it worked. */
const SUCCESS =
  /(toast\s*\(\s*\{[^}]*title|onSuccess|setOpen\(false\)|onSaved|onChanged|return\s+true|status:\s*['"]ok|success:\s*true|navigate\()/i;

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (SKIP.some((k) => p.split(sep).join('/').includes(k))) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** Last line of the logical statement starting at `i` (balanced parens, capped). */
function statementEnd(lines: string[], i: number): number {
  let depth = 0;
  for (let j = i; j < Math.min(i + 25, lines.length); j++) {
    depth += (lines[j].match(/\(/g)?.length ?? 0) - (lines[j].match(/\)/g)?.length ?? 0);
    if (depth <= 0 && j > i) return j;
  }
  return i;
}

interface Finding { file: string; line: number; claimsSuccess: boolean }

function scan(): Finding[] {
  const found: Finding[] = [];
  for (const root of ROOTS) {
    for (const file of walk(join(ROOT, root))) {
      const lines = readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!WRITE.test(lines[i])) continue;
        const end = statementEnd(lines, i);
        const stmt = lines.slice(i, end + 1).join('\n');
        if (!stmt.includes('.from(') && !stmt.includes('.rpc(')) continue;
        if (!['supabase', 'sb.', 'db.', 'client.'].some((c) => stmt.includes(c))) continue;

        const head = lines.slice(Math.max(0, i - 4), i + 1).join('\n');
        const after = lines.slice(end, end + 14).join('\n');
        const destructured = /const\s*\{([^}]*)\}\s*=\s*await/.exec(head);

        if (destructured) {
          const names = destructured[1].split(',').map((n) => n.trim().split(':').pop()!.trim());
          const errName = names.find((n) => n.toLowerCase().includes('err'));
          // Destructured AND referenced afterwards = handled.
          if (errName && new RegExp(`\\b${errName}\\b`).test(after)) continue;
        } else if (!/^\s*(await|void)\s/.test(lines[i])) {
          continue;
        }

        found.push({
          file: relative(ROOT, file).split(sep).join('/'),
          line: i + 1,
          claimsSuccess: SUCCESS.test(after),
        });
      }
    }
  }
  return found;
}

describe('unchecked Supabase writes', () => {
  const findings = scan();
  const lying = findings.filter((f) => f.claimsSuccess);

  it('the scanner still finds call sites (it has not silently broken)', () => {
    expect(findings.length).toBeGreaterThan(50);
  });

  it('does not add unchecked writes', () => {
    expect(
      findings.length,
      `Unchecked Supabase writes rose to ${findings.length} (baseline ${BASELINE_TOTAL}). ` +
      'supabase-js RESOLVES on an RLS denial — destructure `error` and check it. If you fixed ' +
      'sites, ratchet BASELINE_TOTAL down; never raise it.',
    ).toBeLessThanOrEqual(BASELINE_TOTAL);
  });

  it('does not add unchecked writes that then report success', () => {
    const sample = lying.slice(0, 12).map((f) => `${f.file}:${f.line}`).join('\n');
    expect(
      lying.length,
      `Unchecked writes followed by a success signal rose to ${lying.length} ` +
      `(baseline ${BASELINE_CLAIMS_SUCCESS}). These are the ones that lie to the user — the ` +
      `write is rejected and the UI says it saved.\n${sample}`,
    ).toBeLessThanOrEqual(BASELINE_CLAIMS_SUCCESS);
  });

  it('the three sites fixed by the audit stay fixed', () => {
    // Guard the guard: these are the verified true positives. If any regresses, the scanner
    // should see it again.
    const fixed = [
      'src/components/Admin/AgentConfigs/AgentConfigsPage.tsx',
      'supabase/functions/asset-service-reminders-cron/index.ts',
      'supabase/functions/crm-meeting-reminders/index.ts',
    ];
    const regressed = fixed.filter((f) => findings.some((x) => x.file === f && x.claimsSuccess));
    expect(regressed, 'a site fixed by the #347 audit reports success on an unchecked write again')
      .toEqual([]);
  });
});
