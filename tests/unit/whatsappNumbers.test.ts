import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { blankComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => blankComments(readFileSync(join(ROOT, p), 'utf8'));

describe('a workspace with several WhatsApp numbers', () => {
  const api = read('supabase/functions/messaging-api/index.ts');
  const open = api.slice(api.indexOf("case 'open-whatsapp-thread'"), api.indexOf("case 'send'"));

  it('picks the number before looking for an existing conversation, and matches on both', () => {
    const pick = open.indexOf(".from('messaging_channels')");
    const dedupe = open.indexOf(".from('inbox_threads').select('id')");
    expect(pick).toBeGreaterThan(-1);
    expect(pick).toBeLessThan(dedupe);
    expect(open).toContain(".eq('metadata->>zernio_account_id', accountId)");
  });

  it('a chosen number must belong to the workspace, and the default wins when none is chosen', () => {
    expect(open).toMatch(/\.eq\('workspace_id', wsId\)\.eq\('channel_type', 'whatsapp'\)\.eq\('is_active', true\)/);
    expect(open).toMatch(/channelQuery\.eq\('id', channelId\)/);
    expect(open).toContain(".order('is_default', { ascending: false })");
  });

  it('the inbox offers a number filter and a From picker only when there is more than one', () => {
    expect(read('src/pages/Inbox/inboxFilters.ts')).toMatch(/waNumbers\.length > 1 \?/);
    expect(read('src/pages/Inbox/components/InboxSidebar.tsx')).toMatch(/mode === 'whatsapp' && waNumbers\.length > 1/);
    expect(read('src/pages/Inbox/components/ComposeWhatsAppForm.tsx')).toMatch(/numbers\.length > 1 &&/);
  });
});
