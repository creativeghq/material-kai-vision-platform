import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import { inboxUiSource } from '../helpers/inboxSource';
import { parseInboxMode, visibleModes } from '@/pages/Inbox/inboxModes';

const API = stripComments(readFileSync(join(process.cwd(), 'supabase/functions/inbox-api/index.ts'), 'utf8'));
const getThread = API.slice(API.indexOf("case 'get_thread': {"), API.indexOf("case 'create_marketplace_inquiry'"));

describe('a conversation opens on its NEWEST messages and pages backwards', () => {
  it('reads newest-first with a page cap and a cursor, never the oldest 500', () => {
    expect(getThread).toContain(".order('created_at', { ascending: false })");
    expect(getThread).not.toMatch(/limit\(peek \? 40 : 500\)/);
    expect(getThread).toContain('older_cursor: olderCursor');
  });

  it('loads older pages on scroll and keeps the reader where they were', () => {
    const ui = inboxUiSource();
    expect(ui).toContain('inboxApi.getOlderMessages(activeId, olderCursor)');
    expect(ui).toContain('el.scrollTop = el.scrollHeight - prependAnchor.current');
    expect(ui).toMatch(/el\.scrollTop < 120 && olderCursor/);
  });

  it('jumps to the bottom on open and only animates a single new message', () => {
    expect(inboxUiSource()).toContain('const oneNew = prev.id !== null && messages.length === prev.count + 1');
  });
});

describe('Gmail is the operator\'s only', () => {
  it('hides the tab and refuses the URL for everyone else', () => {
    expect(visibleModes(false).some((m) => m.key === 'gmail')).toBe(false);
    expect(visibleModes(true).some((m) => m.key === 'gmail')).toBe(true);
    expect(parseInboxMode('gmail', false)).toBe('all');
    expect(parseInboxMode('gmail', true)).toBe('gmail');
  });
});
