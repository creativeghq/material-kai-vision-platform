import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const code = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'));

const CARD = 'src/components/features/ai/AgentResultCard.tsx';
const HUB = 'src/components/features/ai/AgentHub.tsx';
const src = code(CARD);

describe('record rows render as records, at any count', () => {
  it('the record-row renderer exists and is reached before the table', () => {
    // The table needs two rows to find shared columns. Records must not depend on there being
    // two of them — one hit is the commonest search result there is.
    expect(src).toContain('function isRecordRefRows');
    expect(src).toContain('function RecordRefList');
    const listBranch = src.slice(src.indexOf('if (listEntry) {'));
    const refAt = listBranch.indexOf('isRecordRefRows(rows)');
    const tableAt = listBranch.indexOf('tabularColumns(rows)');
    expect(refAt).toBeGreaterThan(-1);
    expect(tableAt).toBeGreaterThan(-1);
    expect(refAt, 'the table path wins before records are recognised').toBeLessThan(tableAt);
  });

  it('a single record still renders as a record', () => {
    const fn = src.slice(src.indexOf('function isRecordRefRows'), src.indexOf('type AnyRec'));
    expect(fn).toContain('rows.length > 0');
    expect(fn, 'the recogniser inherited the table\'s two-row minimum').not.toMatch(/length\s*<\s*2/);
  });

  it('the recogniser demands a kind the link registry actually knows', () => {
    // Otherwise any array of objects carrying a `kind` string renders as records and silently
    // loses its other columns.
    const fn = src.slice(src.indexOf('function isRecordRefRows'), src.indexOf('type AnyRec'));
    expect(fn).toContain('recordSpec(');
    for (const field of ['kind', 'id', 'title']) expect(fn).toContain(`.${field} === 'string'`);
  });

  it('the title is the link, and the raw path is never printed as a field', () => {
    const row = src.slice(src.indexOf('function RecordRefRow'), src.indexOf('function RecordRefList'));
    expect(row).toContain('useRelatedHref(');
    expect(row).toMatch(/<a\s+href=\{recordRefHref\}/);
    expect(row, 'the path is rendered as a visible value').not.toMatch(/\{row\.path\}/);
  });

  it('the gated route wins over the payload path', () => {
    // `recordRoute` is capability-gated; the tool's own `path` is not. Preferring the payload
    // would hand every reader a link the registry would have withheld.
    const row = src.slice(src.indexOf('function RecordRefRow'), src.indexOf('function RecordRefList'));
    expect(row).toMatch(/const recordRefHref = gated \?\? fromPayload/);
  });

  it('the payload path is not passed through safeHref, which would inert it', () => {
    // safeHref admits only https/http/mailto, so an in-app path becomes '#'. The first cut did
    // exactly that and every record link rendered dead.
    const row = src.slice(src.indexOf('function RecordRefRow'), src.indexOf('function RecordRefList'));
    expect(row, 'safeHref is back and sending app paths to #').not.toContain('safeHref(');
    expect(row).toMatch(/row\.path\.startsWith\('\/'\)/);
    expect(row, 'a protocol-relative //host path would leave the app').toMatch(/!row\.path\.startsWith\('\/\/'\)/);
    const exempt = readFileSync(join(ROOT, 'tests/unit/scrapedLinkSafety.test.ts'), 'utf8');
    expect(exempt).toContain("expr: 'recordRefHref'");
  });
});

describe('a notification click reaches its target', () => {
  const hub = code(HUB);

  it('the auto-send latch records WHICH prompt, not merely that one was sent', () => {
    // /agent-hub is not remounted on a query-param change, so a boolean latch never reset meant
    // the second notification carrying `?q=…` changed the URL and did nothing observable at all.
    expect(hub).toMatch(/const initialPromptSent = useRef<string \| null>\(null\)/);
    expect(hub).toMatch(/initialPromptSent\.current !== initialPrompt/);
    expect(hub).toMatch(/initialPromptSent\.current = initialPrompt/);
    expect(hub, 'the latch is a boolean again').not.toMatch(/initialPromptSent\.current = true/);
  });

  it('marking it read does not gate going there', () => {
    // A failed update used to `return` before navigating, so a transient error swallowed the
    // whole click — the panel stayed open and nothing moved, which from the outside is exactly
    // a dead notification. Being read is bookkeeping; the click is the point.
    const panel = code('src/modules/notifications/components/NotificationsPanel.tsx');
    const handler = panel.slice(panel.indexOf('const handleClick'), panel.indexOf('const dismissOne'));
    expect(handler, 'a failed mark-read still aborts the click').not.toMatch(/if \(error\) return;/);
    expect(handler).toContain('resolveNotificationTarget');
    const navAt = handler.indexOf('resolveNotificationTarget');
    expect(handler.slice(navAt)).toMatch(/navigate\(target\.to\)/);
  });

  it('opening a new conversation clears the deep-link latch', () => {
    // Nothing is open, so nothing has been honoured — clicking the notification for the
    // conversation just left must reopen it rather than read as "already there".
    const nu = hub.slice(hub.indexOf('const handleNewConversation'));
    expect(nu.slice(0, 600)).toContain('loadedConversationParamRef.current = null');
  });
});
