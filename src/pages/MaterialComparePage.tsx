/**
 * Material Comparison Tool
 * Compare 2–4 products side-by-side with property diff highlighting.
 * URL: /compare?ids=id1,id2,...
 */

import { useEffect, useState, useCallback } from 'react';
import { formatLabel } from '@/lib/labelUtils';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Skeleton } from '@/components/core/ui/skeleton';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { useToast } from '@/hooks/use-toast';
import {
  X,
  Plus,
  ArrowLeft,
  Search,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/core/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/core/ui/popover';

interface Product {
  id: string;
  name: string;
  description: string;
  category_id: string | null;
  status: string | null;
  quality_score: number | null;
  confidence_score: number | null;
  completeness_score: number | null;
  properties: Record<string, unknown> | null;
  specifications: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  image_url?: string;
}

interface SearchResult {
  id: string;
  name: string;
  description: string;
}

const MAX_COMPARE = 4;
const MIN_COMPARE = 2;

function flattenObject(obj: Record<string, unknown> | null, prefix = ''): Record<string, string> {
  if (!obj) return {};
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      Object.assign(result, flattenObject(val as Record<string, unknown>, fullKey));
    } else {
      result[fullKey] = val === null ? '—' : String(val);
    }
  }
  return result;
}

// formatLabel is imported from @/lib/labelUtils — handles snake_case, camelCase, acronyms

function ScoreBar({ value, label }: { value: number | null; label: string }) {
  if (value === null) return <span className="text-muted-foreground text-sm">—</span>;
  const pct = Math.round(value * 100);
  const color = pct >= 75 ? 'bg-green-500' : pct >= 50 ? 'bg-yellow-500' : 'bg-red-400';
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{pct}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function MaterialComparePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  const ids = searchParams.get('ids')?.split(',').filter(Boolean) ?? [];

  const loadProducts = useCallback(async (productIds: string[]) => {
    if (productIds.length === 0) {
      setProducts([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select('id, name, description, category_id, status, quality_score, confidence_score, completeness_score, properties, specifications, metadata')
      .in('id', productIds);

    if (error) {
      toast({ title: 'Error loading products', description: error.message, variant: 'destructive' });
    } else if (data) {
      // Preserve order from ids array
      const ordered = productIds.map((id) => data.find((p) => p.id === id)).filter(Boolean) as Product[];
      setProducts(ordered);
    }
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    loadProducts(ids);
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const searchProducts = useCallback(async (query: string) => {
    if (!query.trim()) { setSearchResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('products')
      .select('id, name, description')
      .ilike('name', `%${query}%`)
      .not('id', 'in', `(${ids.join(',') || '00000000-0000-0000-0000-000000000000'})`)
      .limit(8);
    setSearchResults(data ?? []);
    setSearching(false);
  }, [ids]);

  useEffect(() => {
    const timer = setTimeout(() => searchProducts(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, searchProducts]);

  const addProduct = (id: string) => {
    if (ids.length >= MAX_COMPARE) {
      toast({ title: 'Maximum 4 products', description: 'Remove one to add another.' });
      return;
    }
    const newIds = [...ids, id];
    setSearchParams({ ids: newIds.join(',') });
    setSearchOpen(false);
    setSearchQuery('');
  };

  const removeProduct = (id: string) => {
    const newIds = ids.filter((i) => i !== id);
    setSearchParams(newIds.length ? { ids: newIds.join(',') } : {});
  };

  // Collect all property + spec keys across all products
  const allPropKeys = Array.from(
    new Set(products.flatMap((p) => Object.keys(flattenObject(p.properties as Record<string, unknown>)))),
  );
  const allSpecKeys = Array.from(
    new Set(products.flatMap((p) => Object.keys(flattenObject(p.specifications as Record<string, unknown>)))),
  );

  const getValues = (products: Product[], key: string, section: 'properties' | 'specifications') =>
    products.map((p) => flattenObject(p[section] as Record<string, unknown>)[key] ?? '—');

  const isDifferent = (values: string[]) => new Set(values.filter((v) => v !== '—')).size > 1;

  if (loading) {
    return (
      <div className="p-3 sm:p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {[...Array(ids.length || 2)].map((_, i) => <Skeleton key={i} className="h-64" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="rounded-full -ml-2 mb-3">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <SectionHeader
          title="Material Comparison"
          subtitle={`${products.length} of ${MAX_COMPARE} materials selected`}
          actions={products.length < MAX_COMPARE ? (
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="rounded-full gap-2">
                  <Plus className="h-4 w-4" />
                  Add material
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80 p-0" align="end">
                <Command>
                  <CommandInput
                    placeholder="Search materials..."
                    value={searchQuery}
                    onValueChange={setSearchQuery}
                  />
                  <CommandList>
                    {searching ? (
                      <div className="p-3 text-sm text-muted-foreground">Searching...</div>
                    ) : searchResults.length === 0 ? (
                      <CommandEmpty>No results found.</CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {searchResults.map((r) => (
                          <CommandItem key={r.id} onSelect={() => addProduct(r.id)}>
                            <div>
                              <p className="font-medium text-sm">{r.name}</p>
                              {r.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1">{r.description}</p>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          ) : undefined}
        />
      </div>

      {products.length === 0 && (
        <div className="dashboard-card p-12 text-center space-y-4">
          <Search className="h-12 w-12 text-muted-foreground mx-auto" />
          <div>
            <h2 className="text-lg font-medium">No materials selected</h2>
            <p className="text-muted-foreground text-sm">Add at least {MIN_COMPARE} materials to start comparing.</p>
          </div>
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <Button className="rounded-full">
                <Plus className="h-4 w-4 mr-2" />
                Add material
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0">
              <Command>
                <CommandInput placeholder="Search materials..." value={searchQuery} onValueChange={setSearchQuery} />
                <CommandList>
                  {searching ? (
                    <div className="p-3 text-sm text-muted-foreground">Searching...</div>
                  ) : searchResults.length === 0 ? (
                    <CommandEmpty>No results found.</CommandEmpty>
                  ) : (
                    <CommandGroup>
                      {searchResults.map((r) => (
                        <CommandItem key={r.id} onSelect={() => addProduct(r.id)}>
                          <p className="font-medium text-sm">{r.name}</p>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      )}

      {products.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] border-separate border-spacing-0">
            {/* Product headers */}
            <thead>
              <tr>
                <th className="sticky left-0 z-20 w-48 bg-background p-3 text-left align-bottom">
                  <span className="text-sm text-muted-foreground font-normal">Property</span>
                </th>
                {products.map((p) => (
                  <th key={p.id} className="p-3 align-top min-w-[200px]">
                    <div className="dashboard-card p-4 text-left space-y-3 relative">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="absolute top-2 right-2 h-6 w-6 p-0 rounded-full text-muted-foreground hover:text-destructive"
                        onClick={() => removeProduct(p.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                      <div className="w-full h-32 bg-muted rounded-lg overflow-hidden">
                        {(p.metadata as any)?.image_url ? (
                          <img
                            src={(p.metadata as any).image_url}
                            alt={p.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
                            No image
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-sm line-clamp-2">{p.name}</p>
                        {p.status && (
                          <Badge variant="secondary" className="mt-1 text-xs">{p.status}</Badge>
                        )}
                      </div>
                      <div className="space-y-2">
                        <ScoreBar value={p.quality_score} label="Quality" />
                        <ScoreBar value={p.confidence_score} label="Confidence" />
                        <ScoreBar value={p.completeness_score} label="Completeness" />
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full rounded-full text-xs"
                        onClick={() => navigate(`/compare?ids=${p.id}`)}
                      >
                        View Details
                      </Button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* Properties section */}
              {allPropKeys.length > 0 && (
                <>
                  <tr>
                    <td colSpan={products.length + 1} className="px-3 pt-6 pb-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Properties
                      </p>
                    </td>
                  </tr>
                  {allPropKeys.map((key) => {
                    const values = getValues(products, key, 'properties');
                    const diff = isDifferent(values);
                    return (
                      <tr key={`prop-${key}`} className={diff ? 'bg-accent/30' : ''}>
                        <td className="sticky left-0 z-10 bg-background p-3 text-sm text-muted-foreground align-top">
                          <div className="flex items-center gap-1.5">
                            {diff ? (
                              <AlertCircle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                            )}
                            {formatLabel(key)}
                          </div>
                        </td>
                        {values.map((v, i) => (
                          <td
                            key={i}
                            className={`p-3 text-sm align-top border-l border-border/40 ${
                              diff ? 'font-medium' : ''
                            }`}
                          >
                            {v}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </>
              )}

              {/* Specifications section */}
              {allSpecKeys.length > 0 && (
                <>
                  <tr>
                    <td colSpan={products.length + 1} className="px-3 pt-6 pb-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                        Specifications
                      </p>
                    </td>
                  </tr>
                  {allSpecKeys.map((key) => {
                    const values = getValues(products, key, 'specifications');
                    const diff = isDifferent(values);
                    return (
                      <tr key={`spec-${key}`} className={diff ? 'bg-accent/30' : ''}>
                        <td className="sticky left-0 z-10 bg-background p-3 text-sm text-muted-foreground align-top">
                          <div className="flex items-center gap-1.5">
                            {diff ? (
                              <AlertCircle className="h-3.5 w-3.5 text-yellow-500 shrink-0" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                            )}
                            {formatLabel(key)}
                          </div>
                        </td>
                        {values.map((v, i) => (
                          <td
                            key={i}
                            className={`p-3 text-sm align-top border-l border-border/40 ${
                              diff ? 'font-medium' : ''
                            }`}
                          >
                            {v}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </>
              )}

              {allPropKeys.length === 0 && allSpecKeys.length === 0 && (
                <tr>
                  <td colSpan={products.length + 1} className="p-6 text-center text-muted-foreground text-sm">
                    No properties or specifications available for these materials.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Legend */}
      {products.length >= MIN_COMPARE && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 text-yellow-500" />
            Values differ across products
          </div>
          <div className="flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground/40" />
            Values match
          </div>
        </div>
      )}
    </div>
  );
}
