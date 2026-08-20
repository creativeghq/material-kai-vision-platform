import React, { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import {
  Search,
  Upload,
  Image as ImageIcon,
  Type,
  Sparkles,
  Loader2,
  Package,
  BookOpen,
  Brain,
  X,
  Hash,
  Building,
  MapPin,
  User,
  Palette,
  Layers,
  Wand2,
  Box,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { Label } from '@/components/core/ui/label';
import { useToast } from '@/hooks/use-toast';
import { UnifiedSearchService, type SearchResult as ServiceSearchResult } from '@/services/unifiedSearchService';
import { trackSearchImpression, trackSearchClick } from '@/services/manufacturerAnalyticsService';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { FilterBar, useFilters, type FilterValues } from '@/components/core/filters';
import { buildMaterialSearchFilters } from '@/components/features/search/materialSearchFilters';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/core/ui/select';
import { onEnterOrSpace } from '@/utils/a11y';

/**
 * What this component renders. `id` is a PRODUCT id — the `multi_vector` strategy returns
 * product-shaped rows, so `onMaterialSelect` can hand it straight to a product lookup.
 *
 * Until #350 the two mappers below read `result.chunk_id` / `result.document_name` / `result.content`
 * — fields `multi_vector` does not return. Every one arrived `undefined`, so results rendered with
 * no title, and the Discover click handler looked up a product by `undefined` and matched nothing.
 */
type SearchResult = {
  id: string;
  title: string;
  content: string;
  type: 'material' | 'knowledge' | 'pdf_content';
  similarity_score: number;
  source?: string;
  metadata?: Record<string, unknown>;
  extracted_entities?: EntityData[];
  // Additional fields from backend
  chunk_id?: string;
  document_id?: string;
  document_name?: string;
  page_number?: number;
  // Product enrichment (when result is product-shaped)
  category?: string;
  metafield_values?: Array<{
    display_name: string;
    value_text?: string;
    value_number?: number;
    value_boolean?: boolean;
  }>;
};

interface EntityData {
  type: 'MATERIAL' | 'ORG' | 'LOCATION' | 'PERSON' | 'DATE';
  text: string;
  confidence: number;
}

// Post-filter selections survive a reload.
const FILTERS_STORAGE_KEY = 'materialSearchFilters';

type SearchMode = 'text' | 'image' | 'hybrid' | 'color' | 'texture' | 'style' | 'material';

/** Modes whose query is a picture, not words — they get "Searching by image", not "for “x.jpg”". */
const IMAGE_MODES: SearchMode[] = ['image', 'color', 'texture', 'style', 'material'];

// What the in-flight request is actually doing, per mode. Shown under the progress bar so the
// wait is explained rather than just spun at.
const SEARCH_PROGRESS_HINT: Record<SearchMode, string> = {
  text: 'Understanding the query, then matching it across product text and document content…',
  image: 'Analysing the image and comparing it against the visual index…',
  hybrid: 'Combining the text query with the image for a fused match…',
  color: 'Comparing colour palettes across the image index…',
  texture: 'Comparing texture patterns across the image index…',
  style: 'Comparing design styles across the image index…',
  material: 'Comparing material types across the image index…',
};

interface UnifiedSearchInterfaceProps {
  onResultsFound?: (results: SearchResult[]) => void;
  onMaterialSelect?: (materialId: string) => void;
  /** When set, seeds the query box and runs a text search once on mount (e.g. from Spotlight). */
  initialQuery?: string;
}

/**
 * Map one backend row to what this component renders. Every field is read defensively: the
 * strategies disagree about which they populate, and reading an absent one used to surface as a
 * blank card rather than an error.
 */
const toSearchResult = (result: ServiceSearchResult, source: string): SearchResult => ({
  id: result.id,
  title: result.product_name || result.name || result.document_name || 'Untitled',
  // `multi_vector` sends `description`; chunk-shaped strategies send `content`.
  content: result.content ?? result.description ?? '',
  type: 'material',
  similarity_score: result.score ?? result.similarity_score ?? 0,
  source,
  category: result.category,
  document_id: result.document_id,
  document_name: result.document_name,
  page_number: result.page_number,
  metadata: result.metadata ?? {},
});

export const UnifiedSearchInterface: React.FC<UnifiedSearchInterfaceProps> = ({
  onResultsFound,
  onMaterialSelect,
  initialQuery,
}) => {
  // Using modern MaterialSearchService
  // const materialSearchService is imported as singleton

  // Search is scoped to the ACTIVE workspace (respects the workspace switcher) rather than an
  // arbitrary `.maybeSingle()` membership row — so multi-workspace users search the right tenant.
  const { activeWorkspaceId } = useWorkspace();

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  // What the in-flight (or last completed) search was actually for, and whether one has ever run.
  // Without these the page could not tell "you haven't searched yet" (say nothing) apart from
  // "we searched and found nothing" (say so) — it rendered blank for both.
  const [activeQuery, setActiveQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  // The mode the in-flight search was STARTED in. The selector stays live during the request, so
  // reading `searchType` for the progress copy would relabel a running image search as a colour
  // one the moment the operator touched the dropdown.
  const [activeMode, setActiveMode] = useState<SearchMode>('text');
  const [searchType, setSearchType] = useState<SearchMode>('text');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Post-filters over the returned results. Facet options are derived from the current result
  // set, so the modal only ever offers constraints that can actually narrow it.
  const filterGroups = useMemo(() => buildMaterialSearchFilters(results), [results]);
  const savedFilters = useMemo<FilterValues>(() => {
    try { return JSON.parse(localStorage.getItem(FILTERS_STORAGE_KEY) ?? '{}') as FilterValues; }
    catch { return {}; }
  }, []);
  const { values, setValues, filtered, previewCount } = useFilters(results, filterGroups, { initial: savedFilters });
  const filteredResults = filtered;

  // Which products have already been counted as "seen in results" for the CURRENT search. Cleared
  // on every new search, so searching twice for the same thing counts twice (two impressions) but
  // narrowing the post-filters does not (one).
  const impressedRef = useRef<Set<string>>(new Set());

  // An impression is "this product was shown to someone in a ranked result set" — distinct from
  // product_view, which fires when a catalog card scrolls into sight. Only what actually renders
  // counts, which is why this keys off filteredResults rather than the raw response.
  useEffect(() => {
    filteredResults.forEach((result) => {
      if (!result.id || impressedRef.current.has(result.id)) return;
      impressedRef.current.add(result.id);
      trackSearchImpression(
        result.id,
        '',
        window.location.pathname,
        { query: activeQuery, rank: filteredResults.indexOf(result) + 1 },
        result.category,
      );
    });
  }, [filteredResults, activeQuery]);

  const handleResultClick = useCallback((result: SearchResult) => {
    if (!result.id) return;
    trackSearchClick(
      result.id,
      '',
      window.location.pathname,
      { query: activeQuery, rank: filteredResults.indexOf(result) + 1 },
      result.category,
    );
    onMaterialSelect?.(result.id);
  }, [activeQuery, filteredResults, onMaterialSelect]);

  useEffect(() => {
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(values));
  }, [values]);

  // Elapsed seconds on the in-flight search. A multi-vector round-trip through MIVAA routinely
  // takes several seconds; a spinner with no clock starts reading as "hung" long before it is.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isSearching) return;
    setElapsed(0);
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => clearInterval(t);
  }, [isSearching]);

  // Seed + auto-run when opened with an initial query (Spotlight "Smart search", capability
  // deep-links). Runs once per distinct initialQuery so re-renders don't re-fire the search.
  const autoRanFor = useRef<string | null>(null);
  useEffect(() => {
    const q = initialQuery?.trim();
    if (!q || autoRanFor.current === q) return;
    autoRanFor.current = q;
    setSearchType('text');
    setQuery(q);
    void performSearch(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialQuery]);

  const handleImageSelect = useCallback((file: File) => {
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const removeImage = useCallback(() => {
    setSelectedImage(null);
    setImagePreview(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const detectQueryType = useCallback(
    (searchQuery: string): 'text' | 'image' | 'hybrid' => {
      if (selectedImage && searchQuery.trim()) return 'hybrid';
      if (selectedImage) return 'image';
      return 'text';
    },
    [selectedImage],
  );

  const performSearch = useCallback(async (overrideQuery?: string) => {
    // `overrideQuery` lets callers (e.g. the auto-run from `initialQuery`) drive a search without
    // waiting on the async `query` state update. NEVER pass this as a raw onClick handler — the
    // click event would arrive here as `overrideQuery`; wrap it as `() => performSearch()`.
    const effectiveQuery = typeof overrideQuery === 'string' ? overrideQuery : query;
    // Validate input based on search type
    if (searchType === 'text' && !effectiveQuery.trim()) {
      toast({
        title: 'Search Input Required',
        description: 'Please enter a search query',
        variant: 'destructive',
      });
      return;
    }

    if (['image', 'color', 'texture', 'style', 'material'].includes(searchType) && !selectedImage) {
      toast({
        title: 'Image Required',
        description: `Please upload an image for ${searchType} search`,
        variant: 'destructive',
      });
      return;
    }

    setIsSearching(true);
    setActiveMode(searchType);
    // A new search is a new result set — reset the impression dedupe so the same product
    // appearing in two searches counts twice.
    impressedRef.current = new Set();
    setActiveQuery(IMAGE_MODES.includes(searchType) ? (selectedImage?.name ?? '') : effectiveQuery.trim());

    try {
      // Prefer the active workspace (switcher-aware); fall back to a membership lookup.
      let workspaceId = activeWorkspaceId;
      if (!workspaceId) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');
        const { data: wd } = await supabase
          .from('workspace_members').select('workspace_id').eq('user_id', user.id).maybeSingle();
        workspaceId = wd?.workspace_id ?? null;
      }
      if (!workspaceId) {
        throw new Error('No workspace found for user');
      }

      let searchResponse;

      // Encode the selected image to base64 (when present) — UnifiedSearchService
      // wants either an HTTP URL or a base64 string, never a raw File.
      let imageBase64: string | undefined;
      if (selectedImage) {
        imageBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(selectedImage);
        });
      }

      // multi_vector is the only supported strategy — it handles text, image,
      // color, texture, style, and material searches.
      searchResponse = await UnifiedSearchService.searchMultiVector({
        // Send the user's words, or nothing. Never the filename.
        //
        // This used to fall back to `selectedImage.name` (or the literal "texture_search"),
        // and the backend embedded that string into every text-derived channel — 41.5% of the
        // ranking in the balanced profile was `voyage("IMG_2831.jpg")`. An empty query is now
        // valid when an image is attached, and MIVAA answers it from the image instead:
        // vision analysis fills the aspect and understanding vectors, and the text-only
        // channels stand down rather than matching against a fabricated string.
        query: effectiveQuery.trim(),
        workspace_id: workspaceId,
        limit: 15,
        image_base64: imageBase64,
        enableQueryUnderstanding: true,
        // Aspect modes bias retrieval toward that per-aspect vector; text/image/hybrid
        // stay full-fusion (aspect undefined).
        aspect: (['color', 'texture', 'style', 'material'] as const).includes(searchType as any)
          ? (searchType as 'color' | 'texture' | 'style' | 'material')
          : undefined,
      });

      if (!searchResponse.success) {
        throw new Error(searchResponse.error || 'Search failed');
      }

      // Transform UnifiedSearchService results to SearchResult format
      const unifiedResults: SearchResult[] = searchResponse.results
        .filter((result) => !!result.id)
        .map((result) => toSearchResult(result, result.filename || 'catalog'));

      // Sort by similarity score
      unifiedResults.sort((a, b) => b.similarity_score - a.similarity_score);

      setResults(unifiedResults);
      setHasSearched(true);
      onResultsFound?.(unifiedResults);
      // No success toast. The results (or the empty state) below ARE the answer — a toast for
      // them fired *after* the operator had already navigated away, which is how a search with
      // no on-page loader ended up announcing itself from another screen.
    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: 'Search Failed',
        description:
          error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  }, [
    query,
    selectedImage,
    imagePreview,
    detectQueryType,
    onResultsFound,
    toast,
    activeWorkspaceId,
  ]);

  const handleQuickSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) return;

      setIsSearching(true);
      setActiveMode('text');   // the Quick button is always a plain text pass
      // A new search is a new result set — reset the impression dedupe so the same product
      // appearing in two searches counts twice.
      impressedRef.current = new Set();
      setActiveQuery(searchQuery.trim());
      try {
        // Prefer the active workspace (switcher-aware); fall back to a membership lookup.
        let workspaceId = activeWorkspaceId;
        if (!workspaceId) {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('User not authenticated');
          const { data: wd } = await supabase
            .from('workspace_members').select('workspace_id').eq('user_id', user.id).maybeSingle();
          workspaceId = wd?.workspace_id ?? null;
        }
        if (!workspaceId) {
          throw new Error('No workspace found for user');
        }

        // Quick text-based search using multi_vector strategy
        const quickResponse = await UnifiedSearchService.search({
          query: searchQuery,
          workspace_id: workspaceId,
          strategy: 'multi_vector',
          top_k: 8,
        });

        if (!quickResponse.success) {
          throw new Error(quickResponse.error || 'Quick search failed');
        }

        const formatted: SearchResult[] = quickResponse.results
          .filter((result) => !!result.id)
          .map((result) => toSearchResult(result, 'quick_search'));

        setResults(formatted);
        setHasSearched(true);
        onResultsFound?.(formatted);
      } catch (error) {
        console.error('Quick search error:', error);
        toast({
          title: 'Quick Search Failed',
          description: 'Please try the full search',
          variant: 'destructive',
        });
      } finally {
        setIsSearching(false);
      }
    },
    [onResultsFound, toast, activeWorkspaceId],
  );

  const getResultIcon = (type: string) => {
    switch (type) {
      case 'material':
        return <Package className="h-4 w-4 text-blue-500" />;
      case 'knowledge':
        return <BookOpen className="h-4 w-4 text-green-500" />;
      case 'pdf_content':
        return <Brain className="h-4 w-4 text-purple-500" />;
      default:
        return <Search className="h-4 w-4 text-gray-500" />;
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-500';
    if (score >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Unified Search Interface */}
      <Card>
        <CardContent className="space-y-3 pt-6">
          {/* Single-line search bar: type selector · query · actions */}
          <div className="flex items-center gap-2">
            <Select value={searchType} onValueChange={(value: any) => setSearchType(value)}>
              <SelectTrigger className="w-[150px] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="text">
                  <div className="flex items-center gap-2">
                    <Type className="h-4 w-4" />
                    Text Search
                  </div>
                </SelectItem>
                <SelectItem value="image">
                  <div className="flex items-center gap-2">
                    <ImageIcon className="h-4 w-4" />
                    Image Search
                  </div>
                </SelectItem>
                <SelectItem value="hybrid">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4" />
                    Multi-Search
                  </div>
                </SelectItem>
                <SelectItem value="color">
                  <div className="flex items-center gap-2">
                    <Palette className="h-4 w-4" />
                    Color Palette
                  </div>
                </SelectItem>
                <SelectItem value="texture">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4" />
                    Texture Pattern
                  </div>
                </SelectItem>
                <SelectItem value="style">
                  <div className="flex items-center gap-2">
                    <Wand2 className="h-4 w-4" />
                    Design Style
                  </div>
                </SelectItem>
                <SelectItem value="material">
                  <div className="flex items-center gap-2">
                    <Box className="h-4 w-4" />
                    Material Type
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>

            <div className="flex-1 relative">
              <Input
                placeholder="Search materials: 'Cement tile 60x120', 'Fire resistance', 'Waterproof flooring'..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    performSearch();
                  }
                }}
                className="pr-9"
              />
              <Type className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            </div>

            <Button
              variant="outline"
              className="h-10 shrink-0"
              onClick={() => handleQuickSearch(query)}
              disabled={isSearching || !query.trim()}
            >
              Quick
            </Button>
            <Button className="h-10 shrink-0" onClick={() => performSearch()} disabled={isSearching}>
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Search
            </Button>
          </div>

          {/* Contextual helper for the selected mode */}
          <p className="text-xs text-muted-foreground">
            {searchType === 'text' && 'Natural language processing for material specifications'}
            {searchType === 'image' && 'AI will analyze the image to identify materials'}
            {searchType === 'hybrid' && 'Using both text and image for enhanced matching'}
            {searchType === 'color' && 'Find materials with similar color palettes'}
            {searchType === 'texture' && 'Find materials with similar texture patterns'}
            {searchType === 'style' && 'Find materials with similar design styles'}
            {searchType === 'material' && 'Find materials of similar types'}
          </p>

          {/* Image Upload Section — only when the mode can use an image */}
          {searchType !== 'text' && (
          <div className="border border-dashed border-muted-foreground/25 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <Label className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Material Image {['color', 'texture', 'style', 'material', 'image'].includes(searchType) ? '(Required)' : '(Optional)'}
              </Label>
              {selectedImage && (
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={removeImage}>
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>

            {imagePreview ? (
              <div className="flex items-center gap-4">
                <img
                  src={imagePreview}
                  alt="Selected material"
                  className="w-20 h-20 object-cover rounded border"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">{selectedImage?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Image will be analyzed for material identification
                  </p>
                </div>
              </div>
            ) : (
              <div
                role="button"
                tabIndex={0}
                onKeyDown={onEnterOrSpace(() => fileInputRef.current?.click())}
                className="flex flex-col items-center justify-center py-8 cursor-pointer hover:bg-muted/50 rounded"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">
                  Click to upload material image
                </p>
                <p className="text-xs text-muted-foreground">
                  Supports JPG, PNG up to 10MB
                </p>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImageSelect(file);
              }}
            />
          </div>
          )}
        </CardContent>
      </Card>

      {/* Results region — exactly one of: searching · searched-and-found-nothing · results.
          The searching branch matters most on the deep-linked path (Spotlight → /discover?mode=
          smart&q=…), where the search auto-fires on mount: with no branch here the page rendered
          blank for the whole round-trip and the operator had no way to tell it was working. */}
      {isSearching ? (
        <Card aria-busy="true" aria-live="polite">
          <CardHeader className="space-y-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
              <span className="truncate">
                {IMAGE_MODES.includes(activeMode)
                  ? <>Searching by {activeMode === 'image' ? 'image' : activeMode}{activeQuery ? ` — ${activeQuery}` : ''}…</>
                  : activeQuery ? <>Searching for “{activeQuery}”…</> : 'Searching…'}
              </span>
              <span className="ml-auto shrink-0 text-xs font-normal tabular-nums text-muted-foreground">
                {elapsed}s
              </span>
            </CardTitle>
            <div className="progress-indeterminate" />
            <p className="text-xs text-muted-foreground">{SEARCH_PROGRESS_HINT[activeMode]}</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="space-y-2 rounded-lg border border-border border-l-4 border-l-primary/30 p-4"
              >
                <div className="flex items-center gap-2">
                  <div className="skeleton h-4 w-4 rounded" />
                  <div className="skeleton h-3.5 w-52 rounded" />
                  <div className="skeleton ml-auto h-3 w-10 rounded" />
                </div>
                <div className="skeleton h-2.5 w-full rounded" />
                <div className="skeleton h-2.5 w-[85%] rounded" />
                <div className="flex gap-2 pt-1">
                  <div className="skeleton h-4 w-16 rounded-full" />
                  <div className="skeleton h-4 w-20 rounded-full" />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : hasSearched && results.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <Search className="mx-auto mb-3 h-10 w-10 opacity-30" />
            <p className="font-medium">
              {IMAGE_MODES.includes(activeMode)
                ? <>No {activeMode === 'image' ? 'visual' : activeMode} matches{activeQuery ? <> for “{activeQuery}”</> : null}</>
                : activeQuery ? <>No matches for “{activeQuery}”</> : 'No matches'}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              {IMAGE_MODES.includes(activeMode)
                ? 'Nothing in this workspace looked close enough. Try a clearer or tighter crop, or a different mode above.'
                : 'Nothing in this workspace matched. Try fewer or different words, or switch the mode above to search by image, colour, texture or style.'}
            </p>
          </CardContent>
        </Card>
      ) : results.length > 0 && (
        <Card>
          <CardHeader className="space-y-3">
            <CardTitle>
              Search Results ({filteredResults.length} of {results.length}{' '}
              found)
              {filteredResults.length !== results.length && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  (post-filtered)
                </span>
              )}
            </CardTitle>
            {/* Post-filters only — the query box above drives retrieval, so no second search box. */}
            <FilterBar
              groups={filterGroups}
              values={values}
              onChange={setValues}
              previewCount={previewCount}
              searchKey={null}
              title="Narrow results"
            />
          </CardHeader>
          <CardContent>
            {/* Post-filters can hide every result. Say so — otherwise the card renders a header
                claiming "0 of 15" above an empty box with no hint of what to undo. */}
            {filteredResults.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                All {results.length} results are hidden by the filters above. Clear one to see them.
              </p>
            )}
            <div className="space-y-4">
              {filteredResults.map((result, index) => (
                <Card
                  key={index}
                  className="border-l-4 border-l-primary hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => handleResultClick(result)}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getResultIcon(result.type)}
                        <h3 className="font-semibold">{result.title}</h3>
                        <Badge className="inline-flex items-center border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                          {result.type}
                        </Badge>
                        {result.source && (
                          <Badge className="inline-flex items-center border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs">
                            {result.source}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${getConfidenceColor(result.similarity_score)}`}
                        />
                        <span className="text-sm text-muted-foreground">
                          {(result.similarity_score * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {result.content && (
                      <p className="text-sm text-muted-foreground mb-3">
                        {result.content.length > 300
                          ? `${result.content.substring(0, 300)}...`
                          : result.content}
                      </p>
                    )}

                    {/* Metadata */}
                    {result.metadata && (
                      <div className="flex flex-wrap gap-2">
                        {result.category && (
                          <Badge className="inline-flex items-center border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                            {result.category}
                          </Badge>
                        )}
                        {result.metafield_values &&
                          result.metafield_values
                            .slice(0, 2)
                            .map((field, i) => (
                              <Badge
                                key={i}
                                className="inline-flex items-center border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80"
                              >
                                {field.display_name}:{' '}
                                {field.value_text ||
                                  field.value_number ||
                                  String(field.value_boolean)}
                              </Badge>
                            ))}
                        {(result as any).properties && (
                          <Badge className="inline-flex items-center border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                            Properties Available
                          </Badge>
                        )}
                      </div>
                    )}

                    {/* Entity Badges */}
                    {result.extracted_entities &&
                      result.extracted_entities.length > 0 && (
                        <div className="mt-2">
                          <div className="text-xs text-muted-foreground mb-1">
                            Extracted Entities:
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {result.extracted_entities
                              .slice(0, 6)
                              .map((entity, i) => (
                                <Badge
                                  key={i}
                                  variant="outline"
                                  className="text-xs"
                                >
                                  {entity.type === 'MATERIAL' && (
                                    <Hash className="h-2 w-2 mr-1" />
                                  )}
                                  {entity.type === 'ORG' && (
                                    <Building className="h-2 w-2 mr-1" />
                                  )}
                                  {entity.type === 'LOCATION' && (
                                    <MapPin className="h-2 w-2 mr-1" />
                                  )}
                                  {entity.type === 'PERSON' && (
                                    <User className="h-2 w-2 mr-1" />
                                  )}
                                  {entity.text}
                                  <span className="ml-1 text-muted-foreground">
                                    ({Math.round(entity.confidence * 100)}%)
                                  </span>
                                </Badge>
                              ))}
                            {result.extracted_entities.length > 6 && (
                              <Badge variant="outline" className="text-xs">
                                +{result.extracted_entities.length - 6} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
