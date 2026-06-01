import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Home, FileText, CheckCircle2, AlertCircle, Loader2, ExternalLink, RefreshCw, Settings as SettingsIcon, Activity, Package, KeyRound } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { PageHeader } from '@/components/shared/PageHeader';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import { OxygenSettingsTab } from '../components/OxygenSettingsTab';

interface OxygenSyncedQuote {
  id: string;
  quote_number: string | null;
  status: string;
  oxygen_notice_id: string | null;
  oxygen_sync_status: 'pending' | 'syncing' | 'synced' | 'failed' | null;
  oxygen_last_sync_at: string | null;
  oxygen_sync_error: string | null;
  grand_total: number | null;
  currency: string | null;
}

interface Counters {
  synced: number;
  failed: number;
  pending_accepted: number;
}

const OxygenModulePage: React.FC = () => {
  const [rows, setRows] = useState<OxygenSyncedQuote[]>([]);
  const [counters, setCounters] = useState<Counters>({ synced: 0, failed: 0, pending_accepted: 0 });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const recent = await supabase
      .from('quotes')
      .select('id, quote_number, status, oxygen_notice_id, oxygen_sync_status, oxygen_last_sync_at, oxygen_sync_error, grand_total, currency')
      .or('oxygen_notice_id.not.is.null,oxygen_sync_status.eq.failed')
      .order('oxygen_last_sync_at', { ascending: false, nullsFirst: false })
      .limit(50);

    const synced = await supabase
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .not('oxygen_notice_id', 'is', null);

    const failed = await supabase
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('oxygen_sync_status', 'failed');

    const pendingAccepted = await supabase
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'accepted')
      .is('oxygen_notice_id', null);

    setRows((recent.data ?? []) as OxygenSyncedQuote[]);
    setCounters({
      synced: synced.count ?? 0,
      failed: failed.count ?? 0,
      pending_accepted: pendingAccepted.count ?? 0,
    });
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div>
      <PageHeader
        icon={FileText}
        title="Oxygen Pre-Invoice"
        subtitle="Greek e-invoicing — accepted quotes are pushed to oxygen.gr as notices (pre-invoices). Never as final invoices."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" className="gap-2" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button asChild variant="ghost" size="sm" className="gap-2" title="Module Settings (API credentials)">
              <Link to="/admin/modules/oxygen/settings">
                <KeyRound className="h-4 w-4" />
                Keys
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="gap-2">
              <Link to="/admin/modules">
                <Package className="h-4 w-4" />
                All Modules
              </Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="gap-2">
              <Link to="/admin">
                <Home className="h-4 w-4" />
                Back to Admin
              </Link>
            </Button>
          </div>
        }
      />

      <div className="px-3 sm:px-6 py-4 sm:py-8 space-y-6">
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="bg-transparent p-0 gap-2 flex-wrap">
            <TabsTrigger value="overview" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Activity className="h-4 w-4" /> Overview
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <SettingsIcon className="h-4 w-4" /> Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="dashboard-card">
                <CardHeader className="pb-2">
                  <CardDescription>Synced to Oxygen</CardDescription>
                  <CardTitle className="text-3xl">{counters.synced}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" /> notices created (lifetime)
                  </div>
                </CardContent>
              </Card>
              <Card className="dashboard-card">
                <CardHeader className="pb-2">
                  <CardDescription>Failed</CardDescription>
                  <CardTitle className="text-3xl">{counters.failed}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <AlertCircle className="h-3 w-3 text-amber-500" /> awaiting retry from quote page
                  </div>
                </CardContent>
              </Card>
              <Card className="dashboard-card">
                <CardHeader className="pb-2">
                  <CardDescription>Accepted, not synced</CardDescription>
                  <CardTitle className="text-3xl">{counters.pending_accepted}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    Use the "Make Pre-Invoice" button on each quote
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent activity</CardTitle>
                <CardDescription>Last 50 quotes that were synced or failed.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {loading ? (
                  <div className="py-12 flex items-center justify-center text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
                  </div>
                ) : rows.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    No pre-invoices yet. Once an accepted quote is synced it will appear here.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quote</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Oxygen Notice</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Last sync</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map(q => (
                        <TableRow key={q.id}>
                          <TableCell className="font-mono text-xs">
                            {q.quote_number ?? q.id.slice(0, 8)}
                          </TableCell>
                          <TableCell>
                            <SyncBadge status={q.oxygen_sync_status} />
                          </TableCell>
                          <TableCell className="font-mono text-xs">
                            {q.oxygen_notice_id ?? <span className="text-muted-foreground">—</span>}
                          </TableCell>
                          <TableCell>
                            {q.grand_total != null ? `${Number(q.grand_total).toFixed(2)} ${q.currency ?? 'EUR'}` : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {q.oxygen_last_sync_at ? new Date(q.oxygen_last_sync_at).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell>
                            <Button asChild size="sm" variant="ghost" className="gap-1">
                              <Link to={`/admin/quote-requests/${q.id}`}>
                                Open <ExternalLink className="h-3 w-3" />
                              </Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings">
            <OxygenSettingsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

const SyncBadge: React.FC<{ status: OxygenSyncedQuote['oxygen_sync_status'] }> = ({ status }) => {
  if (status === 'synced') return <Badge className="bg-emerald-700 hover:bg-emerald-700 text-white">synced</Badge>;
  if (status === 'failed') return <Badge variant="destructive">failed</Badge>;
  if (status === 'syncing') return <Badge variant="secondary">syncing</Badge>;
  return <Badge variant="outline">{status ?? '—'}</Badge>;
};

export default OxygenModulePage;
