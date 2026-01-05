import React from 'react';

import { cn } from '@/lib/utils';

import { SearchResult, SearchResultCard } from './SearchResultCard';

interface SearchResultsGridProps {
  results: SearchResult[];
  loading?: boolean;
  error?: string;
  onView?: (result: SearchResult) => void;
  onDownload?: (result: SearchResult) => void;
  onFavorite?: (result: SearchResult) => void;
  onTagClick?: (tag: string) => void;
  onSelect?: (resultId: string, selected: boolean) => void;
  selectedResults?: Set<string>;
  className?: string;
}

export const SearchResultsGrid: React.FC<SearchResultsGridProps> = ({
  results,
  loading = false,
  error,
  onView,
  onDownload,
  onFavorite,
  onTagClick,
  onSelect,
  selectedResults = new Set(),
  className,
}) => {
  if (error) {
    return (
      <div className={cn('text-center py-12', className)}>
        <div className="text-red-500 mb-2">Error loading search results</div>
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className={cn(
          'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4',
          className,
        )}
      >
        {Array.from({ length: 8 }).map((_, index) => (
          <div key={index} className="animate-pulse">
            <div className="bg-gray-200 rounded-lg h-64 mb-4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
              <div className="h-3 bg-gray-200 rounded w-2/3"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className={cn('text-center py-12', className)}>
        <div className="text-gray-400 mb-4">
          <svg
            className="mx-auto h-12 w-12"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          No results found
        </h3>
        <p className="text-gray-500">
          Try adjusting your search terms or filters
        </p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4',
        className,
      )}
    >
      {results.map((result) => (
        <div key={result.id} className="relative">
          {/* Selection checkbox */}
          {onSelect && (
            <div className="absolute top-2 left-2 z-10">
              <input
                type="checkbox"
                checked={selectedResults.has(result.id)}
                onChange={(e) => onSelect(result.id, e.target.checked)}
                className="rounded border-gray-300 bg-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
                aria-label={`Select ${result.title}`}
              />
            </div>
          )}

          {/* Result card */}
          <SearchResultCard
            result={result}
            viewMode="card"
            onView={onView || (() => {})}
            onDownload={onDownload || (() => {})}
            onFavorite={onFavorite || (() => {})}
            onTagClick={onTagClick || (() => {})}
            className={cn(
              'h-full transition-all duration-200 hover:shadow-lg hover:scale-[1.02]',
              onSelect && 'pt-8',
            )}
          />
        </div>
      ))}
    </div>
  );
};

export default SearchResultsGrid;
