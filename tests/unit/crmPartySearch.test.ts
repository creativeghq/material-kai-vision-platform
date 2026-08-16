/**
 * One way to search a CRM party.
 *
 * `crm_contacts` / `crm_companies` each carry a generated `search_fold` column holding every
 * searchable field, folded by `public.crm_fold()` — lowercased, accents stripped, final sigma
 * normalised. Every party picker matches THAT, with a term folded the same way by `foldedLike`.
 *
 * Before this there were a dozen pickers, each `ilike`-ing its own subset of raw columns:
 * quotes searched name/first/last/email, invoices added website and VAT, expenses dropped VAT,
 * planned payments dropped website, the supplier credit note dropped email. Every one of them
 * was accent-sensitive, so a Greek customer was findable in some dialogs and not others
 * depending on how you typed their name — and the operator's conclusion was "they aren't in the
 * system", which is how this started.
 *
 * A raw-column `ilike` on either table is that bug coming back. The allowlist below is
 * SHRINK-ONLY and every entry states why it is not a search.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

const PARTY_TABLES = ['crm_contacts', 'crm_companies'];

/** Columns folded into `search_fold`. An `ilike` on any of them is the old, unfolded path. */
const FOLDED_COLUMNS = ['name', 'first_name', 'last_name', 'email', 'website', 'vat_number'];

const RAW_ILIKE = new RegExp(
  // .ilike('name', …)
  `\\.ilike\\(\\s*['"](?:${FOLDED_COLUMNS.join('|')})['"]` +
  // …or a `name.ilike.` clause inside an or() string
  `|[\`,( ](?:${FOLDED_COLUMNS.join('|')})\\.ilike\\.`,
);

/**
 * Lines that legitimately match a raw column, keyed by file. Each is an EXACT match lookup, not
 * a search box — folding them would change what they mean, not just how forgiving they are.
 */
/**
 * The two dedupe probes that used to live here — QuickAddCompanyDialog and NewExpenseDialog's
 * payee find-or-create — were exempted as "an exact-name lookup, deliberately not fuzzy". That
 * reasoning was right about the SHAPE and wrong about the result: `ilike` is case-insensitive but
 * NOT accent-insensitive, so "Καρέλης ΑΕ" never matched the stored "ΚΑΡΕΛΗΣ ΑΕ" and the probe
 * missed exactly the case the platform built folding machinery for (#366 BU-3). They now match a
 * generated `name_fold` column — `crm_fold(name)` alone, so it stays an equality lookup — and
 * needed no exemption at all.
 */
const ALLOWED: Record<string, { text: string; why: string }[]> = {
  'src/components/Admin/DocumentFactoriesCrmLinker.tsx': [{
    text: 'return `name.ilike.${quoteOrValue(safe)}`;',
    why: 'Exact-name batch join: the result is keyed back by lowercased name, so a substring hit '
      + 'would attach the wrong company to a factory.',
  }],
  'src/modules/email/components/CreateCampaignModal.tsx': [{
    text: ".ilike('email', `%${searchQuery}%`)",
    why: 'Recipient picker: it matches the ADDRESS because that is what a campaign needs. '
      + 'Widening to the folded haystack would offer contacts that have no email at all.',
  }],
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry.name)) out.push(p);
  }
  return out;
}

/**
 * Raw-column ilikes belonging to a CRM party query.
 *
 * A line is attributed to the NEAREST `.from()` in either direction, because a clause can sit
 * on either side of it: a builder chain trails its `.from()`, but an `or()` string is often
 * assembled into a variable a few lines ABOVE. Nearest-in-either-direction keeps both in scope
 * without dragging in the unrelated `products` / `user_profiles` queries that share these files.
 */
function findRawPartySearches(): { file: string; line: number; text: string }[] {
  const hits: { file: string; line: number; text: string }[] = [];
  for (const file of walk('src')) {
    const rel = file.split(sep).join('/');
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    const froms = lines.flatMap((line, i) => {
      const m = line.match(/\.from\(\s*['"]([a-z_]+)['"]/);
      return m ? [{ i, table: m[1] }] : [];
    });
    for (const [i, line] of lines.entries()) {
      if (!RAW_ILIKE.test(line)) continue;
      let nearest: { i: number; table: string } | null = null;
      for (const f of froms) {
        if (!nearest || Math.abs(f.i - i) < Math.abs(nearest.i - i)) nearest = f;
      }
      // Past a handful of lines we are almost certainly in unrelated code.
      if (!nearest || Math.abs(nearest.i - i) > 12) continue;
      if (!PARTY_TABLES.includes(nearest.table)) continue;
      hits.push({ file: rel, line: i + 1, text: line.trim() });
    }
  }
  return hits;
}

describe('CRM party search goes through search_fold', () => {
  const hits = findRawPartySearches();

  it('no picker ilikes a raw name/email/website/VAT column', () => {
    const unexplained = hits.filter(
      (h) => !(ALLOWED[h.file] ?? []).some((a) => a.text === h.text),
    );
    expect(
      unexplained.map((h) => `${h.file}:${h.line}  ${h.text}`),
      'A CRM party search is matching a raw column again, so it is accent-sensitive: "Κώστας" ' +
        'will not find "ΚΩΣΤΑΣ". Use `.ilike(CRM_SEARCH_COLUMN, foldedLike(term))` from ' +
        '@/services/crmSearch. If it is genuinely an exact-match lookup, add it to ALLOWED with ' +
        'a reason.',
    ).toEqual([]);
  });

  it('every allowlist entry still exists — the list is shrink-only', () => {
    const stale: string[] = [];
    for (const [file, entries] of Object.entries(ALLOWED)) {
      for (const entry of entries) {
        if (!hits.some((h) => h.file === file && h.text === entry.text)) {
          stale.push(`${file}: ${entry.text}`);
        }
      }
    }
    expect(
      stale,
      'These exemptions no longer match anything — delete them rather than leaving cover for a ' +
        'future raw-column search in the same file.',
    ).toEqual([]);
  });
});

describe('the folded column is only reached through the shared helper', () => {
  const OWNER = 'src/services/crmSearch.ts';

  it('no file hard-codes the search_fold column name', () => {
    const offenders = walk('src')
      .map((f) => f.split(sep).join('/'))
      .filter((f) => f !== OWNER)
      .filter((f) => /['"]search_fold['"]/.test(readFileSync(f, 'utf8')));
    expect(
      offenders,
      'Import CRM_SEARCH_COLUMN from @/services/crmSearch instead — a hand-typed column name is ' +
        'how one picker gets left behind when the column is renamed.',
    ).toEqual([]);
  });

  it('exports the pieces a picker needs', async () => {
    const mod = await import('../../src/services/crmSearch');
    expect(mod.CRM_SEARCH_COLUMN).toBe('search_fold');
    // The pattern must be folded AND wildcard-escaped: a user typing % must not widen their
    // own search, and a Greek term must match however it is accented.
    expect(mod.foldedLike('Κώστας')).toBe('%κωστασ%');
    expect(mod.foldedLike('100%')).toBe('%100\\%%');
  });
});
