import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Search,
  Sparkles,
  FileText,
  Image,
  Database,
  AlertCircle,
  RefreshCw,
  Filter,
  SortAsc,
  SortDesc,
  Grid,
  List
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SemanticSearchInput, SearchOptions } from './SemanticSearchInput';

// Types for search results
export interface SearchResult {
  id: string;
  title: string;
  content: string;
  type: 'document' | 'image' | 'data' | 'analysis';
  category: string;
  relevanceScore: number;
  semanticScore?: number;
  timestamp: Date;
  metadata: {
    source?: string;
    fileType?: string;
    size?: number;
    tags?: string[];
    author?: string;
    processingStatus?: 'completed' | 'processing' | 'failed';
    extractedText?: string;
    confidence?: number;
  };
  highlights?: string[];
  thumbnail?: string;
  url?: string;
}

export interface SearchFilters {
  types: string[];
  categories: string[];
  dateRange: {
    start?: Date;
    end?: Date;
  };
  minRelevance: number;
  sortBy: 'relevance' | 'date' | 'title' | 'semantic';
  sortOrder: 'asc' | 'desc';
}

export interface SemanticSearchProps {
  onResultSelect?: (result: SearchResult) => void;
  onFiltersChange?: (filters: SearchFilters) => void;
  className?: string;
  // API integration props
  searchEndpoint?: string;
  enableRealTimeSearch?: boolean;
  maxResults?: number;
  // UI customization
  showFilters?: boolean;
  showStats?: boolean;
  viewMode?: 'grid' | 'list';
  enableViewToggle?: boolean;
}

// Mock search results for demonstration
const mockResults: SearchResult[] = [
  {
    id: '1',
    title: 'PDF Analysis Report - Q4 Financial Data',
    content: 'Comprehensive analysis of Q4 financial performance including revenue trends, expense breakdowns, and key performance indicators.',
    type: 'document',
    category: 'financial',
    relevanceScore: 0.95,
    semanticScore: 0.92,
    timestamp: new Date(Date.now() - 1000 * 60 * 30),
    metadata: {
      source: 'financial_reports/q4_2024.pdf',
      fileType: 'PDF',
      size: 2048576,
      tags: ['financial', 'quarterly', 'analysis'],
      author: 'Finance Team',
      processingStatus: 'completed',
      confidence: 0.94
    },
    highlights: ['financial performance', 'revenue trends', 'Q4 analysis'],
    thumbnail: '/api/thumbnails/q4_report.jpg'
  },
  {
    id: '2',
    title: 'Image Processing Results - Product Catalog',
    content: 'Automated image analysis results for product catalog items including object detection, text extraction, and quality assessment.',
    type: 'image',
    category: 'product',
    relevanceScore: 0.88,
    semanticScore: 0.85,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 2),
    metadata: {
      source: 'product_images/batch_001/',
      fileType: 'JPG',
      size: 1024000,
      tags: ['product', 'catalog', 'automated'],
      processingStatus: 'completed',
      extractedText: 'Product Name: Premium Widget, SKU: PW-001',
      confidence: 0.87
    },
    highlights: ['object detection', 'text extraction', 'product catalog'],
    thumbnail: '/api/thumbnails/product_batch.jpg'
  },
  {
    id: '3',
    title: 'Data Analysis - Customer Behavior Patterns',
    content: 'Statistical analysis of customer behavior patterns based on transaction data and user interaction metrics.',
    type: 'data',
    category: 'analytics',
    relevanceScore: 0.82,
    semanticScore: 0.79,
    timestamp: new Date(Date.now() - 1000 * 60 * 60 * 6),
    metadata: {
      source: 'analytics/customer_behavior.csv',
      fileType: 'CSV',
      size: 512000,
      tags: ['analytics', 'customer', 'behavior'],
      author: 'Data Science Team',
      processingStatus: 'completed',
      confidence: 0.91
    },
    highlights: ['customer behavior', 'transaction data', 'interaction metrics']
  }
];

export const SemanticSearch: React.FC<SemanticSearchProps> = ({
  onResultSelect,
  onFiltersChange,
  className,
  enableRealTimeSearch = true,
  maxResults = 50,
  showFilters = true,
  showStats = true,
  viewMode: initialViewMode = 'list',
  enableViewToggle = true
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(initialViewMode);
  const [filters, setFilters] = useState<SearchFilters>({
    types: [],
    categories: [],
    dateRange: {},
    minRelevance: 0.5,
    sortBy: 'relevance',
    sortOrder: 'desc'
  });

  // Search execution
  const executeSearch = useCallback(async (searchQuery: string, options?: SearchOptions) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setIsSearching(true);
    setError(null);

    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800));
      
      // Filter and sort mock results based on query and options
      let filteredResults = mockResults.filter(result => {
        const matchesQuery = result.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           result.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           result.metadata.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
        
        const matchesCategory = !options?.category || result.category === options.category;
        const matchesFilters = 
          (filters.types.length === 0 || filters.types.includes(result.type)) &&
          (filters.categories.length === 0 || filters.categories.includes(result.category)) &&
          result.relevanceScore >= filters.minRelevance;

        return matchesQuery && matchesCategory && matchesFilters;
      });

      // Sort results
      filteredResults.sort((a, b) => {
        let comparison = 0;
        switch (filters.sortBy) {
          case 'relevance':
            comparison = b.relevanceScore - a.relevanceScore;
            break;
          case 'semantic':
            comparison = (b.semanticScore || 0) - (a.semanticScore || 0);
            break;
          case 'date':
            comparison = b.timestamp.getTime() - a.timestamp.getTime();
            break;
          case 'title':
            comparison = a.title.localeCompare(b.title);
            break;
        }
        return filters.sortOrder === 'desc' ? comparison : -comparison;
      });

      setResults(filteredResults.slice(0, maxResults));
    } catch (err) {
      setError('Search failed. Please try again.');
      console.error('Search error:', err);
    } finally {
      setIsSearching(false);
    }
  }, [filters, maxResults]);

  // Handle filter changes
  const handleFiltersChange = useCallback((newFilters: Partial<SearchFilters>) => {
    const updatedFilters = { ...filters, ...newFilters };
    setFilters(updatedFilters);
    onFiltersChange?.(updatedFilters);
    
    // Re-execute search with new filters
    if (query.trim()) {
      executeSearch(query);
    }
  }, [filters, query, executeSearch, onFiltersChange]);

  // Real-time search effect
  useEffect(() => {
    if (enableRealTimeSearch && query.trim()) {
      const timer = setTimeout(() => {
        executeSearch(query);
      }, 500);
      return () => clearTimeout(timer);
    }
    // Return undefined when no cleanup is needed
    return undefined;
  }, [query, enableRealTimeSearch, executeSearch]);

  // Get result type icon
  const getResultTypeIcon = (type: SearchResult['type']) => {
    switch (type) {
      case 'document':
        return <FileText className="h-4 w-4" />;
      case 'image':
        return <Image className="h-4 w-4" />;
      case 'data':
        return <Database className="h-4 w-4" />;
      case 'analysis':
        return <Sparkles className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  // Format time ago
  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return `${diffDays}d ago`;
  };

  // Render result card
  const renderResultCard = (result: SearchResult) => (
    <Card 
      key={result.id}
      className="cursor-pointer hover:shadow-md transition-shadow"
      onClick={() => onResultSelect?.(result)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Thumbnail */}
          {result.thumbnail && (
            <div className="flex-shrink-0">
              <img
                src={result.thumbnail}
                alt={result.title}
                className="w-16 h-16 object-cover rounded-md"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
          )}
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2 mb-2">
              <h3 className="font-semibold text-sm line-clamp-2">
                {result.title}
              </h3>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {getResultTypeIcon(result.type)}
                <span className="capitalize">{result.type}</span>
              </div>
            </div>
            
            <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
              {result.content}
            </p>
            
            {/* Highlights */}
            {result.highlights && result.highlights.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-3">
                {result.highlights.slice(0, 3).map((highlight, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {highlight}
                  </Badge>
                ))}
              </div>
            )}
            
            {/* Metadata */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-3">
                <span>Relevance: {Math.round(result.relevanceScore * 100)}%</span>
                {result.semanticScore && (
                  <span>Semantic: {Math.round(result.semanticScore * 100)}%</span>
                )}
                <span>{formatTimeAgo(result.timestamp)}</span>
              </div>
              
              <Badge variant="outline" className="text-xs">
                {result.category}
              </Badge>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  // Render grid view
  const renderGridView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {results.map(renderResultCard)}
    </div>
  );

  // Render list view
  const renderListView = () => (
    <div className="space-y-3">
      {results.map(renderResultCard)}
    </div>
  );

  return (
    <div className={cn("space-y-6", className)}>
      {/* Search Input */}
      <SemanticSearchInput
        value={query}
        onChange={setQuery}
        onSearch={executeSearch}
        placeholder="Search documents, images, and data with AI-powered understanding..."
        disabled={isSearching}
        enableSemanticSuggestions={true}
        categories={['financial', 'product', 'analytics', 'reports']}
      />

      {/* Search Controls */}
      {(showFilters || enableViewToggle) && (
        <div className="flex items-center justify-between">
          {/* Filters */}
          {showFilters && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Toggle filters panel - implement as needed
                }}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleFiltersChange({
                  sortBy: filters.sortBy,
                  sortOrder: filters.sortOrder === 'desc' ? 'asc' : 'desc'
                })}
              >
                {filters.sortOrder === 'desc' ? (
                  <SortDesc className="h-4 w-4 mr-2" />
                ) : (
                  <SortAsc className="h-4 w-4 mr-2" />
                )}
                Sort
              </Button>
            </div>
          )}

          {/* View Toggle */}
          {enableViewToggle && (
            <div className="flex items-center gap-1">
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Search Stats */}
      {showStats && query && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {isSearching ? 'Searching...' : `${results.length} results found`}
            {query && ` for "${query}"`}
          </span>
          {!isSearching && results.length > 0 && (
            <span>
              Search completed in ~{Math.random() * 0.5 + 0.2}s
            </span>
          )}
        </div>
      )}

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error}
            <Button
              variant="outline"
              size="sm"
              onClick={() => executeSearch(query)}
              className="ml-2"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Results */}
      {!isSearching && !error && (
        <>
          {results.length > 0 ? (
            viewMode === 'grid' ? renderGridView() : renderListView()
          ) : query ? (
            <div className="text-center py-12">
              <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">No results found</h3>
              <p className="text-muted-foreground mb-4">
                Try adjusting your search terms or filters
              </p>
              <Button
                variant="outline"
                onClick={() => {
                  setQuery('');
                  setResults([]);
                }}
              >
                Clear search
              </Button>
            </div>
          ) : (
            <div className="text-center py-12">
              <Sparkles className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">AI-Powered Search</h3>
              <p className="text-muted-foreground">
                Search across documents, images, and data with semantic understanding
              </p>
            </div>
          )}
        </>
      )}

      {/* Loading State */}
      {isSearching && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-16 h-16 bg-muted rounded-md" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-muted rounded w-3/4" />
                    <div className="h-3 bg-muted rounded w-full" />
                    <div className="h-3 bg-muted rounded w-2/3" />
                    <div className="flex gap-2">
                      <div className="h-5 bg-muted rounded w-16" />
                      <div className="h-5 bg-muted rounded w-16" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default SemanticSearch;