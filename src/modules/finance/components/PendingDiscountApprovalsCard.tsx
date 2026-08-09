/**
 * Finance approval inbox for customer discount/level changes proposed by the
 * sales team. Approve applies the change to the CRM record; reject discards it. Both
 * emit a Flows event so the requester is notified.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Check, X, Inbox } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { financeService } from '@/modules/finance/services/financeService';
import { flowEventService } from '@/services/flows/flowEventService';
import { formatDate } from '@/utils/datetime';

interface Req {
  id: string; target_id: string; before: any; after: any; requested_by: string | null; created_at: string;
}

const fmtChange = (before: any, after: any): string => {
  const parts: string[] = [];
  const bLvl = before?.user_level_key ?? '—';
  const aLvl = after?.user_level_key ?? '—';
  if (bLvl !== aLvl) parts.push(`level ${bLvl} → ${aLvl}`);
  const bD = before?.discount_percent ?? null;
  const aD = after?.discount_percent ?? null;
  if (bD !== aD) parts.push(`discount ${bD ?? 0}% → ${aD ?? 0}%`);
  return parts.length ? parts.join(' · ') : 'no change';
};

export const PendingDiscountApprovalsCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [reqs, setReqs] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    try { setLoading(true); setReqs(await financeService.listPendingDiscountRequests(workspaceId)); }
    catch (err: any) { toast({ title: 'Failed to load approvals', description: err?.message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [workspaceId]);

  const decide = async (req: Req, approve: boolean) => {
    setBusyId(req.id);
    try {
      const res = await financeService.decidePricingRequest(req.id, approve);
      flowEventService.emit('pricing_change_decided', {
        workspace_id: workspaceId,
        request_id: req.id,
        approved: approve,
        user_id: req.requested_by,
        subject_type: (res as any)?.subject_type ?? req.after?.subject_type,
        subject_id: (res as any)?.subject_id ?? req.target_id,
        title: approve ? 'Discount change approved' : 'Discount change rejected',
        body: `Your customer pricing change was ${approve ? 'approved' : 'rejected'}.`,
      });
      toast({ title: approve ? 'Approved & applied' : 'Rejected' });
      await load();
    } catch (err: any) {
      toast({ title: 'Failed', description: err?.message, variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  // Hide the card entirely when there's nothing to approve (keeps the Pricing tab clean).
  if (!loading && reqs.length === 0) return null;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2">
          <Inbox className="h-4 w-4" /> Pending discount approvals
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] text-primary">{reqs.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Customer discount / level changes proposed by the sales team. Approve to apply to the customer record.
        </p>
        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-2">
            {reqs.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="truncate capitalize">{fmtChange(r.before, r.after)}</div>
                  <div className="text-[11px] text-muted-foreground">{formatDate(r.created_at, { withTime: true })}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button size="sm" variant="outline" className="h-7 gap-1" disabled={busyId === r.id} onClick={() => decide(r, true)}>
                    {busyId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Approve
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-muted-foreground hover:text-destructive" disabled={busyId === r.id} onClick={() => decide(r, false)}>
                    <X className="h-3 w-3" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
