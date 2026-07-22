import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Home, Plus, Search, Trash2, Save } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Card, CardContent } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { realEstateService, type BuyerRequirement, type ContactExt, type PropertyListItem } from '../services/realEstateService';

// #249 — real-estate panel on the CRM contact page: buyer profile (budget / pre-approval / seller AVM)
// + saved searches with an on-demand match against the workspace inventory.
export const PropertyBuyerPanel: React.FC<{ contactId: string; workspaceId: string | null }> = ({ contactId, workspaceId: ws }) => {
  const { toast } = useToast();
  const [ext, setExt] = useState<Partial<ContactExt>>({});
  const [reqs, setReqs] = useState<BuyerRequirement[]>([]);
  const [savingExt, setSavingExt] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!ws) return;
    const [e, r] = await Promise.all([
      realEstateService.getContactExt(ws, contactId).catch(() => null),
      realEstateService.listBuyerRequirements(ws, contactId).catch(() => []),
    ]);
    setExt(e ?? {});
    setReqs(r);
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

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2"><Home className="h-4 w-4 text-primary" /><span className="text-sm font-semibold">Buyer / seller profile</span>
          <Button size="sm" variant="outline" className="ml-auto rounded-full" onClick={saveExt} disabled={savingExt}><Save className="mr-1 h-3.5 w-3.5" /> Save</Button>
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
          <Fld label="Owns — value (AVM)"><Input type="number" value={ext.owned_property_value ?? ''} onChange={(e) => setE('owned_property_value', e.target.value)} /></Fld>
          <Fld label="Owns — address"><Input value={ext.owned_property_address ?? ''} onChange={(e) => setE('owned_property_address', e.target.value)} /></Fld>
          <Fld label="Owns — equity"><Input type="number" value={ext.owned_property_equity ?? ''} onChange={(e) => setE('owned_property_equity', e.target.value)} /></Fld>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2"><Search className="h-4 w-4 text-primary" /><span className="text-sm font-semibold">Saved searches</span>
          <Button size="sm" variant="outline" className="ml-auto rounded-full" onClick={() => setAdding((v) => !v)}><Plus className="mr-1 h-3.5 w-3.5" /> Add</Button>
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
        <Button size="sm" className="rounded-full" onClick={save} disabled={saving}>Add search</Button>
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
        <Button size="sm" variant="outline" className="rounded-full" onClick={runMatch} disabled={loading}><Search className="mr-1 h-3.5 w-3.5" /> {loading ? '…' : 'Match'}</Button>
        <Button size="icon" variant="ghost" className="h-8 w-8" onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></Button>
      </div>
      {matches && (
        <div className="mt-2 border-t pt-2">
          {matches.length === 0 ? <p className="text-xs text-muted-foreground">No matching listings.</p> : (
            <div className="space-y-1">{matches.slice(0, 8).map((m) => (
              <Link key={m.id} to={`/properties/${m.id}`} className="flex items-center gap-2 rounded px-1.5 py-1 text-xs hover:bg-muted/50">
                <span className="min-w-0 flex-1 truncate">{m.title || 'Listing'} <span className="text-muted-foreground">{[m.town, m.region].filter(Boolean).join(', ')}</span></span>
                <Badge className="rounded-full border-0 bg-muted text-[10px]">{m.price != null ? `${m.currency} ${m.price.toLocaleString()}` : '—'}</Badge>
              </Link>
            ))}<div className="px-1.5 text-[11px] text-muted-foreground">{matches.length} match(es)</div></div>
          )}
        </div>
      )}
    </div>
  );
};
