/**
 * Per-(level, category) discount overrides. An extra discount a given level gets
 * on a specific material category, overriding that level's default discount for that
 * category only. "All categories" is handled by the level's default (Customer Pricing
 * Levels card), so this card is category-specific overrides only.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Layers } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { financeService } from '@/modules/finance/services/financeService';
import { parseDecimalOr } from '@/utils/decimal';

interface Disc { id: string; level_key: string; category_key: string | null; discount_pct: number; }
interface Lvl { id: string; level_key: string; label: string; }

export const LevelCategoryDiscountsCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [levels, setLevels] = useState<Lvl[]>([]);
  const [categories, setCategories] = useState<Array<{ key: string; label: string }>>([]);
  const [discounts, setDiscounts] = useState<Disc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newLevel, setNewLevel] = useState('');
  const [newCat, setNewCat] = useState('');
  const [newPct, setNewPct] = useState('');

  const load = async () => {
    try {
      setLoading(true);
      const [lvls, cats, discs] = await Promise.all([
        financeService.listUserLevels(workspaceId),
        financeService.listMaterialCategoryTree(workspaceId).catch(() => []),
        financeService.listLevelDiscounts(workspaceId),
      ]);
      setLevels(lvls.map((l) => ({ id: l.id, level_key: l.level_key, label: l.label })));
      setCategories(cats);
      setDiscounts(discs.filter((d) => d.category_key !== null));
    } catch (err: any) {
      toast({ title: 'Failed to load', description: err?.message, variant: 'destructive' });
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [workspaceId]);

  const labelFor = useMemo(() => {
    const m = new Map(levels.map((l) => [l.level_key, l.label]));
    return (key: string) => m.get(key) ?? key;
  }, [levels]);

  const add = async () => {
    const pct = parseDecimalOr(newPct, NaN);
    if (!newLevel) { toast({ title: 'Pick a level', variant: 'destructive' }); return; }
    if (!newCat) { toast({ title: 'Pick a category', variant: 'destructive' }); return; }
    if (!Number.isFinite(pct) || pct < 0) { toast({ title: 'Enter a discount %', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      await financeService.upsertLevelDiscount({ workspaceId, levelKey: newLevel, categoryKey: newCat, discountPct: pct });
      setNewLevel(''); setNewCat(''); setNewPct(''); await load();
    } catch (err: any) {
      toast({ title: 'Save failed', description: err?.message, variant: 'destructive' });
    } finally { setBusy(false); }
  };

  const remove = async (id: string) => {
    try { await financeService.deleteLevelDiscount(id); await load(); }
    catch (err: any) { toast({ title: 'Delete failed', description: err?.message, variant: 'destructive' }); }
  };

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3">
        <CardTitle className="flex items-center gap-2"><Layers className="h-4 w-4" /> Level Discounts by Category</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-5">
        <p className="text-xs text-muted-foreground">
          Optional: give a level a different discount on a specific category (e.g. <em>Dealer · lighting → 40%</em>).
          Overrides that level's default discount for that category only.
        </p>

        {loading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : discounts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No category overrides — each level's default discount applies everywhere.</p>
        ) : (
          <div className="space-y-2">
            {discounts.map((d) => (
              <div key={d.id} className="flex items-center justify-between rounded-md border border-border/60 px-3 py-2 text-sm">
                <span className="capitalize">{labelFor(d.level_key)} · {String(d.category_key).replace(/_/g, ' ')}</span>
                <div className="flex items-center gap-3">
                  <span className="font-medium">{d.discount_pct}% off</span>
                  <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => remove(d.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-[1fr_1fr_auto_auto] items-end gap-2 pt-1">
          <div className="space-y-1">
            <Label className="text-xs">Level</Label>
            <Select value={newLevel} onValueChange={setNewLevel}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Level" /></SelectTrigger>
              <SelectContent>
                {levels.map((l) => <SelectItem key={l.level_key} value={l.level_key}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Select value={newCat} onValueChange={setNewCat} disabled={categories.length === 0}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder={categories.length === 0 ? 'No categories yet' : 'Category'} />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.key} value={c.key} className="capitalize whitespace-pre">{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">% off</Label>
            <Input className="h-8 w-20 text-xs" type="text" inputMode="decimal" value={newPct} onChange={(e) => setNewPct(e.target.value)} placeholder="0" />
          </div>
          <Button size="sm" variant="outline" onClick={add} disabled={busy || !newLevel || !newCat}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
