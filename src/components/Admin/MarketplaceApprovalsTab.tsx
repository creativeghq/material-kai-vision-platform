import React, { useEffect, useState } from 'react';
import { Store, Check, X, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { marketplaceService, type MarketplaceApplication } from '@/services/marketplaceService';
import { formatDate } from '@/utils/datetime';

/**
 * Operator surface for the surplus marketplace. Workspaces opt in (owner enables) → an
 * application lands here → the operator approves/rejects. Only approved+enabled workspaces can
 * list or browse. Mirrors ResellerApplicationsTab.
 */
export const MarketplaceApprovalsTab: React.FC = () => {
  const { toast } = useToast();
  const [rows, setRows] = useState<MarketplaceApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await marketplaceService.listApplications());
    } catch (err: any) {
      toast({ title: 'Could not load applications', description: err?.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const review = async (workspaceId: string, approve: boolean) => {
    setBusy(workspaceId);
    try {
      await marketplaceService.review(workspaceId, approve);
      toast({ title: approve ? 'Approved' : 'Rejected' });
      await load();
    } catch (err: any) {
      toast({ title: 'Action failed', description: err?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const statusWord = (s: string) =>
    s === 'approved' ? <span className="text-emerald-600 dark:text-emerald-400">Approved</span>
    : s === 'rejected' ? <span className="text-destructive">Rejected</span>
    : <span className="text-amber-600 dark:text-amber-400">Pending</span>;

  const pending = rows.filter((r) => r.status === 'pending');
  const decided = rows.filter((r) => r.status !== 'pending');

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Store className="h-4 w-4" /> Marketplace Applications
          {pending.length > 0 && (
            <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
              {pending.length} pending
            </span>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Workspaces that asked to join the surplus marketplace. Approve to let them list + browse; the
          20% market-price cap applies automatically.
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-8 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">No applications yet.</p>
        ) : (
          <div className="divide-y divide-border/50">
            {[...pending, ...decided].map((r) => (
              <div key={r.workspace_id} className="flex flex-wrap items-center justify-between gap-3 px-6 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{r.workspace_name || r.workspace_id}</div>
                  <div className="text-xs text-muted-foreground">
                    {statusWord(r.status)}
                    {r.enabled ? ' · enabled' : ' · disabled by owner'}
                    {r.applied_at ? ` · applied ${formatDate(r.applied_at)}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {r.status !== 'approved' && (
                    <Button size="sm" className="gap-1" disabled={busy === r.workspace_id} onClick={() => review(r.workspace_id, true)}>
                      {busy === r.workspace_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Approve
                    </Button>
                  )}
                  {r.status !== 'rejected' && (
                    <Button size="sm" variant="outline" className="gap-1" disabled={busy === r.workspace_id} onClick={() => review(r.workspace_id, false)}>
                      <X className="h-3.5 w-3.5" /> Reject
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MarketplaceApprovalsTab;
