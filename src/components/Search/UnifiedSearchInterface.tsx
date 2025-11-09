import React, { useState, useCallback, useRef, useEffect } from 'react';
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
  Filter,
  Hash,
  Building,
  MapPin,
  User,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { UnifiedSearchService } from '@/services/unifiedSearchService';
import { supabase } from '@/integrations/supabase/client';
import {
  MaterialFiltersPanel,
  type MaterialFilters,
} from '@/components/Search/MaterialFiltersPanel';

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
};

interface EntityData {
  type: 'MATERIAL' | 'ORG' | 'LOCATION' | 'PERSON' | 'DATE';
  text: string;
  confidence: number;
}

interface EntityFilters {
  materials: string[];
  organizations: string[];
  locations: string[];
  people: string[];
}

interface AvailableEntities {
  materials: string[];
  organizations: string[];
  locations: string[];
  people: string[];
}

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

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [filteredResults, setFilteredResults] = useState<SearchResult[]>([]);
  // const [_searchType, _setSearchType] = useState<'text' | 'image' | 'hybrid'>('text');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [showEntityFilters, setShowEntityFilters] = useState(false);
  const [entityFilters, setEntityFilters] = useState<EntityFilters>({
    materials: [],
    organizations: [],
    locations: [],
    people: [],
  });
  const [availableEntities, setAvailableEntities] = useState<AvailableEntities>(
    {
      materials: [],
      organizations: [],
      locations: [],
      people: [],
    },
  );
  const [materialFilters, setMaterialFilters] = useState<MaterialFilters>({
    materialTypes: [],
    colors: [],
    priceRange: [0, 10000],
    durabilityRating: [],
    availabilityStatus: [],
    suppliers: [],
    applications: [],
    textures: [],
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Load available entities from database
  const loadAvailableEntities = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('extracted_entities')
        .not('extracted_entities', 'is', null);

      if (error) throw error;

      const allEntities: AvailableEntities = {
        materials: [],
        organizations: [],
        locations: [],
        people: [],
      };

      data?.forEach((item: unknown) => {
        const entities =
          ((item as any).extracted_entities as EntityData[]) || [];
        entities.forEach((entity) => {
          if (entity.confidence >= 0.7) {
            // Only include high-confidence entities
            switch (entity.type) {
              case 'MATERIAL':
                if (!allEntities.materials.includes(entity.text)) {
                  allEntities.materials.push(entity.text);
                }
                break;
              case 'ORG':
                if (!allEntities.organizations.includes(entity.text)) {
                  allEntities.organizations.push(entity.text);
                }
                break;
              case 'LOCATION':
                if (!allEntities.locations.includes(entity.text)) {
                  allEntities.locations.push(entity.text);
                }
                break;
              case 'PERSON':
                if (!allEntities.people.includes(entity.text)) {
                  allEntities.people.push(entity.text);
                }
                break;
            }
          }
        });
      });

      // Sort entities alphabetically
      Object.keys(allEntities).forEach((key) => {
        (allEntities as any)[key].sort();
      });

      setAvailableEntities(allEntities);
    } catch (error) {
      console.error('Error loading entities:', error);
    }
  }, []);

  // Load entities on component mount
  useEffect(() => {
    loadAvailableEntities();
  }, [loadAvailableEntities]);

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

  // Apply entity filters to search results
  const applyEntityFilters = useCallback(
    (searchResults: SearchResult[]) => {
      if (
        !entityFilters.materials.length &&
        !entityFilters.organizations.length &&
        !entityFilters.locations.length &&
        !entityFilters.people.length
      ) {
        return searchResults; // No filters applied
      }

      return searchResults.filter((result) => {
        const entities = result.extracted_entities || [];

        // Check if result matches any selected entity filters
        let matchesFilter = false;

        // Check material entities
        if (entityFilters.materials.length > 0) {
          const materialEntities = entities.filter(
            (e) => e.type === 'MATERIAL',
          );
          if (
            materialEntities.some((e) =>
              entityFilters.materials.includes(e.text),
            )
          ) {
            matchesFilter = true;
          }
        }

        // Check organization entities
        if (entityFilters.organizations.length > 0) {
          const orgEntities = entities.filter((e) => e.type === 'ORG');
          if (
            orgEntities.some((e) =>
              entityFilters.organizations.includes(e.text),
            )
          ) {
            matchesFilter = true;
          }
        }

        // Check location entities
        if (entityFilters.locations.length > 0) {
          const locationEntities = entities.filter(
            (e) => e.type === 'LOCATION',
          );
          if (
            locationEntities.some((e) =>
              entityFilters.locations.includes(e.text),
            )
          ) {
            matchesFilter = true;
          }
        }

        // Check people entities
        if (entityFilters.people.length > 0) {
          const peopleEntities = entities.filter((e) => e.type === 'PERSON');
          if (
            peopleEntities.some((e) => entityFilters.people.includes(e.text))
          ) {
            matchesFilter = true;
          }
        }

        return matchesFilter;
      });
    },
    [entityFilters],
  );

  // Update filtered results when filters or results change
  useEffect(() => {
    const filtered = applyEntityFilters(results);
    setFilteredResults(filtered);
  }, [results, applyEntityFilters]);

  const performSearch = useCallback(async () => {
    if (!query.trim() && !selectedImage) {
      toast({
        title: 'Search Input Required',
        description: 'Please enter a search query or upload an image',
        variant: 'destructive',
      });
      return;
    }

    setIsSearching(true);
    const actualSearchType = detectQueryType(query);

    try {
      // Get workspace_id from user's session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Get user's workspace
      const { data: workspaceData } = await supabase
        .from('workspace_members')
        .select('workspace_id')
        .eq('user_id', user.id)
        .single();

      if (!workspaceData?.workspace_id) {
        throw new Error('No workspace found for user');
      }

      let searchResponse;

      if (actualSearchType === 'text') {
        // Text search using semantic strategy
        searchResponse = await UnifiedSearchService.search({
          query: query.trim(),
          workspace_id: workspaceData.workspace_id,
          strategy: 'semantic',
          top_k: 15,
        });
      } else if (actualSearchType === 'image') {
        // Image-based search using visual strategy
        searchResponse = await UnifiedSearchService.search({
          query: selectedImage?.name || 'uploaded_image',
          workspace_id: workspaceData.workspace_id,
          strategy: 'visual',
          top_k: 12,
          // TODO: Add image_url or image_base64 when image upload is implemented
        });
      } else {
        // Hybrid search (text + semantic)
        searchResponse = await UnifiedSearchService.search({
          query: query.trim(),
          workspace_id: workspaceData.workspace_id,
          strategy: 'hybrid',
          top_k: 20,
        });
      }

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
        description: `Found ${unifiedResults.length} results using ${actualSearchType} search`,
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
  ]);

  const handleQuickSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) return;

      setIsSearching(true);
      try {
        // Get workspace_id from user's session
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          throw new Error('User not authenticated');
        }

        // Get user's workspace
        const { data: workspaceData } = await supabase
          .from('workspace_members')
          .select('workspace_id')
          .eq('user_id', user.id)
          .single();

        if (!workspaceData?.workspace_id) {
          throw new Error('No workspace found for user');
        }

        // Quick text-based search using semantic strategy
        const quickResponse = await UnifiedSearchService.search({
          query: searchQuery,
          workspace_id: workspaceData.workspace_id,
          strategy: 'semantic',
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
    [onResultsFound, toast],
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
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            Intelligent Material Search
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Search by text specifications, upload images, or combine both for
            enhanced results
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
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

          {/* Image Upload Section */}
          <div className="border border-dashed border-muted-foreground/25 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <Label className="flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Material Image (Optional)
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

          {/* Search Type Indicator */}
          <div className="flex items-center gap-2">
            <Badge className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 flex items-center gap-1">
              {detectQueryType(query) === 'text' && (
                <Type className="h-3 w-3" />
              )}
              {detectQueryType(query) === 'image' && (
                <ImageIcon className="h-3 w-3" />
              )}
              {detectQueryType(query) === 'hybrid' && (
                <Sparkles className="h-3 w-3" />
              )}
              {detectQueryType(query).charAt(0).toUpperCase() +
                detectQueryType(query).slice(1)}{' '}
              Search
            </Badge>
            <span className="text-xs text-muted-foreground">
              {detectQueryType(query) === 'hybrid' &&
                'Using both text and image for enhanced matching'}
              {detectQueryType(query) === 'image' &&
                'AI will analyze the image to identify materials'}
              {detectQueryType(query) === 'text' &&
                'Natural language processing for material specifications'}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Entity Filters */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Entity Filters
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowEntityFilters(!showEntityFilters)}
              >
                {showEntityFilters ? 'Hide Filters' : 'Show Filters'}
              </Button>
            </div>
          </CardHeader>
          {showEntityFilters && (
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Material Filters */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 font-medium">
                    <Hash className="h-4 w-4" />
                    Materials ({availableEntities.materials.length})
                  </Label>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {availableEntities.materials
                      .slice(0, 10)
                      .map((material) => (
                        <div
                          key={material}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={`material-${material}`}
                            checked={entityFilters.materials.includes(material)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setEntityFilters((prev) => ({
                                  ...prev,
                                  materials: [...prev.materials, material],
                                }));
                              } else {
                                setEntityFilters((prev) => ({
                                  ...prev,
                                  materials: prev.materials.filter(
                                    (m) => m !== material,
                                  ),
                                }));
                              }
                            }}
                          />
                          <Label
                            htmlFor={`material-${material}`}
                            className="text-sm"
                          >
                            {material}
                          </Label>
                        </div>
                      ))}
                    {availableEntities.materials.length > 10 && (
                      <div className="text-xs text-muted-foreground">
                        +{availableEntities.materials.length - 10} more
                        materials
                      </div>
                    )}
                  </div>
                </div>

                {/* Organization Filters */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 font-medium">
                    <Building className="h-4 w-4" />
                    Organizations ({availableEntities.organizations.length})
                  </Label>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {availableEntities.organizations.slice(0, 10).map((org) => (
                      <div key={org} className="flex items-center space-x-2">
                        <Checkbox
                          id={`org-${org}`}
                          checked={entityFilters.organizations.includes(org)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setEntityFilters((prev) => ({
                                ...prev,
                                organizations: [...prev.organizations, org],
                              }));
                            } else {
                              setEntityFilters((prev) => ({
                                ...prev,
                                organizations: prev.organizations.filter(
                                  (o) => o !== org,
                                ),
                              }));
                            }
                          }}
                        />
                        <Label htmlFor={`org-${org}`} className="text-sm">
                          {org}
                        </Label>
                      </div>
                    ))}
                    {availableEntities.organizations.length > 10 && (
                      <div className="text-xs text-muted-foreground">
                        +{availableEntities.organizations.length - 10} more
                        organizations
                      </div>
                    )}
                  </div>
                </div>

                {/* Location Filters */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 font-medium">
                    <MapPin className="h-4 w-4" />
                    Locations ({availableEntities.locations.length})
                  </Label>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {availableEntities.locations
                      .slice(0, 10)
                      .map((location) => (
                        <div
                          key={location}
                          className="flex items-center space-x-2"
                        >
                          <Checkbox
                            id={`location-${location}`}
                            checked={entityFilters.locations.includes(location)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setEntityFilters((prev) => ({
                                  ...prev,
                                  locations: [...prev.locations, location],
                                }));
                              } else {
                                setEntityFilters((prev) => ({
                                  ...prev,
                                  locations: prev.locations.filter(
                                    (l) => l !== location,
                                  ),
                                }));
                              }
                            }}
                          />
                          <Label
                            htmlFor={`location-${location}`}
                            className="text-sm"
                          >
                            {location}
                          </Label>
                        </div>
                      ))}
                    {availableEntities.locations.length > 10 && (
                      <div className="text-xs text-muted-foreground">
                        +{availableEntities.locations.length - 10} more
                        locations
                      </div>
                    )}
                  </div>
                </div>

                {/* People Filters */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 font-medium">
                    <User className="h-4 w-4" />
                    People ({availableEntities.people.length})
                  </Label>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {availableEntities.people.slice(0, 10).map((person) => (
                      <div key={person} className="flex items-center space-x-2">
                        <Checkbox
                          id={`person-${person}`}
                          checked={entityFilters.people.includes(person)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setEntityFilters((prev) => ({
                                ...prev,
                                people: [...prev.people, person],
                              }));
                            } else {
                              setEntityFilters((prev) => ({
                                ...prev,
                                people: prev.people.filter((p) => p !== person),
                              }));
                            }
                          }}
                        />
                        <Label htmlFor={`person-${person}`} className="text-sm">
                          {person}
                        </Label>
                      </div>
                    ))}
                    {availableEntities.people.length > 10 && (
                      <div className="text-xs text-muted-foreground">
                        +{availableEntities.people.length - 10} more people
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Clear Filters Button */}
              <div className="mt-4 flex items-center justify-between">
                <div className="flex flex-wrap gap-1">
                  {entityFilters.materials.map((material) => (
                    <Badge
                      key={material}
                      variant="secondary"
                      className="text-xs"
                    >
                      <Hash className="h-2 w-2 mr-1" />
                      {material}
                      <X
                        className="h-2 w-2 ml-1 cursor-pointer"
                        onClick={() =>
                          setEntityFilters((prev) => ({
                            ...prev,
                            materials: prev.materials.filter(
                              (m) => m !== material,
                            ),
                          }))
                        }
                      />
                    </Badge>
                  ))}
                  {entityFilters.organizations.map((org) => (
                    <Badge key={org} variant="secondary" className="text-xs">
                      <Building className="h-2 w-2 mr-1" />
                      {org}
                      <X
                        className="h-2 w-2 ml-1 cursor-pointer"
                        onClick={() =>
                          setEntityFilters((prev) => ({
                            ...prev,
                            organizations: prev.organizations.filter(
                              (o) => o !== org,
                            ),
                          }))
                        }
                      />
                    </Badge>
                  ))}
                  {entityFilters.locations.map((location) => (
                    <Badge
                      key={location}
                      variant="secondary"
                      className="text-xs"
                    >
                      <MapPin className="h-2 w-2 mr-1" />
                      {location}
                      <X
                        className="h-2 w-2 ml-1 cursor-pointer"
                        onClick={() =>
                          setEntityFilters((prev) => ({
                            ...prev,
                            locations: prev.locations.filter(
                              (l) => l !== location,
                            ),
                          }))
                        }
                      />
                    </Badge>
                  ))}
                  {entityFilters.people.map((person) => (
                    <Badge key={person} variant="secondary" className="text-xs">
                      <User className="h-2 w-2 mr-1" />
                      {person}
                      <X
                        className="h-2 w-2 ml-1 cursor-pointer"
                        onClick={() =>
                          setEntityFilters((prev) => ({
                            ...prev,
                            people: prev.people.filter((p) => p !== person),
                          }))
                        }
                      />
                    </Badge>
                  ))}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setEntityFilters({
                      materials: [],
                      organizations: [],
                      locations: [],
                      people: [],
                    })
                  }
                  disabled={
                    !entityFilters.materials.length &&
                    !entityFilters.organizations.length &&
                    !entityFilters.locations.length &&
                    !entityFilters.people.length
                  }
                >
                  Clear All Filters
                </Button>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Material Property Filters */}
      <MaterialFiltersPanel
        filters={materialFilters}
        onFiltersChange={setMaterialFilters}
        onClearFilters={() =>
          setMaterialFilters({
            materialTypes: [],
            colors: [],
            priceRange: [0, 10000],
            durabilityRating: [],
            availabilityStatus: [],
            suppliers: [],
            applications: [],
            textures: [],
          })
        }
        collapsible={true}
      />

      {/* Search Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Search Results ({filteredResults.length} of {results.length}{' '}
              found)
              {filteredResults.length !== results.length && (
                <span className="text-sm font-normal text-muted-foreground ml-2">
                  (filtered by entities)
                </span>
              )}
            </CardTitle>
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
