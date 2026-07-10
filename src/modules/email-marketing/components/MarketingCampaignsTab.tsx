/**
 * #255 — workspace-scoped email campaign list. Only channel_type='email' campaigns for the active
 * workspace (RLS + explicit filter, so WhatsApp/messaging campaigns never appear here). Start/pause/
 * resume/cancel/delete drive the campaign-processor cron; a paused campaign with a blocked_reason
 * surfaces the "configure Resend" state.
 */
import React, { useEffect, useState } from 'react';
import { Plus, Send, Calendar, Users, Play, Pause, Ban, Trash2, AlertTriangle, BarChart3 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { marketingService, type MarketingCampaign, type CampaignStatus } from '../services/marketingService';
import { CreateMarketingCampaignModal } from './CreateMarketingCampaignModal';
import { CampaignStatsDialog } from './CampaignStatsDialog';

const STATUS_COLORS: Record<CampaignStatus, string> = {
  draft: 'bg-gray-500',
  scheduled: 'bg-blue-500',
  sending: 'bg-yellow-500',
  sent: 'bg-green-600',
  partial_failure: 'bg-orange-500',
  paused: 'bg-orange-600',
  cancelled: 'bg-red-500',
};

export const MarketingCampaignsTab: React.FC<{ workspaceId: string; byokReady: boolean }> = ({ workspaceId, byokReady }) => {
  const { toast } = useToast();
  const [campaigns, setCampaigns] = useState<MarketingCampaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [statsFor, setStatsFor] = useState<MarketingCampaign | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setCampaigns(await marketingService.listCampaigns(workspaceId));
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to load campaigns', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (workspaceId) load(); /* eslint-disable-next-line */ }, [workspaceId]);

  const act = async (fn: () => Promise<void>, ok: string) => {
    try { await fn(); toast({ title: ok }); load(); }
    catch (e: any) { toast({ title: 'Error', description: e?.message || 'Action failed', variant: 'destructive' }); }
  };

  return (
    <div className="space-y-4">
      <div className="dashboard-card flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Campaigns</h3>
          <p className="text-sm text-muted-foreground">Send bulk email to your CRM audiences from your own Resend domain.</p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="rounded-full"><Plus className="h-4 w-4 mr-2" /> Create Campaign</Button>
      </div>

      {loading ? (
        <div className="dashboard-card py-8 text-center text-muted-foreground">Loading campaigns…</div>
      ) : campaigns.length === 0 ? (
        <div className="dashboard-card py-12 text-center">
          <Send className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">No campaigns yet</h3>
          <p className="text-sm text-muted-foreground mb-4">Create your first email campaign to reach your audience.</p>
          <Button onClick={() => setShowCreate(true)} className="rounded-full"><Plus className="h-4 w-4 mr-2" /> Create Campaign</Button>
        </div>
      ) : (
        <div className="dashboard-card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-border/50">
              <tr>
                <th className="text-left py-3 px-4 font-medium">Campaign</th>
                <th className="text-left py-3 px-4 font-medium">Status</th>
                <th className="text-left py-3 px-4 font-medium">Template</th>
                <th className="text-left py-3 px-4 font-medium">Recipients</th>
                <th className="text-left py-3 px-4 font-medium">Scheduled</th>
                <th className="text-right py-3 px-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const blocked = c.status === 'paused' && c.metadata?.blocked_reason;
                return (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/50">
                    <td className="py-3 px-4">
                      <div className="font-medium">{c.name}</div>
                      {c.subject_line && <div className="text-xs text-muted-foreground">{c.subject_line}</div>}
                      {blocked && (
                        <div className="text-xs text-amber-500 flex items-center gap-1 mt-1">
                          <AlertTriangle className="h-3 w-3" /> {c.metadata?.blocked_message || 'Blocked — check setup.'}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4"><Badge className={STATUS_COLORS[c.status] || 'bg-gray-500'}>{c.status}</Badge></td>
                    <td className="py-3 px-4 text-sm">{c.template?.name || <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 text-sm"><Users className="h-4 w-4 text-muted-foreground" />{c.recipient_count}</div>
                    </td>
                    <td className="py-3 px-4 text-sm">
                      {c.scheduled_at ? (
                        <span className="flex items-center gap-1"><Calendar className="h-4 w-4 text-muted-foreground" />{format(new Date(c.scheduled_at), 'MMM d, HH:mm')}</span>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        {['sending', 'sent', 'partial_failure', 'paused'].includes(c.status) && (
                          <Button variant="ghost" size="sm" title="Delivery stats" onClick={() => setStatsFor(c)}>
                            <BarChart3 className="h-4 w-4" />
                          </Button>
                        )}
                        {(c.status === 'draft' || c.status === 'paused') && (
                          <Button variant="ghost" size="sm" title={byokReady ? 'Send' : 'Configure Resend first'} disabled={!byokReady}
                            onClick={() => act(() => marketingService.startCampaign(c.id), 'Campaign started')}>
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        {c.status === 'sending' && (
                          <Button variant="ghost" size="sm" title="Pause" onClick={() => act(() => marketingService.pauseCampaign(c.id), 'Campaign paused')}>
                            <Pause className="h-4 w-4" />
                          </Button>
                        )}
                        {['draft', 'scheduled', 'sending', 'paused'].includes(c.status) && (
                          <Button variant="ghost" size="sm" title="Cancel" onClick={() => act(() => marketingService.cancelCampaign(c.id), 'Campaign cancelled')}>
                            <Ban className="h-4 w-4" />
                          </Button>
                        )}
                        {c.status === 'draft' && (
                          <Button variant="ghost" size="sm" title="Delete"
                            onClick={() => { if (confirm('Delete this draft campaign?')) act(() => marketingService.deleteCampaign(c.id), 'Campaign deleted'); }}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateMarketingCampaignModal
          workspaceId={workspaceId}
          byokReady={byokReady}
          onClose={() => setShowCreate(false)}
          onSuccess={() => { setShowCreate(false); load(); }}
        />
      )}

      {statsFor && (
        <CampaignStatsDialog
          campaignId={statsFor.id}
          campaignName={statsFor.name}
          workspaceId={workspaceId}
          onClose={() => setStatsFor(null)}
        />
      )}
    </div>
  );
};

export default MarketingCampaignsTab;
