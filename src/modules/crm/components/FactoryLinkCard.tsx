import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Factory, Loader2, Search as SearchIcon, X, ExternalLink, Check } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Button } from '@/components/core/ui/button';

/**
 * Pins a CRM supplier to one or more ingested factory/manufacturer identities
 * (the maker names that come off products.metadata.factory_name). This is the
 * explicit relation that replaces the fragile supplier-name ILIKE match — once
 * pinned, SupplierProductsTab and the "View products" deep-link key off the pin.
 *
 * The candidate list is the set of distinct maker names actually present in the
 * catalog (via the shared getManufacturer accessor, so it matches how Discover
 * buckets factories). A pre-fill suggestion is offered when a maker name matches
 * the supplier's own name.
 */
export const FactoryLinkCard: React.FC<{
  value: string[];
  supplierName?: string;
  workspaceId: string;
  onChange: (names: string[]) => void;
}> = ({ value, supplierName, workspaceId, onChange }) => {
  const [allFactories, setAllFactories] = useState<{ name: string; count: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!workspaceId) { setAllFactories([]); setLoading(false); return; }
    (async () => {
      try {
        // Distinct maker names in THIS workspace's catalog with product counts, straight from
        // the DB (list_workspace_makers) — the same makers ingestion resolved to brand nodes.
        const { data } = await supabase.rpc('list_workspace_makers', { p_workspace_id: workspaceId });
        if (cancelled) return;
        setAllFactories(
          ((data ?? []) as Array<{ factory_name: string; product_count: number }>)
            .map((r) => ({ name: (r.factory_name ?? '').trim(), count: Number(r.product_count) || 0 }))
            .filter((r) => r.name),
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  const selected = value ?? [];
  const toggle = (name: string) => {
    if (selected.includes(name)) onChange(selected.filter((n) => n !== name));
    else onChange([...selected, name]);
  };

  const suggestion = useMemo(() => {
    if (selected.length > 0 || !supplierName) return null;
    const sn = supplierName.trim().toLowerCase();
    if (!sn) return null;
    return allFactories.find((f) => {
      const fn = f.name.toLowerCase();
      return fn === sn || fn.includes(sn) || sn.includes(fn);
    })?.name ?? null;
  }, [allFactories, selected, supplierName]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q ? allFactories.filter((f) => f.name.toLowerCase().includes(q)) : allFactories;
    return base.slice(0, 50);
  }, [allFactories, search]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Factory className="h-4 w-4" />
          Linked factory / manufacturer
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          Pin this supplier to the maker name(s) on ingested products. This is what ties
          the supplier to the catalog — match by the names extracted during ingestion.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Selected pins */}
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {selected.map((name) => (
              <Badge key={name} variant="secondary" className="gap-1 pr-1">
                {name}
                <button type="button" onClick={() => toggle(name)} className="rounded-full hover:bg-muted-foreground/20 p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {suggestion && (
          <button
            type="button"
            onClick={() => toggle(suggestion)}
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <Check className="h-3 w-3" /> Pin “{suggestion}” (matches this supplier's name)
          </button>
        )}

        {/* Picker */}
        <div className="relative">
          <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ingested factory names…"
            className="pl-8 h-9"
          />
        </div>
        <div className="max-h-56 overflow-y-auto rounded-md border border-border/60 divide-y divide-border/40">
          {loading ? (
            <div className="flex items-center gap-2 justify-center py-6 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading factories…
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">No ingested factory names match.</div>
          ) : (
            filtered.map((f) => {
              const isSel = selected.includes(f.name);
              return (
                <button
                  key={f.name}
                  type="button"
                  onClick={() => toggle(f.name)}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40 ${isSel ? 'bg-primary/[0.06]' : ''}`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <span className={`h-3.5 w-3.5 shrink-0 rounded-sm border flex items-center justify-center ${isSel ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`}>
                      {isSel && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                    </span>
                    <span className="truncate">{f.name}</span>
                  </span>
                  <Badge variant="outline" className="text-[10px] shrink-0">{f.count}</Badge>
                </button>
              );
            })
          )}
        </div>

        {selected.length > 0 && (
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link to={`/discover?tab=products&factory=${encodeURIComponent(selected[0])}`}>
              <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
              View products in Discovery
            </Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default FactoryLinkCard;
