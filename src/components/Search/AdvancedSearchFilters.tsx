import React, { useState, useCallback, useMemo } from 'react';
import { Search, Filter, X, Calendar, FileText, Tag, User, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DatePickerWithRange } from '@/components/ui/date-range-picker';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';

// Types for search filters
export interface SearchFilters {
  query: string;
  fileTypes: string[];
  dateRange: DateRange | undefined;
  tags: string[];
  authors: string[];
  contentTypes: string[];
  sizeRange: [number, number];
  sortBy: 'relevance' | 'date' | 'size' | 'name';
  sortOrder: 'asc' | 'desc';
  includeArchived: boolean;
  exactMatch: boolean;
  caseSensitive: boolean;
  searchInContent: boolean;
  searchInMetadata: boolean;
  searchInComments: boolean;
}

export interface FilterOption {
  value: string;
  label: string;
  count?: number;
}

export interface AdvancedSearchFiltersProps {
  filters: SearchFilters;
  onFiltersChange: (filters: SearchFilters) => void;
  onSearch: () => void;
  onReset: () => void;
  availableFileTypes?: FilterOption[];
  availableTags?: FilterOption[];
  availableAuthors?: FilterOption[];
  availableContentTypes?: FilterOption[];
  isLoading?: boolean;
  className?: string;
}

// Default filter values
export const defaultFilters: SearchFilters = {
  query: '',
  fileTypes: [],
  dateRange: undefined,
  tags: [],
  authors: [],
  contentTypes: [],
  sizeRange: [0, 100],
  sortBy: 'relevance',
  sortOrder: 'desc',
  includeArchived: false,
  exactMatch: false,
  caseSensitive: false,
  searchInContent: true,
  searchInMetadata: true,
  searchInComments: false,
};

// Default options
const defaultFileTypes: FilterOption[] = [
  { value: 'pdf', label: 'PDF Documents', count: 1234 },
  { value: 'doc', label: 'Word Documents', count: 567 },
  { value: 'txt', label: 'Text Files', count: 890 },
  { value: 'md', label: 'Markdown Files', count: 345 },
  { value: 'xlsx', label: 'Excel Files', count: 234 },
  { value: 'pptx', label: 'PowerPoint Files', count: 123 },
  { value: 'image', label: 'Images', count: 678 },
  { value: 'video', label: 'Videos', count: 89 },
];

const defaultContentTypes: FilterOption[] = [
  { value: 'document', label: 'Documents', count: 2345 },
  { value: 'report', label: 'Reports', count: 567 },
  { value: 'presentation', label: 'Presentations', count: 234 },
  { value: 'spreadsheet', label: 'Spreadsheets', count: 345 },
  { value: 'form', label: 'Forms', count: 123 },
  { value: 'contract', label: 'Contracts', count: 89 },
  { value: 'invoice', label: 'Invoices', count: 156 },
  { value: 'manual', label: 'Manuals', count: 78 },
];

const sortOptions = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'date', label: 'Date Modified' },
  { value: 'size', label: 'File Size' },
  { value: 'name', label: 'Name' },
];

export const AdvancedSearchFilters: React.FC<AdvancedSearchFiltersProps> = ({
  filters,
  onFiltersChange,
  onSearch,
  onReset,
  availableFileTypes = defaultFileTypes,
  availableTags = [],
  availableAuthors = [],
  availableContentTypes = defaultContentTypes,
  isLoading = false,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState<string | null>(null);

  // Calculate active filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.query.trim()) count++;
    if (filters.fileTypes.length > 0) count++;
    if (filters.dateRange?.from || filters.dateRange?.to) count++;
    if (filters.tags.length > 0) count++;
    if (filters.authors.length > 0) count++;
    if (filters.contentTypes.length > 0) count++;
    if (filters.sizeRange[0] > 0 || filters.sizeRange[1] < 100) count++;
    if (filters.includeArchived) count++;
    if (filters.exactMatch) count++;
    if (filters.caseSensitive) count++;
    if (!filters.searchInContent || !filters.searchInMetadata || filters.searchInComments) count++;
    return count;
  }, [filters]);

  // Handle filter updates
  const updateFilters = useCallback((updates: Partial<SearchFilters>) => {
    onFiltersChange({ ...filters, ...updates });
  }, [filters, onFiltersChange]);

  // Handle multi-select filters
  const toggleArrayFilter = useCallback((key: keyof SearchFilters, value: string) => {
    const currentArray = filters[key] as string[];
    const newArray = currentArray.includes(value)
      ? currentArray.filter(item => item !== value)
      : [...currentArray, value];
    updateFilters({ [key]: newArray });
  }, [filters, updateFilters]);

  // Handle search input with debouncing
  const handleQueryChange = useCallback((value: string) => {
    updateFilters({ query: value });
  }, [updateFilters]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      onSearch();
    } else if (e.key === 'Escape') {
      if (filters.query) {
        updateFilters({ query: '' });
      } else {
        onReset();
      }
    }
  }, [filters.query, onSearch, onReset, updateFilters]);

  // Render filter section
  const renderFilterSection = (
    title: string,
    icon: React.ReactNode,
    content: React.ReactNode,
    sectionKey: string
  ) => (
    <Collapsible
      open={activeSection === sectionKey}
      onOpenChange={(open) => setActiveSection(open ? sectionKey : null)}
    >
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="w-full justify-between p-3 h-auto"
          aria-expanded={activeSection === sectionKey}
        >
          <div className="flex items-center gap-2">
            {icon}
            <span className="font-medium">{title}</span>
          </div>
          {activeSection === sectionKey ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-3">
        {content}
      </CollapsibleContent>
    </Collapsible>
  );

  // Render multi-select filter
  const renderMultiSelectFilter = (
    options: FilterOption[],
    selectedValues: string[],
    onToggle: (value: string) => void
  ) => (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1 mb-2">
        {selectedValues.map((value) => {
          const option = options.find(opt => opt.value === value);
          return (
            <Badge
              key={value}
              variant="secondary"
              className="text-xs"
            >
              {option?.label || value}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 ml-1 hover:bg-transparent"
                onClick={() => onToggle(value)}
                aria-label={`Remove ${option?.label || value} filter`}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          );
        })}
      </div>
      <div className="grid grid-cols-1 gap-2 max-h-40 overflow-y-auto">
        {options.map((option) => (
          <div key={option.value} className="flex items-center space-x-2">
            <Checkbox
              id={`filter-${option.value}`}
              checked={selectedValues.includes(option.value)}
              onCheckedChange={() => onToggle(option.value)}
            />
            <Label
              htmlFor={`filter-${option.value}`}
              className="flex-1 text-sm cursor-pointer flex justify-between"
            >
              <span>{option.label}</span>
              {option.count !== undefined && (
                <span className="text-muted-foreground">({option.count})</span>
              )}
            </Label>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Search className="h-5 w-5" />
            Advanced Search
            {activeFilterCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              aria-expanded={isExpanded}
            >
              <Filter className="h-4 w-4 mr-1" />
              {isExpanded ? 'Simple' : 'Advanced'}
            </Button>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onReset}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Main Search Input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search documents, content, and metadata..."
            value={filters.query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-10 pr-4"
            aria-label="Search query"
          />
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2">
          <Button
            onClick={onSearch}
            disabled={isLoading}
            className="flex-1"
          >
            {isLoading ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                Searching...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Search
              </>
            )}
          </Button>
          <Select
            value={filters.sortBy}
            onValueChange={(value) => updateFilters({ sortBy: value as SearchFilters['sortBy'] })}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="icon"
            onClick={() => updateFilters({ 
              sortOrder: filters.sortOrder === 'asc' ? 'desc' : 'asc' 
            })}
            aria-label={`Sort ${filters.sortOrder === 'asc' ? 'descending' : 'ascending'}`}
          >
            {filters.sortOrder === 'asc' ? '↑' : '↓'}
          </Button>
        </div>

        {/* Advanced Filters */}
        {isExpanded && (
          <div className="space-y-1 border-t pt-4">
            {/* File Types */}
            {renderFilterSection(
              'File Types',
              <FileText className="h-4 w-4" />,
              renderMultiSelectFilter(
                availableFileTypes,
                filters.fileTypes,
                (value) => toggleArrayFilter('fileTypes', value)
              ),
              'fileTypes'
            )}

            <Separator />

            {/* Content Types */}
            {renderFilterSection(
              'Content Types',
              <Tag className="h-4 w-4" />,
              renderMultiSelectFilter(
                availableContentTypes,
                filters.contentTypes,
                (value) => toggleArrayFilter('contentTypes', value)
              ),
              'contentTypes'
            )}

            <Separator />

            {/* Date Range */}
            {renderFilterSection(
              'Date Range',
              <Calendar className="h-4 w-4" />,
              <div className="space-y-3">
                <DatePickerWithRange
                  date={filters.dateRange}
                  onDateChange={(dateRange) => updateFilters({ dateRange })}
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateFilters({
                      dateRange: {
                        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                        to: new Date()
                      }
                    })}
                  >
                    Last 7 days
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateFilters({
                      dateRange: {
                        from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                        to: new Date()
                      }
                    })}
                  >
                    Last 30 days
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateFilters({ dateRange: undefined })}
                  >
                    Clear
                  </Button>
                </div>
              </div>,
              'dateRange'
            )}

            <Separator />

            {/* Authors */}
            {availableAuthors.length > 0 && (
              <>
                {renderFilterSection(
                  'Authors',
                  <User className="h-4 w-4" />,
                  renderMultiSelectFilter(
                    availableAuthors,
                    filters.authors,
                    (value) => toggleArrayFilter('authors', value)
                  ),
                  'authors'
                )}
                <Separator />
              </>
            )}

            {/* Tags */}
            {availableTags.length > 0 && (
              <>
                {renderFilterSection(
                  'Tags',
                  <Tag className="h-4 w-4" />,
                  renderMultiSelectFilter(
                    availableTags,
                    filters.tags,
                    (value) => toggleArrayFilter('tags', value)
                  ),
                  'tags'
                )}
                <Separator />
              </>
            )}

            {/* File Size Range */}
            {renderFilterSection(
              'File Size',
              <Clock className="h-4 w-4" />,
              <div className="space-y-3">
                <div className="px-2">
                  <Slider
                    value={filters.sizeRange}
                    onValueChange={(value) => updateFilters({ sizeRange: value as [number, number] })}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                </div>
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>{filters.sizeRange[0]}% of max size</span>
                  <span>{filters.sizeRange[1]}% of max size</span>
                </div>
              </div>,
              'fileSize'
            )}

            <Separator />

            {/* Search Options */}
            {renderFilterSection(
              'Search Options',
              <Filter className="h-4 w-4" />,
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="search-content" className="text-sm font-medium">
                      Search in content
                    </Label>
                    <Switch
                      id="search-content"
                      checked={filters.searchInContent}
                      onCheckedChange={(checked) => updateFilters({ searchInContent: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="search-metadata" className="text-sm font-medium">
                      Search in metadata
                    </Label>
                    <Switch
                      id="search-metadata"
                      checked={filters.searchInMetadata}
                      onCheckedChange={(checked) => updateFilters({ searchInMetadata: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="search-comments" className="text-sm font-medium">
                      Search in comments
                    </Label>
                    <Switch
                      id="search-comments"
                      checked={filters.searchInComments}
                      onCheckedChange={(checked) => updateFilters({ searchInComments: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="exact-match" className="text-sm font-medium">
                      Exact match
                    </Label>
                    <Switch
                      id="exact-match"
                      checked={filters.exactMatch}
                      onCheckedChange={(checked) => updateFilters({ exactMatch: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="case-sensitive" className="text-sm font-medium">
                      Case sensitive
                    </Label>
                    <Switch
                      id="case-sensitive"
                      checked={filters.caseSensitive}
                      onCheckedChange={(checked) => updateFilters({ caseSensitive: checked })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="include-archived" className="text-sm font-medium">
                      Include archived
                    </Label>
                    <Switch
                      id="include-archived"
                      checked={filters.includeArchived}
                      onCheckedChange={(checked) => updateFilters({ includeArchived: checked })}
                    />
                  </div>
                </div>
              </div>,
              'searchOptions'
            )}
          </div>
        )}

        {/* Keyboard Shortcuts Help */}
        {isExpanded && (
          <div className="text-xs text-muted-foreground border-t pt-3">
            <div className="flex flex-wrap gap-4">
              <span><kbd className="px-1 py-0.5 bg-muted rounded">Ctrl+Enter</kbd> Search</span>
              <span><kbd className="px-1 py-0.5 bg-muted rounded">Esc</kbd> Clear/Reset</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdvancedSearchFilters;