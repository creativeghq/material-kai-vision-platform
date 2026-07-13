/**
 * #176 — per-category markup overrides on resold catalog products. Sits on top of the
 * blanket default_markup_pct (Finance → Settings). Precedence the resolver applies:
 * per-product > per-category > default. Per-product overrides are set from the product
 * card; this card manages the category-level rules.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Tag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { financeService } from '@/modules/finance/services/financeService';
import { parseDecimalOr } from '@/utils/decimal';

interface Rule {
  id: string; scope: 'category' | 'product' | 'brand'; target_id: string;
  markup_pct: number | null; sell_price: number | null; currency: string;
}

export const PricingRulesCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<Array<{ key: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [newMarkup, setNewMarkup] = useState('');
  const [defaultMarkup, setDefaultMarkup] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const [all, cats, settings] = await Promise.all([
        financeService.listPricingRules(workspaceId),
        financeService.listMaterialCategoryTree(workspaceId).catch(() => []),
        financeService.getSettings(workspaceId).catch(() => null),
      ]);
      setRules(all.filter((r) => r.scope === 'category'));
      setCategories(cats);
      if (settings) setDefaultMarkup(String(settings.default_markup_pct ?? 0));
    } catch (err: any) {
      toast({ title: 'Failed to load rules', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };

  const saveDefaultMarkup = async (val: number) => {
    try { await financeService.updateSettings(workspaceId, { default_markup_pct: val }); }
    catch (err: any) { toast({ title: 'Save failed', description: err?.message, variant: 'destructive' }); void load(); }
  };
  useEffect(() => { void load(); }, [workspaceId]);

  // Only offer categories that don't already have a rule.
  const availableCategories = useMemo(() => {
    const taken = new Set(rules.map((r) => r.target_id));
    return categories.filter((c) => !taken.has(c.key));
  }, [categories, rules]);

  const addRule = async () => {
    const cat = newCat.trim().toLowerCase();
    const pct = parseDecimalOr(newMarkup, NaN);
    if (!cat) { toast({ title: 'Pick a category', variant: 'destructive' }); return; }
    if (!Number.isFinite(pct) || pct < 0) { toast({ title: 'Enter a markup %', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await financeService.upsertPricingRule({ workspaceId, scope: 'category', targetId: cat, markupPct: pct });
      setNewCat(''); setNewMarkup('');
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
        <CardTitle className="text-sm flex items-center gap-2"><Tag className="h-4 w-4" /> Category Markup Rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Markup turns your <strong>cost</strong> (KB purchase price) into the <strong>retail price</strong>.
          Precedence: <strong>per-product → per-category → default</strong>. Customer level discounts then apply off retail.
        </p>

        {/* Default markup — the fallback when no per-category/per-product rule matches */}
        <div className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2">
          <div>
            <div className="text-sm font-medium">Default markup</div>
            <p className="text-[11px] text-muted-foreground">Applied to any category without its own rule below.</p>
          </div>
          <div className="flex items-center gap-1">
            <Input
              className="h-8 w-20 text-right text-xs" type="text" inputMode="decimal"
              value={defaultMarkup}
              onChange={(e) => setDefaultMarkup(e.target.value)}
              onBlur={(e) => { const v = parseDecimalOr(e.target.value, NaN); if (Number.isFinite(v) && v >= 0) void saveDefaultMarkup(v); }}
              placeholder="0"
            />
            <span className="text-xs text-muted-foreground">%</span>
          </div>
        </div>

        <div className="pt-1 text-xs font-medium text-muted-foreground">Per-category overrides</div>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : rules.length === 0 ? (
          <p className="text-xs text-muted-foreground">No category rules — the default markup applies to everything.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                <span className="capitalize">{r.target_id.replace(/_/g, ' ')}</span>
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
            <Label className="text-xs">Category</Label>
            <Select value={newCat} onValueChange={setNewCat} disabled={availableCategories.length === 0}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={categories.length === 0 ? 'No catalog categories yet' : availableCategories.length === 0 ? 'All categories have rules' : 'Select a category'} />
              </SelectTrigger>
              <SelectContent>
                {availableCategories.map((c) => (
                  <SelectItem key={c.key} value={c.key} className="capitalize whitespace-pre">{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Markup %</Label>
            <Input className="h-8 text-xs w-24" type="text" inputMode="decimal" value={newMarkup} onChange={(e) => setNewMarkup(e.target.value)} placeholder="25" />
          </div>
          <Button size="sm" variant="outline" onClick={addRule} disabled={busy || !newCat}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </Button>
        </div>
        {categories.length === 0 && (
          <p className="text-[11px] text-muted-foreground">
            Categories are read from your catalog products’ material category. Add products (or import a catalog) and they’ll appear here.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
