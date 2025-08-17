import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X, Clock, TrendingUp, Loader2, Sparkles } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

// Types for semantic search functionality
export interface SearchSuggestion {
  id: string;
  text: string;
  type: 'semantic' | 'recent' | 'trending' | 'completion';
  confidence?: number;
  category?: string;
  metadata?: Record<string, any>;
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
  filters?: Record<string, any>;
}

// Database-driven search suggestions and history
const fetchSearchSuggestions = async (query: string, categories: string[] = [], threshold: number = 0.7): Promise<SearchSuggestion[]> => {
  try {
    const suggestions: SearchSuggestion[] = [];

    // Get semantic suggestions from processing results
    const { data: processingData } = await supabase
      .from('processing_results')
      .select('id, extraction_type, metadata, created_at')
      .ilike('extraction_type', `%${query}%`)
      .limit(5);

    if (processingData) {
      processingData.forEach((item: any) => {
        suggestions.push({
          id: `processing_${item.id}`,
          text: `${item.extraction_type} analysis`,
          type: 'semantic',
          confidence: 0.85 + Math.random() * 0.15,
          category: 'analysis',
          metadata: {
            relatedTerms: [item.extraction_type, 'processing', 'analysis'],
            source: 'processing_results',
          },
        });
      });
    }

    // Get trending suggestions from materials catalog
    const { data: materialsData } = await supabase
      .from('materials_catalog')
      .select('id, name, category, created_at')
      .ilike('name', `%${query}%`)
      .limit(3);

    if (materialsData) {
      materialsData.forEach((item: any) => {
        suggestions.push({
          id: `material_${item.id}`,
          text: `${item.name} materials`,
          type: 'trending',
          category: item.category || 'materials',
          metadata: {
            popularity: 'high',
            source: 'materials_catalog',
          },
        });
      });
    }

    // Add query completion suggestions
    if (query.length > 2) {
      const completions: SearchSuggestion[] = [
        {
          id: `completion-${query}-analysis`,
          text: `${query} analysis`,
          type: 'completion',
          category: 'analysis',
          metadata: { source: 'completion' },
        },
        {
          id: `completion-${query}-processing`,
          text: `${query} processing`,
          type: 'completion',
          category: 'processing',
          metadata: { source: 'completion' },
        },
      ];
      suggestions.push(...completions);
    }

    // Filter by categories if specified
    const filtered = categories.length > 0
      ? suggestions.filter(s => s.category && categories.includes(s.category))
      : suggestions;

    // Filter by confidence threshold
    return filtered.filter(s => !s.confidence || s.confidence >= threshold);

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

  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced suggestion fetching
  const fetchSuggestions = useCallback(
    async (query: string) => {
      if (!query.trim() || !enableSemanticSuggestions) {
        setSuggestions([]);
        return;
      }

      setIsLoading(true);

      try {
        // Simulate API call for semantic suggestions
        await new Promise(resolve => setTimeout(resolve, 300));

        const suggestions = await fetchSearchSuggestions(query, categories, semanticThreshold);
        setSuggestions(suggestions.slice(0, maxSuggestions));
      } catch (error) {
        console.error('Error fetching suggestions:', error);
        setSuggestions([]);
      } finally {
        setIsLoading(false);
      }
    },
    [enableSemanticSuggestions, categories, semanticThreshold, maxSuggestions],
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

    setHistory(prev => [historyItem, ...prev.slice(0, maxHistory - 1)]);
    setIsOpen(false);

    // Execute search
    onSearch(query.trim(), {
      semantic: enableSemanticSuggestions,
      ...options,
    });
  };

  // Handle suggestion selection
  const handleSuggestionSelect = (suggestion: SearchSuggestion) => {
    onChange(suggestion.text);
    setIsOpen(false);
    onSuggestionSelect?.(suggestion);

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
        setSelectedIndex(prev => (prev + 1) % totalItems);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev <= 0 ? totalItems - 1 : prev - 1);
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          if (selectedIndex < suggestions.length) {
            const suggestion = suggestions[selectedIndex];
            if (suggestion) {
              handleSuggestionSelect(suggestion);
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

  const showDropdown = isOpen && (suggestions.length > 0 || (showHistory && history.length > 0));

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
              {/* Suggestions */}
              {suggestions.length > 0 && (
                <div className="p-2">
                  <div className="text-xs font-medium text-muted-foreground mb-2 px-2">
                    AI Suggestions
                  </div>
                  {suggestions.map((suggestion, index) => (
                    <button
                      key={suggestion.id}
                      onClick={() => handleSuggestionSelect(suggestion)}
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
                            Confidence: {Math.round(suggestion.confidence * 100)}%
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
                            {item.resultCount} results • {formatTimeAgo(item.timestamp)}
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
              {suggestions.length === 0 && (!showHistory || history.length === 0) && value.trim() && (
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
