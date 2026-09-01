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

/** Lifecycle triggers this test covers. Adding one here is how the next gets the same treatment. */
const LIFECYCLE_TRIGGERS = ['project_status_changed'] as const;

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

  it('emits on a status change', () => {
    expect(svc).toMatch(/flowEventService\.emit\('project_status_changed'/);
  });

  it('stamps workspace_id — without it a tenant can never fork the default', () => {
    /**
     * CLAUDE.md records this exactly: "a trigger joins the vocabulary only once its emitter stamps
     * `workspace_id` in the payload — verify the payload, not that an emitter exists".
     * `fork_workspace_flow_default` disables the global in the same transaction, so a fork of a
     * trigger whose payload has no workspace ends with FEWER notifications and nothing raising.
     */
    const block = svc.slice(svc.indexOf("flowEventService.emit('project_status_changed'"));
    expect(block.slice(0, 600), 'workspace_id missing from the payload').toMatch(/workspace_id:/);
  });

  it('carries what the seeded default actually reads', () => {
    // `create_notification` reads user_id / title / body / action_url straight off the payload.
    // A missing `user_id` is a flow that runs, reports success, and tells nobody.
    const block = svc.slice(svc.indexOf("flowEventService.emit('project_status_changed'"), svc.indexOf("flowEventService.emit('project_status_changed'") + 900);
    for (const key of ['user_id:', 'title:', 'body:', 'action_url:']) {
      expect(block, `${key} missing — the seeded default reads it`).toContain(key);
    }
  });

  it('fires only on a REAL move', () => {
    // An update that resaves the same status is not a move, and every flow run is metered.
    expect(svc).toMatch(/project\.status !== previousStatus/);
  });
});
