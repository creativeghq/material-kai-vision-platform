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
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n');

/** Strip comments so prose describing the banned pattern is not mistaken for the pattern. */
const stripComments = (src: string) =>
  sharedStripComments(src);

const CRON = 'supabase/functions/asset-service-reminders-cron/index.ts';
const API = 'supabase/functions/customer-assets-api/index.ts';
const SERVICE = 'src/services/customerAssetsService.ts';
const TAB = 'src/components/business/crm/WarrantiesTab.tsx';
const PRODUCT_PANEL = 'src/components/features/products/ProductServiceDefaultsPanel.tsx';
/** The order-side half: registering a sold line into the installed base with a cover period. */
const ORDERS_PANEL = 'src/modules/finance/components/OrdersPanel.tsx';

const ALL_SOURCES = [CRON, API, SERVICE, TAB, PRODUCT_PANEL, ORDERS_PANEL];

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
    //
    // The UTC spellings are matched too, and that is not hypothetical tidiness: the order-side
    // warranty dialog first shipped its end date as `d.setUTCMonth(d.getUTCMonth() + n)`, which
    // the original pattern waved straight through. Postgres and JavaScript disagree there —
    // 2026-01-31 + 1 month is 2026-02-28 in `make_interval`, 2026-03-03 in `Date` — so the twin
    // was a real second answer, not a stylistic one. `warranty_end_date(date, integer)` is now
    // the single implementation and both the trigger path and the client call it.
    // `setDate` stays permitted: `warrantyState` uses "today + 60 days" to CLASSIFY a period the
    // server already dated, which is the sanctioned case above. Producing a stored date is not.
    const dateMaths = /\.set(UTC)?(Month|FullYear)\(|addMonths\(|\baddDays\(/;
    for (const p of [SERVICE, TAB, PRODUCT_PANEL, ORDERS_PANEL]) {
      const src = stripComments(read(p));
      const hit = src.match(dateMaths);
      expect(hit?.[0] ?? null, `${p} computes a date; the server owns cover and due dates`).toBe(null);
    }
  });

  it('a cover end date is derived in SQL, by one function, on both paths', () => {
    // The automatic path (`apply_asset_service_defaults`, off the delivery trigger) and the
    // operator path (the order line dialog) must land on the same date for the same input.
    const service = stripComments(read(SERVICE));
    expect(
      service.includes("rpc('warranty_end_date'"),
      'the client should ask the database for a cover end date, not compute one',
    ).toBe(true);
    // And the order panel must go through that helper rather than growing its own.
    expect(stripComments(read(ORDERS_PANEL))).toContain('warrantyEndDate(');
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

describe('service history', () => {
  it('the client reads history from the view, never by re-filtering raw events', () => {
    // The view resolves `plan_title` through the event's own copy, so an entry whose schedule was
    // deleted still reads correctly. Re-filtering `customer_asset_service_events` client-side
    // would lose that and show a blank service name for every orphaned row.
    const service = stripComments(read(SERVICE));
    expect(service).toContain("'service.history'");
    expect(service).toContain('ServiceHistoryRow');

    const api = stripComments(read(API));
    expect(
      api,
      'service.history must read customer_asset_service_history, not the raw events table',
    ).toContain("from('customer_asset_service_history')");
  });

  it('history is scoped by customer, not only by asset', () => {
    // The whole point of the customer-level ledger: "what have we ever done for this customer"
    // must be answerable without opening every unit in turn.
    const api = stripComments(read(API));
    const historyCase = api.slice(api.indexOf("case 'service.history'"), api.indexOf("case 'service.complete'"));
    for (const filter of ['customer_company_id', 'customer_contact_id']) {
      expect(historyCase, `service.history cannot be filtered by ${filter}`).toContain(filter);
    }
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

describe('warranty certificates', () => {
  const api = stripComments(read(API));

  it('stores bucket + path, never a URL', () => {
    // Pipeline convention 7: a persisted signed URL expires and the row becomes a dead link.
    // Re-signing on read is free.
    expect(api).toContain('document_bucket');
    expect(api).toContain('document_path');
    expect(api).toContain('createSignedUrl');
    expect(
      /document_url\s*:|document_signed_url|\.update\([^)]*signedUrl/.test(api),
      'a signed URL is being written to the warranty row; mint it per read instead',
    ).toBe(false);
  });

  it('proves ownership on the RLS-bound client before the service-role write', () => {
    // The upload is the one place this function touches storage with service-role. The
    // preceding read MUST be on `db` (RLS) and filtered by workspace, or any authenticated
    // user could overwrite another tenant's certificate by guessing a warranty id.
    const upload = api.slice(api.indexOf("case 'warranty.upload_document'"),
                             api.indexOf("case 'warranty.document_url'"));
    expect(upload).toContain("db.from('customer_asset_warranties')");
    expect(upload).toContain("eq('workspace_id', workspaceId)");
    // ...and the ownership check must come BEFORE the upload call.
    expect(upload.indexOf("eq('workspace_id', workspaceId)"))
      .toBeLessThan(upload.indexOf('service.storage'));
  });

  it('rejects anything that is not a certificate, and caps the size', () => {
    expect(api).toContain('WARRANTY_MIME');
    expect(api).toContain('WARRANTY_MAX_BYTES');
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
