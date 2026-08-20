import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Home, Plus, Search, Trash2, Save, Sparkles, Pencil, ExternalLink, MapPin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { realEstateService, type BuyerRequirement, type ContactExt, type PropertyListItem } from '../services/realEstateService';
import { PropertyFormDialog, type PropertyFormValues } from './PropertyFormDialog';
import { scoreLead } from '@/modules/crm/services/leadScoring';
import { statusTone } from '@/utils/statusTone';
import { formatMoney, formatNumber } from '@/utils/decimal';
import { HubEmptyState } from '@/components/core/hub';

// real-estate panel on the CRM contact page: the person's PROPERTIES (own as many as they
// like — each a real listing record), their buyer profile (budget / pre-approval) and saved
// searches with an on-demand match against the workspace inventory.
export const PropertyBuyerPanel: React.FC<{ contactId: string; workspaceId: string | null }> = ({ contactId, workspaceId: ws }) => {
  const { toast } = useToast();
  const [ext, setExt] = useState<Partial<ContactExt>>({});
  const [reqs, setReqs] = useState<BuyerRequirement[]>([]);
  const [savingExt, setSavingExt] = useState(false);
  const [adding, setAdding] = useState(false);
  const [score, setScore] = useState<{ lead_score: number; health_score: number; rationale?: string } | null>(null);
  const [scoring, setScoring] = useState(false);
  const [cp, setCp] = useState<{ selling: PropertyListItem[]; interested: (PropertyListItem & { interest_type: string })[] } | null>(null);
  // Property add/edit dialog. `editId` null = creating; `prefill` seeds a new record from an
  // inbound valuation request so that lead isn't retyped.
  const [propOpen, setPropOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [prefill, setPrefill] = useState<Partial<PropertyFormValues> | undefined>(undefined);

  const load = useCallback(async () => {
    if (!ws) return;
    const [e, r, props] = await Promise.all([
      realEstateService.getContactExt(ws, contactId).catch(() => null),
      realEstateService.listBuyerRequirements(ws, contactId).catch(() => []),
      realEstateService.contactProperties(ws, contactId).catch(() => ({ selling: [], interested: [] })),
    ]);
    setExt(e ?? {});
    setReqs(r);
    setCp(props);
  }, [ws, contactId]);
  useEffect(() => { void load(); }, [load]);

  const setE = (k: keyof ContactExt, v: any) => setExt((p) => ({ ...p, [k]: v }));
  const num = (v: any) => (v === '' || v == null ? undefined : Number(v));

  const saveExt = async () => {
    if (!ws) return;
    setSavingExt(true);
    try {
      await realEstateService.upsertContactExt(ws, contactId, {
        contact_role: (ext.contact_role as any) || undefined,
        budget_min: num(ext.budget_min), budget_max: num(ext.budget_max),
        pre_approval_status: ext.pre_approval_status || undefined, pre_approval_amount: num(ext.pre_approval_amount), lender: ext.lender || undefined,
        owned_property_value: num(ext.owned_property_value), owned_property_address: ext.owned_property_address || undefined, owned_property_equity: num(ext.owned_property_equity),
      });
      toast({ title: 'Buyer profile saved' });
    } catch (e) { toast({ title: 'Save failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSavingExt(false); }
  };

  const money2 = (n: number | null, ccy: string) => formatMoney(n, ccy || 'EUR', { decimals: 0, maxDecimals: 0 });

  const openNew = (seed?: Partial<PropertyFormValues>) => { setEditId(null); setPrefill(seed); setPropOpen(true); };
  const openEdit = (id: string) => { setEditId(id); setPrefill(undefined); setPropOpen(true); };

  const owned = cp?.selling ?? [];
  const interested = cp?.interested ?? [];
  // A valuation request captured through the public lead-magnet writes these three loose columns.
  // It is NOT a property record — surface it as a lead the user can promote into one.
  const valuationLead = !!(ext.owned_property_address || ext.owned_property_value);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-border/60 px-5 py-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2"><Home className="h-4 w-4" /> Properties</CardTitle>
            <p className="mt-0.5 text-xs text-muted-foreground">Every property this person owns or is selling. Add as many as they have.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => openNew()} disabled={!ws}>
            <Plus /> Add property
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {owned.length === 0 && interested.length === 0 && !valuationLead ? (
            <HubEmptyState
              icon={Home}
              title="No properties on this record yet"
              description="Add one and it becomes a full listing — priced, photographed, publishable, and able to take offers."
              action={<Button size="sm" onClick={() => openNew()} disabled={!ws}><Plus /> Add property</Button>}
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-4 py-2 text-left">Property</th>
                  <th className="px-4 py-2 text-left">Location</th>
                  <th className="px-4 py-2 text-left">Type</th>
                  <th className="px-4 py-2 text-left">Relation</th>
                  <th className="px-4 py-2 text-left">Status</th>
                  <th className="px-4 py-2 text-right">Price</th>
                  <th className="px-4 py-2 text-right w-24"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {owned.map((p) => (
                  <tr key={p.id} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <div className="font-medium">{p.title || 'Untitled property'}</div>
                      {p.reference_code && <div className="text-xs font-mono text-muted-foreground">{p.reference_code}</div>}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{[p.town, p.region].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-4 py-2 capitalize text-muted-foreground">{[p.property_type, p.subtype].filter(Boolean).join(' · ')}</td>
                    <td className="px-4 py-2 text-muted-foreground">Owner</td>
                    <td className={`px-4 py-2 capitalize ${statusTone(p.listing_status)}`}>{p.listing_status.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money2(p.price, p.currency)}</td>
                    <td className="px-4 py-2 text-right">
                      <span className="inline-flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="h-8 w-8" title="Edit details" onClick={() => openEdit(p.id)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Link to={`/properties/${p.id}`} title="Open full listing"><Button size="icon" variant="ghost" className="h-8 w-8"><ExternalLink className="h-3.5 w-3.5" /></Button></Link>
                      </span>
                    </td>
                  </tr>
                ))}
                {interested.map((p) => (
                  <tr key={`i-${p.id}`} className="border-b border-border/30 hover:bg-muted/30">
                    <td className="px-4 py-2">
                      <div className="font-medium">{p.title || 'Untitled property'}</div>
                      {p.reference_code && <div className="text-xs font-mono text-muted-foreground">{p.reference_code}</div>}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">{[p.town, p.region].filter(Boolean).join(', ') || '—'}</td>
                    <td className="px-4 py-2 capitalize text-muted-foreground">{[p.property_type, p.subtype].filter(Boolean).join(' · ')}</td>
                    <td className="px-4 py-2 capitalize text-muted-foreground">{p.interest_type.replace(/_/g, ' ')}</td>
                    <td className={`px-4 py-2 capitalize ${statusTone(p.listing_status)}`}>{p.listing_status.replace(/_/g, ' ')}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{money2(p.price, p.currency)}</td>
                    <td className="px-4 py-2 text-right">
                      <Link to={`/properties/${p.id}`} title="Open full listing"><Button size="icon" variant="ghost" className="h-8 w-8"><ExternalLink className="h-3.5 w-3.5" /></Button></Link>
                    </td>
                  </tr>
                ))}
                {valuationLead && (
                  <tr className="border-b border-border/30">
                    <td className="px-4 py-2" colSpan={2}>
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">{ext.owned_property_address || 'Address not given'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground" colSpan={2}>Valuation request — not a listing yet</td>
                    <td className="px-4 py-2 text-muted-foreground">Lead</td>
                    <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                      {ext.owned_property_value != null ? `~${money2(Number(ext.owned_property_value), 'EUR')}` : '—'}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Button size="sm" variant="ghost" className="text-xs"
                        onClick={() => openNew({
                          address: ext.owned_property_address ?? '',
                          price: ext.owned_property_value != null ? Number(ext.owned_property_value) : null,
                        })}>
                        Create listing
                      </Button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <PropertyFormDialog
        open={propOpen}
        onOpenChange={setPropOpen}
        workspaceId={ws}
        propertyId={editId}
        vendorContactId={contactId}
        initial={prefill}
        onSaved={() => { void load(); }}
      />

      <Card><CardContent className="p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2"><Home className="h-4 w-4 text-primary" /><span className="text-sm font-semibold">Buyer / Seller profile</span>
          {score && <Badge className="border-0 bg-primary/15 text-[11px] text-primary" title={score.rationale}>Lead {score.lead_score} · Health {score.health_score}</Badge>}
          <Button size="sm" variant="ghost" className="ml-auto" disabled={scoring} onClick={async () => {
            if (!ws) return; setScoring(true);
            try { const s = await scoreLead(ws, contactId); setScore(s); toast({ title: `Lead scored ${s.lead_score}/100`, description: `${s.rationale ?? ''} · ${s.credits} credit(s)` }); }
            catch (e) { toast({ title: 'Scoring failed', description: (e as Error).message, variant: 'destructive' }); }
            finally { setScoring(false); }
          }}><Sparkles className="mr-1 h-3.5 w-3.5" /> {scoring ? 'Scoring…' : 'AI score'}</Button>
          <Button size="sm" variant="outline" onClick={saveExt} disabled={savingExt}><Save className="mr-1 h-3.5 w-3.5" /> Save</Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Fld label="Role"><select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={ext.contact_role ?? ''} onChange={(e) => setE('contact_role', e.target.value)}>
            {['', 'buyer', 'seller', 'renter', 'investor', 'landlord'].map((o) => <option key={o} value={o}>{o || '—'}</option>)}
          </select></Fld>
          <Fld label="Budget min"><Input type="number" value={ext.budget_min ?? ''} onChange={(e) => setE('budget_min', e.target.value)} /></Fld>
          <Fld label="Budget max"><Input type="number" value={ext.budget_max ?? ''} onChange={(e) => setE('budget_max', e.target.value)} /></Fld>
          <Fld label="Pre-approval"><Input value={ext.pre_approval_status ?? ''} onChange={(e) => setE('pre_approval_status', e.target.value)} placeholder="approved / pending" /></Fld>
          <Fld label="Pre-approval amount"><Input type="number" value={ext.pre_approval_amount ?? ''} onChange={(e) => setE('pre_approval_amount', e.target.value)} /></Fld>
          <Fld label="Lender"><Input value={ext.lender ?? ''} onChange={(e) => setE('lender', e.target.value)} /></Fld>
        </div>
        {/* What they OWN is no longer three loose fields here — it lives in the Properties table
            above, one row per property, so a person with two flats can hold both. The legacy
            `owned_property_*` columns stay on the record (the public valuation lead-magnet still
            writes them) and surface above as a "Valuation request" row you can promote. */}
      </CardContent></Card>

      <Card><CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2"><Search className="h-4 w-4 text-primary" /><span className="text-sm font-semibold">Saved searches</span>
          <Button size="sm" variant="outline" className="ml-auto" onClick={() => setAdding((v) => !v)}><Plus className="mr-1 h-3.5 w-3.5" /> Add</Button>
        </div>
        {adding && <NewSearchForm ws={ws} contactId={contactId} onSaved={async () => { setAdding(false); await load(); }} />}
        {reqs.length === 0 && !adding ? <p className="text-sm text-muted-foreground">No saved searches yet.</p> : (
          <div className="space-y-2">{reqs.map((r) => <SearchRow key={r.id} ws={ws} req={r} onDelete={async () => { if (ws) { await realEstateService.deleteBuyerRequirement(ws, r.id); await load(); } }} />)}</div>
        )}
      </CardContent></Card>
    </div>
  );
};

const Fld: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div><Label className="mb-1 block text-xs text-muted-foreground">{label}</Label>{children}</div>
);

const CRITERIA_TYPES = ['', 'residential', 'commercial', 'land', 'other'];
const CRITERIA_TX = ['', 'sale', 'rent', 'short_let'];

const NewSearchForm: React.FC<{ ws: string | null; contactId: string; onSaved: () => void }> = ({ ws, contactId, onSaved }) => {
  const { toast } = useToast();
  const [f, setF] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));
  const save = async () => {
    if (!ws) return;
    setSaving(true);
    try {
      const criteria: Record<string, any> = {};
      for (const k of ['type', 'transaction_type', 'location']) if (f[k]) criteria[k] = f[k];
      for (const k of ['price_min', 'price_max', 'beds', 'baths']) if (f[k] !== '' && f[k] != null) criteria[k] = Number(f[k]);
      if (f.features) criteria.features = String(f.features).split(',').map((s: string) => s.trim()).filter(Boolean);
      await realEstateService.upsertBuyerRequirement(ws, { crm_contact_id: contactId, label: f.label || 'Saved search', criteria });
      toast({ title: 'Saved search added' });
      onSaved();
    } catch (e) { toast({ title: 'Failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setSaving(false); }
  };
  return (
    <div className="mb-3 rounded-lg border p-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Input placeholder="Label" value={f.label ?? ''} onChange={(e) => set('label', e.target.value)} />
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.type ?? ''} onChange={(e) => set('type', e.target.value)}>{CRITERIA_TYPES.map((o) => <option key={o} value={o}>{o || 'Any type'}</option>)}</select>
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.transaction_type ?? ''} onChange={(e) => set('transaction_type', e.target.value)}>{CRITERIA_TX.map((o) => <option key={o} value={o}>{o || 'Any transaction'}</option>)}</select>
        <Input placeholder="Location" value={f.location ?? ''} onChange={(e) => set('location', e.target.value)} />
        <Input type="number" placeholder="Price min" value={f.price_min ?? ''} onChange={(e) => set('price_min', e.target.value)} />
        <Input type="number" placeholder="Price max" value={f.price_max ?? ''} onChange={(e) => set('price_max', e.target.value)} />
        <Input type="number" placeholder="Min beds" value={f.beds ?? ''} onChange={(e) => set('beds', e.target.value)} />
        <Input type="number" placeholder="Min baths" value={f.baths ?? ''} onChange={(e) => set('baths', e.target.value)} />
        <Input placeholder="Features (comma)" className="sm:col-span-3" value={f.features ?? ''} onChange={(e) => set('features', e.target.value)} />
        <Button size="sm" onClick={save} disabled={saving}>Add search</Button>
      </div>
    </div>
  );
};

const SearchRow: React.FC<{ ws: string | null; req: BuyerRequirement; onDelete: () => void }> = ({ ws, req, onDelete }) => {
  const { toast } = useToast();
  const [matches, setMatches] = useState<PropertyListItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const c = req.criteria ?? {};
  const summary = [c.type, c.transaction_type, c.location, c.price_min && `≥${c.price_min}`, c.price_max && `≤${c.price_max}`, c.beds && `${c.beds}+ bd`].filter(Boolean).join(' · ');
  const runMatch = async () => {
    if (!ws) return;
    setLoading(true);
    try { const r = await realEstateService.matchBuyerRequirement(ws, req.id); setMatches(r.matches); }
    catch (e) { toast({ title: 'Match failed', description: (e as Error).message, variant: 'destructive' }); }
    finally { setLoading(false); }
  };
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{req.label || 'Saved search'}</div><div className="truncate text-xs text-muted-foreground">{summary || 'no criteria'}</div></div>
        <Button size="sm" variant="outline" onClick={runMatch} disabled={loading}><Search className="mr-1 h-3.5 w-3.5" /> {loading ? '…' : 'Match'}</Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
      {matches && (
        <div className="mt-2 border-t pt-2">
          {matches.length === 0 ? <p className="text-xs text-muted-foreground">No matching listings.</p> : (
            <div className="space-y-1">{matches.slice(0, 8).map((m) => (
              <Link key={m.id} to={`/properties/${m.id}`} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/50">
                <span className="min-w-0 flex-1 truncate">{m.title || 'Listing'} <span className="text-muted-foreground">{[m.town, m.region].filter(Boolean).join(', ')}</span></span>
                <Badge className="border-0 bg-muted text-[10px]">{m.price != null ? `${m.currency} ${formatNumber(m.price)}` : '—'}</Badge>
              </Link>
            ))}<div className="px-1.5 text-[11px] text-muted-foreground">{matches.length} match(es)</div></div>
          )}
        </div>
      )}
    </div>
  );
};
