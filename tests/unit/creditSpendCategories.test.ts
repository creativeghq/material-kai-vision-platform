/** Credit spend categorisation guard. */
import { describe, it, expect } from 'vitest';
import { sourceIndex, readSource, strippedSource } from '../helpers/sourceIndex';
import {
  CREDIT_SPEND_CATEGORIES,
  creditOperationCategory,
  type CreditSpendCategoryLabel,
} from '../../src/services/creditCategories';

const EDGE = sourceIndex({ roots: ['supabase/functions'] });
const POSIX = new Map(EDGE.files.map((f, i) => [f, EDGE.paths[i]]));
const LEDGER_UI = 'src/components/core/Profile/CreditUsageHistory.tsx';

/**
 * The lifecycle half of `public.credit_operation_token`, restated ONLY so this sweep can
 * run without a database. Deliberately the narrow half: the rest of the contract (the
 * `cron_` wrapper, the `:target` suffix) is assembled at runtime from values no source
 * literal carries, so there is nothing there for this to drift against.
 */
const baseToken = (literal: string) =>
  literal.toLowerCase().replace(/[-.]/g, '_').replace(/(_(reserve|refund|overage))+$/, '');

const QUOTED = /['"`]([a-z0-9_.-]+)['"`]/g;
const DIRECT = /p_operation_type:\s*['"`]([a-z0-9_.-]+)|p_operation_type:\s*`([a-z0-9_.-]+)\$\{|operationType:\s*['"`]([a-z0-9_.-]+)/g;
// Bounded and non-backtracking: a negated class with a hard ceiling, never a lazy `.*?`.
const RESERVE = /\b(?:reserveCredits|settleCredits|refundCredits)\([^)]{0,200}\)/g;
const EXTERNAL = /\bdebitExternalServiceCredits\(\s*[^)]{0,200}\)/g;

/** The quoted arguments of a call, ignoring anything inside a metadata object literal. */
const argsOf = (call: string) =>
  [...call.slice(0, (call.indexOf('{') + 1 || call.length + 1) - 1).matchAll(QUOTED)]
    .map((q) => q[1]);

/** Every operation type an edge function names as a static literal when it bills. */
function emittedOperationTokens(): Map<string, string> {
  const found = new Map<string, string>();
  const add = (raw: string | undefined, file: string) => {
    const token = raw ? baseToken(raw) : '';
    if (token && !found.has(token)) found.set(token, file);
  };

  for (const [abs, src] of EDGE.stripped()) {
    const file = POSIX.get(abs) ?? abs;
    for (const m of src.matchAll(DIRECT)) add(m[1] ?? m[2] ?? m[3], file);
    // The op type is the LAST string argument of a reserve/settle/refund call, before
    // the metadata object — `{ reason: 'agent_run_failed' }` is a reason, not an operation.
    for (const m of src.matchAll(RESERVE)) add(argsOf(m[0]).at(-1), file);
    // ...and the SECOND of an external-service debit, after the vendor's own name.
    for (const m of src.matchAll(EXTERNAL)) add(argsOf(m[0])[1], file);
  }
  return found;
}

/**
 * Tokens that legitimately have no category. Shrink-only: a new entry needs a reason.
 */
const UNCATEGORIZED_BY_DESIGN: Record<string, string> = {
  other: 'the fallback credit_operation_token emits for an empty operation type',
  cron_: 'the wrapper prefix cron-billing builds around a job key; the SQL strips it',
};

describe('credit spend categories', () => {
  it('classifies every operation an edge function bills', () => {
    const emitted = emittedOperationTokens();
    expect(emitted.size, 'the emitter sweep found nothing — the patterns have rotted')
      .toBeGreaterThan(40);

    const unclassified = [...emitted.entries()]
      .filter(([token]) => !(token in UNCATEGORIZED_BY_DESIGN))
      .filter(([token]) => creditOperationCategory(token) === 'Other')
      .map(([token, file]) => `  ${token} (${file})`);

    expect(unclassified, 'These bill credits and land in "Other", so the user cannot tell '
      + 'what the charge was for — and "Other" is a plausible row, so nothing raises:\n'
      + unclassified.join('\n')).toEqual([]);
  });

  it('classifies the shapes that were silently misfiled', () => {
    // Each read as "Other" on a live billing screen. The cause is in the name: a cron
    // wrapper, a vendor prefix, and a rule written `sam-segment` against an emitter that
    // has only ever written `sam_segment`.
    const cases: Array<[string, CreditSpendCategoryLabel]> = [
      ['seo_website_crawl', 'SEO Toolkit'],
      ['seo_toolkit_audit', 'SEO Toolkit'],
      ['dataforseo_serp_google_organic', 'SEO Toolkit'],
      ['website_crawl', 'SEO Toolkit'],
      ['mention_monitoring', 'Mention Monitoring'],
      ['llm_mention_probe', 'Mention Monitoring'],
      ['job_research_digest', 'Job Research'],
      ['email_contacts_sync', 'Inbox & Email'],
      ['sam_segment', 'Image & Material Tools'],
      ['b2b_manufacturer_search', 'B2B & Company Research'],
      ['company_website_scrape_analysis', 'B2B & Company Research'],
      ['presentation_sheet_moodboard', 'Presentation Sheets'],
    ];
    const wrong = cases
      .map(([token, expected]) => ({ token, expected, actual: creditOperationCategory(token) }))
      .filter((r) => r.actual !== r.expected)
      .map((r) => `  ${r.token}: expected "${r.expected}", got "${r.actual}"`);

    expect(wrong, `Spend Summary would misfile:\n${wrong.join('\n')}`).toEqual([]);
  });

  it('leaves an unknown operation in Other rather than guessing', () => {
    expect(creditOperationCategory('some_operation_nobody_has_written_yet')).toBe('Other');
    expect(creditOperationCategory('')).toBe('Other');
    expect(creditOperationCategory(null)).toBe('Other');
  });

  it('does not re-implement the SQL normalization', () => {
    // `public.credit_operation_token` strips the cron wrapper, the lifecycle suffix and the
    // `:target` suffix BEFORE this function sees a token. A second copy in the client would
    // drift the first time an operation is renamed, and drift is silent: both halves keep
    // returning a valid category, just not the same one.
    const src = strippedSource('src/services/creditCategories.ts');
    for (const forbidden of ['cron_', '_reserve', '_overage', "split(':')"]) {
      expect(src, `creditCategories.ts must not normalize "${forbidden}" — the database does`)
        .not.toContain(forbidden);
    }
  });

  it('categorises the ledger list from the same token as the summary', () => {
    // Both surfaces on this screen must answer the same way about the same row.
    expect(readSource(LEDGER_UI), 'Recent Activity must categorise from operation_token')
      .toContain('creditOperationCategory(t.operation_token)');
    expect(strippedSource(LEDGER_UI), 'the raw operation_type still reaches the categoriser')
      .not.toContain('metadata?.operation_type');
  });
});
