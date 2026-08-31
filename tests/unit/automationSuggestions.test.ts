/**
 * A suggestion may never quietly become an action.
 *
 * This surface reads a user's own behaviour and offers to build them an automation. Two
 * properties make that acceptable rather than alarming, and both are one character from being
 * lost:
 *
 *  1. "Set it up" writes a DRAFT. `p_activate: false` is the whole difference between proposing
 *     a flow and switching on something that mails a customer. Flipping it to `true` breaks
 *     nothing, throws nothing and passes every other gate — the flow just starts running. That
 *     is the same shape as every silent defect in this codebase: a valid value, no error.
 *
 *  2. Every suggestion states the count it rests on. The feature was asked for as "based on the
 *     usual actions you take, here is how to improve this workflow", and the failure mode of that
 *     sentence is a horoscope — advice with nothing behind it. A number the reader can check
 *     against their own bell is what makes it a suggestion instead. So the evidence line must
 *     interpolate the real figures, and an empty result must SAY it has nothing rather than
 *     reaching for a vague one.
 *
 * Also pinned: no second trigger-label map. FlowsPage already keeps a local 11-entry one beside
 * the palette's 133, and a third copy is how one trigger ends up named two things on two screens.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import { triggerLabel } from '../../src/components/Admin/FlowsManagement/utils/paletteItems';

const ROOT = join(__dirname, '..', '..');
const SRC = join(ROOT, 'src/modules/flows-toolkit/components/AutomationSuggestions.tsx');
const src = stripComments(readFileSync(SRC, 'utf8'));

describe('an AI suggestion proposes; it does not act', () => {
  it('creates the flow as a draft, never active', () => {
    expect(src, 'the draft call must pin p_activate: false').toContain('p_activate: false');
    expect(src, 'a suggestion that activates a flow starts sending mail on the user\'s behalf')
      .not.toContain('p_activate: true');
  });

  it('routes creation through create_simple_flow, which enforces the tenant allowlist', () => {
    // Writing to `flows` directly would skip tenant_flow_allowed_triggers()/_actions() and die
    // on a raw 42501 one layer below where a guard can see it.
    expect(src).toContain("create_simple_flow");
    expect(src, 'never insert a flow row from the client').not.toMatch(/from\(['"]flows['"]\)/);
  });

  it('only ever REMOVES notifications without asking', () => {
    // Muting is the one immediate write, and it is safe precisely because it subtracts.
    expect(src).toMatch(/set_workspace_flow_preference[\s\S]{0,200}p_enabled: false/);
  });
});

describe('every suggestion carries the count it rests on', () => {
  it('the evidence line interpolates the real figures', () => {
    const evidence = src.slice(src.indexOf('function evidenceOf'), src.indexOf('function headlineOf'));
    expect(evidence).toContain('s.received');
    expect(evidence).toContain('s.opened');
    expect(evidence).toContain('s.window_days');
  });

  it('an empty result says so instead of offering something vague', () => {
    expect(src, 'the no-suggestions branch must be reachable').toMatch(/asked && !loading && rows\.length === 0/);
  });

  it('a blocked suggestion cannot be actioned', () => {
    // blocked_reason is set when the workspace has no BYOK email sender: the flow would be
    // created and then fail on every send. Offering the button anyway is a promise we cannot keep.
    expect(src).toMatch(/disabled=\{rowBusy \|\| blocked\}/);
    expect(src).toContain('blocked_reason');
  });
});

describe('trigger labels come from the palette, not a new map', () => {
  it('the component imports the shared helper', () => {
    expect(src).toMatch(/import \{ triggerLabel \}/);
  });

  it('and declares no label vocabulary of its own', () => {
    expect(src, 'a third trigger-label map is how two screens disagree about one trigger')
      .not.toMatch(/Record<string,\s*string>/);
  });

  it('names a known trigger from the palette', () => {
    expect(triggerLabel('scheduled')).toBe('Scheduled');
  });

  it('falls back to readable words for a trigger the palette does not name', () => {
    // Not blank, and not the raw snake_case — an unnamed trigger still has to read as English.
    expect(triggerLabel('some_unlisted_event')).toBe('some unlisted event');
    expect(triggerLabel('inbox.message_received')).not.toContain('_');
  });
});
