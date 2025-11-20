import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Clock, TrendingUp, Loader2, Sparkles, AlertCircle } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
// REMOVED: searchSuggestionsService deleted during cleanup - use MIVAA API instead
// import { getSearchSuggestionsService } from '@/services/searchSuggestionsService';
// import type { SearchSuggestion as APISuggestion } from '@/services/searchSuggestionsService';

// Temporary types until migration to MIVAA API
type APISuggestion = any;
const getSearchSuggestionsService = () => ({
  getSuggestions: async () => { throw new Error('Deprecated: Use MIVAA API /api/suggestions'); },
  getTrendingSearches: async () => { throw new Error('Deprecated: Use MIVAA API /api/suggestions'); },
});

// Types for semantic search functionality
export interface SearchSuggestion {
  id: string;
  text: string;
  type: 'semantic' | 'recent' | 'trending' | 'completion';
  confidence?: number;
  category?: string;
  metadata?: Record<string, unknown>;
}

export interface SearchHistory {
  id: string;
  query: string;
  timestamp: Date;
  resultCount: number;
  category?: string;
}

export interface SemanticSearchInputProps {
  value: string;
  onChange: (value: string) => void;
  onSearch: (query: string, options?: SearchOptions) => void;
  placeholder?: string;
  disabled?: boolean;
  showHistory?: boolean;
  maxSuggestions?: number;
  maxHistory?: number;
  className?: string;
  // Semantic search specific props
  enableSemanticSuggestions?: boolean;
  semanticThreshold?: number;
  categories?: string[];
  // Callbacks
  onSuggestionSelect?: (suggestion: SearchSuggestion) => void;
  onHistorySelect?: (historyItem: SearchHistory) => void;
  onClearHistory?: () => void;
}

export interface SearchOptions {
  semantic?: boolean;
  category?: string | undefined;
  filters?: Record<string, unknown>;
}

// Convert API suggestion to component suggestion format
const convertAPISuggestion = (apiSuggestion: APISuggestion): SearchSuggestion => {
  // Map API suggestion types to component types
  const typeMap: Record<string, 'semantic' | 'recent' | 'trending' | 'completion'> = {
    'product': 'semantic',
    'material': 'semantic',
    'category': 'semantic',
    'property': 'semantic',
    'trending': 'trending',
    'recent': 'recent',
    'popular': 'trending',
  };

  return {
    id: apiSuggestion.id,
    text: apiSuggestion.suggestion_text,
    type: typeMap[apiSuggestion.suggestion_type] || 'completion',
    confidence: apiSuggestion.confidence || apiSuggestion.popularity_score,
    category: apiSuggestion.category,
    metadata: {
      ...apiSuggestion.metadata,
      click_count: apiSuggestion.click_count,
      ctr: apiSuggestion.ctr,
      source: 'api',
    },
  };
};

// Fetch search suggestions using the new SearchSuggestionsService
const fetchSearchSuggestions = async (
  query: string,
  categories: string[] = [],
  threshold: number = 0.7,
  userId?: string,
): Promise<SearchSuggestion[]> => {
  try {
    const suggestionsService = getSearchSuggestionsService();

    // Get auto-complete suggestions from the API
    const response = await suggestionsService.getAutoCompleteSuggestions({
      query,
      limit: 10,
      user_id: userId,
      include_trending: true,
      include_recent: true,
      include_popular: true,
      categories: categories.length > 0 ? categories : undefined,
    });

    if (!response.success || !response.suggestions) {
      console.warn('Failed to get suggestions from API, falling back to empty array');
      return [];
    }

    // Convert API suggestions to component format
    const suggestions = response.suggestions.map(convertAPISuggestion);

    // Filter by confidence threshold
    return suggestions.filter((s) => !s.confidence || s.confidence >= threshold);
  } catch (error) {
    console.error('Error fetching search suggestions:', error);
    return [];
  }
};

export const SemanticSearchInput: React.FC<SemanticSearchInputProps> = ({
  value,
  onChange,
  onSearch,
  placeholder = 'Search with AI-powered semantic understanding...',
  disabled = false,
  showHistory = true,
  maxSuggestions = 8,
  maxHistory = 5,
  className,
  enableSemanticSuggestions = true,
  semanticThreshold = 0.7,
  categories = [],
  onSuggestionSelect,
  onHistorySelect,
  onClearHistory,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [history, setHistory] = useState<SearchHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [typoCorrection, setTypoCorrection] = useState<string | null>(null);
  const [showTypoCorrection, setShowTypoCorrection] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const suggestionsService = getSearchSuggestionsService();

  // Debounced suggestion fetching with typo correction
  const fetchSuggestions = useCallback(
    async (query: string) => {
      if (!query.trim() || !enableSemanticSuggestions) {
        setSuggestions([]);
        setTypoCorrection(null);
        setShowTypoCorrection(false);
        return;
      }

      setIsLoading(true);

      try {
        // Check for typos in parallel with fetching suggestions
        const [suggestionsResult, typoResult] = await Promise.all([
          fetchSearchSuggestions(query, categories, semanticThreshold),
          suggestionsService.checkTypoCorrection(query, 0.85, 1),
        ]);

        // Set suggestions
        setSuggestions(suggestionsResult.slice(0, maxSuggestions));

        // Set typo correction if available
        if (typoResult.success && typoResult.recommended_correction) {
          setTypoCorrection(typoResult.recommended_correction.corrected_query);
          setShowTypoCorrection(true);
        } else {
          setTypoCorrection(null);
          setShowTypoCorrection(false);
        }
      } catch (error) {
        console.error('Error fetching suggestions:', error);
        setSuggestions([]);
        setTypoCorrection(null);
        setShowTypoCorrection(false);
      } finally {
        setIsLoading(false);
      }
    },
    [enableSemanticSuggestions, categories, semanticThreshold, maxSuggestions, suggestionsService],
  );

  // Debounce suggestion fetching
  useEffect(() => {
    const timer = setTimeout(() => {
      if (isOpen) {
        fetchSuggestions(value);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [value, isOpen, fetchSuggestions]);

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    onChange(newValue);
    setSelectedIndex(-1);

    if (newValue.trim()) {
      setIsOpen(true);
    }
  };

  // Handle search execution
  const handleSearch = (query: string = value, options?: SearchOptions) => {
    if (!query.trim()) return;

    // Add to history
    const historyItem: SearchHistory = {
      id: Date.now().toString(),
      query: query.trim(),
      timestamp: new Date(),
      resultCount: 0, // Will be updated after search
      ...(options?.category && { category: options.category }),
    };

    setHistory((prev) => [historyItem, ...prev.slice(0, maxHistory - 1)]);
    setIsOpen(false);

    // Execute search
    onSearch(query.trim(), {
      semantic: enableSemanticSuggestions,
      ...options,
    });
  };

  // Handle suggestion selection
  const handleSuggestionSelect = async (suggestion: SearchSuggestion, position: number) => {
    onChange(suggestion.text);
    setIsOpen(false);
    onSuggestionSelect?.(suggestion);

    // Track suggestion click
    try {
      await suggestionsService.trackSuggestionClick(
        suggestion.id,
        value, // original query
        position,
        'clicked',
        undefined, // user_id - can be added if available
        undefined, // result_count - will be updated after search
        undefined  // user_satisfied - can be tracked later
      );
    } catch (error) {
      console.error('Error tracking suggestion click:', error);
    }

    // Auto-search on suggestion select
    handleSearch(suggestion.text, {
      ...(suggestion.category && { category: suggestion.category }),
      semantic: suggestion.type === 'semantic',
    });
  };

  // Handle history selection
  const handleHistorySelect = (historyItem: SearchHistory) => {
    onChange(historyItem.query);
    setIsOpen(false);
    onHistorySelect?.(historyItem);

    // Auto-search on history select
    handleSearch(historyItem.query, {
      ...(historyItem.category && { category: historyItem.category }),
    });
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown') {
        setIsOpen(true);
        return;
      }
      if (e.key === 'Enter') {
        handleSearch();
        return;
      }
      return;
    }

    const totalItems = suggestions.length + (showHistory ? history.length : 0);

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % totalItems);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex((prev) => (prev <= 0 ? totalItems - 1 : prev - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          if (selectedIndex < suggestions.length) {
            const suggestion = suggestions[selectedIndex];
            if (suggestion) {
              handleSuggestionSelect(suggestion, selectedIndex);
            }
          } else {
            const historyIndex = selectedIndex - suggestions.length;
            const historyItem = history[historyIndex];
            if (historyItem) {
              handleHistorySelect(historyItem);
            }
          }
        } else {
          handleSearch();
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !inputRef.current?.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // Get suggestion icon
  const getSuggestionIcon = (type: SearchSuggestion['type']) => {
    switch (type) {
      case 'semantic':
        return <Sparkles className="h-4 w-4 text-purple-500" />;
      case 'trending':
        return <TrendingUp className="h-4 w-4 text-green-500" />;
      case 'recent':
        return <Clock className="h-4 w-4 text-blue-500" />;
      case 'completion':
        return <Search className="h-4 w-4 text-gray-500" />;
      default:
        return <Search className="h-4 w-4 text-gray-500" />;
    }
  };

  const showDropdown =
    isOpen && (suggestions.length > 0 || (showHistory && history.length > 0));

  return (
    <div className={cn('relative w-full', className)}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-10 pr-20"
          aria-label="Semantic search input"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          role="combobox"
        />

        {/* Loading indicator */}
        {isLoading && (
          <Loader2 className="absolute right-12 top-1/2 transform -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}

        {/* Clear button */}
        {value && (
          <Button
            type="button"
            onClick={() => {
              onChange('');
              setIsOpen(false);
              inputRef.current?.focus();
            }}
            className="absolute right-8 top-1/2 transform -translate-y-1/2 h-6 w-6 p-0 bg-transparent hover:bg-accent text-muted-foreground hover:text-foreground"
            aria-label="Clear search"
          >
            <X className="h-3 w-3" />
          </Button>
        )}

        {/* Search button */}
        <Button
          type="button"
          onClick={() => handleSearch()}
          disabled={disabled || !value.trim()}
          className="absolute right-1 top-1/2 transform -translate-y-1/2 h-8 px-3 bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          aria-label="Execute search"
        >
          <Search className="h-3 w-3" />
        </Button>
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <Card
          ref={dropdownRef}
          className="absolute top-full left-0 right-0 mt-1 z-50 max-h-96 overflow-hidden shadow-lg"
        >
          <CardContent className="p-0">
            <div className="max-h-96 overflow-y-auto">
              {/* Typo Correction Banner */}
              {showTypoCorrection && typoCorrection && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950 border-b border-amber-200 dark:border-amber-800">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-amber-900 dark:text-amber-100">
                        Did you mean:{' '}
                        <button
                          onClick={() => {
                            onChange(typoCorrection);
                            setShowTypoCorrection(false);
                            handleSearch(typoCorrection);
                          }}
                          className="font-semibold underline hover:no-underline"
                        >
                          {typoCorrection}
                        </button>
                        ?
                      </p>
                    </div>
                    <button
                      onClick={() => setShowTypoCorrection(false)}
                      className="text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200"
                      aria-label="Dismiss correction"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Suggestions */}
              {suggestions.length > 0 && (
                <div className="p-2">
                  <div className="text-xs font-medium text-muted-foreground mb-2 px-2">
                    AI Suggestions
                  </div>
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.id}
                      onClick={() => handleSuggestionSelect(suggestion, index)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 text-left rounded-md hover:bg-accent transition-colors',
                        selectedIndex === index && 'bg-accent',
                      )}
                      role="option"
                      aria-selected={selectedIndex === index}
                    >
                      {getSuggestionIcon(suggestion.type)}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {suggestion.text}
                        </div>
                        {suggestion.confidence && (
                          <div className="text-xs text-muted-foreground">
                            Confidence:{' '}
                            {Math.round(suggestion.confidence * 100)}%
                          </div>
                        )}
                      </div>
                      {suggestion.category && (
                        <Badge className="text-xs bg-secondary text-secondary-foreground">
                          {suggestion.category}
                        </Badge>
                      )}
                    </button>
                  ))}
                </div>
              )}

              {/* Separator */}
              {suggestions.length > 0 && showHistory && history.length > 0 && (
                <Separator />
              )}

              {/* Search History */}
              {showHistory && history.length > 0 && (
                <div className="p-2">
                  <div className="flex items-center justify-between mb-2 px-2">
                    <div className="text-xs font-medium text-muted-foreground">
                      Recent Searches
                    </div>
                    {onClearHistory && (
                      <Button
                        onClick={onClearHistory}
                        className="h-6 px-2 text-xs bg-transparent hover:bg-accent text-muted-foreground hover:text-foreground"
                      >
                        Clear
                      </Button>
                    )}
                  </div>
                  {history.slice(0, maxHistory).map((item, index) => {
                    const adjustedIndex = suggestions.length + index;
                    return (
                      <button
                        key={item.id}
                        onClick={() => handleHistorySelect(item)}
                        className={cn(
                          'w-full flex items-center gap-3 px-3 py-2 text-left rounded-md hover:bg-accent transition-colors',
                          selectedIndex === adjustedIndex && 'bg-accent',
                        )}
                        role="option"
                        aria-selected={selectedIndex === adjustedIndex}
                      >
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {item.query}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {item.resultCount} results •{' '}
                            {formatTimeAgo(item.timestamp)}
                          </div>
                        </div>
                        {item.category && (
                          <Badge className="text-xs border border-border bg-background text-foreground">
                            {item.category}
                          </Badge>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Empty state */}
              {suggestions.length === 0 &&
                (!showHistory || history.length === 0) &&
                value.trim() && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No suggestions found. Press Enter to search.
                  </div>
                )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SemanticSearchInput;
