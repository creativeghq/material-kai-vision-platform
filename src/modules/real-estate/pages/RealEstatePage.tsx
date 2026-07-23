import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Plus, Eye, Globe, Inbox, CalendarClock, LayoutDashboard, Loader2, Store, Handshake, KeyRound, Users, Wrench } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import { realEstateService, feedUrl, type PropertyListItem, type ListingStatus, type PropertyInquiry, type PropertyViewing, type RealEstateDashboard, type FeedSettings, type SellerLead, type PropertySale, type Tenancy, type MaintenanceWorkOrder, type BuyerRequirement } from '../services/realEstateService';
import { Rss, Copy, RefreshCw } from 'lucide-react';

const STATUS_VARIANT: Record<ListingStatus, string> = {
  draft: 'bg-muted text-muted-foreground', active: 'bg-emerald-500/15 text-emerald-500',
  under_offer: 'bg-amber-500/15 text-amber-500', sold: 'bg-blue-500/15 text-blue-500',
  rented: 'bg-blue-500/15 text-blue-500', withdrawn: 'bg-muted text-muted-foreground',
  archived: 'bg-muted text-muted-foreground',
};
const money = (n: number | null, ccy: string) => (n == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy || 'EUR', maximumFractionDigits: 0 }).format(n));

// Lightweight in-content loader (matches Finance/CRM — never a full-bleed skeleton block).
const InlineLoader: React.FC = () => (
  <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
);

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

  if (wsLoading) {
    return (
      <div className="min-h-screen">
        <PageHeader icon={Building2} title="Real Estate" subtitle="Listings, leads and viewings" />
        <div className="flex h-[calc(100vh-200px)] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </div>
    );
  }
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
            <TabsTrigger value="buyers"><Users className="mr-1.5 h-4 w-4" /> Buyers</TabsTrigger>
            <TabsTrigger value="sellers"><Store className="mr-1.5 h-4 w-4" /> Sellers</TabsTrigger>
            <TabsTrigger value="viewings"><CalendarClock className="mr-1.5 h-4 w-4" /> Viewings</TabsTrigger>
            <TabsTrigger value="lettings"><KeyRound className="mr-1.5 h-4 w-4" /> Lettings</TabsTrigger>
            <TabsTrigger value="sales"><Handshake className="mr-1.5 h-4 w-4" /> Sales</TabsTrigger>
            {canManage && <TabsTrigger value="syndication"><Rss className="mr-1.5 h-4 w-4" /> Syndication</TabsTrigger>}
          </TabsList>
          <TabsContent value="overview"><DashboardPanel ws={ws} /></TabsContent>
          <TabsContent value="listings"><ListingsPanel ws={ws} canManage={canManage} creating={creating} onCreate={createDraft} /></TabsContent>
          <TabsContent value="leads"><LeadsPanel ws={ws} /></TabsContent>
          <TabsContent value="buyers"><BuyersPanel ws={ws} /></TabsContent>
          <TabsContent value="sellers"><SellersPanel ws={ws} /></TabsContent>
          <TabsContent value="viewings"><ViewingsPanel ws={ws} /></TabsContent>
          <TabsContent value="lettings"><LettingsPortfolioPanel ws={ws} /></TabsContent>
          <TabsContent value="sales"><SalesPanel ws={ws} /></TabsContent>
          {canManage && <TabsContent value="syndication"><FeedCard ws={ws} /></TabsContent>}
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

  if (!d) return <InlineLoader />;

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
      {d.commission && d.commission.sold_count > 0 && (() => {
        const money = (n: number) => new Intl.NumberFormat('en-GB', { style: 'currency', currency: d.commission.currency || 'EUR', maximumFractionDigits: 0 }).format(n);
        return (
          <Card><CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 p-4">
            <div className="text-sm font-semibold">Commissions <span className="text-xs font-normal text-muted-foreground">(year to date)</span></div>
            <div><div className="text-[11px] text-muted-foreground">Sold</div><div className="text-base font-semibold">{d.commission.sold_count}</div></div>
            <div><div className="text-[11px] text-muted-foreground">Gross sales</div><div className="text-base font-semibold">{money(d.commission.gross_sales)}</div></div>
            <div><div className="text-[11px] text-muted-foreground">Commission (net)</div><div className="text-base font-semibold text-emerald-500">{money(d.commission.commission_net)}</div></div>
            <div><div className="text-[11px] text-muted-foreground">Invoiced</div><div className="text-base font-semibold">{d.commission.invoiced_count}/{d.commission.sold_count}</div></div>
          </CardContent></Card>
        );
      })()}
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

const FeedCard: React.FC<{ ws: string | null }> = ({ ws }) => {
  const { toast } = useToast();
  const [s, setS] = useState<FeedSettings | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (ws) realEstateService.getFeedSettings(ws).then(setS).catch(() => {}); }, [ws]);
  if (!ws) return null;

  const patch = async (p: { feed_enabled?: boolean; feed_format?: string }) => {
    setBusy(true);
    try { setS(await realEstateService.updateFeedSettings(ws, p)); } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); } finally { setBusy(false); }
  };
  const url = s ? feedUrl(s.feed_token, s.feed_format) : '';

  return (
    <Card><CardContent className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Rss className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Portal syndication feed</span>
        <label className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={!!s?.feed_enabled} disabled={busy || !s} onChange={(e) => patch({ feed_enabled: e.target.checked })} /> Enabled
        </label>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">Portals (Kyero network, OpenImmo-compatible, custom) pull this URL to import your live public listings. Only <span className="font-medium">active + public</span> listings are included.</p>
      {s && (
        <>
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Format</span>
            <select className="h-8 rounded-md border bg-background px-2 text-xs" value={s.feed_format} disabled={busy} onChange={(e) => patch({ feed_format: e.target.value })}>
              <option value="kyero">Kyero v3 (ES/PT/IT)</option>
              <option value="openimmo">OpenImmo (DACH)</option>
              <option value="generic">Generic XML</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md border bg-muted/40 px-2 py-1.5 text-[11px]">{s.feed_enabled ? url : 'Enable the feed to reveal the URL'}</code>
            <Button variant="ghost" size="sm" className="rounded-full" disabled={!s.feed_enabled} onClick={() => { void navigator.clipboard.writeText(url); toast({ title: 'Feed URL copied' }); }}><Copy className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="sm" className="rounded-full" disabled={busy} title="Rotate token" onClick={async () => { setBusy(true); try { setS(await realEstateService.rotateFeedToken(ws)); toast({ title: 'Token rotated — update your portals' }); } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); } finally { setBusy(false); } }}><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>
        </>
      )}
    </CardContent></Card>
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

  if (rows === null) return <InlineLoader />;
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

  if (rows === null) return <InlineLoader />;
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

const SellersPanel: React.FC<{ ws: string | null }> = ({ ws }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<SellerLead[] | null>(null);
  useEffect(() => {
    if (!ws) return;
    realEstateService.listSellers(ws).then(setRows).catch((e) => { toast({ title: 'Failed to load sellers', description: (e as Error).message, variant: 'destructive' }); setRows([]); });
  }, [ws, toast]);
  if (rows === null) return <InlineLoader />;
  if (rows.length === 0) return <div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No seller leads yet. Valuation requests from your public profile capture sellers here.</div>;
  return (
    <Card><CardContent className="p-0"><div className="divide-y divide-border">
      {rows.map((s) => (
        <button key={s.crm_contact_id} onClick={() => navigate(`/crm/contacts/${s.crm_contact_id}`)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-muted/40">
          <div className="min-w-0 flex-1">
            <div className="font-medium">{s.contact?.name || 'Seller'} <span className="text-xs text-muted-foreground">{s.contact?.email}</span></div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{s.owned_property_address || '—'}{s.owned_property_value != null ? ` · est. ${money(s.owned_property_value, 'EUR')}` : ''}</div>
          </div>
          {s.contact?.lead_score != null && <Badge className="rounded-full border-0 bg-primary/15 text-[11px] text-primary" title="Lead score">{s.contact.lead_score}</Badge>}
          <Badge className="rounded-full border-0 bg-muted text-[11px] capitalize">{(s.contact?.lead_status || 'new').replace('_', ' ')}</Badge>
        </button>
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

  if (rows === null) return <InlineLoader />;
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

// #281 — registered buyers (saved searches) across the portfolio.
const CRITERIA_KEYS: [string, string][] = [['property_type', ''], ['transaction_type', ''], ['town', ''], ['region', ''], ['bedrooms_min', 'beds ≥'], ['price_max', '≤']];
const summariseCriteria = (c: Record<string, any>): string => {
  const parts: string[] = [];
  for (const [k, prefix] of CRITERIA_KEYS) { const v = c?.[k]; if (v !== undefined && v !== null && v !== '') parts.push(`${prefix ? prefix + ' ' : ''}${v}`); }
  return parts.length ? parts.join(' · ') : 'Any property';
};
const BuyersPanel: React.FC<{ ws: string | null }> = ({ ws }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<BuyerRequirement[] | null>(null);
  useEffect(() => {
    if (!ws) return;
    realEstateService.listBuyerRequirements(ws).then(setRows).catch((e) => { toast({ title: 'Failed to load buyers', description: (e as Error).message, variant: 'destructive' }); setRows([]); });
  }, [ws, toast]);
  if (rows === null) return <InlineLoader />;
  if (rows.length === 0) return <div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No registered buyers yet. Add a buyer’s requirements from their CRM contact → Property tab, and new matching listings alert you automatically.</div>;
  return (
    <Card><CardContent className="p-0"><div className="divide-y divide-border">
      {rows.map((r) => (
        <button key={r.id} onClick={() => r.crm_contact_id && navigate(`/crm/contacts/${r.crm_contact_id}`)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-muted/40">
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">{r.contact?.name || 'Buyer'} {r.label && <span className="text-xs text-muted-foreground">· {r.label}</span>}</div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{summariseCriteria(r.criteria)}</div>
          </div>
          {!r.is_active && <Badge className="rounded-full border-0 bg-muted text-[11px]">paused</Badge>}
        </button>
      ))}
    </div></CardContent></Card>
  );
};

// #281 — portfolio lettings: active tenancies + open maintenance across all rentals.
const LettingsPortfolioPanel: React.FC<{ ws: string | null }> = ({ ws }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tenancies, setTenancies] = useState<Tenancy[] | null>(null);
  const [work, setWork] = useState<MaintenanceWorkOrder[]>([]);
  useEffect(() => {
    if (!ws) return;
    realEstateService.listTenancies(ws).then(setTenancies).catch((e) => { toast({ title: 'Failed to load lettings', description: (e as Error).message, variant: 'destructive' }); setTenancies([]); });
    realEstateService.listMaintenance(ws, { status: 'open' }).then(setWork).catch(() => setWork([]));
  }, [ws, toast]);
  if (tenancies === null) return <InlineLoader />;
  const freq = (t: Tenancy) => `/${t.rent_frequency.replace('ly', '').replace('month', 'mo').replace('week', 'wk').replace('quarter', 'qtr').replace('year', 'yr')}`;
  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><KeyRound className="h-4 w-4" /> Active tenancies</div>
        {tenancies.length === 0 ? <div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No tenancies yet. Set one up from a rental listing’s Lettings tab.</div> : (
          <Card><CardContent className="p-0"><div className="divide-y divide-border">
            {tenancies.map((t) => (
              <button key={t.id} onClick={() => navigate(`/properties/${t.property_id}`)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{t.property?.title || 'Rental'} <span className="text-xs text-muted-foreground">· {t.tenant?.name || 'no tenant'}</span></div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{money(t.rent_amount, t.currency)}{freq(t)} · from {new Date(t.start_date).toLocaleDateString()}</div>
                </div>
                <Badge className="rounded-full border-0 bg-muted text-[11px] capitalize">{t.status}</Badge>
              </button>
            ))}
          </div></CardContent></Card>
        )}
      </div>
      {work.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Wrench className="h-4 w-4" /> Open maintenance <Badge className="rounded-full border-0 bg-amber-500/15 text-[10px] text-amber-500">{work.length}</Badge></div>
          <Card><CardContent className="p-0"><div className="divide-y divide-border">
            {work.map((w) => (
              <button key={w.id} onClick={() => navigate(`/properties/${w.property_id}`)} className="flex w-full items-center gap-4 px-4 py-3 text-left text-sm hover:bg-muted/40">
                <Wrench className="h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="flex-1"><div className="font-medium">{w.title}</div><div className="text-xs text-muted-foreground">{w.property?.title || 'Property'}</div></div>
                <Badge className="rounded-full border-0 bg-muted text-[11px] capitalize">{w.priority}</Badge>
              </button>
            ))}
          </div></CardContent></Card>
        </div>
      )}
    </div>
  );
};

// #281 — completed sales + commission (the portfolio view of "how much have we earned").
const SalesPanel: React.FC<{ ws: string | null }> = ({ ws }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<PropertySale[] | null>(null);
  useEffect(() => {
    if (!ws) return;
    realEstateService.listSales(ws).then(setRows).catch((e) => { toast({ title: 'Failed to load sales', description: (e as Error).message, variant: 'destructive' }); setRows([]); });
  }, [ws, toast]);
  if (rows === null) return <InlineLoader />;
  if (rows.length === 0) return <div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No completed sales yet. Close one from a listing’s Offers tab → “Complete sale & commission”.</div>;
  const totalCommission = rows.reduce((t, s) => t + Number(s.commission_base ?? 0), 0);
  const ccy = rows[0]?.currency ?? 'EUR';
  return (
    <div className="space-y-4">
      <Card><CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 p-4">
        <div><div className="text-[11px] text-muted-foreground">Completed</div><div className="text-base font-semibold">{rows.length}</div></div>
        <div><div className="text-[11px] text-muted-foreground">Commission (net)</div><div className="text-base font-semibold text-emerald-500">{money(totalCommission, ccy)}</div></div>
        <div><div className="text-[11px] text-muted-foreground">Invoiced</div><div className="text-base font-semibold">{rows.filter((s) => s.invoice_id).length}/{rows.length}</div></div>
      </CardContent></Card>
      <Card><CardContent className="p-0"><div className="divide-y divide-border">
        {rows.map((s) => (
          <button key={s.id} onClick={() => navigate(`/properties/${s.property_id}`)} className="flex w-full items-center gap-4 px-4 py-3 text-left hover:bg-muted/40">
            <Handshake className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="font-medium">{s.property?.title || 'Property'} <span className="text-xs text-muted-foreground">· sold {money(s.sale_price, s.currency)}</span></div>
              <div className="mt-0.5 text-xs text-muted-foreground">{s.seller?.name ? `${s.seller.name} · ` : ''}{new Date(s.completed_at).toLocaleDateString()}</div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-emerald-500">{money(s.commission_base, s.currency)}</div>
              {s.invoice_id
                ? <Badge className="rounded-full border-0 bg-primary/15 text-[10px] capitalize">{s.invoice_status || 'invoiced'}</Badge>
                : <span className="text-[10px] text-muted-foreground">not invoiced</span>}
            </div>
          </button>
        ))}
      </div></CardContent></Card>
    </div>
  );
};
