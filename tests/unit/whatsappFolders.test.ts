import { describe, expect, it } from 'vitest';
import { NO_LABEL_FOLDER, whatsAppFolders } from '@/pages/Inbox/whatsappFolders';
import type { InboxLabel, InboxThread } from '@/services/inboxApi';

const label = (id: string, name: string): InboxLabel => ({ id, name, color: 'green' });
const thread = (id: string, at: string, labels: InboxLabel[], unread = false): InboxThread =>
  ({ id, last_message_at: at, labels, unread, last_message_preview: `msg ${id}` } as unknown as InboxThread);

describe('WhatsApp folders', () => {
  const vip = label('l1', 'VIP');
  const orders = label('l2', 'Orders');

  it('groups by label, puts unlabelled conversations in their own folder, and lists a two-label thread in both', () => {
    const folders = whatsAppFolders([
      thread('a', '2026-10-12T10:00:00Z', [vip]),
      thread('b', '2026-10-12T09:00:00Z', [vip, orders]),
      thread('c', '2026-10-12T08:00:00Z', []),
    ], [vip, orders]);
    expect(folders.map((f) => f.id)).toEqual(['l1', 'l2', NO_LABEL_FOLDER]);
    expect(folders[0].threads.map((t) => t.id)).toEqual(['a', 'b']);
    expect(folders[1].threads.map((t) => t.id)).toEqual(['b']);
  });

  it('a new incoming message brings its folder to the top, marked with the unread count and its preview', () => {
    const folders = whatsAppFolders([
      thread('a', '2026-10-12T10:00:00Z', [vip]),
      thread('b', '2026-10-12T11:00:00Z', [orders], true),
    ], [vip, orders]);
    expect(folders[0]).toMatchObject({ id: 'l2', unread: 1 });
    expect(folders[0].latest?.last_message_preview).toBe('msg b');
    expect(folders[1].unread).toBe(0);
  });

  it('ignores a label that no longer exists in the workspace', () => {
    const gone = label('lx', 'Deleted');
    const folders = whatsAppFolders([thread('a', '2026-10-12T10:00:00Z', [gone])], [vip]);
    expect(folders.map((f) => f.id)).toEqual([NO_LABEL_FOLDER]);
  });
});
