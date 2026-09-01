/**
 * A project lifecycle trigger is wired in EVERY place, or it is half-wired (#378 Phase 4).
 *
 * THE GAP
 * -------
 * Of the platform's whole trigger vocabulary, the only project events were two invitation ones and
 * two request ones. "The job is now on site" — the thing everyone downstream waits for — could not
 * start an automation at all. So the automations the issue imagines (deal won → project from
 * template; expense approved on a billable job → next progress invoice) had no project-side event
 * to hang on.
 *
 * WHY A CONTRACT TEST AND NOT A SPOT CHECK
 * ----------------------------------------
 * §8 of the flows doc requires SEVEN coordinated pieces per trigger, and the failure mode of
 * missing one is silent in a different way each time:
 *
 *   1. the `TriggerType` union            — missing: the node cannot be typed
 *   2. a config interface                 — missing: `TriggerConfigMap` is not exhaustive
 *   3. the icon maps (two of them)        — missing: the node renders with no icon
 *   4. the label map                      — missing: "My Flows" shows the raw event name
 *   5. a `paletteItems` entry             — missing: NOBODY CAN DRAG IT. The trigger exists and is
 *                                           unreachable, which is the shape this whole issue is about
 *   6. a `flow_area_registry` row         — missing: the area is undiscoverable
 *   7. a seeded ACTIVE, LOCKED default    — missing: the trigger fires and nothing happens
 *
 * Plus the emitter, which is the one nothing else can substitute for: `workspace_id` MUST be in
 * the payload, because a trigger without it can never be forked by a tenant. `appointment_booked`
 * shipped in exactly that state and its table has no workspace column to put there.
 *
 * The DB half (6 and 7) is not committed source, so it is verified by probe at authoring time and
 * asserted here only as far as source text can reach. That limit is stated rather than papered
 * over: a green run here does NOT prove the seeded flow exists.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const read = (p: string) => blankComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

/**
 * Every project lifecycle trigger. Adding one here is how the next gets the same treatment — and
 * the list is deliberately hand-kept rather than derived from the union, because the union is one
 * of the SEVEN things being checked and deriving the expectation from the thing under test is how
 * a guard passes on an empty set.
 */
const LIFECYCLE_TRIGGERS = [
  'project_status_changed',
  'project_created',
  'project_task_completed',
  'project_milestone_reached',
  'project_snag_raised',
  'project_expense_approved',
  'project_delivery_issued',
  'project_asset_registered',
  'project_task_overdue',
] as const;

/**
 * Where each one is emitted from. A trigger with no emitter can never fire.
 * `null` means the emitter is SQL — see the note on `project_task_overdue`.
 */
const EMITTERS: Record<(typeof LIFECYCLE_TRIGGERS)[number], string | null> = {
  project_status_changed: 'src/modules/projects/services/projectsService.ts',
  project_created: 'src/modules/projects/services/projectsService.ts',
  project_task_completed: 'src/modules/projects/services/projectsService.ts',
  project_milestone_reached: 'src/modules/projects/services/projectsService.ts',
  project_snag_raised: 'src/modules/projects/services/siteService.ts',
  project_expense_approved: 'src/modules/finance/services/tripExpenseService.ts',
  project_delivery_issued: 'src/modules/finance/services/deliveryNotesService.ts',
  project_asset_registered: 'src/services/customerAssetsService.ts',
  /**
   * The one lifecycle event NO user action produces: a task becomes overdue by the passage of
   * time. Its emitter is `sweep_overdue_project_tasks`, a SQL function on a daily pg_cron job —
   * so there is no committed source to point at, and this test says so rather than asserting on a
   * file that would never contain it.
   *
   * Verified by probe instead: the sweep announces an overdue task once, skips one already
   * announced for that due date, RE-ANNOUNCES one that was rescheduled, and skips both a done task
   * and a future one. The marker is the due date it announced, not a "sent at" timestamp, because
   * `pg_net` is fire-and-forget — a timestamp would mean "we tried once" and a dropped request
   * would silence that task forever.
   */
  project_task_overdue: null,
};

const TYPES = 'src/services/flows/types.ts';
const PALETTE = 'src/components/Admin/FlowsManagement/utils/paletteItems.ts';
const TRIGGER_NODE = 'src/components/Admin/FlowsManagement/nodes/TriggerNode.tsx';
const MY_FLOWS = 'src/components/Admin/FlowsManagement/MyFlowsTab.tsx';
const WEBHOOKS = 'supabase/functions/_shared/webhook-events.ts';
const EMITTER = 'src/modules/projects/services/projectsService.ts';

describe.each(LIFECYCLE_TRIGGERS)('%s is wired everywhere', (trigger) => {
  it('is in the TriggerType union and has a config in the map', () => {
    const types = read(TYPES);
    expect(types, 'missing from the union').toMatch(new RegExp(`\\|\\s*'${trigger}'`));
    expect(types, 'missing from TriggerConfigMap — the map must stay exhaustive')
      .toMatch(new RegExp(`${trigger}:\\s*\\w+TriggerConfig;`));
  });

  it('can be DRAGGED — a trigger with no palette entry is unreachable', () => {
    // The loudest of the seven. Everything else can be missing and the trigger still half-works;
    // without this nobody can build a flow on it at all.
    expect(read(PALETTE)).toMatch(new RegExp(`subType: '${trigger}'`));
  });

  it('has an icon in both maps and a label in the flow list', () => {
    expect(read(TRIGGER_NODE), 'no icon on the canvas node').toMatch(new RegExp(`${trigger}:\\s*\\w+,`));
    expect(read(MY_FLOWS), 'no icon in My Flows').toMatch(new RegExp(`${trigger}:\\s*\\w+,`));
    expect(read(MY_FLOWS), 'My Flows would show the raw event name').toMatch(new RegExp(`${trigger}: '`));
  });

  it('is an outbound webhook event too', () => {
    expect(read(WEBHOOKS)).toMatch(new RegExp(`'${trigger}'`));
  });
});

describe('the emitter is the part nothing else substitutes for', () => {
  const svc = read(EMITTER);

  it.each(LIFECYCLE_TRIGGERS)('%s is actually emitted somewhere', (trigger) => {
    // A trigger in the palette that nothing raises is a node an admin can build a flow on that can
    // never run — the same unreachability this whole issue is about, one layer up.
    const file = EMITTERS[trigger];
    if (file === null) return; // SQL-emitted; verified by probe, not by source text.
    const src = read(file);
    // Plain string containment, not an assembled RegExp: building one from a template literal is
    // how `\(` became a literal paren and the pattern silently failed to compile — the same
    // backslash trap that made gatedPropParity's fiscal check match nothing.
    expect(src, `nothing emits ${trigger}`).toContain(`'${trigger}'`);
  });

  it('the shared helper stamps workspace_id, so every one of them can be forked', () => {
    /**
     * CLAUDE.md records this exactly: "a trigger joins the vocabulary only once its emitter stamps
     * `workspace_id` in the payload — verify the payload, not that an emitter exists".
     * `fork_workspace_flow_default` disables the global in the same transaction, so forking a
     * trigger whose payload has no workspace ends with FEWER notifications and nothing raising.
     *
     * ONE helper is why this is a single assertion rather than eight: each emitter passes a
     * project id and the wording, and the helper resolves the workspace, the owner and the URL.
     * Eight hand-built payloads is how four of them end up subtly different.
     */
    const helper = svc.slice(svc.indexOf('export async function emitProjectLifecycle'));
    expect(helper.slice(0, 2600), 'workspace_id missing from the shared payload').toMatch(/workspace_id: project\.workspace_id/);
    expect(helper.slice(0, 2600), 'user_id missing — create_notification reads it off the payload').toMatch(/user_id: project\.user_id/);
    for (const key of ['title,', 'body,', 'action_url:']) {
      expect(helper.slice(0, 2600), `${key} missing from the shared payload`).toContain(key);
    }
  });

  it('a project with no workspace emits nothing', () => {
    // Such an event could never be matched to a tenant's flows, so raising it is a run that can
    // only ever no-op — and a metered one.
    expect(svc).toMatch(/if \(!project\?\.workspace_id\) return;/);
  });

  it('status and completion fire only on a REAL transition', () => {
    // Re-saving a task that was already done is not a completion, and every flow run is metered.
    expect(svc).toMatch(/project\.status !== previousStatus/);
    expect(svc).toMatch(/task\.status === 'done' && previousStatus !== 'done'/);
  });

  it('a milestone is its own event, not a flag on the task one', () => {
    /**
     * They are different questions with different audiences: "a task finished" is for the team and
     * fires constantly; "we hit the milestone" is for the client and fires rarely. Folding the
     * second into the first as a config filter makes every milestone automation pay for a run on
     * every task.
     */
    expect(svc).toMatch(/'project_milestone_reached'/);
    expect(svc).toMatch(/task\.is_milestone/);
  });

  it('an expense announces per LINE, because one card spans several jobs', () => {
    // Announcing the card against the first line's project would attribute a hotel in Athens to
    // whichever job happened to sort first.
    const trip = read(EMITTERS.project_expense_approved);
    expect(trip).toMatch(/decision === 'approved'/);
    expect(trip, 'the line names its own job').toMatch(/from\('trip_expense_items'\)/);
  });

  it('a delivery derives its job through the order, and grows no column', () => {
    // `delivery_notes` has no `project_id` and must not (#378 L5) — that would be a second copy of
    // what the order already holds, and `get_project_pnl` reads the order.
    const dn = read(EMITTERS.project_delivery_issued);
    expect(dn).toMatch(/orders\(project_id\)/);
  });
});
