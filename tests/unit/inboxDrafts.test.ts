import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import { inboxUiSource } from '../helpers/inboxSource';

const API = stripComments(readFileSync(join(process.cwd(), 'supabase/functions/inbox-api/index.ts'), 'utf8'));
const ui = inboxUiSource();

describe('an unsent reply is a draft, per person and per conversation', () => {
  it('is cleared server-side once its message is stored', () => {
    const send = API.slice(API.indexOf("case 'send_message'"), API.indexOf("case 'mark_read'"));
    const stored = send.indexOf('insertMessageAndNotify(db, {');
    const cleared = send.indexOf(".from('inbox_drafts').delete()");
    expect(cleared).toBeGreaterThan(stored);
  });

  it('lists in a Drafts folder filtered in SQL to the caller', () => {
    expect(API).toContain("q = q.eq('folder_drafts.user_id', userId)");
  });

  it('does not carry one conversation\'s text into the next', () => {
    const open = ui.slice(ui.indexOf('const openThread = useCallback'), ui.indexOf('const { thread, participants, messages'));
    expect(open).toContain("setDraft('')");
    expect(open).toContain('draftLoadedFor.current = null');
  });

  it('only saves once the open thread\'s own draft has loaded', () => {
    expect(ui).toMatch(/draftLoadedFor\.current !== threadId\) return;/);
  });

  it('flushes a pending save when the thread changes instead of dropping it', () => {
    expect(ui).toMatch(/return \(\) => \{ clearTimeout\(timer\); if \(pending\) void save\(\); \};/);
  });
});
