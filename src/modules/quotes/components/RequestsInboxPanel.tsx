/**
 * master-request inbox, rendered as a tab inside the Quotes page (`/quotes?tab=requests`).
 * Procurement quotes routed up from child nodes land here; the parent prices + returns them,
 * or escalates upward. Also shows the requests this workspace has sent up. Network-node only —
 * the tab that mounts this is gated on `network.manage`, and we re-check here as a safety net.
 *
 * line-level upstream RFQ: each request expands to its individual lines so the
 * owner prices/declines per line and the requester folds the returned costs back into the quote.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, Loader2, ArrowRight, ArrowUpCircle, CheckCircle2, XCircle, Send, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { masterRequestsService, type MasterRequest, type MasterRequestLine } from '@/services/masterRequestsService';

const money = (n: number | null, c: string | null) =>
  n == null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: c || 'EUR' }).format(n);

const TONE: Record<string, string> = {
  new: 'text-blue-400',
  in_review: 'text-amber-400',
  priced: 'text-emerald-400',
  escalated: 'text-purple-400',
  cancelled: 'text-muted-foreground',
};

export const RequestsInboxPanel: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { activeWorkspaceId } = useWorkspace();
  const { can } = usePermissions();
  const [incoming, setIncoming] = useState<MasterRequest[]>([]);
  const [mine, setMine] = useState<MasterRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  // per-request expand + lazy-loaded lines, per-line cost drafts + busy, per-request save-back.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [linesById, setLinesById] = useState<Record<string, MasterRequestLine[]>>({});
  const [linesLoading, setLinesLoading] = useState<Record<string, boolean>>({});
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [lineBusy, setLineBusy] = useState<string | null>(null);
  const [saveBack, setSaveBack] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    try {
      setLoading(true);
      const [inbox, sent] = await Promise.all([
        masterRequestsService.listInbox(activeWorkspaceId),
        masterRequestsService.listMine(activeWorkspaceId),
      ]);
      setIncoming(inbox);
      setMine(sent);
    } catch (err: any) {
      toast({ title: 'Failed to load requests', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, toast]);
  useEffect(() => { load(); }, [load]);

  const loadLines = useCallback(async (requestId: string): Promise<MasterRequestLine[]> => {
    setLinesLoading((s) => ({ ...s, [requestId]: true }));
    try {
      const lines = await masterRequestsService.listLines(requestId);
      setLinesById((s) => ({ ...s, [requestId]: lines }));
      return lines;
    } catch (err: any) {
      toast({ title: 'Failed to load lines', description: err?.message, variant: 'destructive' });
      return [];
    } finally {
      setLinesLoading((s) => ({ ...s, [requestId]: false }));
    }
  }, [toast]);
  // Notifying the requester when the owner finishes is handled server-side by the
  // _notify_rfq_lifecycle DB trigger (master_requests → 'priced') — no client emit needed.

  const toggleExpand = useCallback((requestId: string) => {
    setExpanded((s) => {
      const next = !s[requestId];
      if (next && !linesById[requestId] && !linesLoading[requestId]) void loadLines(requestId);
      return { ...s, [requestId]: next };
    });
  }, [linesById, linesLoading, loadLines]);

  const returnPriced = async (r: MasterRequest) => {
    setBusy(r.id);
    try { await masterRequestsService.returnPriced(r.id); toast({ title: 'Returned to requester as priced' }); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const escalate = async (r: MasterRequest) => {
    setBusy(r.id);
    try { await masterRequestsService.escalate(r.id); toast({ title: 'Escalated to your parent node' }); await load(); }
    catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  const priceLine = async (requestId: string, line: MasterRequestLine) => {
    const draft = costDrafts[line.id] ?? '';
    const n = Number(draft);
    if (draft.trim() === '' || Number.isNaN(n) || n < 0) return;
    setLineBusy(line.id);
    try {
      await masterRequestsService.priceLine(line.id, n);
      await loadLines(requestId);
      await load();
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setLineBusy(null); }
  };
  const declineLine = async (requestId: string, line: MasterRequestLine) => {
    setLineBusy(line.id);
    try {
      await masterRequestsService.declineLine(line.id);
      await loadLines(requestId);
      await load();
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setLineBusy(null); }
  };
  const applyPrices = async (r: MasterRequest) => {
    setBusy(r.id);
    try {
      const count = await masterRequestsService.applyPrices(r.id, !!saveBack[r.id]);
      toast({ title: `Applied ${count} price${count === 1 ? '' : 's'}` });
      await load();
    } catch (err: any) { toast({ title: 'Failed', description: err?.message, variant: 'destructive' }); }
    finally { setBusy(null); }
  };

  if (!can('network.manage')) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-muted-foreground">
          This area is for workspaces that manage a downstream network.
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  const renderLinesLoading = () => (
    <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3"><CardTitle className="flex items-center gap-2"><Inbox className="h-4 w-4" /> Incoming ({incoming.filter((r) => r.status === 'new' || r.status === 'in_review').length})</CardTitle></CardHeader>
        <CardContent className="p-0">
          {incoming.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">No requests from your network yet.</div>
          ) : (
            <div className="divide-y divide-border/40">
              {incoming.map((r) => {
                const isOpen = !!expanded[r.id];
                const lines = linesById[r.id];
                return (
                  <div key={r.id}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toggleExpand(r.id)} title={isOpen ? 'Collapse' : 'Expand lines'}>
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{r.requester?.name ?? 'Child workspace'}</span>
                          <span className="text-xs text-muted-foreground">{r.quote?.quote_number || r.quote?.name || `Quote ${r.quote_id.slice(0, 8)}`}</span>
                          <span className={`text-[10px] capitalize ${TONE[r.status] || 'text-muted-foreground'}`}>{r.status.replace('_', ' ')}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">{money(r.amount, r.currency)} · {new Date(r.created_at).toLocaleDateString()}</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => navigate(`/admin/quotes/${r.quote_id}`)} title="Open quote"><ArrowRight className="h-4 w-4" /></Button>
                      {(r.status === 'new' || r.status === 'in_review') && (
                        <>
                          <Button size="sm" variant="outline" disabled={busy === r.id} onClick={() => returnPriced(r)}>
                            {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Return priced</>}
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => escalate(r)} title="Escalate to your parent"><ArrowUpCircle className="h-4 w-4" /></Button>
                        </>
                      )}
                    </div>
                    {isOpen && (
                      <div className="bg-muted/20 px-4 pb-3">
                        {linesLoading[r.id] && !lines ? renderLinesLoading() : (lines && lines.length === 0) ? (
                          <div className="py-4 text-center text-xs text-muted-foreground">No lines on this request.</div>
                        ) : lines ? (
                          <div className="divide-y divide-border/40 rounded-md border border-border/40">
                            {lines.map((line) => {
                              const draft = costDrafts[line.id] ?? '';
                              const n = Number(draft);
                              const invalid = draft.trim() === '' || Number.isNaN(n) || n < 0;
                              return (
                                <div key={line.id} className="flex items-center gap-3 px-3 py-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-medium truncate">{line.product?.name || 'Product'}</span>
                                      {line.product?.sku && <span className="text-[10px] text-muted-foreground">{line.product.sku}</span>}
                                      <span className="text-[10px] text-muted-foreground">× {line.quantity}</span>
                                    </div>
                                  </div>
                                  {line.status === 'pending' && (
                                    <div className="flex items-center gap-2">
                                      <Input
                                        type="number"
                                        min={0}
                                        step="any"
                                        placeholder="Unit cost"
                                        value={draft}
                                        onChange={(e) => setCostDrafts((s) => ({ ...s, [line.id]: e.target.value }))}
                                        className="h-7 w-24 text-xs"
                                      />
                                      <Button size="sm" className="h-7 text-xs" disabled={invalid || lineBusy === line.id} onClick={() => priceLine(r.id, line)}>
                                        {lineBusy === line.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Price'}
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={lineBusy === line.id} onClick={() => declineLine(r.id, line)}>Decline</Button>
                                    </div>
                                  )}
                                  {line.status === 'priced' && (
                                    <span className="flex items-center gap-1 text-xs text-emerald-300">
                                      <CheckCircle2 className="h-3.5 w-3.5" /> {money(line.priced_unit_cost, line.priced_currency)}
                                    </span>
                                  )}
                                  {line.status === 'declined' && (
                                    <span className="text-[10px] text-muted-foreground">
                                      Declined{line.decline_reason ? ` · ${line.decline_reason}` : ''}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : renderLinesLoading()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3"><CardTitle className="flex items-center gap-2"><Send className="h-4 w-4" /> Sent upward</CardTitle></CardHeader>
        <CardContent className="p-0">
          {mine.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">You haven’t submitted any procurement requests.</div>
          ) : (
            <div className="divide-y divide-border/40">
              {mine.map((r) => {
                const isOpen = !!expanded[r.id];
                const lines = linesById[r.id];
                return (
                  <div key={r.id}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => toggleExpand(r.id)} title={isOpen ? 'Collapse' : 'Expand lines'}>
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </Button>
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{r.quote?.quote_number || r.quote?.name || `Quote ${r.quote_id.slice(0, 8)}`}</span>
                        <div className="text-xs text-muted-foreground">{money(r.amount, r.currency)} · {new Date(r.created_at).toLocaleDateString()}</div>
                      </div>
                      {(r.status === 'priced' || (linesById[r.id]?.some((l) => l.status === 'priced'))) && (
                        <>
                          <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                            <Checkbox
                              className="h-3 w-3 accent-primary"
                              checked={!!saveBack[r.id]}
                              onCheckedChange={(v) => setSaveBack((s) => ({ ...s, [r.id]: v === true }))}
                             />
                            Save to catalog
                          </label>
                          <Button size="sm" disabled={busy === r.id} onClick={() => applyPrices(r)}>
                            {busy === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Apply to quote'}
                          </Button>
                        </>
                      )}
                      <span className={`text-[10px] capitalize ${TONE[r.status] || 'text-muted-foreground'}`}>{r.status.replace('_', ' ')}</span>
                    </div>
                    {isOpen && (
                      <div className="bg-muted/20 px-4 pb-3">
                        {linesLoading[r.id] && !lines ? renderLinesLoading() : (lines && lines.length === 0) ? (
                          <div className="py-4 text-center text-xs text-muted-foreground">No lines on this request.</div>
                        ) : lines ? (
                          <div className="divide-y divide-border/40 rounded-md border border-border/40">
                            {lines.map((line) => (
                              <div key={line.id} className="flex items-center gap-3 px-3 py-2">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs font-medium truncate">{line.product?.name || 'Product'}</span>
                                    {line.product?.sku && <span className="text-[10px] text-muted-foreground">{line.product.sku}</span>}
                                    <span className="text-[10px] text-muted-foreground">× {line.quantity}</span>
                                  </div>
                                </div>
                                {line.status === 'priced' ? (
                                  <span className="flex items-center gap-1 text-xs text-emerald-300">
                                    <CheckCircle2 className="h-3.5 w-3.5" /> {money(line.priced_unit_cost, line.priced_currency)}
                                  </span>
                                ) : line.status === 'declined' ? (
                                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                    <XCircle className="h-3.5 w-3.5" /> Declined{line.decline_reason ? ` · ${line.decline_reason}` : ''}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">Awaiting</span>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : renderLinesLoading()}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default RequestsInboxPanel;
