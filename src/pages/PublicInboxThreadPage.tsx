import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MessageSquare, Send, Loader2, Paperclip, X, UserPlus } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card } from '@/components/core/ui/card';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/core/ui/dialog';
import { inboxApi, signInboxAttachment, type InboxMessage } from '@/services/inboxApi';

/**
 * Public customer thread (`/i/:token`). Minimal chrome: one thread, reply box,
 * attachment upload. A "Create an account to continue" modal intercepts any attempt to
 * navigate beyond this thread; signup carries the token so the account can adopt the
 * thread via token_claim (the conversion handshake). Anonymous reads go through the
 * service-role token branch of inbox-api (RLS would otherwise hide the thread).
 */
const PublicInboxThreadPage: React.FC = () => {
  const { token = '' } = useParams();
  const navigate = useNavigate();

  const [subject, setSubject] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('open');
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [showConvert, setShowConvert] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await inboxApi.tokenGetThread(token);
      setSubject(res.thread.subject);
      setStatus(res.thread.status);
      setMessages(res.messages);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { load(); }, [load]);
  // Anonymous clients can't use RLS realtime — poll while the tab is open.
  useEffect(() => {
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, [load]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async () => {
    if (!draft.trim() && !attachment) return;
    setSending(true);
    try {
      let attachments;
      if (attachment) {
        const buf = new Uint8Array(await attachment.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        attachments = [{ filename: attachment.name, content_type: attachment.type || 'application/octet-stream', data_base64: btoa(bin) }];
      }
      await inboxApi.tokenSendMessage({ token, body: draft.trim() || undefined, attachments });
      setDraft('');
      setAttachment(null);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;
  }
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Card className="dashboard-card p-8 max-w-sm text-center">
          <MessageSquare className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <div className="text-lg mb-1">Conversation unavailable</div>
          <div className="text-sm text-muted-foreground">{error}</div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-white/10 px-4 py-3 flex items-center gap-2">
        <MessageSquare className="w-5 h-5 text-primary" />
        <div className="flex-1 min-w-0">
          <div className="truncate">{subject || 'Conversation'}</div>
          <div className="text-xs text-muted-foreground">{status}</div>
        </div>
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => setShowConvert(true)}>
          <UserPlus className="w-4 h-4 mr-1" /> Create account
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 max-w-2xl w-full mx-auto">
        {messages.map((m) => <PublicBubble key={m.id} m={m} />)}
        <div ref={endRef} />
      </div>

      <div className="border-t border-white/10 p-3 max-w-2xl w-full mx-auto">
        {attachment && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
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
            placeholder="Type a reply…"
            className="flex-1 min-h-[44px] max-h-32 resize-none"
            disabled={status === 'closed'}
          />
          <Button className="rounded-full" onClick={send} disabled={sending || status === 'closed' || (!draft.trim() && !attachment)}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <Dialog open={showConvert} onOpenChange={setShowConvert}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create an Account to Continue</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            You can keep this conversation and access the full platform by creating a free account.
            Your messages here will be linked to your new account.
          </p>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setShowConvert(false)}>Not now</Button>
            <Button className="rounded-full" onClick={() => navigate(`/auth?mode=signup&inbox_token=${encodeURIComponent(token)}&redirect=/inbox`)}>
              Create free account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const PublicBubble: React.FC<{ m: InboxMessage }> = ({ m }) => {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    (async () => {
      for (const a of m.attachments || []) {
        const u = await signInboxAttachment(a);
        const k = a.storage_object_path || a.url || '';
        if (u && k) setUrls((p) => ({ ...p, [k]: u }));
      }
    })();
  }, [m]);
  return (
    <div className="rounded-lg px-3 py-2 bg-white/5 max-w-[80%]">
      {m.body && <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>}
      {(m.attachments || []).map((a, i) => {
        const k = a.storage_object_path || a.url || '';
        return (
          <a key={k || i} href={urls[k]} target="_blank" rel="noreferrer"
             className="flex items-center gap-1 text-xs text-primary mt-1 underline">
            <Paperclip className="w-3 h-3" /> {a.name || 'attachment'}
          </a>
        );
      })}
      <div className="text-[10px] text-muted-foreground mt-1">{new Date(m.created_at).toLocaleString()}</div>
    </div>
  );
};

export default PublicInboxThreadPage;
