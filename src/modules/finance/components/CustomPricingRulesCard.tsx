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
  date_window: 'Seasonal window (per category)',
  cash_payment: 'Paid upfront (cash)',
  payment_terms: 'Agreed payment terms',
  first_order: "Customer's first order",
  bundle: 'Bought together (bundle)',
};

/**
 * Which rules apply to a LINE and which to the whole DOCUMENT.
 *
 * A line-level rule multiplies into the price of each matching line; a document-level one comes
 * off the order subtotal. Applying one at both levels would take it twice — the reason
 * `cash_payment` was never folded into the line resolver in phase 1.1.
 */
const LINE_LEVEL = new Set(['category_extra', 'date_window']);
const NEEDS_CATEGORY = LINE_LEVEL;

export const CustomPricingRulesCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [categories, setCategories] = useState<Array<{ key: string; label: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [type, setType] = useState<'category_extra' | 'date_window' | 'cash_payment' | 'payment_terms' | 'first_order' | 'bundle'>('category_extra');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [terms, setTerms] = useState('');
  const [bundleCats, setBundleCats] = useState<string[]>([]);
  const [cat, setCat] = useState('');
  const [pct, setPct] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const [rs, cats] = await Promise.all([
        financeService.listCustomRules(workspaceId),
        financeService.listMaterialCategoryTree(workspaceId).catch(() => []),
      ]);
      setRules(rs.filter((r) => r.rule_type in TYPE_LABELS));
      setCategories(cats);
    } catch (err: any) {
      toast({ title: 'Failed to load rules', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [workspaceId]);

  const add = async () => {
    const p = parseDecimalOr(pct, NaN);
    const needsCategory = NEEDS_CATEGORY.has(type);
    if (needsCategory && !cat) { toast({ title: 'Pick a category', variant: 'destructive' }); return; }
    if (!Number.isFinite(p) || p < 0) { toast({ title: 'Enter a discount %', variant: 'destructive' }); return; }

    const params: any = {};
    if (type === 'date_window') {
      // A window with neither bound is category_extra wearing a different name — the resolver
      // refuses it, so the form refuses it here rather than saving a rule that never fires.
      if (!from && !to) { toast({ title: 'Give the window a start or an end', variant: 'destructive' }); return; }
      if (from) params.from = from;
      if (to) params.to = to;
    }
    if (type === 'payment_terms') {
      if (!terms.trim()) { toast({ title: 'Name the payment terms', variant: 'destructive' }); return; }
      params.terms = terms.trim();
    }
    if (type === 'bundle') {
      const required = bundleCats.filter(Boolean);
      // One category is not a bundle; it is a category discount, which already exists.
      if (required.length < 2) { toast({ title: 'A bundle needs at least two categories', variant: 'destructive' }); return; }
      params.required = required;
    }

    setBusy(true);
    try {
      await financeService.upsertCustomRule({ workspaceId, ruleType: type, categoryKey: needsCategory ? cat : null, params, discountPct: p, sortOrder: rules.length });
      setCat(''); setPct(''); setFrom(''); setTo(''); setTerms(''); setBundleCats([]); await load();
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
    if (r.rule_type === 'payment_terms') return `Terms ${r.params?.terms ?? 'any'} → ${r.discount_pct}% off the whole order`;
    if (r.rule_type === 'first_order') return `A customer's first order → ${r.discount_pct}% off the whole order`;
    if (r.rule_type === 'bundle') return `${(r.params?.required ?? []).join(' + ') || '?'} bought together → ${r.discount_pct}% off the whole order`;
    if (r.rule_type === 'date_window') {
      const c = String(r.category_key ?? '').replace(/_/g, ' ');
      const window = [r.params?.from, r.params?.to].filter(Boolean).join(' → ') || 'no window';
      return `${c}: ${r.discount_pct}% off (${window})`;
    }
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
                <SelectItem value="date_window">Seasonal window</SelectItem>
                <SelectItem value="payment_terms">Payment terms</SelectItem>
                <SelectItem value="first_order">First order</SelectItem>
                <SelectItem value="bundle">Bought together</SelectItem>
                <SelectItem value="cash_payment">Paid upfront (cash)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {NEEDS_CATEGORY.has(type) && (
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
          {type === 'date_window' && (
            <>
              <div className="space-y-1">
                <Label className="text-xs">From</Label>
                <Input className="h-8 w-36 text-xs" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">To</Label>
                <Input className="h-8 w-36 text-xs" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          {type === 'payment_terms' && (
            <div className="space-y-1">
              <Label className="text-xs">Terms</Label>
              <Input className="h-8 w-32 text-xs" value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="net_7" />
            </div>
          )}
          {type === 'bundle' && (
            <div className="space-y-1">
              <Label className="text-xs">Bought together</Label>
              <Select value="" onValueChange={(v) => setBundleCats((prev) => (prev.includes(v) ? prev : [...prev, v]))}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder={bundleCats.length ? bundleCats.join(' + ') : 'Add categories'} />
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
