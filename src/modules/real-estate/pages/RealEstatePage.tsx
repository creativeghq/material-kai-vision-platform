import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Plus, Eye, Globe, Inbox, CalendarClock, LayoutDashboard, Loader2, Store, Handshake, KeyRound, Users, Wrench, Lock, LineChart, Columns3, Link as LinkIcon, Trash2, Pencil } from 'lucide-react';
import { PipelineBoard } from '../components/PipelineBoard';
import { CmaReportDialog } from '../components/CmaReportDialog';
import { ContactSearchDropdown } from '@/components/business/crm/ContactSearchDropdown';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import { Checkbox } from '@/components/core/ui/checkbox';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useEntitlements } from '@/hooks/useEntitlements';
import { ModuleTabGate } from '@/components/core/ModuleTabGate';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/core/ui/tabs';
import { realEstateService, feedUrl, type PropertyListItem, type PropertyInquiry, type PropertyViewing, type RealEstateDashboard, type FeedSettings, type SellerLead, type PropertySale, type Tenancy, type MaintenanceWorkOrder, type BuyerRequirement, type PropertyInvestment, type InvestmentPortfolio } from '../services/realEstateService';
import { statusTone } from '@/utils/statusTone';
import { Rss, Copy, RefreshCw } from 'lucide-react';

const money = (n: number | null, ccy: string) => (n == null ? '—' : new Intl.NumberFormat('en-GB', { style: 'currency', currency: ccy || 'EUR', maximumFractionDigits: 0 }).format(n));
// Canonical tab trigger styling (design-system.md → Tabs): flat primary active state, icon+label gap.
const RE_TAB = 'flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground';

// Lightweight in-content loader (matches Finance/CRM — never a full-bleed skeleton block).
const InlineLoader: React.FC = () => (
  <div className="flex items-center justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
);

export default function RealEstatePage() {
  const { activeWorkspaceId, loading: wsLoading } = useWorkspace();
  const { can } = usePermissions();
  const { isModuleAvailable } = useEntitlements();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const canManage = can('realestate.listings.manage');
  const ws = activeWorkspaceId;
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'overview'; // deep-linkable from the App launcher
  // add-on entitlements (Property Management + Investments). Tabs stay visible so the add-on
  // is discoverable; when not entitled they render an Enable card instead of the (402-gated) panel.
  const pmEnabled = isModuleAvailable('real-estate-management');
  const investEnabled = isModuleAvailable('real-estate-investments');

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
        <Tabs value={tab} onValueChange={(v) => setSearchParams(v === 'overview' ? {} : { tab: v }, { replace: true })}>
          <TabsList className="mb-4 h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="overview" className={RE_TAB}><LayoutDashboard className="h-4 w-4" /> Overview</TabsTrigger>
            <TabsTrigger value="listings" className={RE_TAB}><Building2 className="h-4 w-4" /> Listings</TabsTrigger>
            <TabsTrigger value="pipeline" className={RE_TAB}><Columns3 className="h-4 w-4" /> Pipeline</TabsTrigger>
            <TabsTrigger value="leads" className={RE_TAB}><Inbox className="h-4 w-4" /> Leads</TabsTrigger>
            <TabsTrigger value="buyers" className={RE_TAB}><Users className="h-4 w-4" /> Buyers</TabsTrigger>
            <TabsTrigger value="sellers" className={RE_TAB}><Store className="h-4 w-4" /> Sellers</TabsTrigger>
            <TabsTrigger value="viewings" className={RE_TAB}><CalendarClock className="h-4 w-4" /> Viewings</TabsTrigger>
            <TabsTrigger value="sales" className={RE_TAB}><Handshake className="h-4 w-4" /> Sales</TabsTrigger>
            <TabsTrigger value="lettings" className={RE_TAB}><KeyRound className="h-4 w-4" /> Property Mgmt{!pmEnabled && <Lock className="h-3 w-3 text-muted-foreground" />}</TabsTrigger>
            <TabsTrigger value="investments" className={RE_TAB}><LineChart className="h-4 w-4" /> Investments{!investEnabled && <Lock className="h-3 w-3 text-muted-foreground" />}</TabsTrigger>
            {canManage && <TabsTrigger value="syndication" className={RE_TAB}><Rss className="h-4 w-4" /> Syndication</TabsTrigger>}
          </TabsList>
          <TabsContent value="overview"><DashboardPanel ws={ws} /></TabsContent>
          <TabsContent value="pipeline"><PipelineBoard ws={ws} canManage={canManage} /></TabsContent>
          <TabsContent value="listings"><ListingsPanel ws={ws} canManage={canManage} creating={creating} onCreate={createDraft} /></TabsContent>
          <TabsContent value="leads"><LeadsPanel ws={ws} /></TabsContent>
          <TabsContent value="buyers"><BuyersPanel ws={ws} /></TabsContent>
          <TabsContent value="sellers"><SellersPanel ws={ws} /></TabsContent>
          <TabsContent value="viewings"><ViewingsPanel ws={ws} /></TabsContent>
          <TabsContent value="sales"><SalesPanel ws={ws} /></TabsContent>
          <TabsContent value="lettings">
            <ModuleTabGate moduleSlug="real-estate-management" moduleName="Property Management"
              blurb="Manage rentals end to end: tenancies, rent schedules & payments, maintenance work orders, and landlord statements.">
              <LettingsPortfolioPanel ws={ws} />
            </ModuleTabGate>
          </TabsContent>
          <TabsContent value="investments">
            <ModuleTabGate moduleSlug="real-estate-investments" moduleName="Investments"
              blurb="Model investment properties: purchase + costs + financing + rent → gross/net yield, cap rate, cash-on-cash and monthly cash flow, with a portfolio roll-up.">
              <InvestmentsPanel ws={ws} />
            </ModuleTabGate>
          </TabsContent>
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
                <span className={`text-[11px] capitalize ${statusTone(v.status)}`}>{v.status.replace('_', ' ')}</span>
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
                <span className={`text-[11px] capitalize ${statusTone(q.status)}`}>{q.status.replace('_', ' ')}</span>
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
          <Checkbox checked={!!s?.feed_enabled} disabled={busy || !s} onCheckedChange={(v) => patch({ feed_enabled: v === true })} /> Enabled
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
            <span className={`text-[11px] capitalize ${statusTone(r.listing_status)}`}>{r.listing_status.replace('_', ' ')}</span>
          </div>
        </button>
      ))}
    </div></CardContent></Card>
  );
};

const LeadsPanel: React.FC<{ ws: string | null }> = ({ ws }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [rows, setRows] = useState<PropertyInquiry[] | null>(null);
  const load = useCallback(() => {
    if (!ws) return;
    realEstateService.listInquiries(ws).then(setRows).catch((e) => { toast({ title: 'Failed to load leads', description: (e as Error).message, variant: 'destructive' }); setRows([]); });
  }, [ws, toast]);
  useEffect(() => { load(); }, [load]);
  // Leads are captured by the inquiry form on the agency's public page (/u/{userId}: listings +
  // valuation widget). Surface it so agents know where public leads come from / what to share.
  const header = ws ? (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      {user?.id
        ? <a href={`/u/${user.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary" title="Your public agency page — listings, inquiry form & valuation widget"><Globe className="h-3.5 w-3.5" /> Where leads come from → your public page &amp; inquiry form</a>
        : <span />}
      <AddLeadButton ws={ws} onAdded={load} />
    </div>
  ) : null;

  if (rows === null) return <>{header}<InlineLoader /></>;
  if (rows.length === 0) return <>{header}<div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No leads yet. Add one here, or they arrive from your public listing pages.</div></>;
  return (
    <>{header}
    <Card><CardContent className="p-0"><div className="divide-y divide-border">
      {rows.map((q) => <LeadRow key={q.id} ws={ws as string} q={q} onChanged={load} />)}
    </div></CardContent></Card>
    </>
  );
};

// Link an existing CRM contact into Real Estate as a buyer/seller (writes
// property_contacts_ext.contact_role). The manual counterpart to the inbound capture paths
// (public valuation widget / listing inquiries): the cross-module "connect" affordance — pick a
// contact from the shared CRM spine and give it a real-estate role.
const AddPartyButton: React.FC<{ ws: string; role: 'seller' | 'buyer'; onAdded: () => void }> = ({ ws, role, onAdded }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!contactId) return;
    setBusy(true);
    try {
      await realEstateService.upsertContactExt(ws, contactId, { contact_role: role });
      toast({ title: `Added as ${role}` });
      setOpen(false); setContactId(null); onAdded();
    } catch (e) { toast({ title: 'Could not add', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return (
    <>
      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Add {role}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle className="capitalize">Add a {role}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Pick an existing CRM contact to track as a {role}. New person? Create them in CRM first, then link here.</p>
            <ContactSearchDropdown selectedContactId={contactId} onSelect={setContactId} placeholder={`Search CRM contacts to add as ${role}…`} />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="rounded-full capitalize" onClick={save} disabled={!contactId || busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add {role}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Shared property picker for the global "add" flows whose create is property-scoped
// (schedule viewing / add tenancy / add investment) — pick the listing first.
const PropertySelect: React.FC<{ ws: string | null; value: string; onChange: (id: string) => void }> = ({ ws, value, onChange }) => {
  const [opts, setOpts] = useState<PropertyListItem[]>([]);
  useEffect(() => { if (ws) realEstateService.listProperties(ws).then(setOpts).catch(() => setOpts([])); }, [ws]);
  return (
    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Select a property…</option>
      {opts.map((p) => <option key={p.id} value={p.id}>{p.title || 'Untitled'}{p.reference_code ? ` · #${p.reference_code}` : ''}</option>)}
    </select>
  );
};

// Schedule a viewing from the global Viewings tab (inline — createViewing is simple).
const ScheduleViewingButton: React.FC<{ ws: string; onAdded: () => void }> = ({ ws, onAdded }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [propertyId, setPropertyId] = useState('');
  const [when, setWhen] = useState('');
  const [type, setType] = useState('viewing');
  const [contactId, setContactId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!propertyId || !when) return;
    setBusy(true);
    try {
      await realEstateService.createViewing(ws, { property_id: propertyId, scheduled_at: new Date(when).toISOString(), type, crm_contact_id: contactId ?? undefined });
      toast({ title: 'Viewing scheduled' });
      setOpen(false); setPropertyId(''); setWhen(''); setContactId(null); onAdded();
    } catch (e) { toast({ title: 'Could not schedule', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  return (
    <>
      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Schedule viewing</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Schedule a Viewing</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><span className="mb-1 block text-xs text-muted-foreground">Property</span><PropertySelect ws={ws} value={propertyId} onChange={setPropertyId} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><label htmlFor="viewing-when" className="mb-1 block text-xs text-muted-foreground">When</label><input id="viewing-when" type="datetime-local" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
              <div><label htmlFor="viewing-type" className="mb-1 block text-xs text-muted-foreground">Type</label><select id="viewing-type" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={type} onChange={(e) => setType(e.target.value)}>{/* These values are real-estate-api's VIEWING_TYPES. The select used to emit 'in_person' and 'virtual', neither of which the allowlist knew, and the API SUBSTITUTED rather than rejected — so two of three options, including the default, were silently stored as an ordinary viewing. */}
                {([['viewing', 'in person'], ['virtual', 'virtual'], ['tour', 'tour'], ['open_house', 'open house']] as const).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></div>
            </div>
            <div><span className="mb-1 block text-xs text-muted-foreground">Attendee (optional)</span><ContactSearchDropdown selectedContactId={contactId} onSelect={setContactId} placeholder="Link a CRM contact…" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="rounded-full" onClick={save} disabled={!propertyId || !when || busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Schedule</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Add a buyer (saved-search requirement) from the global Buyers tab (inline).
const AddBuyerButton: React.FC<{ ws: string; onAdded: () => void }> = ({ ws, onAdded }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [contactId, setContactId] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [c, setC] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!contactId) return;
    setBusy(true);
    try {
      const criteria: Record<string, any> = {};
      if (c.property_type) criteria.property_type = c.property_type;
      if (c.town) criteria.town = c.town;
      if (c.bedrooms_min) criteria.bedrooms_min = Number(c.bedrooms_min);
      if (c.price_max) criteria.price_max = Number(c.price_max);
      await realEstateService.upsertBuyerRequirement(ws, { crm_contact_id: contactId, label: label || undefined, criteria });
      toast({ title: 'Buyer added' });
      setOpen(false); setContactId(null); setLabel(''); setC({}); onAdded();
    } catch (e) { toast({ title: 'Could not add buyer', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const field = (k: string, ph: string, t = 'text') => <input type={t} placeholder={ph} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={c[k] ?? ''} onChange={(e) => setC((p) => ({ ...p, [k]: e.target.value }))} />;
  return (
    <>
      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Add buyer</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add a Buyer</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label htmlFor="realestatepage-contact" className="mb-1 block text-xs text-muted-foreground">Contact</label><ContactSearchDropdown selectedContactId={contactId} onSelect={setContactId} placeholder="Search CRM contacts…" /></div>
            <input id="realestatepage-contact" placeholder="Label (e.g. “3-bed in Athens”)" className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={label} onChange={(e) => setLabel(e.target.value)} />
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Requirements (optional — auto-matches new listings)</div>
              <div className="grid grid-cols-2 gap-2">{field('property_type', 'Type e.g. apartment')}{field('town', 'Town')}{field('bedrooms_min', 'Min beds', 'number')}{field('price_max', 'Max price', 'number')}</div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="rounded-full" onClick={save} disabled={!contactId || busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add buyer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Pick a property then jump to its detail tab where the full contextual form lives
// (tenancy / investment — heavy forms not worth duplicating in a global dialog).
const AddViaPropertyButton: React.FC<{ ws: string; label: string; tab: string }> = ({ ws, label, tab }) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [propertyId, setPropertyId] = useState('');
  return (
    <>
      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> {label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">Choose the property — you’ll continue on its {tab} tab.</p>
            <PropertySelect ws={ws} value={propertyId} onChange={setPropertyId} />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="rounded-full" onClick={() => propertyId && navigate(`/properties/${propertyId}?tab=${tab}`)} disabled={!propertyId}>Continue</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Manually add a lead (off-web contact) from the global Leads tab. property_inquiries requires a
// property, so a lead is property-scoped; the backend also creates the CRM contact (D9).
const AddLeadButton: React.FC<{ ws: string; onAdded: () => void }> = ({ ws, onAdded }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [propertyId, setPropertyId] = useState('');
  const [f, setF] = useState<{ name?: string; email?: string; phone?: string; message?: string }>({});
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!propertyId || !f.name?.trim()) return;
    setBusy(true);
    try {
      await realEstateService.createInquiry(ws, { property_id: propertyId, name: f.name.trim(), email: f.email, phone: f.phone, message: f.message });
      toast({ title: 'Lead added' });
      setOpen(false); setPropertyId(''); setF({}); onAdded();
    } catch (e) { toast({ title: 'Could not add lead', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const field = (k: 'name' | 'email' | 'phone', ph: string, t = 'text') => <input type={t} placeholder={ph} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f[k] ?? ''} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} />;
  return (
    <>
      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Add lead</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add a Lead</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label htmlFor="realestatepage-property-they-re-interested-in" className="mb-1 block text-xs text-muted-foreground">Property they’re interested in</label><PropertySelect ws={ws} value={propertyId} onChange={setPropertyId} /></div>
            <div className="grid grid-cols-2 gap-2">{field('name', 'Name')}{field('email', 'Email', 'email')}</div>
            {field('phone', 'Phone')}
            <textarea id="realestatepage-property-they-re-interested-in" placeholder="Notes / What they’re after…" rows={2} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" value={f.message ?? ''} onChange={(e) => setF((p) => ({ ...p, message: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>Cancel</Button>
            <Button className="rounded-full" onClick={save} disabled={!propertyId || !f.name?.trim() || busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Add lead</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'viewing_booked', 'closed', 'spam'];

// Reusable destructive-confirm icon button for list rows.
const DeleteIconButton: React.FC<{ title: string; confirmText: string; onDelete: () => Promise<void> }> = ({ title, confirmText, onDelete }) => {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const go = async () => { setBusy(true); try { await onDelete(); setOpen(false); } finally { setBusy(false); } };
  return (
    <>
      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-red-500 hover:bg-red-500/10 hover:text-red-600" title={title} onClick={(e) => { e.stopPropagation(); setOpen(true); }}><Trash2 className="h-3.5 w-3.5" /></Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{title}?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">{confirmText}</p>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setOpen(false)}>Cancel</Button>
            <Button variant="destructive" className="rounded-full" onClick={go} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

// A lead row with inline status change + edit + delete (the Leads tab is a plain list, not a link).
const LeadRow: React.FC<{ ws: string; q: PropertyInquiry; onChanged: () => void }> = ({ ws, q, onChanged }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ name: q.name ?? '', email: q.email ?? '', phone: q.phone ?? '', message: q.message ?? '' });
  const setStatus = async (status: string) => {
    try { await realEstateService.editInquiry(ws, q.id, { status }); onChanged(); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
  };
  const saveEdit = async () => {
    setBusy(true);
    try { await realEstateService.editInquiry(ws, q.id, f); toast({ title: 'Lead updated' }); setEditing(false); onChanged(); }
    catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setBusy(false); }
  };
  const field = (k: 'name' | 'email' | 'phone', ph: string, t = 'text') => <input type={t} placeholder={ph} className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.value }))} />;
  return (
    <div className="flex items-start gap-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="font-medium">{q.name || 'Anonymous'} <span className="text-xs text-muted-foreground">{q.email}</span></div>
        {q.property?.title && <button onClick={() => navigate(`/properties/${q.property_id}`)} className="text-xs text-primary hover:underline">{q.property.title}</button>}
        {q.message && <div className="mt-0.5 line-clamp-1 text-sm text-muted-foreground">{q.message}</div>}
        <div className="mt-0.5 text-[11px] text-muted-foreground">{new Date(q.created_at).toLocaleString()}</div>
      </div>
      <select className="h-7 shrink-0 rounded-md border bg-background px-1.5 text-xs capitalize" value={q.status} onChange={(e) => setStatus(e.target.value)} title="Status">
        {LEAD_STATUSES.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
      </select>
      {q.crm_contact_id && <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" title="Open CRM contact" onClick={() => navigate(`/crm/contacts/${q.crm_contact_id}`)}><Users className="h-3.5 w-3.5" /></Button>}
      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" title="Edit lead" onClick={() => { setF({ name: q.name ?? '', email: q.email ?? '', phone: q.phone ?? '', message: q.message ?? '' }); setEditing(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
      <DeleteIconButton title="Delete lead" confirmText={`Delete the lead “${q.name || q.email || 'this lead'}”? This removes the inquiry record.`} onDelete={() => realEstateService.deleteInquiry(ws, q.id).then(() => onChanged())} />
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Lead</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">{field('name', 'Name')}{field('email', 'Email', 'email')}</div>
            {field('phone', 'Phone')}
            <textarea placeholder="Notes…" rows={2} className="w-full rounded-md border bg-background px-2 py-1.5 text-sm" value={f.message} onChange={(e) => setF((p) => ({ ...p, message: e.target.value }))} />
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-full" onClick={() => setEditing(false)}>Cancel</Button>
            <Button className="rounded-full" onClick={saveEdit} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

const SellersPanel: React.FC<{ ws: string | null }> = ({ ws }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<SellerLead[] | null>(null);
  const [cmaOpen, setCmaOpen] = useState(false);
  const load = useCallback(() => {
    if (!ws) return;
    realEstateService.listSellers(ws).then(setRows).catch((e) => { toast({ title: 'Failed to load sellers', description: (e as Error).message, variant: 'destructive' }); setRows([]); });
  }, [ws, toast]);
  useEffect(() => { load(); }, [load]);
  const cmaButton = ws ? (
    <div className="mb-3 flex justify-end gap-2">
      <AddPartyButton ws={ws} role="seller" onAdded={load} />
      <Button size="sm" variant="outline" className="rounded-full" onClick={() => setCmaOpen(true)}><LineChart className="mr-1.5 h-4 w-4" /> Generate CMA</Button>
      <CmaReportDialog ws={ws} open={cmaOpen} onOpenChange={setCmaOpen} />
    </div>
  ) : null;
  if (rows === null) return <>{cmaButton}<InlineLoader /></>;
  if (rows.length === 0) return <>{cmaButton}<div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No seller leads yet. Valuation requests from your public profile capture sellers here — and you can pitch one with a CMA above.</div></>;
  return (
    <>
    {cmaButton}
    <Card><CardContent className="p-0"><div className="divide-y divide-border">
      {rows.map((s) => (
        <div key={s.crm_contact_id} className="flex items-center hover:bg-muted/40">
          <button onClick={() => navigate(`/crm/contacts/${s.crm_contact_id}`)} className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left">
            <div className="min-w-0 flex-1">
              <div className="font-medium">{s.contact?.name || 'Seller'} <span className="text-xs text-muted-foreground">{s.contact?.email}</span></div>
              <div className="mt-0.5 truncate text-xs text-muted-foreground">{s.owned_property_address || '—'}{s.owned_property_value != null ? ` · est. ${money(s.owned_property_value, 'EUR')}` : ''}</div>
            </div>
            {s.contact?.lead_score != null && <Badge className="rounded-full border-0 bg-primary/15 text-[11px] text-primary" title="Lead score">{s.contact.lead_score}</Badge>}
            <span className={`text-[11px] capitalize ${statusTone(s.contact?.lead_status || 'new')}`}>{(s.contact?.lead_status || 'new').replace('_', ' ')}</span>
          </button>
          <div className="pr-3"><DeleteIconButton title="Remove seller" confirmText={`Remove ${s.contact?.name || 'this person'} from the sellers list? Their CRM contact stays — only the seller role is removed.`} onDelete={() => realEstateService.unlinkContact(ws as string, s.crm_contact_id).then(load)} /></div>
        </div>
      ))}
    </div></CardContent></Card>
    </>
  );
};

const ViewingsPanel: React.FC<{ ws: string | null }> = ({ ws }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<PropertyViewing[] | null>(null);
  const load = useCallback(() => {
    if (!ws) return;
    realEstateService.listViewings(ws).then(setRows).catch((e) => { toast({ title: 'Failed to load viewings', description: (e as Error).message, variant: 'destructive' }); setRows([]); });
  }, [ws, toast]);
  useEffect(() => { load(); }, [load]);
  const header = ws ? <div className="mb-3 flex justify-end"><ScheduleViewingButton ws={ws} onAdded={load} /></div> : null;

  if (rows === null) return <>{header}<InlineLoader /></>;
  if (rows.length === 0) return <>{header}<div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No viewings scheduled.</div></>;
  return (
    <>{header}
    <Card><CardContent className="p-0"><div className="divide-y divide-border">
      {rows.map((v) => (
        <div key={v.id} className="flex items-center hover:bg-muted/40">
          <button onClick={() => navigate(`/properties/${v.property_id}`)} className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left text-sm">
            <CalendarClock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1"><div className="font-medium">{new Date(v.scheduled_at).toLocaleString()}</div><div className="text-xs text-muted-foreground">{v.property?.title || 'Listing'} · <span className="capitalize">{v.type.replace('_', ' ')}</span></div></div>
            <span className={`text-[11px] capitalize ${statusTone(v.status)}`}>{v.status.replace('_', ' ')}</span>
          </button>
          <div className="pr-3"><DeleteIconButton title="Delete viewing" confirmText="Delete this viewing from the calendar?" onDelete={() => realEstateService.deleteViewing(ws as string, v.id).then(load)} /></div>
        </div>
      ))}
    </div></CardContent></Card>
    </>
  );
};

// Registered buyers (saved searches) across the portfolio.
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
  const load = useCallback(() => {
    if (!ws) return;
    realEstateService.listBuyerRequirements(ws).then(setRows).catch((e) => { toast({ title: 'Failed to load buyers', description: (e as Error).message, variant: 'destructive' }); setRows([]); });
  }, [ws, toast]);
  useEffect(() => { load(); }, [load]);
  const header = ws ? <div className="mb-3 flex justify-end"><AddBuyerButton ws={ws} onAdded={load} /></div> : null;
  if (rows === null) return <>{header}<InlineLoader /></>;
  if (rows.length === 0) return <>{header}<div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No registered buyers yet. Add one here, or from a CRM contact → Property tab — new matching listings alert you automatically.</div></>;
  const copyPortal = (token?: string | null) => {
    if (!token) { toast({ title: 'No portal link for this search yet', variant: 'destructive' }); return; }
    void navigator.clipboard.writeText(`${window.location.origin}/buyer/${token}`);
    toast({ title: 'Buyer portal link copied', description: 'Send it to the buyer — it shows their live matches.' });
  };
  return (
    <>{header}
    <Card><CardContent className="p-0"><div className="divide-y divide-border">
      {rows.map((r) => (
        <div key={r.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40">
          <Users className="h-4 w-4 shrink-0 text-muted-foreground" />
          <button onClick={() => r.crm_contact_id && navigate(`/crm/contacts/${r.crm_contact_id}`)} className="min-w-0 flex-1 text-left">
            <div className="font-medium">{r.contact?.name || 'Buyer'} {r.label && <span className="text-xs text-muted-foreground">· {r.label}</span>}</div>
            <div className="mt-0.5 truncate text-xs text-muted-foreground">{summariseCriteria(r.criteria)}</div>
          </button>
          {!r.is_active && <span className={`text-[11px] ${statusTone('paused')}`}>paused</span>}
          <Button size="sm" variant="ghost" className="rounded-full" title="Copy buyer portal link" onClick={() => copyPortal(r.portal_token)}><LinkIcon className="mr-1 h-3.5 w-3.5" /> Portal</Button>
          <DeleteIconButton title="Delete buyer" confirmText={`Delete the saved search for ${r.contact?.name || 'this buyer'}? Their CRM contact stays.`} onDelete={() => realEstateService.deleteBuyerRequirement(ws as string, r.id).then(load)} />
        </div>
      ))}
    </div></CardContent></Card>
    </>
  );
};

// Portfolio lettings: active tenancies + open maintenance across all rentals.
const LettingsPortfolioPanel: React.FC<{ ws: string | null }> = ({ ws }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tenancies, setTenancies] = useState<Tenancy[] | null>(null);
  const [work, setWork] = useState<MaintenanceWorkOrder[]>([]);
  const load = useCallback(() => {
    if (!ws) return;
    realEstateService.listTenancies(ws).then(setTenancies).catch((e) => { toast({ title: 'Failed to load lettings', description: (e as Error).message, variant: 'destructive' }); setTenancies([]); });
    realEstateService.listMaintenance(ws, { status: 'open' }).then(setWork).catch(() => setWork([]));
  }, [ws, toast]);
  useEffect(() => { load(); }, [load]);
  if (tenancies === null) return <InlineLoader />;
  const freq = (t: Tenancy) => `/${t.rent_frequency.replace('ly', '').replace('month', 'mo').replace('week', 'wk').replace('quarter', 'qtr').replace('year', 'yr')}`;
  return (
    <div className="space-y-6">
      {ws && <div className="flex justify-end"><AddViaPropertyButton ws={ws} label="Add tenancy" tab="lettings" /></div>}
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><KeyRound className="h-4 w-4" /> Active tenancies</div>
        {tenancies.length === 0 ? <div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No tenancies yet. Set one up from a rental listing’s Lettings tab.</div> : (
          <Card><CardContent className="p-0"><div className="divide-y divide-border">
            {tenancies.map((t) => (
              <div key={t.id} className="flex items-center hover:bg-muted/40">
                <button onClick={() => navigate(`/properties/${t.property_id}`)} className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{t.property?.title || 'Rental'} <span className="text-xs text-muted-foreground">· {t.tenant?.name || 'no tenant'}</span></div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{money(t.rent_amount, t.currency)}{freq(t)} · from {new Date(t.start_date).toLocaleDateString()}</div>
                  </div>
                  <span className={`text-[11px] capitalize ${statusTone(t.status)}`}>{t.status}</span>
                </button>
                <div className="pr-3"><DeleteIconButton title="Delete tenancy" confirmText={`Delete the tenancy for ${t.property?.title || 'this rental'}? Rent charges and history for it are removed.`} onDelete={() => realEstateService.deleteTenancy(ws as string, t.id).then(load)} /></div>
              </div>
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
                <span className="text-[11px] capitalize text-muted-foreground">{w.priority}</span>
              </button>
            ))}
          </div></CardContent></Card>
        </div>
      )}
    </div>
  );
};

// Completed sales + commission (the portfolio view of "how much have we earned").
const SalesPanel: React.FC<{ ws: string | null }> = ({ ws }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [rows, setRows] = useState<PropertySale[] | null>(null);
  const load = useCallback(() => {
    if (!ws) return;
    realEstateService.listSales(ws).then(setRows).catch((e) => { toast({ title: 'Failed to load sales', description: (e as Error).message, variant: 'destructive' }); setRows([]); });
  }, [ws, toast]);
  useEffect(() => { load(); }, [load]);
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
          <div key={s.id} className="flex items-center hover:bg-muted/40">
            <button onClick={() => navigate(`/properties/${s.property_id}`)} className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left">
              <Handshake className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{s.property?.title || 'Property'} <span className="text-xs text-muted-foreground">· sold {money(s.sale_price, s.currency)}</span></div>
                <div className="mt-0.5 text-xs text-muted-foreground">{s.seller?.name ? `${s.seller.name} · ` : ''}{new Date(s.completed_at).toLocaleDateString()}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-emerald-500">{money(s.commission_base, s.currency)}</div>
                {s.invoice_id
                  ? <span className={`text-[10px] capitalize ${statusTone(s.invoice_status || 'invoiced')}`}>{s.invoice_status || 'invoiced'}</span>
                  : <span className="text-[10px] text-muted-foreground">not invoiced</span>}
              </div>
            </button>
            <div className="pr-3"><DeleteIconButton title="Delete sale" confirmText="Delete this completed sale? Its commission is removed from your reporting. This does not delete any linked invoice." onDelete={() => realEstateService.deleteSale(ws as string, s.id).then(load)} /></div>
          </div>
        ))}
      </div></CardContent></Card>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <div className={`dashboard-card p-3 ${accent ? 'ring-1 ring-primary/30' : ''}`}>
    <div className="text-[11px] text-muted-foreground">{label}</div>
    <div className={`mt-0.5 text-base font-semibold ${accent ? 'text-primary' : ''}`}>{value}</div>
  </div>
);

// Investments portfolio: per-property yield/cash-flow + roll-up.
const InvestmentsPanel: React.FC<{ ws: string | null }> = ({ ws }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [data, setData] = useState<{ investments: PropertyInvestment[]; portfolio: InvestmentPortfolio } | null>(null);
  const load = useCallback(() => {
    if (!ws) return;
    realEstateService.listInvestments(ws)
      .then(setData)
      .catch((e) => { toast({ title: 'Failed to load investments', description: (e as Error).message, variant: 'destructive' }); setData({ investments: [], portfolio: { count: 0, total_invested: 0, cash_invested: 0, annual_noi: 0, annual_cash_flow: 0, monthly_cash_flow: 0, blended_net_yield_pct: 0, currency: 'EUR' } }); });
  }, [ws, toast]);
  useEffect(() => { load(); }, [load]);
  if (data === null) return <InlineLoader />;
  const { investments, portfolio } = data;
  const ccy = portfolio.currency;
  const header = ws ? <div className="mb-3 flex justify-end"><AddViaPropertyButton ws={ws} label="Add investment" tab="investment" /></div> : null;
  if (investments.length === 0) return <>{header}<div className="dashboard-card p-10 text-center text-sm text-muted-foreground">No investment analysis yet. Add one here, or open a listing → <b>Investments</b> tab to model purchase, financing and rent.</div></>;
  return (
    <>{header}
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Properties" value={String(portfolio.count)} />
        <Stat label="Invested" value={money(portfolio.total_invested, ccy)} />
        <Stat label="Cash in" value={money(portfolio.cash_invested, ccy)} />
        <Stat label="Annual NOI" value={money(portfolio.annual_noi, ccy)} />
        <Stat label="Cash flow / mo" value={money(portfolio.monthly_cash_flow, ccy)} accent />
        <Stat label="Blended yield" value={`${portfolio.blended_net_yield_pct}%`} accent />
      </div>
      <Card><CardContent className="p-0"><div className="divide-y divide-border">
        {investments.map((iv) => (
          <div key={iv.id} className="flex items-center hover:bg-muted/40">
            <button onClick={() => navigate(`/properties/${iv.property_id}`)} className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left">
              <LineChart className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{iv.property?.title || 'Property'} <span className="text-xs text-muted-foreground">· {money(iv.metrics?.total_investment ?? 0, iv.currency)} in</span></div>
                <div className="mt-0.5 text-xs text-muted-foreground">net yield {iv.metrics?.net_yield_pct ?? 0}% · cap {iv.metrics?.cap_rate_pct ?? 0}% · CoC {iv.metrics?.cash_on_cash_pct ?? 0}%</div>
              </div>
              <div className={`shrink-0 text-sm font-semibold ${(iv.metrics?.monthly_cash_flow ?? 0) >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>{money(iv.metrics?.monthly_cash_flow ?? 0, iv.currency)}/mo</div>
            </button>
            <div className="pr-3"><DeleteIconButton title="Delete investment analysis" confirmText={`Remove the investment analysis for ${iv.property?.title || 'this property'}? The listing itself is not affected.`} onDelete={() => realEstateService.deleteInvestment(ws as string, iv.property_id).then(load)} /></div>
          </div>
        ))}
      </div></CardContent></Card>
    </div>
    </>
  );
};
