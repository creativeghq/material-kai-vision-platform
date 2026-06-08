/**
 * #196 — operator review queue for Supplier→Factory access requests. The operator
 * (root-workspace admin) approves/rejects a supplier's request to access a factory's catalog.
 * Mirrors FactoryRegistrationsTab. Approval is the grant (get_accessible_factory_products).
 */
import React, { useEffect, useState } from 'react';
import { KeyRound, Check, X, Loader2 } from 'lucide-react';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Textarea } from '@/components/core/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { factoryAccessService, type FactoryAccessRequest } from '@/services/factoryAccessService';

export const FactoryAccessRequestsTab: React.FC = () => {
  const { toast } = useToast();
  const [requests, setRequests] = useState<FactoryAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = async () => {
    setLoading(true);
    try { setRequests(await factoryAccessService.listForReview()); }
    catch (e: any) { toast({ title: 'Failed to load', description: e?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const decide = async (req: FactoryAccessRequest, decision: 'approved' | 'rejected' | 'revoked', reason?: string) => {
    setProcessingId(req.id);
    try {
      await factoryAccessService.review(req.id, decision, reason);
      setRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: decision, rejection_reason: decision === 'rejected' ? (reason ?? null) : null } : r));
      if (decision === 'rejected') { setRejectingId(null); setRejectReason(''); }
      toast({ title: decision === 'approved' ? 'Access granted' : decision === 'rejected' ? 'Request rejected' : 'Access revoked' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message, variant: 'destructive' });
    } finally { setProcessingId(null); }
  };

  const statusColor = (s: string) =>
    s === 'pending' ? 'bg-amber-500/10 text-amber-700 border-amber-500/30'
    : s === 'approved' ? 'bg-green-500/10 text-green-700 border-green-500/30'
    : 'bg-destructive/10 text-destructive border-destructive/30';

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const pending = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Factory Access Requests</h3>
          {pending > 0 && <Badge variant="secondary" className="text-xs">{pending} pending</Badge>}
        </div>
        <Button size="sm" variant="outline" onClick={load}>Refresh</Button>
      </div>

      {requests.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No factory-access requests yet.</p>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => (
            <div key={req.id} className="rounded-xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{req.requester_workspace_name || req.requester_workspace_id.slice(0, 8)}</p>
                    <span className="text-xs text-muted-foreground">→</span>
                    <p className="text-sm">{req.factory_name || req.factory_user_id.slice(0, 8)}</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-medium capitalize ${statusColor(req.status)}`}>{req.status}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Requested {new Date(req.created_at).toLocaleDateString()}</p>
                  {req.message && <p className="text-sm text-muted-foreground mt-2 italic">“{req.message}”</p>}
                  {req.status === 'rejected' && req.rejection_reason && <p className="text-xs text-muted-foreground mt-1">Reason: {req.rejection_reason}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {req.status === 'pending' && (
                    <>
                      <Button size="sm" className="h-8 bg-green-600 hover:bg-green-700 text-white" onClick={() => decide(req, 'approved')} disabled={processingId === req.id}>
                        {processingId === req.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}<span className="ml-1.5">Approve</span>
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 text-destructive hover:text-destructive hover:border-destructive/50" onClick={() => setRejectingId(req.id)} disabled={processingId === req.id}>
                        <X className="h-3.5 w-3.5" /><span className="ml-1.5">Reject</span>
                      </Button>
                    </>
                  )}
                  {req.status === 'approved' && (
                    <Button size="sm" variant="ghost" className="h-8 text-destructive" onClick={() => decide(req, 'revoked')} disabled={processingId === req.id}>Revoke</Button>
                  )}
                </div>
              </div>
              {rejectingId === req.id && (
                <div className="mt-3 space-y-2">
                  <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Rejection reason (optional)" rows={2} className="resize-none text-sm" />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" onClick={() => { setRejectingId(null); setRejectReason(''); }}>Cancel</Button>
                    <Button size="sm" variant="destructive" onClick={() => decide(req, 'rejected', rejectReason.trim() || undefined)} disabled={processingId === req.id}>Confirm Reject</Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
