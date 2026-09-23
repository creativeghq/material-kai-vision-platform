import React, { useEffect, useState } from 'react';

import { Badge } from '@/components/core/ui/badge';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import {
  productFeedsService, type ProductFeed, type FeedSelectionMode,
} from '@/services/commerce/productFeedsService';

const MODES: { value: FeedSelectionMode; label: string; hint: string }[] = [
  { value: 'all_published', label: 'Everything published', hint: 'Every product with a published price.' },
  { value: 'category', label: 'Chosen categories', hint: 'Only products filed under the categories you pick.' },
  { value: 'products', label: 'Chosen products', hint: 'Only the products you pick, one by one.' },
];

export const FeedSelectionEditor: React.FC<{ feed: ProductFeed; onSaved: () => void }> = ({ feed, onSaved }) => {
  const { toast } = useToast();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const mode = feed.selection?.mode ?? 'all_published';
  const ids = feed.selection?.ids ?? [];

  useEffect(() => {
    let cancelled = false;
    productFeedsService.categories()
      .then((c) => { if (!cancelled) setCategories(c); })
      .catch(() => { });
    return () => { cancelled = true; };
  }, []);

  const save = async (selection: { mode: FeedSelectionMode; ids?: string[] }) => {
    try { await productFeedsService.setSelection(feed.id, selection); onSaved(); }
    catch (err) { toast({ title: 'Could not save the selection', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); }
  };

  const toggleCategory = (id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    void save({ mode: 'category', ids: next });
  };

  const setGate = async (gates: { only_storefront_published?: boolean; include_out_of_stock?: boolean }) => {
    try { await productFeedsService.setGates(feed.id, gates); onSaved(); }
    catch (err) { toast({ title: 'Could not save', description: err instanceof Error ? err.message : String(err), variant: 'destructive' }); }
  };

  return (
    <div className="space-y-3 rounded-sm border border-hairline p-3">
      <div className="space-y-1">
        <Label>What goes in this feed</Label>
        <Select value={mode} onValueChange={(v) => save({ mode: v as FeedSelectionMode, ids: v === 'all_published' ? [] : ids })}>
          <SelectTrigger className="max-w-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            {MODES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">{MODES.find((m) => m.value === mode)?.hint}</p>
      </div>

      {mode === 'category' && (
        <div className="space-y-1">
          <Label>Categories</Label>
          {categories.length === 0 ? (
            <p className="text-xs text-muted-foreground">No categories to pick from yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <button key={c.id} type="button" onClick={() => toggleCategory(c.id)}>
                  <Badge variant={ids.includes(c.id) ? 'info' : 'neutral'} className="cursor-pointer text-[10px]">
                    {c.name}
                  </Badge>
                </button>
              ))}
            </div>
          )}
          {ids.length === 0 && (
            <p className="text-xs text-amber-800 dark:text-amber-300">
              Nothing picked, so this feed serves no products at all.
            </p>
          )}
        </div>
      )}

      {mode === 'products' && (
        <p className="text-xs text-muted-foreground">
          {ids.length === 0
            ? 'No products picked yet, so this feed serves nothing. Pick them from the catalogue once it has products.'
            : `${ids.length} product(s) picked.`}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-6">
        <div className="flex items-center gap-2">
          <Switch checked={feed.only_storefront_published} onCheckedChange={(v) => setGate({ only_storefront_published: v })} aria-label="Published prices only" />
          <span className="text-sm">Published prices only</span>
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={feed.include_out_of_stock} onCheckedChange={(v) => setGate({ include_out_of_stock: v })} aria-label="Include out of stock" />
          <span className="text-sm">List products that are out of stock</span>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        A product with no warehouse record has UNKNOWN stock, not zero — it is listed as on order rather
        than claiming we hold it.
      </p>
    </div>
  );
};
