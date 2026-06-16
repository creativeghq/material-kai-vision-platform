import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Inbox as InboxIcon, Send, Plus, Loader2, MessageSquare, Lock, Paperclip,
  StickyNote, UserPlus, X,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/core/ui/dialog';
import {
  inboxApi, signInboxAttachment,
  type InboxThread, type InboxMessage, type InboxParticipant, type InboxChannel,
} from '@/services/inboxApi';

type ChannelFilter = 'all' | InboxChannel;

interface WorkspaceMemberOption { user_id: string; label: string; }

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

const InboxPage: React.FC = () => {
  const { activeWorkspaceId, isPlatformOperator } = useWorkspace();
  const { persona } = usePermissions();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();

  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [filter, setFilter] = useState<ChannelFilter>('all');
  const [activeId, setActiveId] = useState<string | null>(searchParams.get('thread'));

  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [participants, setParticipants] = useState<InboxParticipant[]>([]);
  const [activeThread, setActiveThread] = useState<InboxThread | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);

  const [draft, setDraft] = useState('');
  const [isNote, setIsNote] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);

  const [showNew, setShowNew] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // The active member viewing this thread (used to decide note-composer visibility).
  const isMember = useMemo(
    () => isPlatformOperator || persona !== 'end_user',
    [isPlatformOperator, persona],
  );

  const loadThreads = useCallback(async () => {
    setLoadingThreads(true);
    try {
      const { threads } = await inboxApi.listThreads(
        filter === 'all' ? {} : { channel: filter },
      );
      setThreads(threads);
    } catch (e) {
      toast({ title: 'Could not load inbox', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoadingThreads(false);
    }
  }, [filter, toast]);

  useEffect(() => { loadThreads(); }, [loadThreads]);

  const openThread = useCallback(async (id: string) => {
    setActiveId(id);
    setSearchParams((p) => { p.set('thread', id); return p; }, { replace: true });
    setLoadingThread(true);
    try {
      const { thread, participants, messages } = await inboxApi.getThread(id);
      setActiveThread(thread);
      setParticipants(participants);
      setMessages(messages);
      // get_thread marks read server-side; reflect locally.
      setThreads((prev) => prev.map((t) => (t.id === id ? { ...t, unread: false } : t)));
    } catch (e) {
      toast({ title: 'Could not open conversation', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setLoadingThread(false);
    }
  }, [setSearchParams, toast]);

  useEffect(() => { if (activeId) openThread(activeId); /* eslint-disable-next-line */ }, []);

  // Realtime: new messages on the open thread + thread-list bumps.
  useEffect(() => {
    if (!activeId) return;
    const ch = supabase
      .channel(`inbox-thread:${activeId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'inbox_messages', filter: `thread_id=eq.${activeId}`,
      }, (payload) => {
        const m = payload.new as InboxMessage;
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [activeId]);

  useEffect(() => {
    const ch = supabase
      .channel('inbox-threads-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inbox_threads' }, () => loadThreads())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [loadThreads]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = useCallback(async () => {
    if (!activeId || (!draft.trim() && !attachment)) return;
    setSending(true);
    try {
      let attachments;
      if (attachment) {
        const buf = new Uint8Array(await attachment.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        attachments = [{ filename: attachment.name, content_type: attachment.type || 'application/octet-stream', data_base64: btoa(bin) }];
      }
      await inboxApi.sendMessage({
        thread_id: activeId,
        body: draft.trim() || undefined,
        attachments,
        message_type: isNote ? 'note' : 'text',
      });
      setDraft('');
      setAttachment(null);
      // Realtime echoes our own insert back, so don't optimistic-append.
    } catch (e) {
      toast({ title: 'Send failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }, [activeId, draft, attachment, isNote, toast]);

  const channelBadge = (t: InboxThread) =>
    t.channel === 'whatsapp'
      ? <Badge variant="secondary" className="text-[10px] bg-green-600/15 text-green-500">WhatsApp</Badge>
      : <Badge variant="secondary" className="text-[10px]">{t.thread_type}</Badge>;

  return (
    <div className="container mx-auto py-6 h-[calc(100vh-5rem)]">
      <div className="flex items-center gap-2 mb-4">
        <InboxIcon className="w-6 h-6 text-primary" />
        <h1 className="text-2xl">Inbox</h1>
        <div className="flex-1" />
        {isMember && (
          <Button className="rounded-full" onClick={() => setShowNew(true)} disabled={!activeWorkspaceId}>
            <Plus className="w-4 h-4 mr-1" /> New
          </Button>
        )}
      </div>

      <div className="grid grid-cols-12 gap-4 h-full">
        {/* Thread list */}
        <Card className="dashboard-card col-span-4 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-white/10">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as ChannelFilter)}>
              <TabsList className="w-full">
                <TabsTrigger value="all" className="flex-1">All</TabsTrigger>
                <TabsTrigger value="internal" className="flex-1">Internal</TabsTrigger>
                <TabsTrigger value="whatsapp" className="flex-1">WhatsApp</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingThreads ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin" /></div>
            ) : threads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-sm gap-2">
                <MessageSquare className="w-8 h-8 opacity-40" />
                No conversations yet
              </div>
            ) : threads.map((t) => (
              <button
                key={t.id}
                onClick={() => openThread(t.id)}
                className={`w-full text-left px-3 py-3 border-b border-white/5 hover:bg-white/5 transition ${activeId === t.id ? 'bg-white/10' : ''}`}
              >
                <div className="flex items-center gap-2">
                  {t.unread && <span className="w-2 h-2 rounded-full bg-primary shrink-0" />}
                  <span className="flex-1 truncate text-sm">{t.subject || '(no subject)'}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(t.last_message_at)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">{channelBadge(t)}
                  {t.status !== 'open' && <Badge variant="outline" className="text-[10px]">{t.status}</Badge>}
                </div>
              </button>
            ))}
          </div>
        </Card>

        {/* Conversation pane */}
        <Card className="dashboard-card col-span-8 flex flex-col overflow-hidden">
          {!activeThread ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Select a conversation</div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2">
                <div className="flex-1 min-w-0">
                  <div className="truncate">{activeThread.subject || '(no subject)'}</div>
                  <div className="text-xs text-muted-foreground">{participants.filter(p => p.status === 'active').length} participants · {activeThread.channel}</div>
                </div>
                {isMember && (
                  <>
                    <Button variant="outline" size="sm" className="rounded-full" onClick={() => setShowAdd(true)}>
                      <UserPlus className="w-4 h-4" />
                    </Button>
                    <select
                      className="bg-transparent border border-white/10 rounded-full px-3 py-1 text-xs"
                      value={activeThread.status}
                      onChange={async (e) => {
                        const status = e.target.value as InboxThread['status'];
                        await inboxApi.setStatus(activeThread.id, status).catch((err) => toast({ title: 'Failed', description: (err as Error).message, variant: 'destructive' }));
                        setActiveThread({ ...activeThread, status });
                      }}
                    >
                      <option value="open">Open</option>
                      <option value="snoozed">Snoozed</option>
                      <option value="closed">Closed</option>
                    </select>
                  </>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {loadingThread ? (
                  <div className="flex items-center justify-center h-32"><Loader2 className="w-5 h-5 animate-spin" /></div>
                ) : messages.map((m) => <MessageBubble key={m.id} m={m} />)}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer */}
              <div className="border-t border-white/10 p-3 space-y-2">
                {isMember && (
                  <button
                    onClick={() => setIsNote((v) => !v)}
                    className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full ${isNote ? 'bg-amber-500/20 text-amber-400' : 'text-muted-foreground hover:bg-white/5'}`}
                  >
                    <StickyNote className="w-3 h-3" /> {isNote ? 'Private note' : 'Reply'}
                  </button>
                )}
                {attachment && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Paperclip className="w-3 h-3" /> {attachment.name}
                    <button onClick={() => setAttachment(null)}><X className="w-3 h-3" /></button>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <label className="cursor-pointer p-2 rounded-full hover:bg-white/5">
                    <Paperclip className="w-4 h-4 text-muted-foreground" />
                    <input type="file" className="hidden" onChange={(e) => setAttachment(e.target.files?.[0] ?? null)} />
                  </label>
                  <Textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                    placeholder={isNote ? 'Write a private note…' : 'Type a message…'}
                    className="flex-1 min-h-[44px] max-h-32 resize-none"
                  />
                  <Button className="rounded-full" onClick={send} disabled={sending || (!draft.trim() && !attachment)}>
                    {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>

      {showNew && activeWorkspaceId && (
        <NewThreadDialog
          workspaceId={activeWorkspaceId}
          onClose={() => setShowNew(false)}
          onCreated={(id) => { setShowNew(false); loadThreads(); openThread(id); }}
        />
      )}
      {showAdd && activeThread && (
        <AddParticipantDialog
          thread={activeThread}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); openThread(activeThread.id); }}
        />
      )}
    </div>
  );
};

const MessageBubble: React.FC<{ m: InboxMessage }> = ({ m }) => {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    (async () => {
      for (const a of m.attachments || []) {
        const u = await signInboxAttachment(a);
        if (u) setUrls((p) => ({ ...p, [a.storage_object_path]: u }));
      }
    })();
  }, [m]);
  const isNote = m.message_type === 'note';
  const isSystem = m.message_type === 'system';
  if (isSystem) {
    return <div className="text-center text-xs text-muted-foreground">{m.body}</div>;
  }
  return (
    <div className={`rounded-lg px-3 py-2 max-w-[80%] ${isNote ? 'bg-amber-500/10 border border-amber-500/30 ml-auto' : 'bg-white/5'}`}>
      {isNote && <div className="flex items-center gap-1 text-[10px] text-amber-400 mb-1"><Lock className="w-3 h-3" /> Private note</div>}
      {m.body && <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>}
      {(m.attachments || []).map((a) => (
        <a key={a.storage_object_path} href={urls[a.storage_object_path]} target="_blank" rel="noreferrer"
           className="flex items-center gap-1 text-xs text-primary mt-1 underline">
          <Paperclip className="w-3 h-3" /> {a.name || 'attachment'}
        </a>
      ))}
      <div className="text-[10px] text-muted-foreground mt-1">{new Date(m.created_at).toLocaleString()}</div>
    </div>
  );
};

const NewThreadDialog: React.FC<{ workspaceId: string; onClose: () => void; onCreated: (id: string) => void }> = ({ workspaceId, onClose, onCreated }) => {
  const { toast } = useToast();
  const [subject, setSubject] = useState('');
  const [members, setMembers] = useState<WorkspaceMemberOption[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: mem } = await supabase.from('workspace_members').select('user_id').eq('workspace_id', workspaceId);
      const ids = (mem || []).map((r: { user_id: string }) => r.user_id);
      if (ids.length === 0) return;
      const { data: profs } = await supabase.from('user_profiles').select('user_id, full_name, email').in('user_id', ids);
      const me = (await supabase.auth.getUser()).data.user?.id;
      setMembers((profs || []).filter((p: { user_id: string }) => p.user_id !== me).map((p: { user_id: string; full_name?: string; email?: string }) => ({
        user_id: p.user_id, label: p.full_name || p.email || p.user_id.slice(0, 8),
      })));
    })();
  }, [workspaceId]);

  const create = async () => {
    setBusy(true);
    try {
      const { thread } = await inboxApi.createThread({
        thread_type: 'internal', workspace_id: workspaceId, subject: subject.trim() || undefined,
        participants: selected.map((user_id) => ({ type: 'member' as const, user_id })),
      });
      onCreated(thread.id);
    } catch (e) {
      toast({ title: 'Could not create', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>New conversation</DialogTitle></DialogHeader>
        <Input placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <div className="text-xs text-muted-foreground mt-2 mb-1">Add team members</div>
        <div className="max-h-48 overflow-y-auto space-y-1">
          {members.map((m) => (
            <label key={m.user_id} className="flex items-center gap-2 text-sm px-2 py-1 rounded hover:bg-white/5">
              <input type="checkbox" checked={selected.includes(m.user_id)}
                onChange={(e) => setSelected((prev) => e.target.checked ? [...prev, m.user_id] : prev.filter((x) => x !== m.user_id))} />
              {m.label}
            </label>
          ))}
          {members.length === 0 && <div className="text-xs text-muted-foreground px-2">No other members found.</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={onClose}>Cancel</Button>
          <Button className="rounded-full" onClick={create} disabled={busy}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

const AddParticipantDialog: React.FC<{ thread: InboxThread; onClose: () => void; onAdded: () => void }> = ({ thread, onClose, onAdded }) => {
  const { toast } = useToast();
  const [members, setMembers] = useState<WorkspaceMemberOption[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: mem } = await supabase.from('workspace_members').select('user_id').eq('workspace_id', thread.workspace_id);
      const ids = (mem || []).map((r: { user_id: string }) => r.user_id);
      if (ids.length === 0) return;
      const { data: profs } = await supabase.from('user_profiles').select('user_id, full_name, email').in('user_id', ids);
      setMembers((profs || []).map((p: { user_id: string; full_name?: string; email?: string }) => ({
        user_id: p.user_id, label: p.full_name || p.email || p.user_id.slice(0, 8),
      })));
    })();
  }, [thread.workspace_id]);

  const add = async (user_id: string) => {
    setBusy(user_id);
    try {
      await inboxApi.addParticipant({ thread_id: thread.id, type: 'member', user_id });
      onAdded();
    } catch (e) {
      toast({ title: 'Could not add', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add member</DialogTitle></DialogHeader>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {members.map((m) => (
            <button key={m.user_id} onClick={() => add(m.user_id)} disabled={!!busy}
              className="w-full flex items-center justify-between text-sm px-2 py-2 rounded hover:bg-white/5">
              {m.label}
              {busy === m.user_id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </button>
          ))}
          {members.length === 0 && <div className="text-xs text-muted-foreground px-2">No members found.</div>}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InboxPage;
