/**
 * #176 — per-category markup overrides on resold catalog products. Sits on top of the
 * blanket default_markup_pct (Finance → Settings). Precedence the resolver applies:
 * per-product > per-category > default. Per-product overrides are set from the product
 * card; this card manages the category-level rules.
 */
import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, Tag } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { financeService } from '@/modules/finance/services/financeService';

interface Rule {
  id: string; scope: 'category' | 'product'; target_id: string;
  markup_pct: number | null; sell_price: number | null; currency: string;
}

export const PricingRulesCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newCat, setNewCat] = useState('');
  const [newMarkup, setNewMarkup] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const all = await financeService.listPricingRules(workspaceId);
      setRules(all.filter((r) => r.scope === 'category'));
    } catch (err: any) {
      toast({ title: 'Failed to load rules', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [workspaceId]);

  const addRule = async () => {
    const cat = newCat.trim().toLowerCase();
    const pct = parseFloat(newMarkup);
    if (!cat) { toast({ title: 'Category required', variant: 'destructive' }); return; }
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
        <CardTitle className="text-sm flex items-center gap-2"><Tag className="h-4 w-4" /> Category markup rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Override the default markup for a whole material category when you add a catalog product to a quote.
          Precedence: <strong>per-product → per-category → default</strong>.
        </p>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : rules.length === 0 ? (
          <p className="text-xs text-muted-foreground">No category rules — the default markup applies to everything.</p>
        ) : (
          <div className="space-y-2">
            {rules.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                <span className="capitalize">{r.target_id}</span>
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
            <Input className="h-8 text-xs" value={newCat} onChange={(e) => setNewCat(e.target.value)} placeholder="tiles" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Markup %</Label>
            <Input className="h-8 text-xs w-24" type="number" step="0.5" min="0" value={newMarkup} onChange={(e) => setNewMarkup(e.target.value)} placeholder="25" />
          </div>
          <Button size="sm" variant="outline" onClick={addRule} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
