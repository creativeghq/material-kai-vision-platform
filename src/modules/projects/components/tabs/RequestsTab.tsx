/**
 * Project requests (WS7 #285) — threaded questions / change requests / approvals.
 *
 * Notifications go out via Flows from the service; nothing here sends anything directly.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, MessageSquare, Send, Trash2, Check, X, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { humanizeLabel } from '@/utils/humanize';
import { statusTone } from '@/utils/statusTone';
import { formatDate } from '@/utils/datetime';
import {
  projectRequestsService, REQUEST_KINDS, REQUEST_STATUSES, REQUEST_CLOSED_STATUSES,
  type ProjectRequestWithMessages, type RequestKind, type RequestStatus,
} from '../../services/projectRequestsService';

export const RequestsTab: React.FC<{ projectId: string; isOwner: boolean }> = ({ projectId, isOwner }) => {
  const { toast } = useToast();
  const [requests, setRequests] = useState<ProjectRequestWithMessages[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    try { setLoading(true); setRequests(await projectRequestsService.list(projectId)); }
    catch (err: any) { toast({ title: 'Failed to load requests', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  }, [projectId, toast]);
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(
    () => requests.filter((r) => showClosed || !REQUEST_CLOSED_STATUSES.includes(r.status)),
    [requests, showClosed],
  );
  const openCount = requests.filter((r) => !REQUEST_CLOSED_STATUSES.includes(r.status)).length;

  const send = async (request: ProjectRequestWithMessages) => {
    if (!reply.trim()) return;
    setSending(true);
    try {
      // isOwner distinguishes a team reply (which notifies the raiser) from a client's own reply.
      await projectRequestsService.addMessage(request, reply.trim(), !isOwner);
      if (isOwner && request.status === 'open') {
        await projectRequestsService.setStatus(request, 'answered');
      }
      setReply('');
      await load();
    } catch (err: any) {
      toast({ title: 'Could not send', description: err?.message, variant: 'destructive' });
    } finally { setSending(false); }
  };

  const setStatus = async (request: ProjectRequestWithMessages, status: RequestStatus) => {
    try { await projectRequestsService.setStatus(request, status); await load(); }
    catch (err: any) { toast({ title: 'Failed to update', description: err?.message, variant: 'destructive' }); }
  };

  const decide = async (request: ProjectRequestWithMessages, decision: 'approved' | 'declined') => {
    try { await projectRequestsService.setApproval(request, decision); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
  };

  const remove = async (request: ProjectRequestWithMessages) => {
    if (!confirm('Delete this request and its replies?')) return;
    try { await projectRequestsService.remove(request.id); await load(); }
    catch (err: any) { toast({ title: 'Failed to delete', description: err?.message, variant: 'destructive' }); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <Card className="dashboard-card">
      <CardHeader className="border-b border-hairline px-5 py-3 flex-row items-center justify-between space-y-0 gap-3 flex-wrap">
        <div>
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <MessageSquare className="h-4 w-4 text-primary" /> Requests
          </CardTitle>
          <p className="text-xs text-muted-foreground">{openCount} open of {requests.length}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Checkbox checked={showClosed} onCheckedChange={(v) => setShowClosed(!!v)} /> Show closed
          </label>
          <Button size="sm" className="rounded-full" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Raise request
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {visible.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            {requests.length === 0 ? 'No requests yet.' : 'Nothing open — tick "Show closed" to see the rest.'}
          </p>
        ) : (
          <div className="divide-y divide-hairline">
            {visible.map((r) => {
              const expanded = openId === r.id;
              return (
                <div key={r.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => { setOpenId(expanded ? null : r.id); setReply(''); }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{r.title}</p>
                        <span className="text-[11px] text-muted-foreground">{humanizeLabel(r.kind)}</span>
                        {r.approval_decision && (
                          <span className={`text-[11px] ${r.approval_decision === 'approved' ? 'text-emerald-400' : 'text-destructive'}`}>
                            {humanizeLabel(r.approval_decision)}
                          </span>
                        )}
                        {!r.client_visible && <span className="text-[11px] text-muted-foreground">· internal</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {r.raised_by_name || 'Someone'} · {formatDate(r.created_at)}
                        {r.messages.length > 0 && ` · ${r.messages.length} repl${r.messages.length === 1 ? 'y' : 'ies'}`}
                      </p>
                    </button>
                    <div className="flex shrink-0 items-center gap-2">
                      {isOwner ? (
                        <select
                          className="h-8 rounded-md border border-border/60 bg-background px-2 text-xs"
                          value={r.status} onChange={(e) => setStatus(r, e.target.value as RequestStatus)}
                        >
                          {REQUEST_STATUSES.map((s) => <option key={s} value={s}>{humanizeLabel(s)}</option>)}
                        </select>
                      ) : (
                        <span className={`text-xs ${statusTone(r.status)}`}>{humanizeLabel(r.status)}</span>
                      )}
                      {isOwner && (
                        <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => remove(r)}>
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {expanded && (
                    <div className="mt-3 space-y-3 pl-1">
                      {r.body && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{r.body}</p>}

                      {r.messages.length > 0 && (
                        <div className="space-y-2">
                          {r.messages.map((m) => (
                            <div key={m.id} className={`rounded-md border border-white/10 p-3 ${m.is_from_client ? '' : 'bg-white/5'}`}>
                              <p className="text-[11px] text-muted-foreground">
                                {m.author_name || (m.is_from_client ? 'Client' : 'Team')} · {formatDate(m.created_at, { withTime: true })}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap text-sm">{m.body}</p>
                            </div>
                          ))}
                        </div>
                      )}

                      {isOwner && r.kind === 'approval_request' && !r.approval_decision && (
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" className="rounded-full" onClick={() => decide(r, 'approved')}>
                            <Check className="h-3.5 w-3.5 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" className="rounded-full" onClick={() => decide(r, 'declined')}>
                            <X className="h-3.5 w-3.5 mr-1" /> Decline
                          </Button>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Input
                          value={reply} onChange={(e) => setReply(e.target.value)}
                          placeholder="Write a reply…"
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(r); } }}
                        />
                        <Button size="sm" className="rounded-full" onClick={() => send(r)} disabled={sending || !reply.trim()}>
                          {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {creating && (
        <NewRequestDialog
          projectId={projectId} isOwner={isOwner}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); void load(); }}
        />
      )}
    </Card>
  );
};

// ---------------------------------------------------------------------------

const NewRequestDialog: React.FC<{
  projectId: string; isOwner: boolean; onClose: () => void; onSaved: () => void;
}> = ({ projectId, isOwner, onClose, onSaved }) => {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [kind, setKind] = useState<RequestKind>('question');
  const [clientVisible, setClientVisible] = useState(true);
  const [saving, setSaving] = useState(false);

  // A collaborator cannot open an approval request — the DB insert policy refuses it, so it is
  // not offered either.
  const kinds = isOwner ? REQUEST_KINDS : REQUEST_KINDS.filter((k) => k !== 'approval_request');

  const save = async () => {
    if (!title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await projectRequestsService.create({
        project_id: projectId,
        title: title.trim(),
        body: body.trim() || null,
        kind,
        client_visible: isOwner ? clientVisible : true,
      });
      onSaved();
    } catch (err: any) {
      toast({ title: 'Failed to raise request', description: err?.message, variant: 'destructive' });
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Raise a request</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What do you need?" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Details</Label>
            <textarea
              className="min-h-24 w-full rounded-md border border-border/60 bg-background p-2 text-sm"
              value={body} onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <select className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
              value={kind} onChange={(e) => setKind(e.target.value as RequestKind)}>
              {kinds.map((k) => <option key={k} value={k}>{humanizeLabel(k)}</option>)}
            </select>
          </div>
          {isOwner && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={clientVisible} onCheckedChange={(v) => setClientVisible(!!v)} />
              {clientVisible
                ? <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> Visible to the client</span>
                : <span className="flex items-center gap-1"><EyeOff className="h-3.5 w-3.5" /> Internal only</span>}
            </label>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" className="rounded-full" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Raise request'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RequestsTab;
