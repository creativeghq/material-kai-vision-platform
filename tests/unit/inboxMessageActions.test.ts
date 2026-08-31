/**
 * The react / reply / copy bar that appears over a message on hover.
 *
 * Both of its failures were geometry, which is the category nothing in this repo can catch: no
 * typecheck, no integrity probe and no render test sees a control that is present, enabled and
 * wired but drawn in the wrong place. They are asserted here as source shapes because that is
 * where the mistake lives — a class list, not a value.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(process.cwd(), 'src', 'pages', 'Inbox', 'InboxPage.tsx'), 'utf8');

/** The `MessageActions` component body, so these assertions cannot pass on some other bar. */
const ACTIONS = (() => {
  const start = SRC.indexOf('const MessageActions:');
  expect(start).toBeGreaterThan(-1);
  const end = SRC.indexOf('\nconst ', start + 1);
  return SRC.slice(start, end === -1 ? undefined : end);
})();

describe('message hover actions', () => {
  it('anchors to the message, not to 82% of the pane', () => {
    /*
     * The bar is `absolute left-2 / right-2` against the message row. A `div` with `flex` is a
     * BLOCK-level flex container, so without `w-fit` that row is the full 82% on every message
     * and the bar lands out in the blank gutter beside a short reply — pointing at nothing.
     *
     * Asserted on the row that actually carries the positioning context (`group/msg relative`),
     * because the bar's own classes are correct and always were.
     */
    const row = SRC.match(/group\/msg relative[^`"]*/)?.[0] ?? '';
    expect(row).toContain('w-fit');
    // ...and it still has to be capped, or a long paragraph runs the width of the pane.
    expect(row).toContain('max-w-[82%]');
  });

  it('stays visible while its own popover is open', () => {
    /*
     * The reaction picker is a Radix Popover and its content is PORTALLED to the body. On open,
     * focus moves into the portal and the pointer goes with it, so `group-hover/msg` and
     * `group-focus-within/msg` both stop holding — and the bar hid itself. The trigger IS the
     * popover's anchor, and a `display:none` anchor measures 0×0 at the origin, so the emoji row
     * jumped to the corner of the screen the instant it was clicked.
     *
     * So the open state has to pin the bar: `hidden` may only be reachable while it is closed.
     */
    const cls = ACTIONS.match(/className=\{`absolute -top-3[\s\S]*?`\}/)?.[0] ?? '';
    expect(cls).not.toBe('');
    expect(cls).toMatch(/pickingEmoji \?/);
    // `hidden` sits in the CLOSED half of that ternary and nowhere else.
    // Split on the ternary's own colon only — `group-hover/msg:flex` carries colons of its own.
    const ternary = cls.split(/pickingEmoji \?/)[1];
    const sep = ternary.indexOf(':');
    const whenOpen = ternary.slice(0, sep);
    const whenClosed = ternary.slice(sep + 1);
    expect(whenOpen).not.toContain('hidden');
    expect(whenClosed).toContain('hidden');
    // The hover/focus reveal is what `hidden` is traded against — losing it makes the bar permanent.
    expect(whenClosed).toContain('group-hover/msg:flex');
    expect(whenClosed).toContain('group-focus-within/msg:flex');
  });

  it('opens the emoji row away from the message it is reacting to', () => {
    // The bar sits at the TOP of the message, so the default side (`bottom`) drops the picker
    // straight over the words being reacted to.
    expect(ACTIONS).toMatch(/side="top"/);
    // Mirrored with the anchor: the bar is on the side away from the avatar, and the picker
    // opens back over the bubble rather than off the edge of the pane.
    expect(ACTIONS).toMatch(/align=\{ours \? 'start' : 'end'\}/);
    expect(ACTIONS).toMatch(/ours \? 'left-2' : 'right-2'/);
  });
});
