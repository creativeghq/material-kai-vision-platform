/**
 * Layer B custom pricing rules. Applied at quote-time on top of the level discount
 * (multiplicative).
 *   • category_extra — a blanket extra % off a category, any customer
 *
 * `volume_category` was RETIRED in #347 phase 1.4 and must not come back here: the CHECK
 * constraint refuses it, so offering it would let an operator fill a form whose save fails on a
 * constraint error. "≥ N units of a category → % off" is now a category-scoped
 * `product_price_breaks` row, which resolves its threshold through `convert_to_base_unit` —
 * this rule compared the RAW quantity, so 5 pallets and 5 pieces matched the same threshold.
 * (cash_payment is schema-ready but surfaced once a payment-context hook exists, to avoid an inert rule.)
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, SlidersHorizontal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { financeService } from '@/modules/finance/services/financeService';
import { parseDecimalOr } from '@/utils/decimal';

interface Rule {
  id: string; rule_type: string; category_key: string | null; params: any;
  discount_pct: number; label: string | null; is_active: boolean; sort_order: number;
}

const TYPE_LABELS: Record<string, string> = {
  category_extra: 'Category extra discount',
  cash_payment: 'Paid upfront (cash)',
};

export const CustomPricingRulesCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<Array<{ key: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<'category_extra' | 'cash_payment'>('category_extra');
  const [cat, setCat] = useState('');
  const [pct, setPct] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const [rs, cats] = await Promise.all([
        financeService.listCustomRules(workspaceId),
        financeService.listMaterialCategoryTree(workspaceId).catch(() => []),
      ]);
      setRules(rs.filter((r) => r.rule_type === 'category_extra' || r.rule_type === 'cash_payment'));
      setCategories(cats);
    } catch (err: any) {
      toast({ title: 'Failed to load rules', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [workspaceId]);

  const add = async () => {
    const p = parseDecimalOr(pct, NaN);
    const isCash = type === 'cash_payment';
    if (!isCash && !cat) { toast({ title: 'Pick a category', variant: 'destructive' }); return; }
    if (!Number.isFinite(p) || p < 0) { toast({ title: 'Enter a discount %', variant: 'destructive' }); return; }
    const params: any = {};
    setBusy(true);
    try {
      await financeService.upsertCustomRule({ workspaceId, ruleType: type, categoryKey: isCash ? null : cat, params, discountPct: p, sortOrder: rules.length });
      setCat(''); setPct(''); await load();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    try { await financeService.deleteCustomRule(id); await load(); }
    catch (err: any) { toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' }); }
  };

  const describe = (r: Rule) => {
    if (r.rule_type === 'cash_payment') return `Paid upfront → ${r.discount_pct}% off the whole order`;
    const c = String(r.category_key ?? '').replace(/_/g, ' ');
    return `${c}: ${r.discount_pct}% off (all customers)`;
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4" /> Custom Pricing Rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Extra discounts applied automatically on quotes, on top of the customer's level discount (all ex-VAT).
        </p>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : rules.length === 0 ? (
          <p className="text-xs text-muted-foreground">No custom rules yet.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] capitalize">{TYPE_LABELS[r.rule_type] ?? r.rule_type}</span>
                  <span className="truncate capitalize">{describe(r)}</span>
                </div>
                <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => remove(r.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-[1fr_1fr_auto_auto_auto] sm:items-end">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="category_extra">Category extra</SelectItem>
                <SelectItem value="cash_payment">Paid upfront (cash)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {type !== 'cash_payment' && (
            <div className="space-y-1">
              <Label className="text-xs">Category</Label>
              <Select value={cat} onValueChange={setCat} disabled={categories.length === 0}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue placeholder={categories.length === 0 ? 'No categories' : 'Category'} />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c.key} value={c.key} className="capitalize whitespace-pre">{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">% off</Label>
            <Input className="h-8 w-20 text-xs" type="text" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="0" />
          </div>
          <Button size="sm" variant="outline" onClick={add} disabled={busy || (type !== 'cash_payment' && !cat)}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
