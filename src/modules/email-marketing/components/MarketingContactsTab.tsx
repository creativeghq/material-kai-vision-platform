/**
 * #255 — Resend Audience / Contacts. Shows the contacts already in the workspace's Resend audience,
 * a toggle to auto-sync CRM contacts to Resend daily, a manual "Sync now" button, and the last-sync
 * status. Sync is additive (never deletes / never touches unsubscribed contacts).
 */
import React, { useEffect, useState } from 'react';
import { RefreshCw, Loader2, Users, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Switch } from '@/components/core/ui/switch';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { marketingService, type ResendContactsResult } from '../services/marketingService';

export const MarketingContactsTab: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [data, setData] = useState<ResendContactsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    try {
      const res = await marketingService.listResendContacts(workspaceId);
      setData(res);
      // A re-sync can return a different-sized audience — keep the page in range.
      setPage((p) => clampPage(p, res.contacts?.length ?? 0));
    }
    catch (e: any) { toast({ title: 'Error', description: e?.message || 'Failed to load contacts', variant: 'destructive' }); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (workspaceId) load(); /* eslint-disable-next-line */ }, [workspaceId]);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await marketingService.syncResendContacts(workspaceId);
      toast({
        title: 'Sync complete',
        description: `${res.added} new, ${res.already} already present${res.capped ? ' (capped — run again for the rest)' : ''}.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: 'Sync failed', description: e?.message || 'Could not sync to Resend', variant: 'destructive' });
    } finally {
      setSyncing(false);
    }
  };

  const toggleAuto = async (on: boolean) => {
    setSavingToggle(true);
    try {
      await marketingService.setContactAutoSync(workspaceId, on);
      setData((d) => (d ? { ...d, auto_sync: on } : d));
      toast({ title: on ? 'Auto-sync enabled' : 'Auto-sync disabled', description: on ? 'CRM contacts sync to Resend daily.' : undefined });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to update', variant: 'destructive' });
    } finally {
      setSavingToggle(false);
    }
  };

  if (loading) return <div className="dashboard-card py-8 text-center text-muted-foreground">Loading contacts…</div>;

  if (data && !data.allowed) {
    return (
      <div className="dashboard-card">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">Configure your Resend account first.</p>
            <p className="text-xs text-muted-foreground">Contacts sync into your own Resend audience — set up your Resend key in the Setup tab.</p>
          </div>
        </div>
      </div>
    );
  }

  const contacts = data?.contacts ?? [];

  return (
    <div className="space-y-4">
      {/* Sync controls */}
      <div className="dashboard-card space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2"><Users className="h-5 w-5" /> Resend Audience</h3>
            <p className="text-sm text-muted-foreground">Contacts synced into your Resend account for campaigns.</p>
          </div>
          <Button onClick={sync} disabled={syncing} className="rounded-full">
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />} Sync now
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="text-sm font-medium">Auto-sync CRM contacts to Resend</p>
            <p className="text-xs text-muted-foreground">When on, new CRM contacts are pushed to your Resend audience daily.</p>
          </div>
          <Switch checked={!!data?.auto_sync} disabled={savingToggle} onCheckedChange={toggleAuto} />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {data?.last_sync_error ? (
            <><AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Last sync failed: {data.last_sync_error}</>
          ) : data?.last_synced_at ? (
            <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Last synced {formatDistanceToNow(new Date(data.last_synced_at), { addSuffix: true })}
              {data.last_sync_count != null && ` · ${data.last_sync_count} added`}</>
          ) : (
            <>Not synced yet — click “Sync now” to push your CRM contacts.</>
          )}
        </div>
      </div>

      {/* Contact list */}
      <div className="dashboard-card">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold">Contacts in Resend ({contacts.length})</h4>
        </div>
        {contacts.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">No contacts in your Resend audience yet. Click “Sync now”.</div>
        ) : (
          <>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border/50">
                <tr>
                  <th className="text-left py-2 px-3 font-medium">Email</th>
                  <th className="text-left py-2 px-3 font-medium">Name</th>
                  <th className="text-left py-2 px-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {paginate(contacts, page).map((c) => (
                  <tr key={c.id || c.email} className="border-b last:border-0">
                    <td className="py-2 px-3">{c.email}</td>
                    <td className="py-2 px-3 text-muted-foreground">{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td className="py-2 px-3">
                      {c.unsubscribed
                        ? <span className="text-sm capitalize text-muted-foreground">Unsubscribed</span>
                        : <span className="text-sm capitalize text-emerald-600 dark:text-emerald-400">Subscribed</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <TablePagination
            page={page}
            total={contacts.length}
            onPageChange={setPage}
            label="contacts"
          />
          </>
        )}
      </div>
    </div>
  );
};

export default MarketingContactsTab;
