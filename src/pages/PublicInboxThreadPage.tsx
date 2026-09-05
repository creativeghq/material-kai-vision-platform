import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MessageSquare, Send, Loader2, Paperclip, X, UserPlus, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Card } from '@/components/core/ui/card';
import { Textarea } from '@/components/core/ui/textarea';
import { Input } from '@/components/core/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/core/ui/dialog';
import { inboxApi, signInboxAttachment, type InboxMessage } from '@/services/inboxApi';
import { InboxCatalogCards, readInboxCards } from '@/modules/messaging/components/InboxCatalogCards';
import { formatDate } from '@/utils/datetime';

/**
 * Public customer thread (`/i/:token`). Minimal chrome: one thread, reply box,
 * attachment upload. A "Create an account to continue" modal intercepts any attempt to
 * navigate beyond this thread; signup carries the token so the account can adopt the
 * thread via token_claim (the conversion handshake). Anonymous reads go through the
 * service-role token branch of inbox-api (RLS would otherwise hide the thread).
 *
 * READING is link-only; REPLYING is not (#357 AE-12). Possession of the URL proves possession of
 * the URL — a forwarded mail, a quoted reply chain or a shared mailbox hands it to someone who
 * would then be posting as the customer. So the first reply from a browser costs a one-time code
 * sent to the address the link was issued for, and the proof that comes back is kept locally for
 * a few hours. A forwarded link carries no localStorage, which is the whole point.
 */

/** Where this browser keeps its proof for one conversation. Keyed by token: a customer may hold
 *  links to several, and a proof is minted for exactly one. */
const proofKey = (token: string) => `inbox_thread_proof:${token}`;

/** localStorage throws in some privacy modes — a reply must still be possible, via a fresh code. */
function readProof(token: string): string | null {
  try {
    const raw = localStorage.getItem(proofKey(token));
    if (!raw) return null;
    // The proof carries its own expiry in the part before the dot, so nothing else has to be
    // stored or kept in sync.
    const exp = Number(raw.slice(0, raw.indexOf('.')));
    if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) {
      localStorage.removeItem(proofKey(token));
      return null;
    }
    return raw;
  } catch { return null; }
}
function writeProof(token: string, proof: string): void {
  try { localStorage.setItem(proofKey(token), proof); } catch { /* private mode — verify each time */ }
}
function clearProof(token: string): void {
  try { localStorage.removeItem(proofKey(token)); } catch { /* nothing to clear */ }
}
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
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
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

  /** Ask for a code and open the dialog. Also the recovery path when a proof has expired. */
  const startVerification = useCallback(async () => {
    setVerifyError(null);
    setCode('');
    setVerifyOpen(true);
    setVerifyBusy(true);
    try {
      const res = await inboxApi.tokenRequestCode(token);
      setSentTo(res.sent_to);
    } catch (e) {
      setVerifyError((e as Error).message);
    } finally {
      setVerifyBusy(false);
    }
  }, [token]);

  const send = useCallback(async () => {
    if (!draft.trim() && !attachment) return;
    const proof = readProof(token);
    // No proof yet — get one first. The draft is left in the box, so nothing is lost.
    if (!proof) { await startVerification(); return; }

    setSending(true);
    try {
      let attachments;
      if (attachment) {
        const buf = new Uint8Array(await attachment.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
        attachments = [{ filename: attachment.name, content_type: attachment.type || 'application/octet-stream', data_base64: btoa(bin) }];
      }
      await inboxApi.tokenSendMessage({ token, body: draft.trim() || undefined, attachments, sender_proof: proof });
      setDraft('');
      setAttachment(null);
      await load();
    } catch (e) {
      // The server is the authority on whether the proof is still good — a clock skew or a
      // rotated secret both land here, and both are fixed by verifying again rather than by
      // showing the customer an error they cannot act on.
      if ((e as { code?: string }).code === 'sender_verification_required') {
        clearProof(token);
        await startVerification();
        return;
      }
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  }, [draft, attachment, token, load, startVerification]);

  const submitCode = async () => {
    setVerifyBusy(true);
    setVerifyError(null);
    try {
      const res = await inboxApi.tokenVerifyCode(token, code);
      writeProof(token, res.proof);
      setVerifyOpen(false);
      await send();
    } catch (e) {
      setVerifyError((e as Error).message);
    } finally {
      setVerifyBusy(false);
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
        <Button variant="outline" size="sm" onClick={() => setShowConvert(true)}>
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
          <Button onClick={send} disabled={sending || status === 'closed' || (!draft.trim() && !attachment)}>
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      <Dialog open={verifyOpen} onOpenChange={setVerifyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-primary" /> Confirm it is you
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {sentTo
              ? <>We emailed a 6-digit code to <span className="font-medium text-foreground">{sentTo}</span>. Enter it to reply — this browser will remember you for a few hours.</>
              : 'Sending you a code…'}
          </p>
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => { if (e.key === 'Enter' && code.length === 6) submitCode(); }}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            className="text-center text-lg tracking-[0.4em] tabular-nums"
          />
          {verifyError && <p className="text-sm text-red-700 dark:text-red-400">{verifyError}</p>}
          <DialogFooter>
            <Button variant="ghost" onClick={startVerification} disabled={verifyBusy}>Send a new code</Button>
            <Button onClick={submitCode} disabled={verifyBusy || code.length !== 6}>
              {verifyBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Confirm and reply'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showConvert} onOpenChange={setShowConvert}>
        <DialogContent>
          <DialogHeader><DialogTitle>Create an Account to Continue</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            You can keep this conversation and access the full platform by creating a free account.
            Your messages here will be linked to your new account.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConvert(false)}>Not now</Button>
            <Button onClick={() => navigate(`/auth?mode=signup&inbox_token=${encodeURIComponent(token)}&redirect=/inbox`)}>
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
      {/* Products or services the business suggested — the same card the member's transcript shows. */}
      <InboxCatalogCards cards={readInboxCards(m.metadata)} />
      {(m.attachments || []).map((a, i) => {
        const k = a.storage_object_path || a.url || '';
        return (
          <a key={k || i} href={urls[k]} target="_blank" rel="noreferrer"
             className="flex items-center gap-1 text-xs text-primary mt-1 underline">
            <Paperclip className="w-3 h-3" /> {a.name || 'attachment'}
          </a>
        );
      })}
      <div className="text-[10px] text-muted-foreground mt-1">{formatDate(m.created_at, { withTime: true })}</div>
    </div>
  );
};

export default PublicInboxThreadPage;
