import React, { useMemo, useRef, useState } from 'react';
import { Archive, ArrowLeft, Download, Loader2, Mail, MailOpen, Paperclip, Reply, ReplyAll, Send, Star, Trash2, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { formatDate, formatTime } from '@/utils/datetime';
import { gmailApi, type GmailMessage } from '@/services/gmailApi';
import { EmailHtmlView } from '../components/EmailHtmlView';
import { EmailFormatBar, EmailPreview } from '../components/EmailFormatBar';
import { splitAddresses } from '../emailRecipients';
import type { GmailMailboxState } from './useGmailMailbox';

export async function fileToAttachment(file: File) {
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return { filename: file.name, content_type: file.type || 'application/octet-stream', data_base64: btoa(bin) };
}

const MessageCard: React.FC<{ m: GmailMessage; expanded: boolean; onToggle: () => void; accountId: string }> = ({ m, expanded, onToggle, accountId }) => {
  const { toast } = useToast();
  const [plain, setPlain] = useState(false);
  const download = async (attachmentId: string, filename: string, mimeType: string) => {
    try {
      const { data_base64 } = await gmailApi.attachment(accountId, m.id, attachmentId);
      const a = document.createElement('a');
      a.href = `data:${mimeType || 'application/octet-stream'};base64,${data_base64}`;
      a.download = filename;
      a.click();
    } catch (e) {
      toast({ title: 'Could not download', description: (e as Error).message, variant: 'destructive' });
    }
  };
  return (
    <div className="rounded-sm border border-hairline bg-card">
      <button type="button" onClick={onToggle} className="w-full flex items-baseline gap-2 px-3 py-2 text-left">
        <span className="text-sm font-medium truncate">{m.from.name || m.from.address}</span>
        {m.from.name && <span className="text-xs text-muted-foreground truncate">{m.from.address}</span>}
        <span className="ml-auto text-[11px] text-muted-foreground tabular-nums shrink-0">
          {m.date ? `${formatDate(m.date)} ${formatTime(m.date)}` : '—'}
        </span>
      </button>
      {!expanded ? (
        <div className="px-3 pb-2 text-xs text-muted-foreground truncate">{m.snippet}</div>
      ) : (
        <div className="px-3 pb-3 space-y-2">
          <div className="text-[11px] text-muted-foreground">
            To {m.to.join(', ') || '—'}{m.cc.length ? ` · Cc ${m.cc.join(', ')}` : ''}
          </div>
          {m.html && !plain
            ? <EmailHtmlView html={m.html} sender={m.from.address} onShowText={() => setPlain(true)} />
            : (
              <div className="space-y-1">
                <div className="text-sm whitespace-pre-wrap break-words">{m.text ?? m.snippet}</div>
                {m.html && <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setPlain(false)}>Show formatted</Button>}
              </div>
            )}
          {m.attachments.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {m.attachments.map((a) => (
                <button key={a.attachmentId} type="button" onClick={() => download(a.attachmentId, a.filename, a.mimeType)}
                  className="inline-flex items-center gap-1.5 rounded-sm border border-hairline bg-surface-sunken px-2 py-1 text-xs hover:bg-surface-hover">
                  <Download className="w-3 h-3" />{a.filename}
                  <span className="text-muted-foreground tabular-nums">{Math.max(1, Math.round(a.size / 1024))} KB</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const GmailThreadView: React.FC<{ g: GmailMailboxState }> = ({ g }) => {
  const { toast } = useToast();
  const { account, openId, openMessages, loadingThread, modify, threads, setOpenId, openThread } = g;
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [replying, setReplying] = useState<null | 'reply' | 'all'>(null);
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const row = threads.find((t) => t.id === openId);
  const last = openMessages?.[openMessages.length - 1] ?? null;
  const me = account?.email.toLowerCase() ?? '';

  const lastIncoming = useMemo(
    () => [...(openMessages ?? [])].reverse().find((m) => m.from.address !== me) ?? last,
    [openMessages, me, last],
  );

  const startReply = (kind: 'reply' | 'all') => {
    if (!lastIncoming) return;
    const target = lastIncoming.reply_to || lastIncoming.from.address || '';
    setTo(target);
    if (kind === 'all') {
      const others = [...lastIncoming.to, ...lastIncoming.cc].filter((a) => a && a !== me && a !== target);
      setCc([...new Set(others)].join(', '));
    } else setCc('');
    setReplying(kind);
    requestAnimationFrame(() => bodyRef.current?.focus());
  };

  const send = async () => {
    if (!account || !openId || !lastIncoming) return;
    setSending(true);
    try {
      await gmailApi.send({
        account_id: account.id, thread_id: openId, reply_to_message_id: lastIncoming.id,
        to: splitAddresses(to), cc: splitAddresses(cc), bcc: splitAddresses(bcc), body,
        attachments: files.length ? await Promise.all(files.map(fileToAttachment)) : undefined,
      });
      toast({ title: 'Reply sent' });
      setReplying(null); setBody(''); setFiles([]); setCc(''); setBcc(''); setPreview(false);
      await openThread(openId);
    } catch (e) {
      toast({ title: 'Reply not sent', description: (e as Error).message, variant: 'destructive' });
    } finally { setSending(false); }
  };

  if (!openId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center text-sm text-muted-foreground p-6">
        <Mail className="w-6 h-6 mb-2" />
        Pick a conversation to read it.
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="px-4 py-2.5 border-b border-hairline bg-surface-sunken flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="icon" className="h-8 w-8 md:hidden" onClick={() => setOpenId(null)} title="Back"><ArrowLeft className="w-4 h-4" /></Button>
        <h2 className="font-sans text-sm font-semibold truncate flex-1">{row?.subject ?? last?.subject ?? 'Conversation'}</h2>
        <Button variant="ghost" size="icon" className="h-8 w-8" title={row?.starred ? 'Unstar' : 'Star'}
          onClick={() => modify(openId, row?.starred ? { remove: ['STARRED'] } : { add: ['STARRED'] }, row?.starred ? 'Unstarred' : 'Starred')}>
          <Star className={`w-4 h-4 ${row?.starred ? 'fill-current text-amber-700 dark:text-amber-300' : ''}`} />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Mark unread" onClick={() => modify(openId, { add: ['UNREAD'] }, 'Marked unread')}>
          <MailOpen className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Archive" onClick={() => modify(openId, { remove: ['INBOX'] }, 'Archived')}>
          <Archive className="w-4 h-4" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" title="Move to trash" onClick={() => modify(openId, { trash: true }, 'Moved to trash')}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
        {loadingThread || !openMessages ? (
          <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : openMessages.map((m, i) => (
          <MessageCard
            key={m.id} m={m} accountId={account?.id ?? ''}
            expanded={i === openMessages.length - 1 || expanded.has(m.id)}
            onToggle={() => setExpanded((cur) => { const n = new Set(cur); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })}
          />
        ))}
      </div>
      <div className="border-t border-hairline bg-surface-sunken p-3 shrink-0 space-y-2">
        {!replying ? (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => startReply('reply')} disabled={!lastIncoming}><Reply className="w-4 h-4 mr-1" />Reply</Button>
            <Button size="sm" variant="outline" onClick={() => startReply('all')} disabled={!lastIncoming}><ReplyAll className="w-4 h-4 mr-1" />Reply all</Button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[2.5rem_1fr] items-center gap-1.5 text-xs">
              <Label htmlFor="g-to" className="text-xs text-muted-foreground">To</Label>
              <Input id="g-to" value={to} onChange={(e) => setTo(e.target.value)} className="h-7 text-xs" />
              <Label htmlFor="g-cc" className="text-xs text-muted-foreground">Cc</Label>
              <Input id="g-cc" value={cc} onChange={(e) => setCc(e.target.value)} className="h-7 text-xs" />
              <Label htmlFor="g-bcc" className="text-xs text-muted-foreground">Bcc</Label>
              <Input id="g-bcc" value={bcc} onChange={(e) => setBcc(e.target.value)} className="h-7 text-xs" />
            </div>
            <EmailFormatBar textareaRef={bodyRef} value={body} onChange={setBody} preview={preview} onPreview={setPreview} />
            {preview
              ? <EmailPreview value={body} onEdit={() => setPreview(false)} />
              : <Textarea ref={bodyRef} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Write your reply…" className="min-h-[100px] resize-y bg-card" />}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="inline-flex items-center gap-1 cursor-pointer text-muted-foreground hover:text-foreground">
                <Paperclip className="w-3.5 h-3.5" /> Attach
                <input type="file" multiple className="hidden" onChange={(e) => { const f = Array.from(e.target.files ?? []); setFiles((c) => [...c, ...f]); e.target.value = ''; }} />
              </label>
              {files.map((f, i) => (
                <span key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-sm border border-hairline bg-card px-1.5 py-0.5">
                  {f.name}
                  <button type="button" onClick={() => setFiles((c) => c.filter((_, j) => j !== i))} title="Remove"><X className="w-3 h-3" /></button>
                </span>
              ))}
              <span className="ml-auto flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setReplying(null)}>Discard</Button>
                <Button size="sm" onClick={send} disabled={sending || !to.trim() || (!body.trim() && files.length === 0)}>
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Send className="w-4 h-4 mr-1" />Send</>}
                </Button>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
