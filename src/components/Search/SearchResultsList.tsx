import React, { useState, useMemo } from 'react';
import {
  Grid3X3,
  List,
  LayoutGrid,
  SortAsc,
  SortDesc,
  Filter,
  Search,
  X,
  Download,
  Eye,
  Clock,
  TrendingUp,
  FileText,
  Image,
  Database,
  BarChart3,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

import { SearchResultCard, SearchResult } from './SearchResultCard';
import { applyQualityBasedRanking } from '@/services/qualityBasedRankingService';

// Types for sorting and filtering
export type SortField = 'relevance' | 'semantic' | 'quality' | 'date' | 'title' | 'views';
export type SortOrder = 'asc' | 'desc';
export type ViewMode = 'card' | 'list' | 'compact';
export type FilterType = 'all' | 'document' | 'image' | 'data' | 'analysis';

interface SearchResultsListProps {
  results: SearchResult[];
  loading?: boolean;
  error?: string;
  totalCount?: number;
  currentPage?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onView?: (result: SearchResult) => void;
  onDownload?: (result: SearchResult) => void;
  onFavorite?: (result: SearchResult) => void;
  onTagClick?: (tag: string) => void;
  onBulkDownload?: (results: SearchResult[]) => void;
  className?: string;
}

const sortOptions = [
  { value: 'relevance', label: 'Relevance', icon: TrendingUp },
  { value: 'semantic', label: 'Semantic Score', icon: TrendingUp },
  { value: 'quality', label: 'Quality Score', icon: TrendingUp },
  { value: 'date', label: 'Date', icon: Clock },
  { value: 'title', label: 'Title', icon: FileText },
  { value: 'views', label: 'Views', icon: Eye },
];

const filterOptions = [
  { value: 'all', label: 'All Types', icon: Search },
  { value: 'document', label: 'Documents', icon: FileText },
  { value: 'image', label: 'Images', icon: Image },
  { value: 'data', label: 'Data', icon: Database },
  { value: 'analysis', label: 'Analysis', icon: BarChart3 },
];

const viewModeOptions = [
  { value: 'card', label: 'Card View', icon: LayoutGrid },
  { value: 'list', label: 'List View', icon: List },
  { value: 'compact', label: 'Compact View', icon: Grid3X3 },
];

export const SearchResultsList: React.FC<SearchResultsListProps> = ({
  results,
  loading = false,
  error,
  totalCount,
  currentPage = 1,
  pageSize = 20,
  onPageChange,
  onView,
  onDownload,
  onFavorite,
  onTagClick,
  onBulkDownload,
  className,
}) => {
  const [viewMode, setViewMode] = useState<ViewMode>('card');
  const [sortField, setSortField] = useState<SortField>('relevance');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [filterType, setFilterType] = useState<FilterType>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedResults, setSelectedResults] = useState<Set<string>>(new Set());

  // Filter and sort results
  const filteredAndSortedResults = useMemo(() => {
    let filtered = results;

    // Apply type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(result => result.type === filterType);
    }

    // Apply search term filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(result =>
        result.title.toLowerCase().includes(term) ||
        result.description.toLowerCase().includes(term) ||
        result.tags.some(tag => tag.toLowerCase().includes(term)) ||
        result.author?.toLowerCase().includes(term),
      );
    }

    // Sort results
    if (sortField === 'quality') {
      // Use quality-based ranking
      filtered = applyQualityBasedRanking(filtered, true);
      if (sortOrder === 'asc') {
        filtered.reverse();
      }
    } else {
      filtered.sort((a, b) => {
        let comparison = 0;

        switch (sortField) {
          case 'relevance':
            comparison = a.relevanceScore - b.relevanceScore;
            break;
          case 'semantic':
            comparison = (a.semanticScore || 0) - (b.semanticScore || 0);
            break;
          case 'date':
            comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            break;
          case 'title':
            comparison = a.title.localeCompare(b.title);
            break;
          case 'views':
            comparison = (a.viewCount || 0) - (b.viewCount || 0);
            break;
          default:
            comparison = 0;
        }

        return sortOrder === 'asc' ? comparison : -comparison;
      });
    }

    return filtered;
  }, [results, filterType, searchTerm, sortField, sortOrder]);

  const handleSelectResult = (resultId: string, selected: boolean) => {
    const newSelected = new Set(selectedResults);
    if (selected) {
      newSelected.add(resultId);
    } else {
      newSelected.delete(resultId);
    }
    setSelectedResults(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedResults.size === filteredAndSortedResults.length) {
      setSelectedResults(new Set());
    } else {
      setSelectedResults(new Set(filteredAndSortedResults.map(r => r.id)));
    }
  };

  const handleBulkDownload = () => {
    const selectedResultObjects = filteredAndSortedResults.filter(r =>
      selectedResults.has(r.id),
    );
    onBulkDownload?.(selectedResultObjects);
  };

  const clearFilters = () => {
    setFilterType('all');
    setSearchTerm('');
    setSortField('relevance');
    setSortOrder('desc');
  };

  const hasActiveFilters = filterType !== 'all' || searchTerm !== '';

  // Pagination
  const totalPages = Math.ceil((totalCount || filteredAndSortedResults.length) / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  const paginatedResults = filteredAndSortedResults.slice(startIndex, endIndex);

  if (error) {
    return (
      <div className={cn('text-center py-12', className)}>
        <div className="text-red-500 mb-2">Error loading search results</div>
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header with controls */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-gray-900">
            Search Results
            {totalCount && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({totalCount.toLocaleString()} results)
              </span>
            )}
          </h2>

          {hasActiveFilters && (
            <Button
              onClick={clearFilters}
              className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 hover:bg-accent hover:text-accent-foreground h-9 px-3 text-gray-500 hover:text-gray-700"
            >
              <X className="h-4 w-4 mr-1" />
              Clear filters
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Bulk actions */}
          {selectedResults.size > 0 && (
            <>
              <Badge className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 bg-secondary text-secondary-foreground hover:bg-secondary/80 mr-2">
                {selectedResults.size} selected
              </Badge>
              <Button
                onClick={handleBulkDownload}
                className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3 mr-2"
              >
                <Download className="h-4 w-4 mr-1" />
                Download Selected
              </Button>
              <Separator orientation="vertical" className="h-6 mr-2" />
            </>
          )}

          {/* View mode selector */}
          <div className="flex border rounded-lg">
            {viewModeOptions.map((option) => {
              const Icon = option.icon;
              return (
                <Button
                  key={option.value}
                  onClick={() => setViewMode(option.value as ViewMode)}
                  className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-9 px-3 rounded-none first:rounded-l-lg last:rounded-r-lg ${
                    viewMode === option.value
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                      : 'hover:bg-accent hover:text-accent-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filters and sorting */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex flex-1 items-center gap-4">
          {/* Search within results */}
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search within results..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Type filter */}
          <Select value={filterType} onValueChange={(value: string) => setFilterType(value as FilterType)}>
            <SelectTrigger className="w-40">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {filterOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center">
                      <Icon className="h-4 w-4 mr-2" />
                      {option.label}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          {/* Sort controls */}
          <Select value={sortField} onValueChange={(value: string) => setSortField(value as SortField)}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => {
                const Icon = option.icon;
                return (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center">
                      <Icon className="h-4 w-4 mr-2" />
                      {option.label}
                    </div>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>

          <Button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
          >
            {sortOrder === 'asc' ? (
              <SortAsc className="h-4 w-4" />
            ) : (
              <SortDesc className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500">Loading search results...</p>
        </div>
      ) : filteredAndSortedResults.length === 0 ? (
        <div className="text-center py-12">
          <Search className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No results found</h3>
          <p className="text-gray-500">
            {hasActiveFilters
              ? 'Try adjusting your filters or search terms'
              : 'No search results to display'
            }
          </p>
        </div>
      ) : (
        <>
          {/* Select all checkbox for list/compact views */}
          {(viewMode === 'list' || viewMode === 'compact') && (
            <div className="flex items-center gap-2 py-2 border-b">
              <input
                type="checkbox"
                checked={selectedResults.size === filteredAndSortedResults.length}
                onChange={handleSelectAll}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-600">
                Select all ({filteredAndSortedResults.length} results)
              </span>
            </div>
          )}

          {/* Results grid/list */}
          <div className={cn(
            'space-y-4',
            viewMode === 'card' && 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 space-y-0',
            viewMode === 'compact' && 'space-y-2',
          )}>
            {paginatedResults.map((result) => (
              <div key={result.id} className="relative">
                {/* Selection checkbox for card view */}
                {viewMode === 'card' && (
                  <div className="absolute top-2 left-2 z-10">
                    <input
                      type="checkbox"
                      checked={selectedResults.has(result.id)}
                      onChange={(e) => handleSelectResult(result.id, e.target.checked)}
                      className="rounded border-gray-300 bg-white shadow-sm"
                    />
                  </div>
                )}

                {/* Selection checkbox for list/compact views */}
                {(viewMode === 'list' || viewMode === 'compact') && (
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={selectedResults.has(result.id)}
                      onChange={(e) => handleSelectResult(result.id, e.target.checked)}
                      className="mt-2 rounded border-gray-300"
                    />
                    <div className="flex-1">
                      <SearchResultCard
                        result={result}
                        viewMode={viewMode}
                        onView={onView || (() => {})}
                        onDownload={onDownload || (() => {})}
                        onFavorite={onFavorite || (() => {})}
                        onTagClick={onTagClick || (() => {})}
                      />
                    </div>
                  </div>
                )}

                {/* Card view without checkbox wrapper */}
                {viewMode === 'card' && (
                  <SearchResultCard
                    result={result}
                    viewMode={viewMode}
                    onView={onView || (() => {})}
                    onDownload={onDownload || (() => {})}
                    onFavorite={onFavorite || (() => {})}
                    onTagClick={onTagClick || (() => {})}
                    className="pt-8"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-6">
              <div className="text-sm text-gray-500">
                Showing {startIndex + 1} to {Math.min(endIndex, filteredAndSortedResults.length)} of{' '}
                {totalCount || filteredAndSortedResults.length} results
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => onPageChange?.(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
                >
                  Previous
                </Button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    const page = i + 1;
                    return (
                      <Button
                        key={page}
                        onClick={() => onPageChange?.(page)}
                        className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-9 px-3 w-8 h-8 p-0 ${
                          currentPage === page
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
                        }`}
                      >
                        {page}
                      </Button>
                    );
                  })}

                  {totalPages > 5 && (
                    <>
                      <span className="text-gray-400">...</span>
                      <Button
                        onClick={() => onPageChange?.(totalPages)}
                        className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-9 px-3 w-8 h-8 p-0 ${
                          currentPage === totalPages
                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                            : 'border border-input bg-background hover:bg-accent hover:text-accent-foreground'
                        }`}
                      >
                        {totalPages}
                      </Button>
                    </>
                  )}
                </div>

                <Button
                  onClick={() => onPageChange?.(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
                >
                  Next
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SearchResultsList;
