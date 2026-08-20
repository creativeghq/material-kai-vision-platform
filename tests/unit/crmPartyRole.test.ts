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
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

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
  return sharedStripComments(src);
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
   * The B2B discovery save is the other half of the same bug, arrived at from the opposite
   * direction (#334 defect 1). It did not OMIT the role — it PINNED it, `is_customer: true`,
   * under a comment reasoning that B2B research prospects a party we want to sell to. The
   * toolkit's only discovery tool is `b2b_manufacturer_search`, which finds factories, so every
   * porcelain tile plant the agent saved was filed as a customer with no way to say otherwise.
   *
   * A pinned literal is invisible to the guard above, which only constrains inserts that claim
   * `is_supplier` — so it gets its own case. The role must be a tool PARAMETER (the operator sees
   * it on the confirmation card and can change it), and it must default to supplier.
   */
  it('lets the B2B discovery save choose the party role instead of pinning it', () => {
    const src = stripComments(
      readFileSync(join(ROOT, 'supabase/functions/_shared/tools/b2b-tools.ts'), 'utf8'),
    );

    expect(
      src,
      '`save_to_crm` must expose the party role as a parameter — the agent knows whether it just '
      + 'searched for factories or for buyers, and the operator can correct it on the confirm card.',
    ).toMatch(/role:\s*z\.enum\(\[\s*'supplier',\s*'customer',\s*'both'\s*\]\)/);

    expect(
      src,
      'The default must be supplier: the only discovery tool in this toolkit finds manufacturers, '
      + 'and a party we intend to SELL to has to be named as one.',
    ).toMatch(/company\.role\s*\?\?\s*'supplier'/);

    const insert = src.match(/from\(\s*'crm_companies'\s*\)[\s\S]{0,200}?\.insert\(\{([\s\S]{0,900}?)\}\s*\)/);
    expect(insert, '`save_to_crm` no longer inserts into crm_companies — re-point this guard.').toBeTruthy();
    for (const flag of ['is_customer', 'is_supplier']) {
      expect(
        insert![1],
        `${flag} is pinned to a literal again. Both flags come from the role parameter; pinning one `
        + `is how every discovered factory ended up in the customer lists.`,
      ).not.toMatch(new RegExp(`\\b${flag}\\s*:\\s*(?:true|false)\\b`));
    }
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
