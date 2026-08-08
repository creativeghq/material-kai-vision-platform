import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Star, Truck, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/core/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  supplierPricingService, type SupplierProductRow, type SupplierProductInput,
} from '@/services/supplierPricingService';

/**
 * "Suppliers & pricing" for one product (#324 phase 5).
 *
 * Every row is THIS workspace's own negotiated deal with that supplier — private, and never
 * written by a manufacturer publishing a price. The sourcing resolver reads these rows
 * preferred-first, then cheapest, and MOQ/lead time feed the procurement flow.
 */
interface Props { productId: string; workspaceId: string }

export const SupplierPricingSection: React.FC<Props> = ({ productId, workspaceId }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<SupplierProductRow[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [enforceMoq, setEnforceMoq] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<SupplierProductRow | 'new' | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, moq] = await Promise.all([
        supplierPricingService.listForProduct(productId),
        supplierPricingService.getEnforceMoq(productId).catch(() => false),
      ]);
      setRows(list);
      setEnforceMoq(moq);
      setNames(await supplierPricingService.supplierNames(list.map((r) => r.supplier_company_id)));
    } catch (e: any) {
      toast({ title: 'Failed to load suppliers', description: e?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [productId, toast]);

  const toggleEnforceMoq = async (next: boolean) => {
    setEnforceMoq(next); // optimistic — a switch that lags feels broken
    try {
      await supplierPricingService.setEnforceMoq(productId, next);
    } catch (e: any) {
      setEnforceMoq(!next);
      toast({ title: 'Failed', description: e?.message, variant: 'destructive' });
    }
  };

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from('crm_companies')
        .select('id, name').eq('workspace_id', workspaceId).eq('is_supplier', true).order('name');
      setSuppliers((data ?? []) as Array<{ id: string; name: string }>);
    })();
  }, [workspaceId]);

  const remove = async (row: SupplierProductRow) => {
    setBusyId(row.id);
    try {
      await supplierPricingService.remove(row.id);
      await load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message, variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  const prefer = async (row: SupplierProductRow) => {
    setBusyId(row.id);
    try {
      await supplierPricingService.setPreferred(productId, row.id);
      await load();
    } catch (e: any) {
      toast({ title: 'Failed', description: e?.message, variant: 'destructive' });
    } finally { setBusyId(null); }
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2"><Truck className="h-4 w-4 text-primary" /> Suppliers &amp; pricing</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            What each supplier charges you for this product. These are your own agreed costs — they stay private to this workspace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="rounded-full h-8" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button size="sm" className="rounded-full h-8" onClick={() => setEditing('new')}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add supplier
          </Button>
        </div>
      </CardHeader>
      <CardContent className={rows.length ? 'p-0' : undefined}>
        {loading ? (
          <div className="flex items-center gap-2 justify-center py-10 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">
            No suppliers yet. Add one to enable multi-supplier sourcing for this product.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="text-left font-medium px-4 py-2">Supplier</th>
                <th className="text-left font-medium px-4 py-2">Their SKU</th>
                <th className="text-right font-medium px-4 py-2">Your cost</th>
                <th className="text-right font-medium px-4 py-2">MOQ</th>
                <th className="text-right font-medium px-4 py-2">Lead time</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    <span className={r.is_preferred ? 'font-medium' : undefined}>
                      {names[r.supplier_company_id] || '—'}
                    </span>
                    {r.is_preferred && <span className="ml-2 text-[10px] text-emerald-600 dark:text-emerald-400">preferred</span>}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{r.supplier_sku || '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.cost != null ? `${r.cost} ${r.currency}` : <span className="text-muted-foreground">not set</span>}
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.moq ?? '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.lead_time_days != null ? `${r.lead_time_days}d` : '—'}</td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">
                    {!r.is_preferred && (
                      <Button size="sm" variant="ghost" className="rounded-full h-8" disabled={busyId === r.id} onClick={() => prefer(r)} title="Make preferred">
                        <Star className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="rounded-full h-8" onClick={() => setEditing(r)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="rounded-full h-8 text-destructive" disabled={busyId === r.id} onClick={() => remove(r)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* MOQ figures above are inert without this: it decides whether a shortfall of 3
            orders 3, or the supplier's minimum of 50. */}
        {rows.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-t">
            <div>
              <Label htmlFor={`moq-${productId}`} className="text-sm">Respect minimum order quantities</Label>
              <p className="text-xs text-muted-foreground">
                When on, ordering this product rounds up to the chosen supplier's MOQ and shows their lead time.
              </p>
            </div>
            <Switch id={`moq-${productId}`} checked={enforceMoq} onCheckedChange={toggleEnforceMoq} />
          </div>
        )}
      </CardContent>

      <SupplierRowDialog
        open={editing !== null}
        row={editing === 'new' ? null : editing}
        suppliers={suppliers}
        onClose={() => setEditing(null)}
        onSave={async (input, id) => {
          await supplierPricingService.upsert(workspaceId, productId, input, id);
          setEditing(null);
          await load();
        }}
      />
    </Card>
  );
};

const SupplierRowDialog: React.FC<{
  open: boolean;
  row: SupplierProductRow | null;
  suppliers: Array<{ id: string; name: string }>;
  onClose: () => void;
  onSave: (input: SupplierProductInput, id?: string) => Promise<void>;
}> = ({ open, row, suppliers, onClose, onSave }) => {
  const { toast } = useToast();
  const [supplierId, setSupplierId] = useState('');
  const [sku, setSku] = useState('');
  const [cost, setCost] = useState('');
  const [currency, setCurrency] = useState('EUR');
  const [moq, setMoq] = useState('');
  const [lead, setLead] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSupplierId(row?.supplier_company_id ?? '');
    setSku(row?.supplier_sku ?? '');
    setCost(row?.cost != null ? String(row.cost) : '');
    setCurrency(row?.currency ?? 'EUR');
    setMoq(row?.moq != null ? String(row.moq) : '');
    setLead(row?.lead_time_days != null ? String(row.lead_time_days) : '');
  }, [open, row]);

  const submit = async () => {
    if (!supplierId) { toast({ title: 'Pick a supplier', variant: 'destructive' }); return; }
    setSaving(true);
    try {
      await onSave({
        supplier_company_id: supplierId,
        supplier_sku: sku.trim() || null,
        cost: cost.trim() === '' ? null : Number(cost),
        currency,
        moq: moq.trim() === '' ? null : Number(moq),
        lead_time_days: lead.trim() === '' ? null : Number(lead),
        is_preferred: row?.is_preferred ?? false,
      }, row?.id);
    } catch (e: any) {
      toast({ title: 'Save failed', description: e?.message, variant: 'destructive' });
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{row ? 'Edit supplier' : 'Add supplier'}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger><SelectValue placeholder="Choose a supplier" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Their SKU</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Your cost</Label>
              <Input type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Currency</Label>
              <Input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Minimum order qty</Label>
              <Input type="number" value={moq} onChange={(e) => setMoq(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Lead time (days)</Label>
              <Input type="number" value={lead} onChange={(e) => setLead(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="rounded-full" onClick={onClose}>Cancel</Button>
          <Button className="rounded-full" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default SupplierPricingSection;
