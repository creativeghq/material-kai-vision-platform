import React, { useState } from 'react';
import { Material, MaterialCategory } from '@/types/materials';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Search, Filter, X, SlidersHorizontal } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export interface FilterOptions {
  searchQuery: string;
  category: MaterialCategory | 'all';
  color: string;
  finish: string;
  brand: string;
  sortBy: 'name' | 'date' | 'category';
  sortOrder: 'asc' | 'desc';
}

interface CatalogFiltersProps {
  filters: FilterOptions;
  onFiltersChange: (filters: FilterOptions) => void;
  materials: Material[];
  isLoading?: boolean;
}

export const CatalogFilters: React.FC<CatalogFiltersProps> = ({
  filters,
  onFiltersChange,
  materials,
  isLoading = false
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Extract unique values for filter options
  const uniqueColors = Array.from(new Set(
    materials.map(m => m.metadata.color).filter(Boolean)
  ));
  const uniqueFinishes = Array.from(new Set(
    materials.map(m => m.metadata.finish).filter(Boolean)
  ));
  const uniqueBrands = Array.from(new Set(
    materials.map(m => m.metadata.brand).filter(Boolean)
  ));

  const updateFilter = <K extends keyof FilterOptions>(
    key: K,
    value: FilterOptions[K]
  ) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearAllFilters = () => {
    onFiltersChange({
      searchQuery: '',
      category: 'all',
      color: '',
      finish: '',
      brand: '',
      sortBy: 'name',
      sortOrder: 'asc'
    });
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.searchQuery) count++;
    if (filters.category !== 'all') count++;
    if (filters.color) count++;
    if (filters.finish) count++;
    if (filters.brand) count++;
    return count;
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* Search and Quick Filters */}
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input
              placeholder="Search materials by name, brand, or description..."
              className="pl-10"
              value={filters.searchQuery}
              onChange={(e) => updateFilter('searchQuery', e.target.value)}
              disabled={isLoading}
            />
          </div>

          {/* Category Filter */}
          <Select
            value={filters.category}
            onValueChange={(value) => updateFilter('category', value as MaterialCategory | 'all')}
            disabled={isLoading}
          >
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              {Object.values(MaterialCategory).map((category) => (
                <SelectItem key={category} value={category}>
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Advanced Filter Toggle */}
          <Button
            variant="outline"
            size="icon"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="shrink-0"
          >
            <SlidersHorizontal className="w-4 h-4" />
          </Button>
        </div>

        {/* Active Filters Display */}
        {getActiveFilterCount() > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Active filters:</span>
            
            {filters.searchQuery && (
              <Badge variant="secondary" className="text-xs">
                Search: "{filters.searchQuery}"
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-1 hover:bg-transparent"
                  onClick={() => updateFilter('searchQuery', '')}
                >
                  <X className="w-2 h-2" />
                </Button>
              </Badge>
            )}
            
            {filters.category !== 'all' && (
              <Badge variant="secondary" className="text-xs">
                Category: {filters.category}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-1 hover:bg-transparent"
                  onClick={() => updateFilter('category', 'all')}
                >
                  <X className="w-2 h-2" />
                </Button>
              </Badge>
            )}
            
            {filters.color && (
              <Badge variant="secondary" className="text-xs">
                Color: {filters.color}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-1 hover:bg-transparent"
                  onClick={() => updateFilter('color', '')}
                >
                  <X className="w-2 h-2" />
                </Button>
              </Badge>
            )}
            
            {filters.finish && (
              <Badge variant="secondary" className="text-xs">
                Finish: {filters.finish}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-1 hover:bg-transparent"
                  onClick={() => updateFilter('finish', '')}
                >
                  <X className="w-2 h-2" />
                </Button>
              </Badge>
            )}
            
            {filters.brand && (
              <Badge variant="secondary" className="text-xs">
                Brand: {filters.brand}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-4 w-4 ml-1 hover:bg-transparent"
                  onClick={() => updateFilter('brand', '')}
                >
                  <X className="w-2 h-2" />
                </Button>
              </Badge>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={clearAllFilters}
              className="text-xs"
            >
              Clear all
            </Button>
          </div>
        )}

        {/* Advanced Filters */}
        {showAdvanced && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
            {/* Color Filter */}
            <Select
              value={filters.color}
              onValueChange={(value) => updateFilter('color', value)}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Any Color" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any Color</SelectItem>
                {uniqueColors.map((color) => (
                  <SelectItem key={color} value={color}>
                    {color.charAt(0).toUpperCase() + color.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Finish Filter */}
            <Select
              value={filters.finish}
              onValueChange={(value) => updateFilter('finish', value)}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Any Finish" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any Finish</SelectItem>
                {uniqueFinishes.map((finish) => (
                  <SelectItem key={finish} value={finish}>
                    {finish.charAt(0).toUpperCase() + finish.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Brand Filter */}
            <Select
              value={filters.brand}
              onValueChange={(value) => updateFilter('brand', value)}
              disabled={isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder="Any Brand" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Any Brand</SelectItem>
                {uniqueBrands.map((brand) => (
                  <SelectItem key={brand} value={brand}>
                    {brand}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Sort Options */}
            <div className="flex gap-2">
              <Select
                value={filters.sortBy}
                onValueChange={(value) => updateFilter('sortBy', value as FilterOptions['sortBy'])}
                disabled={isLoading}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="name">Name</SelectItem>
                  <SelectItem value="date">Date Added</SelectItem>
                  <SelectItem value="category">Category</SelectItem>
                </SelectContent>
              </Select>
              
              <Select
                value={filters.sortOrder}
                onValueChange={(value) => updateFilter('sortOrder', value as FilterOptions['sortOrder'])}
                disabled={isLoading}
              >
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="asc">A-Z</SelectItem>
                  <SelectItem value="desc">Z-A</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};