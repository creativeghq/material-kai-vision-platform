import type { InboxLabel, InboxThread } from '@/services/inboxApi';

export const NO_LABEL_FOLDER = '__no_label__';

export interface ThreadFolder {
  id: string;
  name: string;
  color: string | null;
  threads: InboxThread[];
  unread: number;
  latest: InboxThread | null;
}

const at = (t: InboxThread) => Date.parse(t.last_message_at ?? '') || 0;

/** WhatsApp conversations grouped by label, the folder with the newest message first. */
export function whatsAppFolders(threads: InboxThread[], labels: InboxLabel[]): ThreadFolder[] {
  const byId = new Map(labels.map((l) => [l.id, l]));
  const folders = new Map<string, ThreadFolder>();
  const folderFor = (id: string, name: string, color: string | null) => {
    let f = folders.get(id);
    if (!f) { f = { id, name, color, threads: [], unread: 0, latest: null }; folders.set(id, f); }
    return f;
  };
  for (const t of threads) {
    const own = (t.labels ?? []).filter((l) => byId.has(l.id));
    const targets = own.length
      ? own.map((l) => folderFor(l.id, byId.get(l.id)!.name, byId.get(l.id)!.color))
      : [folderFor(NO_LABEL_FOLDER, 'No label', null)];
    for (const f of targets) {
      f.threads.push(t);
      if (t.unread) f.unread += 1;
      if (!f.latest || at(t) > at(f.latest)) f.latest = t;
    }
  }
  for (const f of folders.values()) f.threads.sort((a, b) => at(b) - at(a));
  return [...folders.values()].sort((a, b) => (b.latest ? at(b.latest) : 0) - (a.latest ? at(a.latest) : 0));
}
