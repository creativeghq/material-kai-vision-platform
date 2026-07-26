import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Send, Mail, Users, AlertCircle, CheckCircle2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { catalogsService, type PresentationCatalog } from '@/services/catalogsService';
import { crmCategoriesService, type CrmCategorySummary, type ResolvedRecipient } from '@/services/crmCategoriesService';
import { getErrorMessage } from '@/core/errors/utils';
import { useConnectEmailGate } from '@/modules/email/hooks/useConnectEmailGate';

interface Props {
  open: boolean;
  onClose: () => void;
  catalog: PresentationCatalog;
  onSent?: (sendBatchId: string) => void;
}

export const SendToCustomersModal: React.FC<Props> = ({ open, onClose, catalog, onSent }) => {
  const { toast } = useToast();
  const { handleEmailSendError, connectEmailGate } = useConnectEmailGate();
  const [categories, setCategories] = useState<CrmCategorySummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingCats, setLoadingCats] = useState(true);

  const [recipients, setRecipients] = useState<ResolvedRecipient[]>([]);
  const [previewing, setPreviewing] = useState(false);

  const [subject, setSubject] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [ensureGrants, setEnsureGrants] = useState(true);

  const [sending, setSending] = useState(false);
  const [sentResult, setSentResult] = useState<{ sent: number; failed: number; batchId: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setSubject(`${catalog.title} — new catalog`);
    setMessageBody('');
    setSelectedIds(new Set());
    setRecipients([]);
    setSentResult(null);
    (async () => {
      try {
        setLoadingCats(true);
        const list = await crmCategoriesService.list();
        setCategories(list.filter((c) => c.is_active));
      } catch (err) {
        toast({ title: 'Error', description: getErrorMessage(err), variant: 'destructive' });
      } finally { setLoadingCats(false); }
    })();
  }, [open, catalog.title, toast]);

  const refreshPreview = useCallback(async (categoryIds: string[]) => {
    if (categoryIds.length === 0) {
      setRecipients([]);
      return;
    }
    setPreviewing(true);
    try {
      const res = await crmCategoriesService.resolveRecipients(catalog.workspace_id, categoryIds);
      setRecipients(res);
    } catch (err) {
      toast({ title: 'Preview failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setPreviewing(false); }
  }, [toast]);

  const toggleCategory = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
    refreshPreview([...next]);
  };

  const grouped = useMemo(() => {
    const out = { manual: [] as CrmCategorySummary[], professional_type: [] as CrmCategorySummary[], role: [] as CrmCategorySummary[] };
    // Only these three kinds are rendered here; other kinds (industry, lead_status,
    // lead_source — pick-one vocabularies, not memberships) are intentionally skipped.
    for (const c of categories) out[c.kind as keyof typeof out]?.push(c);
    return out;
  }, [categories]);

  const handleSend = async () => {
    if (recipients.length === 0) {
      toast({ title: 'No recipients', description: 'Pick at least one category that contains members with email addresses.', variant: 'destructive' });
      return;
    }
    if (!subject.trim()) {
      toast({ title: 'Subject required', variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const res = await catalogsService.dispatchSend({
        catalogId: catalog.id,
        categoryIds: [...selectedIds],
        subject: subject.trim(),
        messageBody: messageBody.trim() || undefined,
        ensureGrants,
      });
      setSentResult({ sent: res.sent_count, failed: res.failed_count, batchId: res.send_batch_id });
      toast({ title: `Sent to ${res.sent_count} recipients`, description: res.failed_count > 0 ? `${res.failed_count} failed.` : undefined });
      if (onSent) onSent(res.send_batch_id);
    } catch (err) {
      if (await handleEmailSendError(err, { workspaceId: catalog.workspace_id, feature: 'catalog' })) return;
      toast({ title: 'Send failed', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setSending(false); }
  };

  const canSend = catalog.status === 'published' && recipients.length > 0 && subject.trim().length > 0;

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && !sending && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-4 w-4 text-primary" /> Send "{catalog.title}" to customers
          </DialogTitle>
        </DialogHeader>

        {catalog.status !== 'published' && (
          <div className="rounded border border-yellow-500/30 bg-yellow-500/10 p-3 text-sm flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-medium">Catalog not published</div>
              <div className="text-xs text-muted-foreground">Recipients open the catalog at <code>/c/&lt;slug&gt;</code> behind the email-gate. Publish the catalog first, then send.</div>
            </div>
          </div>
        )}

        {sentResult ? (
          <div className="space-y-3">
            <div className="rounded border border-green-500/30 bg-green-500/10 p-4 flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />
              <div>
                <div className="font-medium">Sent</div>
                <div className="text-sm text-muted-foreground">
                  {sentResult.sent} delivered{sentResult.failed > 0 ? ` · ${sentResult.failed} failed` : ''}.
                  Batch <code className="text-xs">{sentResult.batchId.slice(0, 8)}…</code> tracked under the Sends tab.
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={onClose}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="overflow-y-auto pr-1 space-y-4 flex-1">
              {/* Categories picker */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><Users className="h-3 w-3" /> Pick categories</Label>
                {loadingCats ? (
                  <div className="flex items-center gap-2 py-4 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading categories…</div>
                ) : (
                  <div className="space-y-3">
                    {(['manual', 'professional_type'] as const).map((kind) => {
                      const list = grouped[kind];
                      if (list.length === 0) return null;
                      return (
                        <div key={kind} className="space-y-1">
                          <div className="text-xs uppercase tracking-wide text-muted-foreground">
                            {kind === 'manual' ? 'Custom' : 'Professional type'}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {list.map((c) => {
                              const active = selectedIds.has(c.id);
                              const empty = c.total_count === 0;
                              return (
                                <button
                                  key={c.id}
                                  onClick={() => !empty && toggleCategory(c.id)}
                                  disabled={empty}
                                  className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 transition border ${
                                    active ? 'bg-primary text-primary-foreground border-primary' :
                                    empty ? 'opacity-40 cursor-not-allowed border-border' :
                                    'border-border hover:border-primary/50'
                                  }`}
                                  title={empty ? 'No members' : undefined}
                                >
                                  {c.color_hex && <span className="w-2 h-2 rounded-full" style={{ background: c.color_hex }} />}
                                  {c.name}
                                  <Badge variant="outline" className="text-[10px] py-0 ml-1">{c.total_count}</Badge>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recipient preview */}
              {selectedIds.size > 0 && (
                <div className="rounded border p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="font-medium flex items-center gap-2">
                      <Mail className="h-3 w-3" />
                      {previewing ? 'Resolving…' : `${recipients.length} unique recipient${recipients.length === 1 ? '' : 's'}`}
                    </div>
                    {previewing && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                  </div>
                  {recipients.length > 0 && (
                    <div className="text-xs text-muted-foreground max-h-32 overflow-y-auto space-y-0.5">
                      {recipients.slice(0, 30).map((r) => (
                        <div key={r.email} className="flex items-center gap-2">
                          <span className="font-mono">{r.email}</span>
                          {r.display_name && <span>· {r.display_name}</span>}
                          <span className="ml-auto text-[10px] capitalize text-muted-foreground">{r.member_kind}</span>
                        </div>
                      ))}
                      {recipients.length > 30 && <div className="italic">…and {recipients.length - 30} more</div>}
                    </div>
                  )}
                </div>
              )}

              {/* Subject + message */}
              <div className="space-y-2">
                <Label>Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Personal message (optional)</Label>
                <Textarea
                  value={messageBody}
                  onChange={(e) => setMessageBody(e.target.value)}
                  rows={3}
                  placeholder="Add a short note that appears at the top of the email."
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  id="ensure-grants"
                  type="checkbox"
                  checked={ensureGrants}
                  onChange={(e) => setEnsureGrants(e.target.checked)}
                />
                <Label htmlFor="ensure-grants" className="cursor-pointer text-xs">
                  Auto-grant gate access — every recipient gets a row in the email allowlist so the gate accepts them on first visit. Recommended.
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
              <Button onClick={handleSend} disabled={sending || !canSend}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                Send to {recipients.length} recipient{recipients.length === 1 ? '' : 's'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
    {connectEmailGate}
    </>
  );
};
