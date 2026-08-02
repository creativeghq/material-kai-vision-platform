import React, { useEffect, useState } from 'react';
import { Store, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { marketplaceService, type MarketplaceParticipation } from '@/services/marketplaceService';

/**
 * Owner/admin surface to join & toggle the surplus marketplace. Enabling raises an
 * application → the Operator approves in Admin → Operations → Onboarding → Marketplace. Only an
 * approved + enabled workspace can list/browse; listings are capped at `cap`% over market price.
 */
export const MarketplaceParticipationCard: React.FC = () => {
  const { toast } = useToast();
  const { activeWorkspaceId, workspaceRole } = useWorkspace();
  const canManage = workspaceRole === 'owner' || workspaceRole === 'admin';

  const [part, setPart] = useState<MarketplaceParticipation | null>(null);
  const [cap, setCap] = useState<number>(20);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!activeWorkspaceId || !canManage) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [p, c] = await Promise.all([
          marketplaceService.getParticipation(activeWorkspaceId),
          marketplaceService.getMarkupCap(),
        ]);
        if (!cancelled) { setPart(p); setCap(c); }
      } catch {
        /* non-fatal — card just shows the default state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeWorkspaceId, canManage]);

  if (!canManage) return null;

  const apply = async () => {
    if (!activeWorkspaceId) return;
    setBusy(true);
    try {
      setPart(await marketplaceService.applyParticipation(activeWorkspaceId));
      toast({ title: 'Application submitted', description: 'The operator will review it shortly.' });
    } catch (err: any) {
      toast({ title: 'Could not apply', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const setEnabled = async (enabled: boolean) => {
    if (!activeWorkspaceId) return;
    setBusy(true);
    try {
      setPart(await marketplaceService.setParticipationEnabled(activeWorkspaceId, enabled));
      toast({ title: enabled ? 'Marketplace enabled' : 'Marketplace paused' });
    } catch (err: any) {
      toast({ title: 'Could not update', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const status = part?.status;
  const enabled = !!part?.enabled;

  return (
    <Card className="rounded-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><Store className="h-4 w-4" /> Surplus Marketplace</CardTitle>
        <p className="text-xs text-muted-foreground">
          List your excess stock to other businesses and buy theirs. To keep it a genuine deal venue,
          listings are capped at <span className="text-foreground font-medium">{cap}% over the market price</span>
          {' '}(checked automatically when you set a price). The operator takes no commission.
        </p>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        ) : !part || (!enabled && status !== 'approved') ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {status === 'rejected' ? 'Your previous application was declined. You can re-apply.' : 'Your workspace is not on the marketplace yet.'}
            </span>
            <Button className="rounded-full" disabled={busy} onClick={apply}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : status === 'rejected' ? 'Re-apply' : 'Apply to join'}
            </Button>
          </div>
        ) : status === 'pending' ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-amber-600 dark:text-amber-400">Application pending operator approval.</span>
            <Button variant="outline" className="rounded-full" disabled={busy} onClick={() => setEnabled(false)}>Withdraw</Button>
          </div>
        ) : status === 'approved' ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">
              {enabled
                ? <span className="text-emerald-600 dark:text-emerald-400">Active — you can list &amp; browse the marketplace.</span>
                : <span className="text-muted-foreground">Approved, currently paused.</span>}
            </span>
            <Button variant={enabled ? 'outline' : 'default'} className="rounded-full" disabled={busy} onClick={() => setEnabled(!enabled)}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : enabled ? 'Pause' : 'Enable'}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-destructive">Application declined.</span>
            <Button className="rounded-full" disabled={busy} onClick={apply}>Re-apply</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default MarketplaceParticipationCard;
