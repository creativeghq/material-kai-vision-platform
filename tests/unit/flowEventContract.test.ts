import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { stripComments as sharedStripComments, blankComments as sharedBlankComments } from '../helpers/stripComments';

/**
 * Every emitted flow event must exist in the `TriggerType` union (#263 item 4).
 *
 * The union is what a flow can LISTEN for. An emitter firing a string that is not in it is
 * unreachable by construction: `flow-engine` matches zero flows, returns `{triggered: 0}`, and
 * nothing anywhere reports a problem — the emit succeeded, the delivery just never existed.
 *
 * This is not hypothetical. `contracts-api` emitted **`contract_signed`** while the union carried
 * **`contract_created`** (#272): the emitter was unreachable AND the union entry unemitted, one
 * character class apart, for as long as both existed. It is fixed now; this is what stops the next
 * one, because nothing else can.
 *
 * WHY TYPESCRIPT CANNOT DO THIS:
 *   • `emitFlowEvent` / `flowEventService.emit` take a `string` — they must, since events cross
 *     the Deno/Vite boundary and edge functions cannot import `src/services/flows/types.ts`.
 *   • The icon and label maps ARE `Record<TriggerType, …>`, so tsc already guarantees those are
 *     exhaustive. Re-testing them here would add nothing. The gap is the emit side.
 *
 * Direction matters and only one direction is an error. An emitted string missing from the union
 * is a BUG (nothing can listen). A union member with no emitter is NOT — plenty are emitted from
 * SQL triggers, and `manual`/`scheduled`/`webhook` are entry points rather than events. So this
 * asserts one way and reports the other as information.
 */
const UNION_FILE = 'src/services/flows/types.ts';
const SCAN_ROOTS = ['src', 'supabase/functions'];

/** `| 'foo'` members of the TriggerType union, read from its declaration only. */
function readTriggerUnion(): Set<string> {
  // Comments stripped FIRST. The declaration is terminated by the first `;`, and one of the
  // section comments inside it reads "dotted keys; payload-only" — that semicolon truncated the
  // union at roughly half its members, so ~70 perfectly valid events were reported as orphans.
  // A parser that silently reads half its input is the same failure shape this file is about.
  const src = stripComments(readFileSync(UNION_FILE, 'utf8'));
  const start = src.indexOf('export type TriggerType =');
  expect(start, `could not find the TriggerType declaration in ${UNION_FILE}`).toBeGreaterThan(-1);
  const end = src.indexOf(';', start);
  const body = src.slice(start, end === -1 ? undefined : end);
  const out = new Set<string>();
  for (const m of body.matchAll(/\|\s*'([^']+)'/g)) out.add(m[1]);
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  let entries: ReturnType<typeof readdirSync>;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Strip comments so prose naming an old event name doesn't register as an emit. */
function stripComments(src: string): string {
  return sharedStripComments(src);
}

interface Emit { event: string; file: string; line: number }

function collectEmits(): Emit[] {
  // Only a STRING LITERAL event name. A variable (`emitFlowEvent(evt, …)`) cannot be checked
  // statically and is skipped rather than guessed at — a guard that invents findings is worse
  // than one with a known blind spot, and this one's blind spot is narrow and deliberate.
  //
  // TWO call shapes, because the event name is not always the first argument:
  //   emitFlowEvent('x', …)                              — name first
  //   flowEventService.emit('x', …)                      — name first
  //   emitFlowEventToWorkspaceRoles(ws, roles, 'x', …)   — name THIRD
  //   flowEventService.emitToWorkspaceRoles(ws, roles, 'x', …)
  //
  // The role-fanout form was invisible here until #342. That is why `order_created` — emitted by
  // `ordersService.create` since the orders module shipped — was reported as having no in-repo
  // emitter: the guard could not see the call. A blind spot in the check that exists to find
  // blind spots is worth more than the finding it hid.
  const RE_FIRST = /(?:emitFlowEvent|flowEventService\.emit)\(\s*'([a-zA-Z0-9_.]+)'/g;
  const RE_THIRD =
    /(?:emitFlowEventToWorkspaceRoles|flowEventService\.emitToWorkspaceRoles)\(\s*[^,]+,\s*\[[^\]]*\]\s*,\s*'([a-zA-Z0-9_.]+)'/g;
  const out: Emit[] = [];
  for (const root of SCAN_ROOTS) {
    for (const file of walk(root)) {
      const src = stripComments(readFileSync(file, 'utf8'));
      const rel = relative(process.cwd(), file).split('\\').join('/');
      // Matched against the whole file, not per line: the fanout form is routinely wrapped
      // across lines by the formatter, and a per-line scan would silently miss every one.
      for (const re of [RE_FIRST, RE_THIRD]) {
        for (const m of src.matchAll(re)) {
          const line = src.slice(0, m.index ?? 0).split('\n').length;
          out.push({ event: m[1], file: rel, line });
        }
      }
    }
  }
  return out;
}

describe('flow event contract', () => {
  const union = readTriggerUnion();
  const emits = collectEmits();

  it('finds the union and the emitters (guards against a vacuous pass)', () => {
    // Both halves must be non-trivial. If the union regex or the emit regex ever stops matching —
    // a refactor to an enum, a rename of emitFlowEvent — every assertion below would pass by
    // scanning nothing, which is the exact failure this whole test file exists to prevent.
    // Floor sits just under the real member count (103 today), not near zero. The first version
    // of this parser truncated the union to ~half and a `> 50` floor waved it straight through,
    // so ~70 valid events were reported as orphans while the sanity check said everything was
    // fine. Note 103 is the TriggerType declaration alone — `types.ts` contains other unions, so
    // grepping `| '…'` across the whole file gives 148 and is the wrong number to calibrate on.
    expect(union.size, 'TriggerType union parsed short — the declaration format changed').toBeGreaterThan(90);
    expect(emits.length, 'no emitFlowEvent/emit call sites found — the call shape changed').toBeGreaterThan(30);
  });

  it('every emitted event exists in the TriggerType union', () => {
    const orphans = emits
      .filter((e) => !union.has(e.event))
      .map((e) => `${e.file}:${e.line} emits '${e.event}' — not in TriggerType`);

    expect(
      [...new Set(orphans)],
      'These emit an event no flow can listen for. flow-engine will match zero flows and return '
      + '{triggered: 0} without error, so the feature is silently undeliverable.\nAdd the string to '
      + `the TriggerType union in ${UNION_FILE} (and follow §8 of docs/flows-notification-system.md: `
      + 'icon/label maps, a paletteItems entry, a seeded locked default flow, and a flow_area_registry '
      + 'row), or correct the emitter to the name that already exists.\n',
    ).toEqual([]);
  });

  it('reports union members with no in-repo emitter (informational, never fails)', () => {
    const emitted = new Set(emits.map((e) => e.event));
    const unemitted = [...union].filter((t) => !emitted.has(t)).sort();
    // NOT an assertion. Many are emitted from SQL triggers (`price_alert_triggered`,
    // `rfq_lines_requested`), and `manual`/`scheduled`/`webhook` are entry points, not events.
    // Failing on these would make the suite red for correct code — the surest way to get a guard
    // deleted. Printed so the count is visible when someone is looking for dead wiring.
    console.log(`[flow-contract] ${unemitted.length}/${union.size} union members have no in-repo emitter (SQL triggers + entry points expected): ${unemitted.join(', ')}`);
    expect(union.size).toBeGreaterThan(0);
  });
});

/**
 * The tenant flow vocabulary was THREE copies, and the one nobody had listed was the enforcer.
 *
 * `TENANT_TRIGGERS` / `TENANT_ACTIONS` in flow-tools.ts become the zod enum handed to the LLM —
 * what a user is OFFERED. `create_simple_flow`'s `v_allowed_*` gate the agent's create path. But
 * the REAL floor is `enforce_tenant_flow_allowlist`, a BEFORE INSERT OR UPDATE trigger on `flows`
 * that every write path crosses, and it had its own third array.
 *
 * That is not hypothetical, and this comment used to describe it in the past tense while it was
 * still live. `payment_sent` was added to the first two when the drift was "fixed"; the table
 * trigger never got it, so "notify me when a payment goes out" still passed zod, still passed the
 * RPC, and still died on a raw `42501` one layer further down. Offered, accepted, impossible —
 * exactly as before, one level below where anyone had looked.
 *
 * Fixed structurally 2026-08-24: both SQL halves now read `tenant_flow_allowed_triggers()` /
 * `tenant_flow_allowed_actions()`, so there is ONE list in the database and one mirror in
 * TypeScript. The pin below is that mirror. A unit test cannot read pg_proc, so it cannot verify
 * the database side — what it CAN do is refuse to let the TypeScript half move quietly, turning a
 * silent drift into a deliberate one.
 */
describe('tenant flow vocabulary', () => {
  const TOOL_FILE = 'supabase/functions/_shared/tools/flow-tools.ts';

  const readConst = (name: string): string[] => {
    const src = stripComments(readFileSync(TOOL_FILE, 'utf8'));
    const start = src.indexOf(`const ${name} = [`);
    expect(start, `could not find ${name} in ${TOOL_FILE}`).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf(']', start));
    return [...body.matchAll(/'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);
  };

  // Must equal tenant_flow_allowed_triggers() / tenant_flow_allowed_actions(), verbatim.
  //
  // Widened 2026-08-27 from 8 entries to 56. It was 8 because `forkable` — offered on the
  // Automations page as "Reuse" — is derived from this list, and only 4 of 87 tenant-governable
  // platform defaults qualified. The narrowness was never about operator-vs-tenant (that is
  // `tenant_configurable`, a separate flag): a FORK is `is_global=false`, and flow-engine matches
  // such a row only as `and(is_global.eq.false, workspace_id.eq.<ws>)`, so the admission rule is
  // "does this trigger's emitter stamp workspace_id". Every entry below was verified against the
  // payload actually posted to flow-engine — see the emitter test at the bottom of this block.
  // `appointment_booked` was REMOVED: `appointments` has no workspace_id column at all.
  const RPC_TRIGGERS = [
    'manual', 'scheduled',
    'invoice_paid', 'payment_received', 'payment_sent', 'bank_payment_unmatched',
    'card_spend_threshold', 'customer_credit_releasable', 'finance_follow_up',
    'quote_approved', 'quote_rejected', 'quote_sent', 'order_created', 'order_status_changed',
    'purchase_order.sent', 'purchase_order.received', 'supplier_po_received',
    'upstream_order_created', 'rfq_lines_requested', 'rfq_lines_priced', 'inventory_low_stock',
    'pricing_change_requested', 'pricing_change_decided',
    'inbox.message_received', 'inbox.thread_assigned', 'inbox.order_intake_ready',
    'crm_contact_created', 'crm_company_created', 'contract_signed', 'review_received',
    'hr.employee_added', 'hr.departure_recorded', 'hr.absence_requested', 'hr.absence_reviewed',
    'hr.overtime_recorded', 'hr.applicant_stage_changed', 'hr_late_checkin',
    'asset.service_due', 'asset.service_overdue',
    'campaign_sent', 'catalog_sent_to_customers', 'client_view_feedback_received',
    'document_published', 'doc_suggestion_submitted', 'page_watch_changed',
    'social_post_published', 'social_post_failed', 'social_comment_received',
    'social_account_connected', 'social_account_disconnected',
    'whatsapp_number_status_changed', 'whatsapp_template_status_changed',
    'seo.article_refresh_due', 'seo.site_health_changed',
    'realestate.buyer_matches_found', 'realestate.new_listing_for_buyer',
  ];
  const RPC_ACTIONS = [
    'send_email', 'send_whatsapp', 'create_notification', 'send_agent_message', 'send_campaign',
  ];

  const SYNC_HINT =
    'Changing the tenant vocabulary means changing BOTH halves in the same change: this constant ' +
    '(the TypeScript mirror) and tenant_flow_allowed_triggers() / tenant_flow_allowed_actions() ' +
    '(the ONE database list, read by create_simple_flow AND the enforce_tenant_flow_allowlist ' +
    'table trigger), applied via mcp__supabase__apply_migration. Do NOT add a fourth list.';

  it('the offered triggers are exactly the ones create_simple_flow allows', () => {
    expect([...readConst('TENANT_TRIGGERS')].sort(), SYNC_HINT).toEqual([...RPC_TRIGGERS].sort());
  });

  it('the offered actions are exactly the ones create_simple_flow allows', () => {
    expect([...readConst('TENANT_ACTIONS')].sort(), SYNC_HINT).toEqual([...RPC_ACTIONS].sort());
  });

  it('every tenant trigger is a real member of the TriggerType union', () => {
    const union = readTriggerUnion();
    for (const t of readConst('TENANT_TRIGGERS')) {
      expect(union.has(t), `'${t}' is offered to tenants but is not in the TriggerType union`).toBe(true);
    }
  });

  /**
   * The tool's admission rule, enforced: "Add a trigger only once a trusted server-side emitter
   * stamps workspace_id." A tenant flow bound to an event nothing emits is the silent-zero shape
   * — it saves, it activates, it shows up in the list, and it never once fires.
   */
  it('every tenant trigger is emitted WITH a workspace_id (or is an entry point)', () => {
    // Entry points are STARTED, not emitted, so no emitter exists or should. 'scheduled' is
    // cron-driven (flow-engine wakes it); 'manual' is what createFlowForWorkspace stamps on every
    // empty automation the tenant builder creates, which is why the table guard must keep allowing
    // it — drop it and the New automation button starts raising 42501.
    const ENTRY_POINTS = new Set(['scheduled', 'manual']);

    /**
     * The admission rule, and it is stricter than "something emits it".
     *
     * flow-engine matches a tenant flow ONLY as `and(is_global.eq.false, workspace_id.eq.<ws>)`;
     * an event it cannot attribute to a workspace falls back to `eq('is_global', true)`. So a
     * trigger whose emitter omits workspace_id admits a tenant automation that saves, activates,
     * appears in the list — and never once fires. Worse through Reuse, which switches the platform
     * default OFF in the same transaction: the owner ends up with FEWER notifications than they
     * started with, and no error is raised anywhere. `appointment_booked` shipped in exactly that
     * state (the `appointments` table has no workspace_id column at all).
     *
     * Checking presence alone would have passed it, which is why this reads the payload.
     */
    // BOTH emit shapes, for the reason collectEmits documents: the role-fanout form takes the
    // event name THIRD, and a scan that only knows the name-first form reported `order_created`
    // — live since the orders module shipped — as unemitted. Here it would have been worse than a
    // wrong report: it would have condemned 16 correctly-stamped triggers as unusable.
    const EMIT_CALL =
      /(?:emitFlowEventToWorkspaceRoles|flowEventService\.emitToWorkspaceRoles|emitFlowEvent|flowEventService\.emit)\(/g;

    // Read the tree ONCE, not once per trigger — 56 triggers × a full walk of src/ and
    // supabase/functions/ was 12s for a single assertion, and a slow guard is a deleted guard.
    const sources = SCAN_ROOTS.flatMap((root) =>
      walk(root).map((file) => stripComments(readFileSync(file, 'utf8'))));

    const stampsWorkspace = (event: string): boolean => {
      const literal = `'${event}'`;
      {
        for (const src of sources) {
          for (const m of src.matchAll(EMIT_CALL)) {
            // Balanced read of the whole ARGUMENT LIST. A fixed window would bleed into the next
            // emit call and credit this one with that one's workspace_id.
            const open = m.index! + m[0].length - 1;
            let depth = 0, close = -1;
            for (let j = open; j < src.length; j++) {
              if (src[j] === '(') depth++;
              else if (src[j] === ')' && --depth === 0) { close = j; break; }
            }
            if (close === -1) continue;
            const args = src.slice(open, close + 1);
            const at = args.indexOf(literal);
            if (at === -1) continue;
            // Only AFTER the event name. The fanout form's FIRST argument is routinely
            // `order.workspace_id` — counting that would pass a call whose payload omits it,
            // which is precisely the defect this test exists to catch.
            if (/workspace_id/.test(args.slice(at + literal.length))) return true;
          }
        }
      }
      return false;
    };

    /**
     * Emitters this file structurally cannot see, each verified by hand against the payload that
     * actually reaches flow-engine. Named individually rather than loosening the scan into
     * guesswork — an exemption with a citation is auditable; a wider regex is not.
     *
     * Two shapes:
     *  • a TypeScript emitter whose event name is a VARIABLE (collectEmits only reads string
     *    literals, by deliberate design — see its comment).
     *  • a SQL emitter in pg_proc, which no repo test can read at all.
     */
    const VERIFIED_ELSEWHERE: Record<string, string> = {
      quote_approved:        "ternary eventName, src/modules/quotes/services/QuotesService.ts — payload carries workspace_id: quote.workspace_id",
      quote_rejected:        'same site as quote_approved (the other arm of the ternary)',
      'asset.service_due':   "ternary eventType, supabase/functions/asset-service-reminders-cron — `base` carries workspace_id: row.workspace_id",
      'asset.service_overdue': 'same site as asset.service_due (the other arm of the ternary)',
      inventory_low_stock:   "SQL: public._notify_low_stock — data carries 'workspace_id', NEW.workspace_id",
      supplier_po_received:  "SQL: public.handoff_purchase_order_to_supplier — data carries 'workspace_id', v_sup_ws",
      upstream_order_created: "SQL: public._notify_upstream_order_created — data carries 'workspace_id', NEW.workspace_id",
      rfq_lines_requested:   "SQL: public._notify_rfq_lifecycle — v_data carries 'workspace_id', v_recipient_ws",
      rfq_lines_priced:      'same site as rfq_lines_requested (the other status branch)',
    };

    const offenders: string[] = [];
    for (const t of readConst('TENANT_TRIGGERS')) {
      if (ENTRY_POINTS.has(t) || t in VERIFIED_ELSEWHERE) continue;
      if (!stampsWorkspace(t)) offenders.push(t);
    }
    expect(
      offenders,
      'These are offered to tenants but no in-repo emitter puts a workspace_id in the payload. A ' +
      'tenant flow bound to one can never match, and Reuse would switch the working platform ' +
      'default off in exchange for a copy that never fires. Either stamp the workspace at the ' +
      'emitter, or drop the trigger from the vocabulary (both halves — see SYNC_HINT). If the ' +
      'emitter is SQL or uses a variable event name, add it to VERIFIED_ELSEWHERE with the site ' +
      'and the field you verified.\n',
    ).toEqual([]);
  });

  /**
   * The palette is a FOURTH copy of this vocabulary, and it had already drifted — wider, which is
   * the dangerous direction. `payment_reversed`, `asset.warranty_expiring` and `appointment_booked`
   * were all offered as draggable nodes in the tenant builder and rejected by
   * `enforce_tenant_flow_allowlist`, so the save died on a raw 42501 naming a constraint the user
   * has never heard of. It carried no test of any kind until 2026-08-27.
   */
  it('the visual builder offers exactly the tenant vocabulary, no more', () => {
    const PALETTE_FILE = 'src/components/Admin/FlowsManagement/utils/paletteItems.ts';
    const src = stripComments(readFileSync(PALETTE_FILE, 'utf8'));
    const start = src.indexOf('TENANT_ALLOWED_SUBTYPES');
    expect(start, `could not find TENANT_ALLOWED_SUBTYPES in ${PALETTE_FILE}`).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf(']', start));
    const palette = new Set([...body.matchAll(/'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]));

    // `send_sms` is the flow-engine alias for send_whatsapp — a palette label, not a fifth action.
    const allowed = new Set([...readConst('TENANT_TRIGGERS'), ...readConst('TENANT_ACTIONS'), 'send_sms']);
    const offered = [...palette].filter((s) => !allowed.has(s)).sort();
    expect(
      offered,
      `${PALETTE_FILE} offers these in the tenant builder but the DB guard rejects them. The node ` +
      'drags, the flow saves, and the write dies on a raw 42501. Remove them, or add them to the ' +
      'vocabulary in both halves.\n',
    ).toEqual([]);

    // The other direction is only a missed opportunity, so report rather than fail: a trigger the
    // enforcer allows but the palette hides is invisible in the builder, not broken.
    const hidden = [...allowed].filter((s) => !palette.has(s)).sort();
    if (hidden.length) {
      console.log(`[flow-contract] allowed by the DB but absent from the builder palette: ${hidden.join(', ')}`);
    }
  });
});

/**
 * Global (operator) flows are visible to the OPERATOR ONLY — never to a tenant, anywhere.
 *
 * `is_global = true` rows are the platform's own automations. A platform admin edits them in one
 * place (/admin → Flows) and they apply to every workspace at once: flow-engine matches
 * `is_global.eq.true` for EVERY workspace, so all 100+ of them genuinely execute inside tenant
 * workspaces. That is what makes this boundary easy to breach by accident — the rows are live in
 * a tenant's world, they are just not the tenant's to see.
 *
 * The database enforces it (`flows_tenant_select` requires `is_global = false`; `flow_runs`
 * likewise; create/toggle/delete_simple_flow all guard it; flow-engine's on-demand run demands a
 * platform admin for a global flow). This guards the layer RLS cannot: a tenant-facing query that
 * runs under the SERVICE ROLE, where RLS does not apply at all. `manage_flows` is exactly that —
 * callerClient() falls back to service role for partner `kai_` keys and admin-secret paths — so
 * its filter is the only thing standing there, and a "redundant, RLS has it" cleanup would be a
 * silent full disclosure of the operator's automation set.
 */
describe('operator flows never reach a tenant surface', () => {
  // Surfaces a non-operator can reach. Engine internals (flow-engine, flow-scheduler-cron,
  // flow-webhook, _shared/flow-events.ts) are deliberately absent: matching global flows is their
  // job. The admin console is absent for the same reason — it is the operator's own screen.
  const TENANT_SURFACES = [
    'supabase/functions/_shared/tools/flow-tools.ts',
    ...walk('src/modules/flows-toolkit'),
  ];

  it.each(TENANT_SURFACES)('%s filters is_global on every flows read', (file) => {
    const src = stripComments(readFileSync(file, 'utf8'));
    let from = src.indexOf(".from('flows')");
    while (from !== -1) {
      // The query chain up to its terminator — enough to hold the filters that belong to it.
      const chain = src.slice(from, from + 700);
      expect(
        /\.eq\(\s*'is_global'\s*,\s*false\s*\)/.test(chain),
        `${file} reads the flows table without an explicit .eq('is_global', false). This is a ` +
          `tenant surface, and it may run under the service role where RLS does not apply — so ` +
          `that filter is the disclosure boundary, not a duplicate of one. Operator flows are ` +
          `read and edited in /admin only.`,
      ).toBe(true);
      from = src.indexOf(".from('flows')", from + 1);
    }
  });

  it('the tenant flows page and the chat tool agree on the scope', () => {
    // Two independent tenant surfaces answering "what are my automations". If they ever disagree,
    // one of them is showing a set the other calls private.
    for (const f of ['src/modules/flows-toolkit/pages/FlowsPage.tsx',
                     'supabase/functions/_shared/tools/flow-tools.ts']) {
      const src = stripComments(readFileSync(f, 'utf8'));
      expect(/\.eq\(\s*'is_global'\s*,\s*false\s*\)/.test(src), `${f} must scope to non-global flows`).toBe(true);
      expect(/\.eq\(\s*'workspace_id'/.test(src), `${f} must scope to one workspace`).toBe(true);
    }
  });
});
