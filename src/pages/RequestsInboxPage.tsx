/**
 * #177 — master-request parent inbox (`/requests`). Procurement quotes routed up from
 * child nodes land here; the parent prices + returns them, or escalates upward. Also
 * shows the requests this workspace has sent up. Gated on `network.manage`.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Inbox, Loader2, ArrowRight, ArrowUpCircle, CheckCircle2, Send } from 'lucide-react';
import { GlobalAdminHeader } from '@/components/Admin/GlobalAdminHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { masterRequestsService, type MasterRequest } from '@/services/masterRequestsService';

const money = (n: number | null, c: string | null) =>
  n == null ? '—' : new Intl.NumberFormat(undefined, { style: 'currency', currency: c || 'EUR' }).format(n);

const TONE: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  in_review: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  priced: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  escalated: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

const RequestsInboxPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { activeWorkspaceId } = useWorkspace();
  const { can } = usePermissions();
  const [incoming, setIncoming] = useState<MasterRequest[]>([]);
  const [mine, setMine] = useState<MasterRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

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

  if (!can('network.manage')) {
    return <div className="min-h-screen"><GlobalAdminHeader title="Requests" description="Procurement requests" badge="Network" /><div className="p-6"><Card><CardContent className="py-12 text-center text-sm text-muted-foreground">This area is for workspaces that manage a downstream network.</CardContent></Card></div></div>;
  }

  return (
    <div className="min-h-screen">
      <GlobalAdminHeader title="Requests" description="Procurement requests routed from your network — price &amp; return, or escalate upward." badge="Network" />
      <div className="p-3 sm:p-6 space-y-6">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3"><CardTitle className="text-sm flex items-center gap-2"><Inbox className="h-4 w-4" /> Incoming ({incoming.filter((r) => r.status === 'new' || r.status === 'in_review').length})</CardTitle></CardHeader>
              <CardContent className="p-0">
                {incoming.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">No requests from your network yet.</div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {incoming.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{r.requester?.name ?? 'Child workspace'}</span>
                            <span className="text-xs text-muted-foreground">{r.quote?.quote_number || r.quote?.name || `Quote ${r.quote_id.slice(0, 8)}`}</span>
                            <Badge variant="outline" className={`text-[10px] ${TONE[r.status] || ''}`}>{r.status.replace('_', ' ')}</Badge>
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
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="border-b border-border/60 px-5 py-3"><CardTitle className="text-sm flex items-center gap-2"><Send className="h-4 w-4" /> Sent upward</CardTitle></CardHeader>
              <CardContent className="p-0">
                {mine.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">You haven’t submitted any procurement requests.</div>
                ) : (
                  <div className="divide-y divide-border/40">
                    {mine.map((r) => (
                      <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                        <div className="flex-1 min-w-0">
                          <span className="font-medium">{r.quote?.quote_number || r.quote?.name || `Quote ${r.quote_id.slice(0, 8)}`}</span>
                          <div className="text-xs text-muted-foreground">{money(r.amount, r.currency)} · {new Date(r.created_at).toLocaleDateString()}</div>
                        </div>
                        <Badge variant="outline" className={`text-[10px] ${TONE[r.status] || ''}`}>{r.status.replace('_', ' ')}</Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
};

export default RequestsInboxPage;
