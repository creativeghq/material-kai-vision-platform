/**
 * #255 — per-campaign delivery stats. Aggregates from campaign_recipients (workspace-readable) and
 * offers a "Refresh from Resend" pull that polls the workspace's OWN Resend account for the latest
 * delivered/opened/clicked/bounced status (marketing sends go out under the tenant's Resend, so
 * their events don't reach our webhook).
 */
import React, { useEffect, useState } from 'react';
import { RefreshCw, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { marketingService, type CampaignStats } from '../services/marketingService';

interface Props {
  campaignId: string;
  campaignName: string;
  workspaceId: string;
  onClose: () => void;
}

const CELLS: Array<{ key: keyof CampaignStats; label: string }> = [
  { key: 'total', label: 'Recipients' },
  { key: 'sent', label: 'Sent' },
  { key: 'delivered', label: 'Delivered' },
  { key: 'opened', label: 'Opened' },
  { key: 'clicked', label: 'Clicked' },
  { key: 'bounced', label: 'Bounced' },
  { key: 'complained', label: 'Complaints' },
  { key: 'failed', label: 'Failed' },
  { key: 'pending', label: 'Pending' },
];

export const CampaignStatsDialog: React.FC<Props> = ({ campaignId, campaignName, workspaceId, onClose }) => {
  const { toast } = useToast();
  const [stats, setStats] = useState<CampaignStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setStats(await marketingService.getStats(campaignId)); }
    catch (e: any) { toast({ title: 'Error', description: e?.message || 'Failed to load stats', variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [campaignId]);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await marketingService.syncStats(campaignId, workspaceId);
      toast({
        title: 'Stats refreshed',
        description: res.capped
          ? `Updated ${res.updated} of ${res.synced} polled. More recipients remain${res.total_dispatched ? ` (${res.total_dispatched} total)` : ''} — click Sync again to continue.`
          : `Updated ${res.updated} of ${res.synced} polled.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: 'Sync failed', description: e?.message || 'Could not reach Resend', variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="truncate">{campaignName} — stats</DialogTitle></DialogHeader>

        {loading || !stats ? (
          <div className="py-8 text-center text-muted-foreground">Loading…</div>
        ) : (
          <div className="grid grid-cols-3 gap-3">
            {CELLS.map((c) => (
              <div key={c.key} className="rounded-lg border p-3 text-center">
                <div className="text-2xl font-bold">{stats[c.key]}</div>
                <div className="text-xs text-muted-foreground">{c.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">Opens/clicks come from your Resend account.</p>
          <Button size="sm" variant="outline" onClick={sync} disabled={syncing} className="rounded-full">
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />} Refresh from Resend
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CampaignStatsDialog;
