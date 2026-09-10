/** Ratchet on Supabase writes whose error is never checked (#347 audit). */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const ROOTS = ['src', 'supabase/functions', 'api'];
const SKIP = ['node_modules', 'integrations/supabase/types.ts', '_generated', '.deno'];

/** Ratchet down as sites are fixed. NEVER raise these to make a build pass. */
const BASELINE_TOTAL = 242;
const BASELINE_CLAIMS_SUCCESS = 1;

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
        // EVERY destructure in the window, not just the first. A single `.exec` returned the
        // EARLIEST one, so an unrelated read sitting above the write — `const { data: fresh } =
        // await supabase...` on the line before a properly-checked update — shadowed the real
        // destructure, found no `err` name in it, and reported the checked write as unchecked.
        // A guard that cries wolf on correct code teaches people to work around the guard, which
        // costs more than the bug it catches.
        const destructures = [...head.matchAll(/const\s*\{([^}]*)\}\s*=\s*await/g)];

        if (destructures.length) {
          // The LAST one, which is the destructure this write is actually part of — a write is
          // written `const { error } = await supabase...`, so its own is the closest above it.
          // Deliberately not `.some()`: any-of would let a checked write two lines up excuse an
          // unchecked one below it, and a false NEGATIVE here is worse than the noise being fixed.
          const own = destructures[destructures.length - 1];
          const names = own[1].split(',').map((n) => n.trim().split(':').pop()!.trim());
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
