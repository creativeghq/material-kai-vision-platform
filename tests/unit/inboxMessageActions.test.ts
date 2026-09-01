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
    // BOTH portalled surfaces the bar anchors — the emoji picker and the overflow menu. A second
    // one added without joining this condition reproduces the original bug exactly.
    expect(cls).toMatch(/pickingEmoji \|\| menuOpen \?/);
    // `hidden` sits in the CLOSED half of that ternary and nowhere else.
    // Split on the ternary's own colon only — `group-hover/msg:flex` carries colons of its own.
    const ternary = cls.split(/pickingEmoji \|\| menuOpen \?/)[1];
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


/**
 * The rest of what WhatsApp offers on a message, and the two things it offers that we do not.
 *
 * The operator asked for parity with the menu they use every day. Four of those items mean
 * something here and are built (forward, pin, star, delete); "add text to note" is ours and has
 * no WhatsApp equivalent. The two that are NOT here are absent on purpose, and the reason is the
 * same in both cases: a control that appears to do something it cannot is worse than no control.
 */
describe('the rest of the message menu', () => {
  const PAGE = SRC;
  const API = readFileSync(
    join(process.cwd(), 'supabase', 'functions', 'inbox-api', 'index.ts'), 'utf8');

  it('offers forward, pin, star, note and remove', () => {
    for (const label of ['Forward', 'Pin to top', 'Star', 'Add text to note', 'Remove from this inbox']) {
      expect(ACTIONS, `"${label}" is not in the menu`).toContain(label);
    }
  });

  it('never calls the removal an unsend', () => {
    // Zernio exposes no retract, so a delivered message stays on the customer's phone. "Delete"
    // alone would have the operator believe they had taken something back — and act on it.
    expect(ACTIONS).toContain('Remove from this inbox');
    expect(ACTIONS).not.toMatch(/Delete for everyone/);
    // ...and the toast says the same thing in words, because the menu item is read once.
    expect(PAGE).toMatch(/no way to unsend it/);
  });

  it('keeps a PIN and a STAR separate all the way down', () => {
    // They look like one feature. A pin is the conversation's ("read this first") and lives on
    // the message; a star is mine and lives in a table keyed by the person. Collapse them into
    // one boolean on the row and two colleagues in a shared inbox overwrite each other.
    expect(API).toMatch(/case 'pin_message'/);
    expect(API).toMatch(/case 'star_message'/);
    expect(API).toMatch(/inbox_message_merge_metadata/);
    const starBlock = API.slice(API.indexOf("case 'star_message'"), API.indexOf("case 'forward_message'"));
    expect(starBlock).toMatch(/inbox_message_stars/);
    // Keyed on the VERIFIED caller, never on a body-supplied user id (invariant 1).
    expect(starBlock).toMatch(/user_id: userId/);
    expect(starBlock).not.toMatch(/payload\.user_id/);
  });

  it('checks membership of BOTH conversations before forwarding', () => {
    // Forwarding is the one action that moves words across a boundary. Being able to READ the
    // source is not the question — the question is whether the caller may WRITE to the target.
    const fwd = API.slice(API.indexOf("case 'forward_message'"), API.indexOf("case 'delete_message'"));
    expect(fwd.match(/resolveThreadAccess/g)?.length ?? 0).toBe(2);
    expect(fwd).toMatch(/fromAccess\.isMember/);
    expect(fwd).toMatch(/toAccess\.isMember/);
    // And it RELAYS: a forward that only wrote a row would show in our transcript and never
    // reach the customer. `insertMessageAndNotify` is the function that sends.
    expect(fwd).toMatch(/insertMessageAndNotify/);
    // The 24h window applies however the message was composed.
    expect(fwd).toMatch(/whatsappWindow/);
  });

  it('only lets the sender or an owner/admin remove a message', () => {
    const del = API.slice(API.indexOf("case 'delete_message'"), API.indexOf("case 'list_labels'"));
    expect(del).toMatch(/access\.isMember/);
    expect(del).toMatch(/callerRoleInWorkspace/);
    // Soft, because a conversation is a record and every reader already filters on it.
    expect(del).toMatch(/deleted_at: new Date\(\)\.toISOString\(\)/);
  });

  it('shows the pinned message where it cannot scroll away', () => {
    // A pin whose banner lives inside the scroller is the thing it was meant to replace.
    expect(PAGE).toMatch(/const pinnedMessage = useMemo/);
    const banner = PAGE.slice(PAGE.indexOf('title="Jump to the pinned message"') - 900,
                              PAGE.indexOf('title="Jump to the pinned message"') + 200);
    expect(banner).toContain('shrink-0');
    // ...and it can be jumped to, which needs the bubble to carry an id.
    expect(PAGE).toMatch(/id=\{`inbox-msg-\$\{m\.id\}`\}/);
    expect(PAGE).toMatch(/inbox-msg-\$\{pinnedMessage\.id\}/);
  });

  it('does not offer a Report that reports to nobody', () => {
    // WhatsApp's "Report" sends the message to Meta. There is no equivalent destination here,
    // and the nearest real action (recording a messaging opt-out) is a consent decision that has
    // no business hiding behind a menu item borrowed from another app's vocabulary.
    expect(ACTIONS).not.toMatch(/Report/);
  });
});
