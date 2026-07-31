/**
 * CRM party-role guard.
 *
 * The bug this exists to stop: `crm_companies.is_customer` (and `crm_contacts.is_client`)
 * DEFAULTED TO TRUE at the column. Every path that creates a supplier correctly set
 * `is_supplier: true` and said nothing about the other flag — so the column default filed the
 * company as a customer as well. Adding an issuer to CRM from the myDATA expenses inbox
 * produced a party that was BOTH, and a company we only ever buy from turned up in the customer
 * pickers, the AR statements and the receivables aging.
 *
 * Six code sites and two SQL functions had the same shape, because none of them was wrong: the
 * omission was the bug, and an omission is invisible in review. `is_customer` now defaults to
 * false (migration `crm_companies_is_customer_default_false`), which fixes the SQL creators
 * outright, and the "stated no role -> customer" convention that API callers relied on moved
 * into the crm-api companies POST handler, where a request CAN be inspected for whether it
 * stated a role at all.
 *
 * A direct insert cannot be inspected that way, so it has to say what it is creating. This test
 * fails the build when a supplier-creating insert goes back to leaving the customer flag to
 * whatever the column happens to default to.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['src', 'supabase/functions'];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    if (e === 'node_modules' || e === 'dist') continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e) && !/types\.ts$/.test(e)) out.push(p);
  }
  return out;
}

/** Strip comments so the prose above (and the notes at each call site) doesn't trip the scanner. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * Insert payloads reaching `crm_companies` / `crm_contacts`. Matches both the direct PostgREST
 * form (`.from('crm_companies').insert({...})`) and the crm-api client form
 * (`companiesAPI.createCompany({...})`), which lands in the same table one hop later.
 */
const INSERTS = [
  {
    table: 'crm_companies',
    counterpart: 'is_customer',
    re: /(?:from\(\s*['"]crm_companies['"]\s*\)[\s\S]{0,200}?\.insert\(|createCompany\()\s*\{([\s\S]{0,900}?)\}\s*(?:as any)?\s*\)/g,
  },
  {
    table: 'crm_contacts',
    counterpart: 'is_client',
    re: /(?:from\(\s*['"]crm_contacts['"]\s*\)[\s\S]{0,200}?\.insert\(|createContact\()\s*\{([\s\S]{0,900}?)\}\s*(?:as any)?\s*\)/g,
  },
];

describe('CRM party role is stated, never defaulted', () => {
  const files = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)));

  it('finds sources to scan', () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it('never creates a supplier without saying whether it is also a customer', () => {
    const offenders: string[] = [];
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      for (const { table, counterpart, re } of INSERTS) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src)) !== null) {
          const payload = m[1];
          // Only supplier-creating inserts are constrained. A payload that doesn't claim the
          // supplier role has nothing to disambiguate.
          if (!/\bis_supplier\s*:\s*(?:true|[A-Za-z_$][\w$.]*)/.test(payload)) continue;
          if (new RegExp(`\\b${counterpart}\\s*:`).test(payload)) continue;
          const line = src.slice(0, m.index).split('\n').length;
          offenders.push(`${relative(ROOT, f)}:${line} — inserts a ${table} supplier without ${counterpart}`);
        }
      }
    }
    expect(
      offenders,
      `A supplier-creating insert must state the other role explicitly (\`is_customer: false\` / `
      + `\`is_client: false\`). Leaving it out is how suppliers ended up in the customer lists:\n`
      + offenders.join('\n'),
    ).toEqual([]);
  });

  /**
   * The convention has to live SOMEWHERE, and the API handler is the one layer that can tell
   * "this caller wants the default" from "this caller is creating a supplier". If this guard
   * goes, a partner-key caller that posts a bare company silently stops being a customer.
   */
  it('keeps the "no role stated -> customer" convention in the crm-api handler', () => {
    const src = readFileSync(
      join(ROOT, 'supabase/functions/crm-api/handlers/companies-api-handler.ts'),
      'utf8',
    );
    expect(stripComments(src)).toMatch(
      /is_customer\s*===\s*undefined[\s\S]{0,120}is_supplier\s*===\s*undefined[\s\S]{0,120}is_customer\s*=\s*true/,
    );
  });
});
