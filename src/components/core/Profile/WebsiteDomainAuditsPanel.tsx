import React, { useEffect, useState } from 'react';
import { Loader2, Plus, RefreshCw } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/core/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { formatDate, timeAgo } from '@/utils/datetime';
import { formatNumber } from '@/utils/decimal';
import { userWebsitesService, type SeoTrackedDomainRow, type UserWebsite } from '@/services/userWebsitesService';
import { listAuditHistory, triggerAuditNow, type SeoDomainAuditSnapshot } from '@/services/seoToolkitApi';
import { Loading } from './seo/dashboardPrimitives';

/** Websites -> Visibility -> Domain Audits. */
export const WebsiteDomainAuditsPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const [domains, setDomains] = useState<SeoTrackedDomainRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [trackingDomain, setTrackingDomain] = useState(false);
  const [openDomain, setOpenDomain] = useState<SeoTrackedDomainRow | null>(null);
  const [domainHistory, setDomainHistory] = useState<SeoDomainAuditSnapshot[] | null>(null);
  const [auditingDomain, setAuditingDomain] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const d = await userWebsitesService.trackedDomains(website.id);
        if (!cancelled) setDomains(d);
      } catch (e: any) {
        if (!cancelled) toast({ title: 'Could not load tracked domains', description: e?.message, variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [website.id]);

  const openDomainHistory = async (d: SeoTrackedDomainRow) => {
    setOpenDomain(d);
    setDomainHistory(null);
    try {
      setDomainHistory(await listAuditHistory(d.id, 30));
    } catch (e: any) {
      toast({ title: 'Could not load the audit history', description: e.message, variant: 'destructive' });
      setDomainHistory([]);
    }
  };

  const auditDomainNow = async () => {
    if (!openDomain) return;
    setAuditingDomain(true);
    try {
      const r = await triggerAuditNow(openDomain.id);
      if (!r.ok) throw new Error(r.error || 'Audit failed');
      toast({ title: 'Audit complete', description: `${openDomain.domain} audited.` });
      setDomainHistory(await listAuditHistory(openDomain.id, 30));
      setDomains(await userWebsitesService.trackedDomains(website.id));
    } catch (e: any) {
      toast({ title: 'Audit failed', description: e.message, variant: 'destructive' });
    } finally {
      setAuditingDomain(false);
    }
  };

  /**
   * This pane is about THIS website, so the button tracks exactly its domain. It used to open the
   * agent quick-start, which asked the operator to type the domain they were already standing on
   * and left the row unattached to the website -- so this pane stayed empty after they had done it.
   */
  const trackOwnDomain = async () => {
    setTrackingDomain(true);
    try {
      const row = await userWebsitesService.trackOwnDomain(website);
      toast({
        title: `Tracking ${row.domain}`,
        description: 'The first rank and backlink audit runs within the hour, then weekly.',
      });
      setDomains(await userWebsitesService.trackedDomains(website.id));
    } catch (e: any) {
      toast({ title: 'Could not track the domain', description: e.message, variant: 'destructive' });
    } finally {
      setTrackingDomain(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
          <CardTitle>Domain Audits</CardTitle>
          <CardDescription>
            Scheduled domain-rank tracking for this website's own domain. Rival domains are followed
            under the Competitors tab, measured on the same weekly run in the same market.
          </CardDescription>
          </div>
          {!loading && domains.length === 0 && (
            <Button size="sm" variant="outline" className="shrink-0"
              onClick={trackOwnDomain} disabled={trackingDomain}>
              {trackingDomain
                ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                : <Plus className="w-3.5 h-3.5 mr-1" />}
              Track this domain
            </Button>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <Loading />
          ) : domains.length === 0 ? (
            <HubEmptyState
              variant="empty"
              title="This domain is not tracked yet"
              description="Tracking takes a weekly rank and backlink snapshot so movement shows up as a trend rather than a surprise."
              action={
                <Button size="sm" onClick={trackOwnDomain} disabled={trackingDomain}>
                  {trackingDomain
                    ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                    : <Plus className="w-3.5 h-3.5 mr-1" />}
                  Track this domain
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domain</TableHead>
                  <TableHead className="text-right">Rank</TableHead>
                  <TableHead className="text-right">Organic traffic</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last audit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {domains.map((d) => (
                  <TableRow key={d.id} className="cursor-pointer" onClick={() => void openDomainHistory(d)}>
                    <TableCell className="font-medium">{d.display_label || d.domain}</TableCell>
                    <TableCell className="text-right">{d.current_domain_rank ?? '—'}</TableCell>
                    <TableCell className="text-right">{formatNumber(d.current_organic_traffic)}</TableCell>
                    <TableCell className={d.is_active ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}>
                      {d.is_active ? 'active' : 'paused'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{timeAgo(d.last_audited_at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Every weekly audit for one tracked domain. */}
      <Dialog open={!!openDomain} onOpenChange={(o) => { if (!o) setOpenDomain(null); }}>
        <DialogContent className="max-w-3xl">
          <DialogTitle>{openDomain?.display_label || openDomain?.domain} · audit history</DialogTitle>
          {domainHistory == null ? (
            <Loading />
          ) : domainHistory.length === 0 ? (
            <HubEmptyState
              variant="empty"
              title="No audits recorded yet"
              description="The first runs within the hour of tracking, then weekly. History is visible to the person who added the domain."
              action={
                <Button size="sm" disabled={auditingDomain} onClick={() => void auditDomainNow()}>
                  {auditingDomain ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
                  Audit now
                </Button>
              }
            />
          ) : (
            <div className="table-scroll">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Audited</TableHead>
                    <TableHead className="text-right">Rank</TableHead>
                    <TableHead className="text-right">Keywords</TableHead>
                    <TableHead className="text-right">Traffic</TableHead>
                    <TableHead className="text-right">Ref. domains</TableHead>
                    <TableHead className="text-right">Backlinks</TableHead>
                    <TableHead className="text-right">Spam</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {domainHistory.map((h) => (
                    <TableRow key={h.id}>
                      <TableCell className="text-muted-foreground">{formatDate(h.audited_at, { withTime: true })}</TableCell>
                      <TableCell className="text-right tabular-nums">{h.domain_rank ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(h.ranking_keywords)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(h.organic_traffic)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(h.referring_domains)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(h.backlinks)}</TableCell>
                      <TableCell className="text-right tabular-nums">{h.spam_score ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">${Number(h.cost_usd ?? 0).toFixed(4)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WebsiteDomainAuditsPanel;
