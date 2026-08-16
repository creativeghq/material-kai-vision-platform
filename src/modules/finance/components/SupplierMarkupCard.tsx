/**
 * per-supplier markup overrides (#332 step 6).
 *
 * "Mark everything from this supplier up 35%" was not expressible: `pricing_rules.scope` only
 * allowed product and category, even though supplier is a first-class dimension everywhere else
 * (`supplier_products`, `platform_suppliers`, the #324 identity spine).
 *
 * Sits BELOW brand in the ladder — product → brand → supplier → category → default — because a
 * brand is what the customer is buying and a supplier is only who we happen to buy it from. The
 * same brand arriving through two distributors should not move the shelf price.
 *
 * Matched on `products.supplier_company_id`, which is why the picker reports a product count:
 * a supplier we buy from but that is nobody's default supplier is offered with 0, so the
 * operator can see the rule would reach nothing rather than wondering why prices did not move.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Truck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { financeService } from '@/modules/finance/services/financeService';
import { supabase } from '@/integrations/supabase/client';
import { parseDecimalOr } from '@/utils/decimal';

interface Rule {
  id: string; scope: string; target_id: string;
  markup_pct: number | null; sell_price: number | null; currency: string;
}

interface SupplierRow {
  supplier_company_id: string; supplier_name: string;
  product_count: number; is_default_for_any: boolean;
}

export const SupplierMarkupCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newSupplier, setNewSupplier] = useState('');
  const [newMarkup, setNewMarkup] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const [all, res] = await Promise.all([
        financeService.listPricingRules(workspaceId),
        supabase.rpc('list_workspace_product_suppliers', { p_workspace_id: workspaceId }),
      ]);
      setRules(all.filter((r) => r.scope === 'supplier'));
      setSuppliers((res.data ?? []) as SupplierRow[]);
    } catch (err: any) {
      toast({ title: 'Failed to load rules', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [workspaceId]);

  const nameForTarget = (targetId: string): string =>
    suppliers.find((s) => s.supplier_company_id === targetId)?.supplier_name || targetId;

  const available = useMemo(() => {
    const taken = new Set(rules.map((r) => r.target_id));
    return suppliers.filter((s) => !taken.has(s.supplier_company_id));
  }, [suppliers, rules]);

  const addRule = async () => {
    const supplierId = newSupplier.trim();
    const pct = parseDecimalOr(newMarkup, NaN);
    if (!supplierId) { toast({ title: 'Pick a supplier', variant: 'destructive' }); return; }
    if (!Number.isFinite(pct) || pct < 0) { toast({ title: 'Enter a markup %', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await financeService.upsertPricingRule({ workspaceId, scope: 'supplier', targetId: supplierId, markupPct: pct });
      setNewSupplier(''); setNewMarkup('');
      await load();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    try { await financeService.deletePricingRule(id); await load(); }
    catch (err: any) { toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' }); }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2"><Truck className="h-4 w-4" /> Supplier Markup Rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Applies to products whose <strong>default supplier</strong> is the one you pick.
          Precedence: <strong>per-product → per-brand → per-supplier → per-category → default</strong>.
        </p>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : rules.length === 0 ? (
          <p className="text-xs text-muted-foreground">No supplier rules — the per-category or default markup applies.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                <span>{nameForTarget(r.target_id)}</span>
                <div className="flex items-center gap-3">
                  <span className="font-medium">+{r.markup_pct}%</span>
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => remove(r.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-[1fr_auto_auto] items-end gap-2 pt-1">
          <div className="space-y-1">
            <Label className="text-xs">Supplier</Label>
            <Select value={newSupplier} onValueChange={setNewSupplier} disabled={available.length === 0}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={suppliers.length === 0 ? 'No suppliers yet' : available.length === 0 ? 'All suppliers have rules' : 'Select a supplier'} />
              </SelectTrigger>
              <SelectContent>
                {available.map((s) => (
                  <SelectItem key={s.supplier_company_id} value={s.supplier_company_id}>
                    {s.supplier_name}
                    {/* Say what the rule would reach. 0 is the honest answer for a supplier that
                        is nobody's default, and it is the answer that stops a silent no-op. */}
                    <span className="text-muted-foreground">
                      {' · '}{s.product_count} product{s.product_count === 1 ? '' : 's'}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Markup %</Label>
            <Input className="h-8 w-24 text-xs" type="text" inputMode="decimal" value={newMarkup}
              onChange={(e) => setNewMarkup(e.target.value)} placeholder="35" />
          </div>
          <Button size="sm" variant="outline" onClick={addRule} disabled={busy || !newSupplier}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </Button>
        </div>
        {suppliers.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            Suppliers appear here once a company is marked as a supplier, is a product&rsquo;s default
            supplier, or has a row in the supplier price list.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
