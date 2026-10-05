import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';
import { inboxUiSource } from '../helpers/inboxSource';

const API = stripComments(readFileSync(join(process.cwd(), 'supabase/functions/inbox-api/index.ts'), 'utf8'));
const list = API.slice(API.indexOf("case 'list_threads'"), API.indexOf("case 'get_thread'"));

describe('the thread list pages instead of stopping at 200', () => {
  it('orders on a unique key and hands back a cursor', () => {
    expect(list).toMatch(/\.order\('last_message_at', \{ ascending: false \}\)\.order\('id', \{ ascending: false \}\)/);
    expect(list).toContain('.limit(pageSize + 1)');
    expect(list).toContain('next_cursor: nextCursor');
    expect(list).not.toMatch(/\.limit\(200\)/);
  });

  it('searches on the server, message bodies included, and never inside private notes', () => {
    expect(list).toMatch(/from\('inbox_messages'\)[\s\S]{0,120}\.ilike\('body', like\)\.neq\('message_type', 'note'\)/);
    expect(list).toContain('escapeLike(search)');
    expect(list).toMatch(/subject\.ilike\.\$\{pgrstQuote\(like\)\}/);
  });

  it('filters by any of several labels', () => {
    expect(list).toMatch(/\.in\('label_id', labelIds\)/);
  });
});

describe('the Inbox asks the server for those pages', () => {
  const ui = inboxUiSource();
  it('sends the search, the labels and the cursor', () => {
    expect(ui).toMatch(/search: serverSearch/);
    expect(ui).toMatch(/label_ids: labelIds/);
    expect(ui).toMatch(/before: nextCursor/);
    expect(ui).toContain('Load older conversations');
  });

  it('does not re-filter a server search result by subject, which would hide body matches', () => {
    expect(ui).toMatch(/if \(q && query\.trim\(\) !== serverSearch\)/);
  });
});
