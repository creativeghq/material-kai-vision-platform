import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Download, Loader2, Paperclip, Search } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Badge } from '@/components/core/ui/badge';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { downloadCSV } from '@/components/analytics/shared/analyticsUtils';
import { formatDate, formatTime, todayLocalISO } from '@/utils/datetime';
import { inboxApi, type InboxLabel, type InboxMessageHit, type InboxMessageSearch } from '@/services/inboxApi';
import { labelDot } from '../inboxFormat';

const CHANNELS = [
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'email', label: 'Email' },
  { key: 'social', label: 'Social' },
  { key: 'internal', label: 'Team' },
] as const;
const PAGE = 50;
const EXPORT_MAX = 2000;

/** A local calendar day as the UTC instant it starts at; `plusDays` moves to an exclusive end. */
function dayStart(day: string, plusDays = 0): string | null {
  if (!day) return null;
  const d = new Date(`${day}T00:00:00`);
  d.setDate(d.getDate() + plusDays);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const who = (h: InboxMessageHit) => h.thread_subject || h.contact_phone || h.email_from || 'Conversation';

/** The Inbox view for finding messages: it takes the place of the list and the conversation. */
export const MessageSearchPanel: React.FC<{
  workspaceId: string;
  labels: InboxLabel[];
  initialChannels?: string[];
  onOpenThread: (threadId: string) => void;
  onClose: () => void;
}> = ({ workspaceId, labels, initialChannels = [], onOpenThread, onClose }) => {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [channels, setChannels] = useState<string[]>(initialChannels);
  const [direction, setDirection] = useState<'in' | 'out' | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [files, setFiles] = useState(false);
  const [rows, setRows] = useState<InboxMessageHit[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState<'search' | 'more' | 'export' | null>(null);
  const seq = useRef(0);

  const params = useCallback((): InboxMessageSearch => ({
    workspace_id: workspaceId, q: q.trim() || undefined, channels, direction,
    from: dayStart(from), to: dayStart(to, 1), label_ids: labelIds, has_attachments: files,
  }), [workspaceId, q, channels, direction, from, to, labelIds, files]);

  useEffect(() => {
    const mine = ++seq.current;
    const timer = setTimeout(() => {
      setBusy('search');
      inboxApi.searchMessages({ ...params(), limit: PAGE })
        .then((r) => { if (mine === seq.current) { setRows(r.messages); setCursor(r.next_cursor); } })
        .catch((e: Error) => { if (mine === seq.current) { setRows([]); toast({ title: 'Search failed', description: e.message, variant: 'destructive' }); } })
        .finally(() => { if (mine === seq.current) setBusy(null); });
    }, 300);
    return () => clearTimeout(timer);
  }, [params, toast]);

  const more = async () => {
    if (!cursor) return;
    const mine = seq.current;
    setBusy('more');
    try {
      const r = await inboxApi.searchMessages({ ...params(), limit: PAGE, before: cursor });
      // The filters changed while this page loaded: it belongs to a search that is gone.
      if (mine !== seq.current) return;
      setRows((cur) => [...(cur ?? []), ...r.messages]);
      setCursor(r.next_cursor);
    } catch (e) {
      toast({ title: 'Could not load more', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const exportCsv = async () => {
    setBusy('export');
    try {
      const all: InboxMessageHit[] = [];
      let next: string | null = null;
      do {
        const r = await inboxApi.searchMessages({ ...params(), limit: 200, before: next });
        all.push(...r.messages);
        next = r.next_cursor;
      } while (next && all.length < EXPORT_MAX);
      downloadCSV(`inbox-messages-${todayLocalISO()}.csv`, [
        ['Date', 'Time', 'Channel', 'Conversation', 'Phone', 'Email', 'Direction', 'From', 'Message', 'Files', 'Status'],
        ...all.map((h) => [
          formatDate(h.created_at), formatTime(h.created_at), h.thread_channel, who(h), h.contact_phone ?? '', h.email_from ?? '',
          h.direction === 'in' ? 'Received' : 'Sent', h.sender_name, h.body ?? '', String(h.attachment_count), h.thread_status,
        ]),
      ]);
      if (next) toast({ title: `Exported the newest ${EXPORT_MAX.toLocaleString()} messages`, description: 'Narrow the filters to export the rest.' });
    } catch (e) {
      toast({ title: 'Export failed', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const toggle = (list: string[], set: (v: string[]) => void, key: string) => set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);
  const chip = (on: boolean) => `h-7 px-2.5 rounded-sm border text-xs ${on ? 'border-primary/50 bg-primary/[0.08] text-primary' : 'border-hairline text-muted-foreground hover:text-foreground'}`;

  return (
    <section className="dashboard-card md:col-span-9 lg:col-span-10 flex-1 min-h-0 flex flex-col gap-3 overflow-hidden p-4">
        <div className="flex items-start justify-between gap-3 shrink-0">
          <div>
            <h2 className="text-base font-semibold font-sans">Search Messages</h2>
            <p className="text-xs text-muted-foreground">Every message that matches, newest first. Open one to jump to its conversation.</p>
          </div>
          <Button size="sm" variant="outline" onClick={onClose}><ArrowLeft className="w-3.5 h-3.5" />Conversations</Button>
        </div>

        <div className="space-y-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Words in the message…" className="pl-8" autoFocus />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {CHANNELS.map((c) => (
              <button key={c.key} type="button" className={chip(channels.includes(c.key))} onClick={() => toggle(channels, setChannels, c.key)}>{c.label}</button>
            ))}
            <span className="mx-1 h-4 w-px bg-hairline" aria-hidden />
            <button type="button" className={chip(direction === 'in')} onClick={() => setDirection(direction === 'in' ? null : 'in')}>Received</button>
            <button type="button" className={chip(direction === 'out')} onClick={() => setDirection(direction === 'out' ? null : 'out')}>Sent</button>
            <span className="mx-1 h-4 w-px bg-hairline" aria-hidden />
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <label htmlFor="msg-search-from">From</label>
              <Input id="msg-search-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-7 w-36 text-xs" />
            </span>
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <label htmlFor="msg-search-to">to</label>
              <Input id="msg-search-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-7 w-36 text-xs" />
            </span>
            <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground ml-1">
              <Checkbox checked={files} onCheckedChange={(v) => setFiles(v === true)} /> With files
            </label>
          </div>
          {labels.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground mr-1">Labels</span>
              {labels.map((l) => (
                <button key={l.id} type="button" className={`${chip(labelIds.includes(l.id))} inline-flex items-center gap-1.5`} onClick={() => toggle(labelIds, setLabelIds, l.id)}>
                  <span className={`w-2 h-2 rounded-full ${labelDot(l.color)}`} />{l.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between shrink-0 text-xs text-muted-foreground">
          <span className="tabular-nums">
            {rows === null ? 'Searching…' : `${rows.length.toLocaleString()}${cursor ? '+' : ''} message${rows.length === 1 ? '' : 's'}`}
          </span>
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!rows?.length || busy === 'export'} onClick={() => { void exportCsv(); }}>
            {busy === 'export' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}Export CSV
          </Button>
        </div>

        <div className="flex-1 min-h-0 overflow-auto rounded-sm border border-hairline">
          {rows === null || (busy === 'search' && !rows.length) ? (
            <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <HubEmptyState variant="filtered" icon={Search} title="No messages match"
              description="Try fewer words, another channel, or a wider date range."
              action={<Button size="sm" variant="outline" onClick={() => { setQ(''); setChannels([]); setDirection(null); setFrom(''); setTo(''); setLabelIds([]); setFiles(false); }}>Clear filters</Button>} />
          ) : (
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-sunken">
                  <tr className="text-left text-[11px] font-semibold text-muted-foreground">
                    <th className="px-3 py-2 w-32">When</th>
                    <th className="px-3 py-2 w-48">Conversation</th>
                    <th className="px-3 py-2 w-36">From</th>
                    <th className="px-3 py-2">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((h) => (
                    <tr key={h.message_id} className="border-t border-hairline hover:bg-surface-hover cursor-pointer align-top"
                      onClick={() => onOpenThread(h.thread_id)}>
                      <td className="px-3 py-2 text-xs text-muted-foreground tabular-nums whitespace-nowrap">
                        {formatDate(h.created_at)}<br />{formatTime(h.created_at)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="truncate max-w-[12rem] font-medium">{who(h)}</div>
                        <div className="text-[11px] text-muted-foreground capitalize">{h.thread_channel}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="truncate max-w-[9rem]">{h.sender_name}</div>
                        <Badge variant={h.direction === 'in' ? 'info' : 'neutral'}>{h.direction === 'in' ? 'Received' : 'Sent'}</Badge>
                      </td>
                      <td className="px-3 py-2">
                        <div className="line-clamp-2 whitespace-pre-wrap break-words">{h.body || '—'}</div>
                        {h.attachment_count > 0 && (
                          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                            <Paperclip className="w-3 h-3" />{h.attachment_count} file{h.attachment_count === 1 ? '' : 's'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {cursor && (
                <div className="flex justify-center py-3 border-t border-hairline">
                  <Button size="sm" variant="outline" onClick={() => { void more(); }} disabled={busy === 'more'}>
                    {busy === 'more' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}Load more
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
    </section>
  );
};
