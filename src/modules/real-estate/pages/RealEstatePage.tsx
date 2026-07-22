import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, Eye, Globe, Inbox, CalendarClock, LayoutDashboard } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { Skeleton } from '@/components/core/ui/skeleton';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import { realEstateService, type PropertyListItem, type ListingStatus, type PropertyInquiry, type PropertyViewing, type RealEstateDashboard } from '../services/realEstateService';

const STATUS_VARIANT: Record<ListingStatus, string> = {
  draft: 'bg-muted text-muted-foreground', active: 'bg-emerald-500/15 text-emerald-500',
  under_offer: 'bg-amber-500/15 text-amber-500', sold: 'bg-blue-500/15 text-blue-500',
  rented: 'bg-blue-500/15 text-blue-500', withdrawn: 'bg-muted text-muted-foreground',
  archived: 'bg-muted text-muted-foreground',
};
const money = (n: number | null, ccy: string) => (n == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy || 'EUR', maximumFractionDigits: 0 }).format(n));

export default function RealEstatePage() {
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const { can } = usePermissions();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const canManage = can('realestate.listings.manage');
  const ws = activeWorkspaceId;

  const createDraft = async () => {
    if (!ws) return;
    setCreating(true);
    try {
      const p = await realEstateService.createProperty(ws, { title: 'Untitled listing', property_type: 'residential', transaction_type: 'sale' });
      navigate(`/properties/${p.id}`);
    } catch (e) { toast({ title: 'Could not create listing', description: (e as Error).message, variant: 'destructive' }); }
    finally { setCreating(false); }
  };

  if (wsLoading) return <div className="p-6"><Skeleton className="h-64 w-full" /></div>;
  if (!can('realestate.view')) {
    return (
      <div className="min-h-screen">
        <PageHeader icon={Building2} title="Real Estate" subtitle="Property listings & management" />
        <div className="p-6"><div className="dashboard-card p-8 text-center text-sm text-muted-foreground">You don’t have access to Real Estate for this workspace. Ask a workspace owner or admin.</div></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader icon={Building2} title="Real Estate" subtitle="Listings, leads and viewings"
        actions={canManage ? <Button onClick={createDraft} disabled={creating} className="rounded-full"><Plus className="mr-2 h-4 w-4" /> New listing</Button> : undefined} />

      <div className="p-3 sm:p-6">
        <Tabs defaultValue="overview">
          <TabsList className="mb-4 bg-muted">
            <TabsTrigger value="overview"><LayoutDashboard className="mr-1.5 h-4 w-4" /> Overview</TabsTrigger>
            <TabsTrigger value="listings"><Building2 className="mr-1.5 h-4 w-4" /> Listings</TabsTrigger>
            <TabsTrigger value="leads"><Inbox className="mr-1.5 h-4 w-4" /> Leads</TabsTrigger>
            <TabsTrigger value="viewings"><CalendarClock className="mr-1.5 h-4 w-4" /> Viewings</TabsTrigger>
          </TabsList>
          <TabsContent value="overview"><DashboardPanel ws={ws} /></TabsContent>
          <TabsContent value="listings"><ListingsPanel ws={ws} canManage={canManage} creating={creating} onCreate={createDraft} /></TabsContent>
          <TabsContent value="leads"><LeadsPanel ws={ws} /></TabsContent>
          <TabsContent value="viewings"><ViewingsPanel ws={ws} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

const DashboardPanel: React.FC<{ ws: string | null }> = ({ ws }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [d, setD] = useState<RealEstateDashboard | null>(null);
  useEffect(() => {
    if (!ws) return;
    realEstateService.dashboard(ws).then(setD).catch((e) => { toast({ title: 'Failed to load overview', description: (e as Error).message, variant: 'destructive' }); });
  }, [ws, toast]);

  if (!d) return <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}</div>;

  const kpi = (label: string, value: number, tint = 'text-foreground') => (
    <Card><CardContent className="p-4"><div className={`text-2xl font-semibold ${tint}`}>{value}</div><div className="mt-0.5 text-xs text-muted-foreground">{label}</div></CardContent></Card>
  );
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {kpi('Listings', d.totals.listings)}
        {kpi('Active', d.totals.active, 'text-emerald-500')}
        {kpi('Public', d.totals.public, 'text-emerald-500')}
        {kpi('Draft', d.totals.draft, 'text-muted-foreground')}
        {kpi('Under offer', d.totals.under_offer, 'text-amber-500')}
        {kpi('New leads', d.new_leads, 'text-primary')}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><CardContent className="p-0">
          <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">Upcoming viewings (7 days)</div>
          {d.upcoming_viewings.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">None scheduled.</div> : (
            <div className="divide-y divide-border">{d.upcoming_viewings.map((v) => (
              <button key={v.id} onClick={() => navigate(`/properties/${v.property_id}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/40">
                <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1"><div className="font-medium">{new Date(v.scheduled_at).toLocaleString()}</div><div className="text-xs text-muted-foreground">{v.property?.title || 'Listing'}</div></div>
                <Badge className="rounded-full border-0 bg-muted text-[11px] capitalize">{v.status.replace('_', ' ')}</Badge>
              </button>
            ))}</div>
          )}
        </CardContent></Card>
        <Card><CardContent className="p-0">
          <div className="border-b border-border px-4 py-2.5 text-sm font-semibold">Recent leads</div>
          {d.recent_leads.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">No leads yet.</div> : (
            <div className="divide-y divide-border">{d.recent_leads.map((q) => (
              <button key={q.id} onClick={() => navigate(`/properties/${q.property_id}`)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/40">
                <div className="flex-1"><div className="font-medium">{q.name || 'Anonymous'}</div><div className="text-xs text-muted-foreground">{q.property?.title || 'Listing'}</div></div>
                <Badge className="rounded-full border-0 bg-muted text-[11px] capitalize">{q.status.replace('_', ' ')}</Badge>
              </button>
            ))}</div>
          )}
        </CardContent></Card>
      </div>
    </div>
  );
};

const ListingsPanel: React.FC<{ ws: string | null; canManage: boolean; creating: boolean; onCreate: () => void }> = ({ ws, canManage, creating, onCreate }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<PropertyListItem[] | null>(null);
  const load = useCallback(async () => {
    if (!ws) return;
    try { setRows(await realEstateService.listProperties(ws)); }
    catch (e) { toast({ title: 'Failed to load listings', description: (e as Error).message, variant: 'destructive' }); setRows([]); }
  }, [ws, toast]);
  useEffect(() => { void load(); }, [load]);

  if (rows === null) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>;
  if (rows.length === 0) return (
    <div className="dashboard-card p-10 text-center">
      <Building2 className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">No listings yet.{canManage ? ' Create your first property to get started.' : ''}</p>
      {canManage && <Button onClick={onCreate} disabled={creating} className="mt-4 rounded-full"><Plus className="mr-2 h-4 w-4" /> New listing</Button>}
    </div>
  );
  return (
    <Card><CardContent className="p-0"><div className="divide-y divide-border">
      {rows.map((r) => (
        <button key={r.id} onClick={() => navigate(`/properties/${r.id}`)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-muted/40">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><span className="truncate font-medium">{r.title || 'Untitled listing'}</span>{r.reference_code && <span className="shrink-0 text-xs text-muted-foreground">#{r.reference_code}</span>}</div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{[r.property_type, r.transaction_type.replace('_', ' '), [r.town, r.region].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="hidden shrink-0 text-sm font-medium sm:block">{money(r.price, r.currency)}</div>
          <div className="flex shrink-0 items-center gap-2">
            {r.is_public && <Globe className="h-3.5 w-3.5 text-emerald-500" aria-label="Public" />}
            {r.view_count > 0 && <span className="flex items-center gap-1 text-xs text-muted-foreground"><Eye className="h-3 w-3" />{r.view_count}</span>}
            <Badge className={`${STATUS_VARIANT[r.listing_status]} rounded-full border-0 text-[11px] capitalize`}>{r.listing_status.replace('_', ' ')}</Badge>
          </div>
        </button>
      ))}
    </div></CardContent></Card>
  );
};

const LeadsPanel: React.FC<{ ws: string | null }> = ({ ws }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<PropertyInquiry[] | null>(null);
  useEffect(() => {
    if (!ws) return;
    realEstateService.listInquiries(ws).then(setRows).catch((e) => { toast({ title: 'Failed to load leads', description: (e as Error).message, variant: 'destructive' }); setRows([]); });
  }, [ws, toast]);

  if (rows === null) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  if (rows.length === 0) return <div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No leads yet. Inquiries from your public listing pages appear here.</div>;
  return (
    <Card><CardContent className="p-0"><div className="divide-y divide-border">
      {rows.map((q) => (
        <div key={q.id} className="flex items-start gap-4 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{q.name || 'Anonymous'} <span className="text-xs text-muted-foreground">{q.email}</span></div>
            {q.property?.title && <button onClick={() => navigate(`/properties/${q.property_id}`)} className="text-xs text-primary hover:underline">{q.property.title}</button>}
            {q.message && <div className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{q.message}</div>}
            <div className="mt-0.5 text-[11px] text-muted-foreground">{new Date(q.created_at).toLocaleString()}</div>
          </div>
          <Badge className="rounded-full border-0 bg-muted text-[11px] capitalize">{q.status.replace('_', ' ')}</Badge>
        </div>
      ))}
    </div></CardContent></Card>
  );
};

const ViewingsPanel: React.FC<{ ws: string | null }> = ({ ws }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<PropertyViewing[] | null>(null);
  useEffect(() => {
    if (!ws) return;
    realEstateService.listViewings(ws).then(setRows).catch((e) => { toast({ title: 'Failed to load viewings', description: (e as Error).message, variant: 'destructive' }); setRows([]); });
  }, [ws, toast]);

  if (rows === null) return <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>;
  if (rows.length === 0) return <div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No viewings scheduled.</div>;
  return (
    <Card><CardContent className="p-0"><div className="divide-y divide-border">
      {rows.map((v) => (
        <button key={v.id} onClick={() => navigate(`/properties/${v.property_id}`)} className="flex w-full items-center gap-4 px-4 py-3 text-left text-sm hover:bg-muted/40">
          <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex-1"><div className="font-medium">{new Date(v.scheduled_at).toLocaleString()}</div><div className="text-xs text-muted-foreground">{v.property?.title || 'Listing'} · <span className="capitalize">{v.type.replace('_', ' ')}</span></div></div>
          <Badge className="rounded-full border-0 bg-muted text-[11px] capitalize">{v.status.replace('_', ' ')}</Badge>
        </button>
      ))}
    </div></CardContent></Card>
  );
};
