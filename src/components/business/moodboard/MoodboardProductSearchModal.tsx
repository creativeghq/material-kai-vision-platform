import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2, Plus, Check, Sparkles, Package } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { moodboardAPI } from '@/services/moodboardAPI';
import { PRODUCT_IMAGE_SELECT, getProductImageUrl } from '@/utils/productMetadata';
import { getOptimizedImageUrl } from '@/utils/imageUrl';

interface SearchHit {
  id: string;
  name: string;
  imageUrl: string | null;
}

interface MoodboardProductSearchModalProps {
  moodboardId: string;
  moodboardTitle: string;
  open: boolean;
  onClose: () => void;
  /** Material IDs already in the moodboard — shown as "Added" and not re-addable. */
  existingMaterialIds?: string[];
  /** Called after a product is successfully added so the parent can refresh. */
  onAdded?: () => void;
}

export const MoodboardProductSearchModal: React.FC<MoodboardProductSearchModalProps> = ({
  moodboardId,
  moodboardTitle,
  open,
  onClose,
  existingMaterialIds = [],
  onAdded,
}) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<SearchHit[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!open) {
      // Reset transient state when the modal closes.
      setQuery('');
      setResults([]);
      setHasSearched(false);
      setAdded(new Set());
    }
  }, [open]);

  const runSearch = useCallback(async (q: string) => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      setHasSearched(false);
      return;
    }
    try {
      setSearching(true);
      const escaped = term.replace(/[%_]/g, (m) => `\\${m}`);
      const { data, error } = await supabase
        .from('products')
        .select(`id, name, ${PRODUCT_IMAGE_SELECT}`)
        .or(`name.ilike.%${escaped}%,description.ilike.%${escaped}%`)
        .limit(40);
      if (error) throw error;
      setResults(
        (data ?? []).map((p: any) => ({
          id: p.id,
          name: p.name ?? 'Untitled product',
          imageUrl: getProductImageUrl(p),
        })),
      );
      setHasSearched(true);
    } catch (err) {
      console.error('Product search failed:', err);
      toast({ title: 'Search failed', description: 'Could not search products', variant: 'destructive' });
    } finally {
      setSearching(false);
    }
  }, [toast]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), 350);
  };

  const handleAdd = async (hit: SearchHit) => {
    try {
      setAddingId(hit.id);
      await moodboardAPI.addMoodBoardItem({ moodboard_id: moodboardId, material_id: hit.id });
      setAdded((prev) => new Set(prev).add(hit.id));
      toast({ title: 'Added', description: `"${hit.name}" added to "${moodboardTitle}"` });
      onAdded?.();
    } catch (err) {
      console.error('Add to moodboard failed:', err);
      toast({ title: 'Error', description: 'Failed to add product', variant: 'destructive' });
    } finally {
      setAddingId(null);
    }
  };

  const handleAdvancedSearch = () => {
    // Hand off to the KAI agent, carrying the moodboard id so products added
    // from the agent land back in this moodboard.
    const params = new URLSearchParams();
    params.set('moodboard', moodboardId);
    if (query.trim()) {
      params.set('prompt', `Find materials matching "${query.trim()}" for my moodboard "${moodboardTitle}".`);
    }
    onClose();
    navigate(`/agent-hub?${params.toString()}`);
  };

  const isAdded = (id: string) => added.has(id) || existingMaterialIds.includes(id);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Add Products</DialogTitle>
          <DialogDescription>
            Search the catalog and add materials to "{moodboardTitle}"
          </DialogDescription>
        </DialogHeader>

        {/* Search bar */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch(query)}
              placeholder="Search materials by name or description..."
              className="pl-9 rounded-full"
              autoFocus
            />
          </div>
          <Button
            variant="outline"
            className="rounded-full gap-1.5 shrink-0"
            onClick={handleAdvancedSearch}
            title="Search with the KAI agent — added products return to this moodboard"
          >
            <Sparkles className="h-4 w-4" />
            Advanced search
          </Button>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto -mx-1 px-1 mt-1">
          {searching ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !hasSearched ? (
            <div className="text-center py-12 text-muted-foreground">
              <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Start typing to search the catalog</p>
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-sm mb-3">No products found for "{query}"</p>
              <Button variant="outline" className="rounded-full gap-1.5" onClick={handleAdvancedSearch}>
                <Sparkles className="h-4 w-4" />
                Try advanced search
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-2">
              {results.map((hit) => {
                const done = isAdded(hit.id);
                return (
                  <div
                    key={hit.id}
                    className="rounded-xl border border-border bg-card overflow-hidden flex flex-col"
                  >
                    <div className="aspect-square bg-muted overflow-hidden relative">
                      {hit.imageUrl ? (
                        <img
                          src={getOptimizedImageUrl(hit.imageUrl, 'thumbnail')}
                          alt={hit.name}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Package className="h-7 w-7 text-muted-foreground/40" />
                        </div>
                      )}
                    </div>
                    <div className="p-2.5 flex flex-col gap-2 flex-1">
                      <p className="text-xs font-medium line-clamp-2 leading-tight flex-1">{hit.name}</p>
                      <Button
                        size="sm"
                        variant={done ? 'secondary' : 'default'}
                        className="rounded-full h-7 text-xs w-full"
                        disabled={done || addingId === hit.id}
                        onClick={() => handleAdd(hit)}
                      >
                        {addingId === hit.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : done ? (
                          <><Check className="h-3.5 w-3.5 mr-1" /> Added</>
                        ) : (
                          <><Plus className="h-3.5 w-3.5 mr-1" /> Add</>
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default MoodboardProductSearchModal;
