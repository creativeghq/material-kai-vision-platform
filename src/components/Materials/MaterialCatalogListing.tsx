import React, { useState, useMemo, useCallback } from 'react';
import {
  Package,
  Filter,
  Search,
  Grid3X3,
  List,
  Info,
  Tag,
  Image as ImageIcon,
  MapPin,
  Wrench,
  Thermometer,
  Layers,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  Database,
  Link,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';

import {
  Material,
  MaterialCategory,
  MATERIAL_CATEGORIES,
  getMaterialCategories,
  getAllMaterialFinishes,
  getAllMaterialSizes,
  getAllMaterialInstallationMethods,
  getAllMaterialApplications,
} from '@/types/materials';

interface MaterialCatalogListingProps {
  materials: Material[];
  loading?: boolean;
  onMaterialSelect?: (material: Material) => void;
  onMaterialEdit?: (material: Material) => void;
  showImages?: boolean;
  showMetaFields?: boolean;
  allowFiltering?: boolean;
  allowSorting?: boolean;
  viewMode?: 'grid' | 'list';
}

interface FilterState {
  search: string;
  category: MaterialCategory | 'all';
  finish: string;
  size: string;
  installationMethod: string;
  application: string;
  sortBy: 'name' | 'category' | 'createdAt' | 'updatedAt';
  sortOrder: 'asc' | 'desc';
}

const defaultFilters: FilterState = {
  search: '',
  category: 'all',
  finish: '',
  size: '',
  installationMethod: '',
  application: '',
  sortBy: 'name',
  sortOrder: 'asc',
};

export const MaterialCatalogListing: React.FC<MaterialCatalogListingProps> = ({
  materials,
  loading = false,
  onMaterialSelect,
  onMaterialEdit,
  showImages = true,
  showMetaFields = true,
  allowFiltering = true,
  allowSorting = true,
  viewMode: initialViewMode = 'grid',
}) => {
  const { toast: _toast } = useToast();
  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(initialViewMode);
  const [showFilters, setShowFilters] = useState(false);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  // Get all available filter options from the materials and type system
  const filterOptions = useMemo(() => ({
    categories: getMaterialCategories(),
    finishes: getAllMaterialFinishes(),
    sizes: getAllMaterialSizes(),
    installationMethods: getAllMaterialInstallationMethods(),
    applications: getAllMaterialApplications(),
  }), []);

  // Filter and sort materials based on current filter state
  const filteredAndSortedMaterials = useMemo(() => {
    const filtered = materials.filter(material => {
      // Search filter
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        const matchesSearch =
          material.name.toLowerCase().includes(searchLower) ||
          material.description?.toLowerCase().includes(searchLower) ||
          material.category.toLowerCase().includes(searchLower) ||
          material.metadata?.finish?.toLowerCase().includes(searchLower) ||
          material.metadata?.size?.toLowerCase().includes(searchLower) ||
          material.metadata?.installationMethod?.toLowerCase().includes(searchLower) ||
          material.metadata?.application?.toLowerCase().includes(searchLower) ||
          material.standards.some(standard => standard.toLowerCase().includes(searchLower));
        
        if (!matchesSearch) return false;
      }

      // Category filter
      if (filters.category !== 'all' && material.category !== filters.category) {
        return false;
      }

      // Meta field filters
      if (filters.finish && material.metadata?.finish !== filters.finish) {
        return false;
      }
      if (filters.size && material.metadata?.size !== filters.size) {
        return false;
      }
      if (filters.installationMethod && material.metadata?.installationMethod !== filters.installationMethod) {
        return false;
      }
      if (filters.application && material.metadata?.application !== filters.application) {
        return false;
      }

      return true;
    });

    // Sort materials
    filtered.sort((a, b) => {
      let comparison = 0;
      
      switch (filters.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'category':
          comparison = a.category.localeCompare(b.category);
          break;
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case 'updatedAt':
          comparison = new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
          break;
        default:
          comparison = 0;
      }

      return filters.sortOrder === 'desc' ? -comparison : comparison;
    });

    return filtered;
  }, [materials, filters]);

  const updateFilter = useCallback(<K extends keyof FilterState>(
    key: K,
    value: FilterState[K]
  ) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  const toggleCardExpansion = useCallback((materialId: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(materialId)) {
        newSet.delete(materialId);
      } else {
        newSet.add(materialId);
      }
      return newSet;
    });
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <span className="text-muted-foreground">Loading materials catalog...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with stats and view controls */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Material Catalog</h2>
          <p className="text-sm text-muted-foreground">
            {filteredAndSortedMaterials.length} of {materials.length} materials
            {filters.search || filters.category !== 'all' || filters.finish || filters.size || filters.installationMethod || filters.application
              ? ' (filtered)'
              : ''
            }
          </p>
        </div>
        <div className="flex items-center gap-2">
          {allowFiltering && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2"
            >
              <Filter className="h-4 w-4" />
              Filters
              {showFilters ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          )}
          <div className="flex border border-border rounded-md">
            <Button
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('grid')}
              className="rounded-r-none border-r"
            >
              <Grid3X3 className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-l-none"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Filters Panel */}
      {allowFiltering && showFilters && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filter & Sort Materials
              </span>
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Reset All
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search and Category */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="search">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search by name, description, standards..."
                    value={filters.search}
                    onChange={(e) => updateFilter('search', e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select 
                  value={filters.category} 
                  onValueChange={(value: MaterialCategory | 'all') => updateFilter('category', value)}
                >
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {filterOptions.categories.map(category => (
                      <SelectItem key={category} value={category}>
                        {MATERIAL_CATEGORIES[category].name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Meta Field Filters */}
            {showMetaFields && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="finish">Finish</Label>
                  <Select value={filters.finish} onValueChange={(value: string) => updateFilter('finish', value)}>
                    <SelectTrigger id="finish">
                      <SelectValue placeholder="Any finish" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any finish</SelectItem>
                      {filterOptions.finishes.map(finish => (
                        <SelectItem key={finish} value={finish}>
                          {finish}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="size">Size</Label>
                  <Select value={filters.size} onValueChange={(value: string) => updateFilter('size', value)}>
                    <SelectTrigger id="size">
                      <SelectValue placeholder="Any size" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any size</SelectItem>
                      {filterOptions.sizes.map(size => (
                        <SelectItem key={size} value={size}>
                          {size}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="installation">Installation</Label>
                  <Select value={filters.installationMethod} onValueChange={(value: string) => updateFilter('installationMethod', value)}>
                    <SelectTrigger id="installation">
                      <SelectValue placeholder="Any method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any method</SelectItem>
                      {filterOptions.installationMethods.map(method => (
                        <SelectItem key={method} value={method}>
                          {method}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="application">Application</Label>
                  <Select value={filters.application} onValueChange={(value: string) => updateFilter('application', value)}>
                    <SelectTrigger id="application">
                      <SelectValue placeholder="Any application" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Any application</SelectItem>
                      {filterOptions.applications.map(application => (
                        <SelectItem key={application} value={application}>
                          {application}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            {/* Sorting */}
            {allowSorting && (
              <div className="flex items-center gap-4">
                <div className="space-y-2">
                  <Label htmlFor="sortBy">Sort by</Label>
                  <Select value={filters.sortBy} onValueChange={(value: FilterState['sortBy']) => updateFilter('sortBy', value)}>
                    <SelectTrigger id="sortBy" className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="name">Name</SelectItem>
                      <SelectItem value="category">Category</SelectItem>
                      <SelectItem value="createdAt">Created Date</SelectItem>
                      <SelectItem value="updatedAt">Updated Date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sortOrder">Order</Label>
                  <Select value={filters.sortOrder} onValueChange={(value: FilterState['sortOrder']) => updateFilter('sortOrder', value)}>
                    <SelectTrigger id="sortOrder" className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="asc">Ascending</SelectItem>
                      <SelectItem value="desc">Descending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateFilter('sortOrder', filters.sortOrder === 'asc' ? 'desc' : 'asc')}
                  className="mt-7 flex items-center gap-2"
                >
                  <ArrowUpDown className="h-4 w-4" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Materials Display */}
      {filteredAndSortedMaterials.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No materials found</h3>
            <p className="text-muted-foreground">
              {materials.length === 0 
                ? 'No materials in the catalog yet.'
                : 'Try adjusting your filters or search terms.'
              }
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className={viewMode === 'grid' 
          ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' 
          : 'space-y-4'
        }>
          {filteredAndSortedMaterials.map((material) => (
            <MaterialCard
              key={material.id}
              material={material}
              viewMode={viewMode}
              showImages={showImages}
              showMetaFields={showMetaFields}
              expanded={expandedCards.has(material.id)}
              onToggleExpand={() => toggleCardExpansion(material.id)}
              onSelect={() => onMaterialSelect?.(material)}
              onEdit={() => onMaterialEdit?.(material)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface MaterialCardProps {
  material: Material;
  viewMode: 'grid' | 'list';
  showImages: boolean;
  showMetaFields: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onSelect?: () => void;
  onEdit?: () => void;
}

const MaterialCard: React.FC<MaterialCardProps> = ({
  material,
  viewMode,
  showImages,
  showMetaFields,
  expanded,
  onToggleExpand,
  onSelect,
  onEdit: _onEdit,
}) => {
  const categoryDef = MATERIAL_CATEGORIES[material.category];

  return (
    <Card className={`overflow-hidden transition-all hover:shadow-md ${
      viewMode === 'list' ? 'h-auto' : 'h-fit'
    }`}>
      {/* Material Image */}
      {showImages && (material.thumbnailUrl || material.imageUrl) && (
        <div className="relative h-48 bg-muted">
          <img
            src={material.thumbnailUrl || material.imageUrl}
            alt={material.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              target.style.display = 'none';
            }}
          />
          <div className="absolute top-2 right-2">
            <Badge className="bg-background/80 text-foreground border">
              {categoryDef.name}
            </Badge>
          </div>
        </div>
      )}

      <CardHeader className={`pb-3 ${viewMode === 'list' ? 'py-4' : ''}`}>
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg mb-1 flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              {material.name}
            </CardTitle>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="secondary" className="capitalize">
                {categoryDef.name}
              </Badge>
              {material.standards.length > 0 && (
                <Badge variant="outline" className="text-xs">
                  {material.standards.length} standard{material.standards.length > 1 ? 's' : ''}
                </Badge>
              )}
            </div>
            {material.description && (
              <p className="text-sm text-muted-foreground line-clamp-2">
                {material.description}
              </p>
            )}
          </div>
          <div className="flex items-center gap-1 ml-4">
            {onSelect && (
              <Button size="sm" variant="outline" onClick={onSelect}>
                Select
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={onToggleExpand}
              className="p-2"
            >
              <Info className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <Collapsible open={expanded} onOpenChange={onToggleExpand}>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {/* Meta Fields */}
            {showMetaFields && (
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Tag className="h-4 w-4" />
                  Material Properties
                </Label>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {material.metadata?.finish && (
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        <span className="font-medium">Finish:</span> {material.metadata.finish}
                      </span>
                    </div>
                  )}
                  {material.metadata?.size && (
                    <div className="flex items-center gap-2">
                      <Grid3X3 className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        <span className="font-medium">Size:</span> {material.metadata.size}
                      </span>
                    </div>
                  )}
                  {material.metadata?.installationMethod && (
                    <div className="flex items-center gap-2">
                      <Wrench className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        <span className="font-medium">Installation:</span> {material.metadata.installationMethod}
                      </span>
                    </div>
                  )}
                  {material.metadata?.application && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        <span className="font-medium">Application:</span> {material.metadata.application}
                      </span>
                    </div>
                  )}
                </div>

                {/* Additional Meta Properties */}
                {material.metadata?.additionalProperties && Object.keys(material.metadata.additionalProperties).length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium">Additional Properties</Label>
                    <div className="space-y-1">
                      {Object.entries(material.metadata.additionalProperties).map(([key, value]) => (
                        <div key={key} className="flex items-center gap-2 text-sm">
                          <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}:</span>
                          <span className="text-muted-foreground">
                            {typeof value === 'string' ? value : JSON.stringify(value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Enhanced Metafield System Display */}
                {material.metafieldValues && material.metafieldValues.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      Metafields
                    </Label>
                    <div className="space-y-1">
                      {material.metafieldValues.map((metafield, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          <span className="font-medium">{metafield.key}:</span>
                          <span className="text-muted-foreground">
                            {typeof metafield.value === 'string' ? metafield.value : JSON.stringify(metafield.value)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Material Images Display */}
                {material.images && material.images.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" />
                      Associated Images ({material.images.length})
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {material.images.slice(0, 3).map((image, index) => (
                        <div key={index} className="relative w-16 h-16 rounded overflow-hidden bg-muted">
                          <img
                            src={image.url}
                            alt={image.alt || `Material image ${index + 1}`}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = 'none';
                            }}
                          />
                        </div>
                      ))}
                      {material.images.length > 3 && (
                        <div className="w-16 h-16 rounded bg-muted flex items-center justify-center text-xs text-muted-foreground">
                          +{material.images.length - 3}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Material Relationships Display */}
                {material.relationships && material.relationships.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium flex items-center gap-2">
                      <Link className="h-4 w-4" />
                      Related Materials
                    </Label>
                    <div className="space-y-1">
                      {material.relationships.map((relationship, index) => (
                        <div key={index} className="flex items-center gap-2 text-sm">
                          <Badge variant="outline" className="text-xs">
                            {relationship.type}
                          </Badge>
                          <span className="text-muted-foreground">
                            {relationship.relatedMaterialId}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Physical Properties */}
            {Object.keys(material.properties).length > 0 && (
              <div className="space-y-3">
                <Separator />
                <Label className="text-sm font-medium flex items-center gap-2">
                  <Thermometer className="h-4 w-4" />
                  Physical Properties
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {material.properties.density && (
                    <div className="text-sm">
                      <span className="font-medium">Density:</span>
                      <span className="text-muted-foreground ml-1">{material.properties.density} g/cm³</span>
                    </div>
                  )}
                  {material.properties.thermalConductivity && (
                    <div className="text-sm">
                      <span className="font-medium">Thermal Conductivity:</span>
                      <span className="text-muted-foreground ml-1">{material.properties.thermalConductivity} W/m·K</span>
                    </div>
                  )}
                  {material.properties.yieldStrength && (
                    <div className="text-sm">
                      <span className="font-medium">Yield Strength:</span>
                      <span className="text-muted-foreground ml-1">{material.properties.yieldStrength} MPa</span>
                    </div>
                  )}
                  {material.properties.tensileStrength && (
                    <div className="text-sm">
                      <span className="font-medium">Tensile Strength:</span>
                      <span className="text-muted-foreground ml-1">{material.properties.tensileStrength} MPa</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Standards */}
            {material.standards.length > 0 && (
              <div className="space-y-2">
                <Separator />
                <Label className="text-sm font-medium">Standards & Certifications</Label>
                <div className="flex flex-wrap gap-1">
                  {material.standards.map((standard, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {standard}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Timestamps */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t">
              <span>Created: {new Date(material.createdAt).toLocaleDateString()}</span>
              <span>Updated: {new Date(material.updatedAt).toLocaleDateString()}</span>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};

export default MaterialCatalogListing;