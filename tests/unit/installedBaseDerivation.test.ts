/**
 * Installed base (#343) — the two rules this feature can silently break.
 *
 * 1. ONE DERIVATION OF "NEXT DUE".
 *    The next service date is the `due_on` of a plan's single open `customer_asset_service_events`
 *    row, enforced by a partial unique index. There is no `next_due_on` column and nothing
 *    recomputes the date client-side. This is the same shape as the money-derivation rule: a
 *    wrong date is a valid date, so neither typecheck nor an integrity probe can see the drift.
 *    Five implementations of "how much is settled" is how that rule was learned; this stops the
 *    installed base repeating it with dates.
 *
 * 2. REMINDERS GO THROUGH FLOWS, NOT THROUGH A HARDCODED SEND.
 *    `CLAUDE.md` forbids a `user_notifications` insert or an `email-api` call at a new call site.
 *    The reminder cron must only ever EMIT — otherwise an admin cannot pause, retarget or add a
 *    channel without a deploy, which is exactly the state the whole Flows migration undid.
 *    `crm-meeting-reminders`, the file this cron was modelled on, still contains a hardcoded
 *    `user_notifications` insert; that precedent is why this is asserted rather than assumed.
 *
 * Both are scanned from source because both survive a green typecheck.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

/** Strip comments so prose describing the banned pattern is not mistaken for the pattern. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const CRON = 'supabase/functions/asset-service-reminders-cron/index.ts';
const API = 'supabase/functions/customer-assets-api/index.ts';
const SERVICE = 'src/services/customerAssetsService.ts';
const TAB = 'src/components/business/crm/EquipmentServiceTab.tsx';
const PRODUCT_PANEL = 'src/components/features/products/ProductServiceDefaultsPanel.tsx';

const ALL_SOURCES = [CRON, API, SERVICE, TAB, PRODUCT_PANEL];

describe('one derivation of "next due"', () => {
  it('no installed-base source stores or reads a cached next-due field', () => {
    // `next_due_on`, `nextDueOn`, `next_service_on`, … — any name for a second copy of the
    // answer the open occurrence already holds.
    // Case-insensitive on purpose: `nextDueOn` is the likelier TypeScript spelling, and a
    // snake_case-only pattern waves it straight through (verified both ways before landing).
    const banned = /next_?due(_?(on|date))?|next_?service_?(on|date)/i;
    const offenders = ALL_SOURCES
      .map((p) => [p, stripComments(read(p))] as const)
      .filter(([, src]) => banned.test(src))
      .map(([p]) => p);
    expect(
      offenders,
      `these files reference a cached next-due field; the next due date is the plan's single ` +
      `open customer_asset_service_events row and must not be duplicated:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });

  it('the client never does date arithmetic to produce a due date', () => {
    // setMonth/setDate/addMonths on the frontend would be a second implementation of
    // `next_service_due(...)`. The only date maths allowed client-side is "today", used for
    // form defaults and for classifying a warranty the server already dated.
    const dateMaths = /\.setMonth\(|\.setFullYear\(|addMonths\(|\baddDays\(/;
    for (const p of [SERVICE, TAB, PRODUCT_PANEL]) {
      const src = stripComments(read(p));
      expect(dateMaths.test(src), `${p} computes a date; the server owns due dates`).toBe(false);
    }
  });

  it('completing an occurrence is the only client path that advances a plan', () => {
    // The service exposes complete/skip, and both route to the one RPC. A direct write to
    // customer_asset_service_events from the client would bypass the "open the next one" step
    // and silently end the schedule.
    const src = stripComments(read(SERVICE));
    expect(src).toContain("'service.complete'");
    expect(src).toContain("'service.skip'");
    expect(
      /from\(['"]customer_asset_service_events['"]\)/.test(src),
      'the client writes service events directly instead of going through complete_asset_service',
    ).toBe(false);
  });
});

describe('reminders are emitted as flow events, never sent directly', () => {
  const cron = stripComments(read(CRON));

  it('the cron emits all three trigger types', () => {
    for (const evt of ['asset.service_due', 'asset.service_overdue', 'asset.warranty_expiring']) {
      expect(cron, `${evt} is declared but never emitted`).toContain(`'${evt}'`);
    }
  });

  it('every emitted event exists in the TriggerType union', () => {
    // flowEventContract.test.ts asserts this platform-wide; naming the three here means a
    // rename of one of them fails in the file that owns them, not only in a global sweep.
    const union = stripComments(read('src/services/flows/types.ts'));
    for (const evt of ['asset.service_due', 'asset.service_overdue', 'asset.warranty_expiring']) {
      expect(union, `${evt} is emitted but no flow can listen for it`).toContain(`'${evt}'`);
    }
  });

  it('the cron does not hardcode a notification insert or an email send', () => {
    expect(
      /from\(['"]user_notifications['"]\)/.test(cron),
      'the cron writes user_notifications directly — emit a flow event instead (CLAUDE.md, Flows)',
    ).toBe(false);
    expect(
      /functions\/v1\/email-api|['"]email-api['"]/.test(cron),
      'the cron calls email-api directly — the delivering flow owns the channel',
    ).toBe(false);
  });

  it('every reminder path stamps a de-dup marker so it fires exactly once', () => {
    for (const col of ['reminded_at', 'overdue_reminded_at']) {
      expect(cron, `${col} is never written; the reminder would re-fire every tick`).toContain(col);
    }
  });

  it('a failed emit leaves the row unstamped so the next tick retries', () => {
    // emitFlowEvent returns null on failure. Stamping unconditionally is how a reminder gets
    // lost forever — the bug crm-meeting-reminders shipped with and later fixed.
    expect(cron).toMatch(/res === null/);
    expect(cron).toMatch(/if \(!ok\)/);
  });
});

describe('tenancy', () => {
  it('the API never trusts a body id against the service-role client', () => {
    const api = stripComments(read(API));
    // Reads and writes run on `db` (the RLS-bound user client). `service` exists only for the
    // membership check and the two definer RPCs that are called AFTER ownership is proven.
    expect(api).toContain('userCanAccessWorkspace');
    const serviceUses = api.match(/\bservice\.(from|rpc)\(/g) ?? [];
    expect(
      serviceUses.every((u) => u.startsWith('service.rpc(')),
      `the service-role client is used for a table read/write: ${serviceUses.join(', ')}`,
    ).toBe(true);
  });

  it('an ownership mismatch returns 404, not 403', () => {
    const api = stripComments(read(API));
    expect(api).not.toMatch(/HttpError\(403/);
  });
});
