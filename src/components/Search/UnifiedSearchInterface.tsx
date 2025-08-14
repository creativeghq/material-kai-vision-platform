import React, { useState, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
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
  X
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { MivaaSearchIntegration } from '@/services/mivaaSearchIntegration';
import { MivaaEmbeddingIntegration } from '@/services/mivaaEmbeddingIntegration';

interface SearchResult {
  id: string;
  title: string;
  content: string;
  type: 'material' | 'knowledge' | 'pdf_content';
  similarity_score: number;
  source?: string;
  metadata?: any;
}

interface UnifiedSearchInterfaceProps {
  onResultsFound?: (results: SearchResult[]) => void;
  onMaterialSelect?: (materialId: string) => void;
}

export const UnifiedSearchInterface: React.FC<UnifiedSearchInterfaceProps> = ({
  onResultsFound,
  onMaterialSelect
}) => {
  // Initialize MIVAA service instances
  const mivaaSearchService = new MivaaSearchIntegration();
  const mivaaEmbeddingService = new MivaaEmbeddingIntegration();

  const [query, setQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchType, setSearchType] = useState<'text' | 'image' | 'hybrid'>('text');
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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

  const detectQueryType = useCallback((searchQuery: string): 'text' | 'image' | 'hybrid' => {
    if (selectedImage && searchQuery.trim()) return 'hybrid';
    if (selectedImage) return 'image';
    return 'text';
  }, [selectedImage]);

  const performSearch = useCallback(async () => {
    if (!query.trim() && !selectedImage) {
      toast({
        title: "Search Input Required",
        description: "Please enter a search query or upload an image",
        variant: "destructive"
      });
      return;
    }

    setIsSearching(true);
    const actualSearchType = detectQueryType(query);
    
    try {
      let searchResults: any;

      if (actualSearchType === 'text') {
        // Enhanced text search with MIVAA's LlamaIndex RAG
        searchResults = await mivaaSearchService.searchDocuments({
          query: query.trim(),
          searchType: 'enhanced_text',
          includeKnowledge: true,
          includePDFContent: true,
          limit: 15
        });
      } else if (actualSearchType === 'image') {
        // Image-based search using MIVAA embedding service
        const imageBase64 = imagePreview?.split(',')[1] || '';
        const embeddings = await mivaaEmbeddingService.generateEmbeddings([imageBase64]);
        searchResults = await mivaaSearchService.searchByEmbedding({
          embedding: embeddings.embeddings[0],
          threshold: 0.7,
          limit: 12
        });
      } else {
        // Hybrid search (text + image) using MIVAA services
        const imageBase64 = imagePreview?.split(',')[1] || '';
        searchResults = await mivaaSearchService.hybridSearch({
          textQuery: query.trim(),
          imageData: imageBase64,
          threshold: 0.6,
          limit: 20
        });
      }

      // Transform results to unified format
      const unifiedResults: SearchResult[] = [
        ...(searchResults.results || []).map((result: any) => ({
          id: result.material_id || result.id,
          title: result.material_name || result.title,
          content: result.content || result.material_details?.description || '',
          type: result.result_type || 'material',
          similarity_score: result.similarity_score,
          source: result.source_type || 'database',
          metadata: result.metadata || result.material_details
        })),
        ...(searchResults.knowledge_results || []).map((result: any) => ({
          id: result.id,
          title: result.title,
          content: result.content,
          type: 'knowledge' as const,
          similarity_score: result.confidence || 0.7,
          source: result.source_type || 'knowledge_base',
          metadata: result.metadata
        }))
      ];

      // Sort by similarity score
      unifiedResults.sort((a, b) => b.similarity_score - a.similarity_score);

      setResults(unifiedResults);
      onResultsFound?.(unifiedResults);

      toast({
        title: "Search Completed",
        description: `Found ${unifiedResults.length} results using ${actualSearchType} search`
      });

    } catch (error) {
      console.error('Search error:', error);
      toast({
        title: "Search Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setIsSearching(false);
    }
  }, [query, selectedImage, imagePreview, detectQueryType, onResultsFound, toast]);

  const handleQuickSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    try {
      // Quick text-based search using MIVAA's fast search
      const quickResults = await mivaaSearchService.searchDocuments({
        query: searchQuery,
        searchType: 'specification_match',
        includeKnowledge: false,
        includePDFContent: true,
        limit: 8
      });

      const formatted = quickResults.results.map((result: any) => ({
        id: result.id,
        title: result.title || result.name,
        content: result.content || result.description,
        type: result.type || 'material',
        similarity_score: result.confidence || 0.8,
        source: 'quick_search',
        metadata: result.metadata
      }));

      setResults(formatted);
      onResultsFound?.(formatted);
      
    } catch (error) {
      console.error('Quick search error:', error);
      toast({
        title: "Quick Search Failed",
        description: "Please try the full search",
        variant: "destructive"
      });
    } finally {
      setIsSearching(false);
    }
  }, [onResultsFound, toast, mivaaSearchService]);

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
            Search by text specifications, upload images, or combine both for enhanced results
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
                onKeyPress={(e) => e.key === 'Enter' && performSearch()}
                className="pr-10"
              />
              <Type className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
            </div>
            <Button 
              variant="outline" 
              onClick={() => handleQuickSearch(query)}
              disabled={isSearching || !query.trim()}
            >
              Quick
            </Button>
            <Button onClick={performSearch} disabled={isSearching}>
              {isSearching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
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
                <Button variant="ghost" size="sm" onClick={removeImage}>
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
            <Badge variant="outline" className="flex items-center gap-1">
              {detectQueryType(query) === 'text' && <Type className="h-3 w-3" />}
              {detectQueryType(query) === 'image' && <ImageIcon className="h-3 w-3" />}
              {detectQueryType(query) === 'hybrid' && <Sparkles className="h-3 w-3" />}
              {detectQueryType(query).charAt(0).toUpperCase() + detectQueryType(query).slice(1)} Search
            </Badge>
            <span className="text-xs text-muted-foreground">
              {detectQueryType(query) === 'hybrid' && "Using both text and image for enhanced matching"}
              {detectQueryType(query) === 'image' && "AI will analyze the image to identify materials"}
              {detectQueryType(query) === 'text' && "Natural language processing for material specifications"}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Search Results */}
      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Search Results ({results.length} found)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {results.map((result, index) => (
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
                        <Badge variant="outline">{result.type}</Badge>
                        {result.source && (
                          <Badge variant="secondary" className="text-xs">
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
                        : result.content
                      }
                    </p>

                    {/* Metadata */}
                    {result.metadata && (
                      <div className="flex flex-wrap gap-2">
                        {result.metadata.category && (
                          <Badge variant="secondary">
                            {result.metadata.category}
                          </Badge>
                        )}
                        {result.metadata.material_categories && Array.isArray(result.metadata.material_categories) && 
                          result.metadata.material_categories.slice(0, 2).map((cat: string, i: number) => (
                            <Badge key={i} variant="outline">{cat}</Badge>
                          ))
                        }
                        {result.metadata.technical_complexity && (
                          <Badge variant="outline">
                            Complexity: {result.metadata.technical_complexity}/10
                          </Badge>
                        )}
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