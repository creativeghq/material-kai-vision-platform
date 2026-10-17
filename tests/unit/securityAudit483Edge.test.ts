import { describe, it, expect } from 'vitest';
import { isAllowedMydataBase, resolveMydataBase } from '../../supabase/functions/_shared/aade/mydata-endpoint.ts';
import { secretMatches, timingSafeEqual } from '../../supabase/functions/_shared/timing-safe.ts';
import { strippedSource } from '../helpers/sourceIndex';

const fn = (p: string) => strippedSource(`supabase/functions/${p}`);

describe('#483 H8 — a tenant-writable myDATA base_url only ever reaches AADE', () => {
  it('accepts the AADE hosts', () => {
    expect(isAllowedMydataBase('https://mydatapi.aade.gr/myDATA')).toBe(true);
    expect(isAllowedMydataBase('https://mydataapidev.aade.gr/myDATA/')).toBe(true);
  });

  it.each([
    'http://mydatapi.aade.gr/myDATA',
    'https://169.254.169.254/latest',
    'https://mydatapi.aade.gr.attacker.example/myDATA',
    'https://attacker.example/mydatapi.aade.gr',
    'https://user:pw@mydatapi.aade.gr/myDATA',
    'https://mydatapi.aade.gr:8443/myDATA',
    'https://mydatapi.aade.gr/myDATA?x=1',
    'not a url',
  ])('refuses %s', (url) => {
    expect(isAllowedMydataBase(url)).toBe(false);
  });

  it('resolveMydataBase refuses before any DNS lookup', async () => {
    await expect(resolveMydataBase('https://10.0.0.1/myDATA')).rejects.toThrow(/not an AADE host/);
  });

  it.each(['finance-mydata-send/index.ts', 'finance-mydata-delivery/index.ts', 'finance-mydata-book/index.ts'])(
    '%s fetches through the shared endpoint guard and never raw',
    (file) => {
      const src = fn(file);
      expect(src).toContain('resolveMydataBase(');
      expect(src).toContain('mydataFetch(');
      expect(src).not.toMatch(/[^.\w]fetch\(/);
    },
  );

  it('check-rights no longer echoes the upstream body', () => {
    expect(fn('finance-mydata-send/index.ts')).not.toMatch(/\braw:/);
  });
});

describe('#483 L3 — secrets compare in constant time and fail closed', () => {
  it('compares', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(secretMatches('s', 's')).toBe(true);
    expect(secretMatches('', '')).toBe(false);
    expect(secretMatches(null, 's')).toBe(false);
    expect(secretMatches('s', undefined)).toBe(false);
  });

  it.each([
    '_shared/auth.ts', 'finance-mydata-book/index.ts',
    'seo-api/handlers/answer-check.ts', 'seo-api/handlers/toolkit-audit.ts',
  ])('%s has no === on the cron secret', (file) => {
    const src = fn(file);
    expect(src).toContain('secretMatches(');
    expect(src).not.toMatch(/=== ?(cronSecret|CRON_SECRET\(\)|expected)\b/);
  });
});

describe('#483 tenancy and billing gates', () => {
  it('H3 seo-reports refuses a report whose website is in another workspace', () => {
    const src = fn('seo-reports/index.ts');
    const check = src.indexOf("site.workspace_id !== report.workspace_id");
    expect(check).toBeGreaterThan(-1);
    expect(check).toBeLessThan(src.indexOf("rpc('build_website_seo_report'"));
  });

  it('H5 toolkit-audit re-checks the owner in the charged workspace, in both branches, before charging', () => {
    const src = fn('seo-api/handlers/toolkit-audit.ts');
    const checks = [...src.matchAll(/userHasWorkspaceCapability\(sb, (td\.user_id|userId), /g)].map((m) => m.index!);
    const charges = [...src.matchAll(/chargeCronWorkspace\(/g)].map((m) => m.index!);
    expect(checks.length).toBe(2);
    expect(charges.length).toBe(2);
    expect(checks[0]).toBeLessThan(charges[0]);
    expect(checks[1]).toBeLessThan(charges[1]);
  });

  it('H6 toolkit-research sends an allowlisted body with the server-resolved workspace', () => {
    const src = fn('seo-api/handlers/toolkit-research.ts');
    expect(src).not.toContain('JSON.stringify(body.params)');
    expect(src).toContain('buildResearchParams(body.params as Record<string, unknown>, workspaceId');
    expect(src).toMatch(/workspace_id: workspaceId,/);
  });

  it('H11 catalog-access refuses PostgREST pattern characters, including *', () => {
    const src = fn('catalog-access/index.ts');
    expect(src).toContain('const LIKE_PATTERN_CHARS = /[%*\\\\]/;');
    const resolver = src.slice(src.indexOf('async function resolveEmailMatch'));
    expect(resolver.indexOf('isLikelyEmail(email)')).toBeLessThan(resolver.indexOf('.ilike('));
  });

  it('M6 viva 1797/1798 read the transaction back and write only into the merchant workspace', () => {
    const src = fn('viva-webhooks/index.ts');
    const failed = src.slice(src.indexOf('if (eventTypeId === EVENT_PAYMENT_FAILED)'), src.indexOf('if (eventTypeId === EVENT_REVERSAL_CREATED)'));
    expect(failed).toContain('await readBack(');
    expect(failed).toContain(".eq('workspace_id', cfg.workspace_id)");
    const reversal = src.slice(src.indexOf('if (eventTypeId === EVENT_REVERSAL_CREATED)'), src.indexOf('if (eventTypeId === EVENT_ACCOUNT_TRANSACTION)'));
    expect(reversal).toContain('await readBack(');
    expect(reversal).toContain('const wsId: string = cfg.workspace_id;');
    expect(reversal).not.toContain('data?.Amount ?? 0');
    expect((reversal.match(/\.from\('payments'\)/g) ?? []).length)
      .toBe((reversal.match(/\.eq\('workspace_id', cfg\.workspace_id\)/g) ?? []).length);
  });

  it('M7 store-api never fetches a store raw or echoes its body', () => {
    for (const file of ['store-api/handlers/sync-orders.ts', 'store-api/handlers/document-writeback.ts']) {
      const src = fn(file);
      expect(src).not.toMatch(/[^.\w]fetch\(/);
      expect(src).not.toContain('await res.text()');
    }
  });

  it('M9 tenant integration actions require a capability, not membership', () => {
    expect(fn('bank-statement-import/index.ts')).toContain("'finance.operate'");
    expect(fn('bank-statement-import/index.ts')).not.toContain(".from('workspace_members')");
    const oauth = fn('zernio-api/handlers/oauth.ts');
    expect((oauth.match(/userHasWorkspaceCapability\(supabase, userId, [\w.]+, 'marketing\.seo'\)/g) ?? []).length).toBe(3);
  });

  it('M15 page watches are entitled, capped, and scheduled checks are debited before they are recorded', () => {
    const watches = fn('page-watches/index.ts');
    expect(watches).toContain('assertEntitled(supabase, workspaceId, MODULE_SLUG)');
    expect(watches).toContain('await assertUnderWatchCap();');
    const hook = fn('page-watch-webhook/index.ts');
    for (const handler of ['async function handleMonitorPage', 'async function handleCheckCompleted']) {
      const body = hook.slice(hook.indexOf(handler));
      const paid = body.indexOf('ensureCheckPaid(');
      expect(paid).toBeGreaterThan(-1);
      const write = Math.min(...['.upsert(', '.update(patch)'].map((w) => body.indexOf(w)).filter((i) => i > -1));
      expect(paid).toBeLessThan(write);
    }
  });

  it('L1 a public signer cannot accept a draft, rejected or expired quote', () => {
    const src = fn('quote-public-share/index.ts');
    expect(src).toContain("new Set(['submitted', 'quoted', 'accepted'])");
    expect(src.indexOf('ACCEPTABLE_QUOTE_STATUSES.has(')).toBeLessThan(src.indexOf(".from('quote_approvals').insert("));
  });

  it('H2 global messaging reads sit behind the operator gate too', () => {
    const src = fn('messaging-api/index.ts');
    const block = src.slice(src.indexOf('const PLATFORM_ACTIONS'), src.indexOf('const PLATFORM_ACTIONS') + 400);
    for (const action of ['plan-status', 'webhook-status', 'get-settings']) expect(block).toContain(`'${action}'`);
  });
});
