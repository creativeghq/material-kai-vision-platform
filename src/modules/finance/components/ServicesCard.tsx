/**
 * Manage sellable services (products with item_type='service'). Add/edit name,
 * unit, price, VAT category + myDATA income classification; these feed quote/invoice/
 * receipt lines and transmit to myDATA with the right classification.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Pencil, Trash2, Wrench, Save, X, UserRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { MoneyInput } from '@/components/core/ui/money-input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useQuotaErrorHandler } from '@/hooks/useQuotaErrorHandler';
import { servicesService, type ServiceItem, type ServiceInput } from '@/modules/finance/services/servicesService';
import { invoicingSetupService, type RefRow } from '@/services/invoicingSetupService';
import { VAT_CATEGORIES } from '@/modules/finance/services/financeService';
import { formatMoney } from '@/utils/decimal';
import { HubEmptyState } from '@/components/core/hub';
import { WorkspaceQuotaBadge } from '@/components/core/WorkspaceQuotaBadge';
import { Badge } from '@/components/core/ui/badge';
import { useAuth } from '@/contexts/AuthContext';

const EMPTY: ServiceInput = { name: '', description: '', unit: '', price: null, currency: 'EUR', vatCategory: 1, incType: '', incCat: '' };

export const ServicesCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const handleQuota = useQuotaErrorHandler();
  const { user } = useAuth();
  const [items, setItems] = useState<ServiceItem[]>([]);
  const [incTypes, setIncTypes] = useState<RefRow[]>([]);
  const [incCats, setIncCats] = useState<RefRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null); // product id | 'new' | null
  const [form, setForm] = useState<ServiceInput>(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const [list, t, c] = await Promise.all([
        servicesService.list(workspaceId),
        invoicingSetupService.listReference('income_classification_type'),
        invoicingSetupService.listReference('income_classification_category'),
      ]);
      setItems(list); setIncTypes(t); setIncCats(c);
    } catch (err: any) {
      toast({ title: 'Failed to load services', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [workspaceId]);

  const startNew = () => { setForm(EMPTY); setEditing('new'); };
  const startEdit = (s: ServiceItem) => {
    setForm({
      name: s.name, description: s.description ?? '', unit: s.unit ?? '',
      price: s.list_price, currency: s.currency, vatCategory: s.vat_category ?? 1,
      incType: s.income_classification_type ?? '', incCat: s.income_classification_category ?? '',
    });
    setEditing(s.id);
  };

  const save = async () => {
    if (!form.name.trim()) { toast({ title: 'Name is required', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      if (editing === 'new') await servicesService.create(workspaceId, form);
      else if (editing) await servicesService.update(workspaceId, editing, form);
      setEditing(null);
      await load();
      toast({ title: 'Service saved' });
    } catch (err: any) {
      // Services now count against their own plan cap (`max_services`), raised by the
      // products quota trigger. Route it to the upsell — as a generic "Save failed" the
      // operator only learns the row did not save, not that the plan is the reason.
      if (!handleQuota(err)) {
        toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
      }
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    try { await servicesService.remove(id); await load(); }
    catch (err: any) { toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' }); }
  };

  // Same rows as Profile → Services: listing here is the same fact as adding it there.
  const toggleListing = async (s: ServiceItem) => {
    try {
      await servicesService.setProfileListing(s.id, !s.profile_user_id);
      await load();
      toast({ title: s.profile_user_id ? 'Removed from the profile' : 'Listed on your profile' });
    } catch (err: any) {
      toast({ title: 'Could not update the listing', description: err?.message, variant: 'destructive' });
    }
  };

  const money = (v: number | null, c: string) => formatMoney(v, c);

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2"><Wrench className="h-4 w-4" /> Services</CardTitle>
        <div className="flex items-center gap-2">
          {/* Counts what the trigger counts: services only, against max_services. */}
          <WorkspaceQuotaBadge table="products" quotaKey="max_services" label="services" eq={{ column: 'item_type', value: 'service' }} />
          {editing === null && <Button size="sm" variant="outline" onClick={startNew}><Plus className="h-3.5 w-3.5 mr-1" /> New service</Button>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Services you sell (e.g. installation, consulting). They appear on quotes, invoices and receipts and transmit to myDATA with the classification set here. No stock.
        </p>

        {editing !== null && (
          <div className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-3">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Name *</Label>
                <Input className="h-8 text-xs" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Electrical installation" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">Description</Label>
                <Textarea rows={2} value={form.description ?? ''} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What's included…" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Unit</Label>
                <Input className="h-8 text-xs" value={form.unit ?? ''} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="hour, job, m²" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Price</Label>
                  <MoneyInput className="h-8 text-xs" value={form.price} onValueChange={(v) => setForm({ ...form, price: v })} placeholder="0.00" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{['EUR', 'USD', 'GBP'].map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">VAT category</Label>
                <Select value={form.vatCategory != null ? String(form.vatCategory) : ''} onValueChange={(v) => setForm({ ...form, vatCategory: Number(v) })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{VAT_CATEGORIES.map((v) => <SelectItem key={v.code} value={v.code}>{v.longLabel}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Income classification type</Label>
                <Select value={form.incType ?? ''} onValueChange={(v) => setForm({ ...form, incType: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{incTypes.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} — {t.description}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Income classification category</Label>
                <Select value={form.incCat ?? ''} onValueChange={(v) => setForm({ ...form, incCat: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select…" /></SelectTrigger>
                  <SelectContent>{incCats.map((t) => <SelectItem key={t.code} value={t.code}>{t.code} — {t.description}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={save} disabled={busy}>{busy ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Save className="h-3 w-3 mr-1" />} Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(null)} disabled={busy}><X className="h-3 w-3 mr-1" /> Cancel</Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 && editing === null ? (
          <HubEmptyState
            icon={Wrench}
            title="No services yet"
            description="Services are what you sell that carries no stock — installation, consulting, delivery. They appear on quotes and invoices and transmit to myDATA with their own classification."
            action={<Button size="sm" onClick={startNew}><Plus /> New service</Button>}
          />
        ) : (
          <div className="space-y-1">
            {items.map((s) => (
              <div key={s.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    {s.name}
                    {s.profile_user_id && (
                      <Badge variant="info" className="text-[10px] gap-1">
                        <UserRound className="h-2.5 w-2.5" />{s.profile_user_id === user?.id ? 'On your profile' : 'On a profile'}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{money(s.list_price, s.currency)}{s.unit ? ` / ${s.unit}` : ''}{s.vat_category ? ` · VAT ${s.vat_category}` : ''}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {(!s.profile_user_id || s.profile_user_id === user?.id) && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleListing(s)}>
                      {s.profile_user_id ? 'Remove from profile' : 'List on my profile'}
                    </Button>
                  )}
                  <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => startEdit(s)}><Pencil className="h-3.5 w-3.5" /></button>
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => remove(s.id)}><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
