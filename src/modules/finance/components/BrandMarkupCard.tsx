/**
 * per-brand markup overrides on resold catalog products. Sits alongside the
 * per-category rules (PricingRulesCard) and the blanket default_markup_pct. Precedence
 * the resolver applies: per-product → per-brand → per-supplier → per-category → default. This card
 * manages the brand-level rules only (the default markup lives on the category card).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Factory } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { financeService, type PricingRuleScope } from '@/modules/finance/services/financeService';
import { supabase } from '@/integrations/supabase/client';
import { parseDecimalOr } from '@/utils/decimal';

interface Rule {
  id: string; scope: PricingRuleScope; target_id: string;
  markup_pct: number | null; sell_price: number | null; currency: string;
}

interface Maker {
  factory_name: string; product_count: number; brand_company_id: string | null;
}

export const BrandMarkupCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [makers, setMakers] = useState<Maker[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newBrand, setNewBrand] = useState('');
  const [newMarkup, setNewMarkup] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const [all, makersRes] = await Promise.all([
        financeService.listPricingRules(workspaceId),
        supabase.rpc('list_workspace_makers', { p_workspace_id: workspaceId }),
      ]);
      setRules(all.filter((r) => r.scope === 'brand'));
      // Only brands resolved to a brand company node are selectable (that's the rule target_id).
      const rows = ((makersRes.data ?? []) as Maker[]).filter((m) => !!m.brand_company_id);
      setMakers(rows);
    } catch (err: any) {
      toast({ title: 'Failed to load rules', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, [workspaceId]);

  const nameForTarget = (targetId: string): string =>
    makers.find((m) => m.brand_company_id === targetId)?.factory_name || targetId;

  // Only offer brands that don't already have a rule.
  const availableBrands = useMemo(() => {
    const taken = new Set(rules.map((r) => r.target_id));
    return makers.filter((m) => m.brand_company_id && !taken.has(m.brand_company_id));
  }, [makers, rules]);

  const addRule = async () => {
    const brandId = newBrand.trim();
    const pct = parseDecimalOr(newMarkup, NaN);
    if (!brandId) { toast({ title: 'Pick a brand', variant: 'destructive' }); return; }
    if (!Number.isFinite(pct) || pct < 0) { toast({ title: 'Enter a markup %', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await financeService.upsertPricingRule({ workspaceId, scope: 'brand', targetId: brandId, markupPct: pct });
      setNewBrand(''); setNewMarkup('');
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
        <CardTitle className="flex items-center gap-2"><Factory className="h-4 w-4" /> Brand Markup Rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Markup turns your <strong>cost</strong> into the <strong>retail price</strong>.
          Precedence: <strong>per-product → per-brand → per-supplier → per-category → default</strong>. Customer discounts then apply off retail.
        </p>

        <div className="pt-1 text-xs font-medium text-muted-foreground">Per-brand overrides</div>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : rules.length === 0 ? (
          <p className="text-xs text-muted-foreground">No brand rules — the per-category or default markup applies.</p>
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

        <div className="grid grid-cols-[1fr_auto_auto] gap-2 items-end pt-1">
          <div className="space-y-1">
            <Label className="text-xs">Brand</Label>
            <Select value={newBrand} onValueChange={setNewBrand} disabled={availableBrands.length === 0}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={makers.length === 0 ? 'No linked brands yet' : availableBrands.length === 0 ? 'All brands have rules' : 'Select a brand'} />
              </SelectTrigger>
              <SelectContent>
                {availableBrands.map((m) => (
                  <SelectItem key={m.brand_company_id!} value={m.brand_company_id!} className="whitespace-pre">{m.factory_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Markup %</Label>
            <Input className="h-8 text-xs w-24" type="text" inputMode="decimal" value={newMarkup} onChange={(e) => setNewMarkup(e.target.value)} placeholder="25" />
          </div>
          <Button size="sm" variant="outline" onClick={addRule} disabled={busy || !newBrand}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </Button>
        </div>
        {makers.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            Brands are read from your catalog products that are linked to a brand company. Link a supplier/brand and it’ll appear here.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
