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
import { UnifiedSearchService } from '@/services/unifiedSearchService';
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

// Search result type based on UnifiedSearchService response
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

// Post-filter selections survive a reload, as they did in the old sidebar panel.
const FILTERS_STORAGE_KEY = 'materialSearchFilters';

interface UnifiedSearchInterfaceProps {
  onResultsFound?: (results: SearchResult[]) => void;
  onMaterialSelect?: (materialId: string) => void;
}

export const UnifiedSearchInterface: React.FC<UnifiedSearchInterfaceProps> = ({
  onResultsFound,
  onMaterialSelect,
}) => {
  // Using modern MaterialSearchService
  // const materialSearchService is imported as singleton

  // Search is scoped to the ACTIVE workspace (respects the workspace switcher) rather than an
  // arbitrary `.maybeSingle()` membership row — so multi-workspace users search the right tenant.
  const { activeWorkspaceId } = useWorkspace();

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchType, setSearchType] = useState<'text' | 'image' | 'hybrid' | 'color' | 'texture' | 'style' | 'material'>('text');
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

  useEffect(() => {
    localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(values));
  }, [values]);

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

  const performSearch = useCallback(async () => {
    // Validate input based on search type
    if (searchType === 'text' && !query.trim()) {
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
        query: searchType === 'text' ? query.trim() : (selectedImage?.name || `${searchType}_search`),
        workspace_id: workspaceId,
        limit: 15,
        image_base64: imageBase64,
        enableQueryUnderstanding: true,
        // Aspect modes (#277) bias retrieval toward that per-aspect vector; text/image/hybrid
        // stay full-fusion (aspect undefined).
        aspect: (['color', 'texture', 'style', 'material'] as const).includes(searchType as any)
          ? (searchType as 'color' | 'texture' | 'style' | 'material')
          : undefined,
      });

      if (!searchResponse.success) {
        throw new Error(searchResponse.error || 'Search failed');
      }

      // Transform UnifiedSearchService results to SearchResult format
      const unifiedResults: SearchResult[] = searchResponse.results.map(
        (result) => ({
          id: result.chunk_id,
          title: result.document_name,
          content: result.content,
          type: 'pdf_content' as const,
          similarity_score: result.similarity_score,
          source: result.filename || 'knowledge_base',
          chunk_id: result.chunk_id,
          document_id: result.document_id,
          document_name: result.document_name,
          page_number: result.page_number,
          metadata: {
            chunk_metadata: result.chunk_metadata,
            document_tags: result.document_tags,
            source_metadata: result.source_metadata,
          },
        }),
      );

      // Sort by similarity score
      unifiedResults.sort((a, b) => b.similarity_score - a.similarity_score);

      setResults(unifiedResults);
      onResultsFound?.(unifiedResults);

      toast({
        title: 'Search Completed',
        description: `Found ${unifiedResults.length} results using ${searchType} search`,
      });
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

        const formatted: SearchResult[] = quickResponse.results.map((result) => ({
          id: result.chunk_id,
          title: result.document_name,
          content: result.content,
          type: 'pdf_content' as const,
          similarity_score: result.similarity_score,
          source: 'quick_search',
          chunk_id: result.chunk_id,
          document_id: result.document_id,
          document_name: result.document_name,
          page_number: result.page_number,
          metadata: {
            chunk_metadata: result.chunk_metadata,
          },
        }));

        setResults(formatted);
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
        <CardContent className="space-y-4 pt-6">
          {/* Main Search Input */}
          <div className="flex gap-2">
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
                className="pr-10"
              />
              <Type className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            </div>
            <Button
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 py-2"
              onClick={() => handleQuickSearch(query)}
              disabled={isSearching || !query.trim()}
            >
              Quick
            </Button>
            <Button onClick={performSearch} disabled={isSearching}>
              {isSearching ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}
              Search
            </Button>
          </div>

          {/* Search Type Selector */}
          <div className="flex items-center gap-4">
            <Label className="text-sm font-medium">Search Type:</Label>
            <Select value={searchType} onValueChange={(value: any) => setSearchType(value)}>
              <SelectTrigger className="w-[220px]">
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
            <span className="text-xs text-muted-foreground">
              {searchType === 'text' && 'Natural language processing for material specifications'}
              {searchType === 'image' && 'AI will analyze the image to identify materials'}
              {searchType === 'hybrid' && 'Using both text and image for enhanced matching'}
              {searchType === 'color' && 'Find materials with similar color palettes'}
              {searchType === 'texture' && 'Find materials with similar texture patterns'}
              {searchType === 'style' && 'Find materials with similar design styles'}
              {searchType === 'material' && 'Find materials of similar types'}
            </span>
          </div>

          {/* Image Upload Section */}
          <div className="border border-dashed border-muted-foreground/25 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <Label className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Material Image {['color', 'texture', 'style', 'material', 'image'].includes(searchType) ? '(Required)' : '(Optional)'}
              </Label>
              {selectedImage && (
                <Button
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 rounded-md px-3"
                  onClick={removeImage}
                >
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


        </CardContent>
      </Card>

      {/* Search Results */}
      {results.length > 0 && (
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
            <div className="space-y-4">
              {filteredResults.map((result, index) => (
                <Card
                  key={index}
                  className="border-l-4 border-l-primary hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => onMaterialSelect?.(result.id)}
                >
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getResultIcon(result.type)}
                        <h3 className="font-semibold">{result.title}</h3>
                        <Badge className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                          {result.type}
                        </Badge>
                        {result.source && (
                          <Badge className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 text-xs">
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

                    <p className="text-sm text-muted-foreground mb-3">
                      {result.content.length > 300
                        ? `${result.content.substring(0, 300)}...`
                        : result.content}
                    </p>

                    {/* Metadata */}
                    {result.metadata && (
                      <div className="flex flex-wrap gap-2">
                        {result.category && (
                          <Badge className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
                            {result.category}
                          </Badge>
                        )}
                        {result.metafield_values &&
                          result.metafield_values
                            .slice(0, 2)
                            .map((field, i) => (
                              <Badge
                                key={i}
                                className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80"
                              >
                                {field.display_name}:{' '}
                                {field.value_text ||
                                  field.value_number ||
                                  String(field.value_boolean)}
                              </Badge>
                            ))}
                        {(result as any).properties && (
                          <Badge className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
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
