/**
 * Campaign-audience derivation guard.
 *
 * The bug this exists to stop: "who does this campaign go to" was implemented FIVE times —
 * `CreateMarketingCampaignModal` (tenant preview), `marketingService.ensureRecipients`,
 * `manage_email_campaign` (agent tool), `CreateCampaignModal` (admin page) and the dead
 * `campaignService.addRecipients` — across TWO incompatible `audience_filter` schemas
 * (`{category_ids, manual_emails}` vs `{type, emails, recipients}`).
 *
 * Every copy drifted, and each drift was invisible:
 *   - agent-created drafts materialized NO rows, so "send" flipped the status and emailed nobody
 *     (that failure is the entire reason `ensureRecipients` was written);
 *   - the agent path dropped `manual_emails` and silently under-sent;
 *   - the admin path deduped nothing (a user and a contact sharing an address got two emails),
 *     set no merge vars (`{{firstName}}` rendered blank) and read `user_profiles` platform-wide,
 *     putting other tenants' users in one workspace's campaign;
 *   - the tenant modal's "all contacts" toggle was never persisted, so re-resolving a saved
 *     campaign silently lost it;
 *   - the admin "estimate" counted source tables by hand, so it disagreed with the send.
 *
 * None of that is visible to a typecheck (a wrong recipient list is a valid array) or to an
 * integrity check (the stored rows were internally consistent). The only durable fix is ONE
 * derivation, in SQL: `resolve_campaign_audience` answers "who", `campaign_materialize_recipients`
 * writes the rows, and TypeScript formats.
 *
 * SCOPE — a green run here does NOT prove the invariant holds.
 * This scans REPO FILES, so it only sees the TypeScript half. This project's SQL is applied via
 * the Supabase MCP and never committed (CLAUDE.md), so a function body lives only in `pg_proc` and
 * is invisible to this test. A second audience derivation added in SQL would pass this file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

/** Everything allowed to talk about campaign audiences at all. */
const SCANNED = [
  'src/modules/email',
  'src/modules/email-marketing',
  'supabase/functions/_shared/tools/email-marketing-tools.ts',
];

/** The five historical offenders — named so a regression points at its own precedent. */
const HISTORICAL_OFFENDERS = [
  'src/modules/email-marketing/components/CreateMarketingCampaignModal.tsx',
  'src/modules/email-marketing/services/marketingService.ts',
  'src/modules/email/components/CreateCampaignModal.tsx',
  'src/modules/email/services/campaignService.ts',
  'supabase/functions/_shared/tools/email-marketing-tools.ts',
];

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

function collect(): string[] {
  const out: string[] = [];
  for (const entry of SCANNED) {
    const p = join(ROOT, entry);
    let s;
    try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/** Strip comments so prose describing the old bug (including this file's own header) is not a hit. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

const FILES = collect();
const SOURCES = new Map(FILES.map((f) => [relative(ROOT, f).replace(/\\/g, '/'), stripComments(readFileSync(f, 'utf8'))]));

describe('campaign audience has exactly one derivation', () => {
  it('scans the files it claims to scan', () => {
    // A path typo would silently make every assertion below vacuous.
    for (const offender of HISTORICAL_OFFENDERS) {
      expect(SOURCES.has(offender), `${offender} is not being scanned — fix SCANNED`).toBe(true);
    }
  });

  it('nothing but the RPC inserts campaign_recipients rows', () => {
    const offenders: string[] = [];
    for (const [path, src] of SOURCES) {
      // `.from('campaign_recipients')` … `.insert(` within the same chain.
      if (/from\(\s*['"]campaign_recipients['"]\s*\)[\s\S]{0,200}?\.insert\(/.test(src)) offenders.push(path);
    }
    expect(
      offenders,
      'campaign_recipients is written by campaign_materialize_recipients ONLY — an insert here ' +
      'skips the dedupe, the unsubscribe suppression and the merge vars, exactly as the admin page did.',
    ).toEqual([]);
  });

  it('no client-side union/de-dupe of audience sources', () => {
    const offenders: string[] = [];
    for (const [path, src] of SOURCES) {
      // The shape every copy had: a Map accumulating rows under a case-folded address key. Kept
      // deliberately broad — the first version of this rule pinned the exact spelling the old code
      // used (`byEmail.set(e, …)`) and a re-write with an inline key expression walked straight
      // through it. No file in scope has a legitimate Map + toLowerCase pairing.
      const buildsEmailMap = /new Map[<(]/.test(src) && /\.set\(/.test(src) && /toLowerCase\(\)/.test(src);
      if (buildsEmailMap) offenders.push(path);
    }
    expect(
      offenders,
      'Union + de-dupe by address belongs to resolve_campaign_audience. Rebuilding it here is how ' +
      'the preview came to disagree with the send.',
    ).toEqual([]);
  });

  it('no hand-rolled merge vars', () => {
    const offenders: string[] = [];
    for (const [path, src] of SOURCES) {
      if (/fullName\s*:/.test(src) && /firstName\s*:/.test(src) && /lastName\s*:/.test(src)) offenders.push(path);
    }
    expect(
      offenders,
      'Merge vars come from person_merge_vars() in SQL. Two TS copies existed and a third path set ' +
      'none at all, so {{firstName}} rendered blank for every admin-created campaign.',
    ).toEqual([]);
  });

  it('the retired {type, emails, recipients} audience schema is gone', () => {
    const offenders: string[] = [];
    for (const [path, src] of SOURCES) {
      if (/audience_filter\s*[:=][\s\S]{0,120}?\btype\s*:/.test(src)) offenders.push(path);
    }
    expect(
      offenders,
      'audience_filter holds ONE shape (CampaignAudience). Two schemas in one jsonb column meant a ' +
      'campaign created on one page resolved to zero recipients on the other.',
    ).toEqual([]);
  });

  it('the partial category-only resolver is not used for campaign audiences', () => {
    const offenders: string[] = [];
    for (const [path, src] of SOURCES) {
      if (src.includes('crm_categories_resolve_recipients_ws')) offenders.push(path);
    }
    expect(
      offenders,
      'crm_categories_resolve_recipients_ws answers only "who is in these categories". A campaign ' +
      'audience is more than that — call resolve_campaign_audience.',
    ).toEqual([]);
  });

  it('the canonical entry points still exist and are what the pages call', () => {
    const service = SOURCES.get('src/modules/email-marketing/services/marketingService.ts')!;
    expect(service).toContain(`rpc('resolve_campaign_audience'`);
    expect(service).toContain(`rpc('campaign_materialize_recipients'`);

    // Both create paths resolve for their preview and materialize through the service, rather than
    // assembling a recipient list of their own.
    for (const page of [
      'src/modules/email-marketing/components/CreateMarketingCampaignModal.tsx',
      'src/modules/email/components/CreateCampaignModal.tsx',
    ]) {
      expect(SOURCES.get(page), page).toMatch(/marketingService\.(resolveAudience|ensureRecipients)\(/);
    }

    // The agent tool goes to the same two RPCs — its drafts reaching the processor with no rows is
    // the original silent-zero this whole guard exists for.
    const tool = SOURCES.get('supabase/functions/_shared/tools/email-marketing-tools.ts')!;
    expect(tool).toContain(`rpc('resolve_campaign_audience'`);
    expect(tool).toContain(`rpc('campaign_materialize_recipients'`);
  });
});
