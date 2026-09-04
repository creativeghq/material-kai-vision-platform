/**
 * Project requests (WS7 #285) — threaded questions / change requests / approvals.
 *
 * Notifications go out via Flows from the service; nothing here sends anything directly.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, MessageSquare, Send, Trash2, Check, X, Eye, EyeOff, FileText, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { humanizeLabel } from '@/utils/humanize';
import { statusTone } from '@/utils/statusTone';
import { formatDate, todayLocalISO } from '@/utils/datetime';
import {
  projectRequestsService, REQUEST_KINDS, REQUEST_STATUSES, REQUEST_CLOSED_STATUSES,
  REVIEW_DECISIONS, CLOSING_REVIEW_DECISIONS, isTeamFacing, type ReviewDecision,
  type ProjectRequestWithMessages, type RequestKind, type RequestStatus, type SimilarRequest,
} from '../../services/projectRequestsService';
import {
  projectDocumentsService, type ProjectDocumentWithRevisions,
} from '../../services/projectDocumentsService';

export const RequestsTab: React.FC<{
  projectId: string;
  isOwner: boolean;
  /** `?request=` from the notification's action_url — the thread to open on arrival. */
  focusRequestId?: string | null;
}> = ({ projectId, isOwner, focusRequestId }) => {
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

  // The four project_request_* notifications link to one thread by id. Opening it (and
  // un-hiding it when it has since been closed) is what makes that link land on the thing
  // it names rather than on a list the reader has to search.
  useEffect(() => {
    if (!focusRequestId) return;
    const target = requests.find((r) => r.id === focusRequestId);
    if (!target) return;
    setOpenId(focusRequestId);
    if (REQUEST_CLOSED_STATUSES.includes(target.status)) setShowClosed(true);
  }, [focusRequestId, requests]);

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

  const review = async (request: ProjectRequestWithMessages, decision: ReviewDecision) => {
    try {
      await projectRequestsService.setReviewDecision(request, decision);
      await load();
      toast({
        title: humanizeLabel(decision),
        description: CLOSING_REVIEW_DECISIONS.includes(decision)
          ? `${request.reference ?? 'The submittal'} is closed.`
          : `${request.reference ?? 'The submittal'} stays open for the next revision.`,
      });
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    }
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
          <Button size="sm" onClick={() => setCreating(true)}>
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
                <div
                  key={r.id}
                  ref={(el) => { if (el && expanded && r.id === focusRequestId) el.scrollIntoView({ block: 'center' }); }}
                  className="p-4"
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => { setOpenId(expanded ? null : r.id); setReply(''); }}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {/* The register number, when it has one. Team-facing kinds are numbered
                            because an RFI has to mean the same thing to the architect who never
                            logs in here; a client question does not. */}
                        {r.reference && (
                          <span className="font-mono text-xs tabular-nums text-muted-foreground">{r.reference}</span>
                        )}
                        <p className="font-medium">{r.title}</p>
                        <span className="text-[11px] text-muted-foreground">{humanizeLabel(r.kind)}</span>
                        {r.revision > 0 && (
                          <span className="text-[11px] text-muted-foreground">rev {r.revision}</span>
                        )}
                        {r.review_decision && (
                          <Badge variant={
                            r.review_decision === 'rejected' ? 'error'
                              : r.review_decision === 'revise_and_resubmit' ? 'warning' : 'success'
                          }>
                            {humanizeLabel(r.review_decision)}
                          </Badge>
                        )}
                        {r.approval_decision && (
                          <span className={`text-[11px] ${r.approval_decision === 'approved' ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>
                            {humanizeLabel(r.approval_decision)}
                          </span>
                        )}
                        {!r.client_visible && <span className="text-[11px] text-muted-foreground">· internal</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {r.raised_by_name || 'Someone'} · {formatDate(r.created_at)}
                        {r.messages.length > 0 && ` · ${r.messages.length} repl${r.messages.length === 1 ? 'y' : 'ies'}`}
                      </p>
                      {/* The sheet the question is about. `is_current` is the load-bearing half:
                          an answer given against a superseded drawing may be an answer about the
                          wrong drawing, and the reader can only know that if we say so. */}
                      {r.drawing && (
                        <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="font-mono tabular-nums">
                            {r.drawing.drawing_number || r.drawing.title}
                          </span>
                          <span>rev {r.drawing.rev_label}</span>
                          {!r.drawing.is_current && (
                            <span className="flex items-center gap-1 text-amber-800 dark:text-amber-400">
                              <AlertTriangle className="h-3 w-3" /> superseded since
                            </span>
                          )}
                        </p>
                      )}
                      {r.due_at && (
                        /* Overdue is a fact about an unanswered request, so it is only said while
                           one is still open — a resolved RFI that was late is history, not a task. */
                        <p className={`text-xs ${
                          !REQUEST_CLOSED_STATUSES.includes(r.status) && r.due_at < todayLocalISO()
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                        }`}>
                          {!REQUEST_CLOSED_STATUSES.includes(r.status) && r.due_at < todayLocalISO()
                            ? `Answer was needed by ${formatDate(r.due_at)}`
                            : `Answer needed by ${formatDate(r.due_at)}`}
                        </p>
                      )}
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
                          <Button size="sm" variant="outline" onClick={() => decide(r, 'approved')}>
                            <Check className="h-3.5 w-3.5 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => decide(r, 'declined')}>
                            <X className="h-3.5 w-3.5 mr-1" /> Decline
                          </Button>
                        </div>
                      )}

                      {/* A submittal is closed by RECORDING THE VERDICT, never by the status
                          dropdown: the database refuses a resolved submittal with no decision, and
                          the verdict is the only thing anybody needs from it later — whether the
                          thing may be installed. `revise_and_resubmit` reopens and bumps the
                          revision rather than closing, which is the state worth chasing. */}
                      {isOwner && r.kind === 'submittal' && (
                        <div className="flex flex-wrap gap-2">
                          {REVIEW_DECISIONS.map((d) => (
                            <Button
                              key={d}
                              size="sm"
                              variant={r.review_decision === d ? 'secondary' : 'outline'}
                              onClick={() => void review(r, d)}
                            >
                              {humanizeLabel(d)}
                            </Button>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Input
                          value={reply} onChange={(e) => setReply(e.target.value)}
                          placeholder="Write a reply…"
                          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(r); } }}
                        />
                        <Button size="sm" onClick={() => send(r)} disabled={sending || !reply.trim()}>
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
  const [dueAt, setDueAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [revisionId, setRevisionId] = useState('');
  const [docs, setDocs] = useState<ProjectDocumentWithRevisions[]>([]);
  const [similar, setSimilar] = useState<SimilarRequest[]>([]);
  const [dismissed, setDismissed] = useState(false);

  // The drawing register, for the citation picker. Best-effort: a project with no drawings, or a
  // failed read, simply does not offer one — it must never stop somebody raising the question.
  useEffect(() => {
    let alive = true;
    projectDocumentsService.list(projectId)
      .then((d) => { if (alive) setDocs(d); })
      .catch(() => { if (alive) setDocs([]); });
    return () => { alive = false; };
  }, [projectId]);

  /**
   * Look for the same question already on the register, as the title is typed.
   *
   * Debounced, and only once there is enough of a title to mean anything — running on every
   * keystroke would rank against two characters and show five unrelated hits, which trains people
   * to ignore the panel entirely. It is advisory: nothing here can stop the save.
   */
  useEffect(() => {
    const q = title.trim();
    if (q.length < 6) { setSimilar([]); return; }
    let alive = true;
    const t = setTimeout(() => {
      void projectRequestsService.findSimilar(projectId, q, revisionId || null)
        .then((rows) => { if (alive) setSimilar(rows); });
    }, 400);
    return () => { alive = false; clearTimeout(t); };
  }, [projectId, title, revisionId]);

  // A collaborator cannot open an approval request — the DB insert policy refuses it, so it is
  // not offered either. RFIs and submittals are withheld from them for a different reason: those
  // go UP to the design team on the project's behalf, and a client raising one would put a
  // numbered commitment into the register that nobody on the team agreed to.
  const kinds = isOwner
    ? REQUEST_KINDS
    : REQUEST_KINDS.filter((k) => k !== 'approval_request' && !isTeamFacing(k));

  const teamFacing = isTeamFacing(kind);

  const save = async () => {
    if (!title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await projectRequestsService.create({
        project_id: projectId,
        title: title.trim(),
        body: body.trim() || null,
        kind,
        // A team-facing request is internal by default and the checkbox is not offered for it —
        // an RFI is a question about a problem in the architect's information, and publishing the
        // project's open problems to the customer is not what raising one means.
        client_visible: teamFacing ? false : (isOwner ? clientVisible : true),
        due_at: dueAt || null,
        drawing_revision_id: revisionId || null,
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

          {/* The sheet the question is about. Offered only when the register has one — an empty
              picker is a control that teaches people it does nothing. */}
          {docs.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs">About which drawing</Label>
              <select
                className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
                value={revisionId} onChange={(e) => setRevisionId(e.target.value)}
              >
                <option value="">Not about a specific drawing</option>
                {docs.map((d) => (
                  <optgroup key={d.id} label={`${d.drawing_number ? `${d.drawing_number} — ` : ''}${d.title}`}>
                    {/* Every issue, not just the current one: a question is asked against the sheet
                        in somebody's hand, which on site is regularly not the latest. */}
                    {(d.revisions || []).map((rev) => (
                      <option key={rev.id} value={rev.id}>
                        rev {rev.rev_label}{rev.is_current ? ' (current)' : ' — superseded'}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          )}

          {/* Already asked? Advisory, dismissible, and never in the way of the button. The commonest
              real duplicate is the same problem in different words by someone holding the same
              sheet, which is why naming a drawing widens the search rather than narrowing it. */}
          {similar.length > 0 && !dismissed && (
            <div className="rounded-md border border-amber-800/30 bg-amber-500/[0.08] p-3 dark:border-amber-400/25">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-800 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-amber-900 dark:text-amber-300">
                    {similar.length === 1 ? 'This may already have been asked' : 'These may already have been asked'}
                  </p>
                  <ul className="mt-2 space-y-2">
                    {similar.map((h) => (
                      <li key={h.id} className="text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {h.reference && (
                            <span className="font-mono tabular-nums text-muted-foreground">{h.reference}</span>
                          )}
                          <span className="font-medium">{h.title}</span>
                          <span className={statusTone(h.status)}>{humanizeLabel(h.status)}</span>
                          {h.same_drawing && h.drawing_number && (
                            <span className="text-muted-foreground">· {h.drawing_number} rev {h.rev_label}</span>
                          )}
                        </div>
                        {/* On a resolved hit the last reply IS the answer being asked for again,
                            so it is shown here rather than behind a click. */}
                        {h.last_answer && (
                          <p className="mt-0.5 line-clamp-2 text-muted-foreground">{h.last_answer}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="mt-2 text-xs underline text-muted-foreground hover:text-foreground"
                    onClick={() => setDismissed(true)}
                  >
                    Mine is a different question
                  </button>
                </div>
              </div>
            </div>
          )}
          {teamFacing && (
            <div className="space-y-1">
              <Label className="text-xs">Answer needed by</Label>
              <Input type="date" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
              <p className="text-[11px] text-muted-foreground">
                Optional, but it is what turns this from a question into something somebody can be
                late on. {kind === 'rfi' ? 'The number is assigned when you raise it.' : ''}
              </p>
            </div>
          )}
          {isOwner && !teamFacing && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={clientVisible} onCheckedChange={(v) => setClientVisible(!!v)} />
              {clientVisible
                ? <span className="flex items-center gap-1"><Eye className="h-3.5 w-3.5" /> Visible to the client</span>
                : <span className="flex items-center gap-1"><EyeOff className="h-3.5 w-3.5" /> Internal only</span>}
            </label>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Raise request'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default RequestsTab;
