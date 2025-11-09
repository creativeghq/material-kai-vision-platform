import React, { useState, useEffect } from 'react';
import {
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  Palette,
  DollarSign,
  Shield,
  Package,
  Layers,
  Building2,
  Sparkles,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export interface MaterialFilters {
  materialTypes: string[];
  colors: string[];
  priceRange: [number, number];
  durabilityRating: number[];
  availabilityStatus: string[];
  suppliers: string[];
  applications: string[];
  textures: string[];
}

interface MaterialFiltersPanelProps {
  filters: MaterialFilters;
  onFiltersChange: (filters: MaterialFilters) => void;
  onClearFilters: () => void;
  className?: string;
  collapsible?: boolean;
}

const MATERIAL_TYPES = [
  'Ceramic',
  'Porcelain',
  'Marble',
  'Granite',
  'Wood',
  'Metal',
  'Fabric',
  'Leather',
  'Glass',
  'Concrete',
  'Stone',
  'Composite',
];

const COLORS = [
  'White',
  'Black',
  'Gray',
  'Beige',
  'Brown',
  'Blue',
  'Green',
  'Red',
  'Yellow',
  'Orange',
  'Pink',
  'Purple',
];

const AVAILABILITY_STATUS = ['In Stock', 'Pre-Order', 'Discontinued', 'Limited'];

const APPLICATIONS = [
  'Flooring',
  'Wall Covering',
  'Upholstery',
  'Countertop',
  'Backsplash',
  'Exterior',
  'Interior',
  'Commercial',
  'Residential',
];

const TEXTURES = [
  'Smooth',
  'Rough',
  'Matte',
  'Glossy',
  'Textured',
  'Patterned',
  'Polished',
  'Honed',
];

export const MaterialFiltersPanel: React.FC<MaterialFiltersPanelProps> = ({
  filters,
  onFiltersChange,
  onClearFilters,
  className = '',
  collapsible = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [expandedSections, setExpandedSections] = useState({
    materialType: true,
    color: true,
    price: true,
    durability: true,
    availability: true,
    supplier: false,
    application: false,
    texture: false,
  });

  // Load filter preferences from localStorage
  useEffect(() => {
    const savedFilters = localStorage.getItem('materialFilters');
    if (savedFilters) {
      try {
        const parsed = JSON.parse(savedFilters);
        onFiltersChange(parsed);
      } catch (error) {
        console.error('Failed to load saved filters:', error);
      }
    }
  }, []);

  // Save filters to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('materialFilters', JSON.stringify(filters));
  }, [filters]);

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleMaterialTypeChange = (type: string, checked: boolean) => {
    const updated = checked
      ? [...filters.materialTypes, type]
      : filters.materialTypes.filter((t) => t !== type);
    onFiltersChange({ ...filters, materialTypes: updated });
  };

  const handleColorChange = (color: string, checked: boolean) => {
    const updated = checked
      ? [...filters.colors, color]
      : filters.colors.filter((c) => c !== color);
    onFiltersChange({ ...filters, colors: updated });
  };

  const handlePriceRangeChange = (value: number[]) => {
    onFiltersChange({ ...filters, priceRange: [value[0], value[1]] });
  };

  const handleDurabilityChange = (rating: number, checked: boolean) => {
    const updated = checked
      ? [...filters.durabilityRating, rating]
      : filters.durabilityRating.filter((r) => r !== rating);
    onFiltersChange({ ...filters, durabilityRating: updated });
  };

  const handleAvailabilityChange = (status: string, checked: boolean) => {
    const updated = checked
      ? [...filters.availabilityStatus, status]
      : filters.availabilityStatus.filter((s) => s !== status);
    onFiltersChange({ ...filters, availabilityStatus: updated });
  };

  const handleApplicationChange = (app: string, checked: boolean) => {
    const updated = checked
      ? [...filters.applications, app]
      : filters.applications.filter((a) => a !== app);
    onFiltersChange({ ...filters, applications: updated });
  };

  const handleTextureChange = (texture: string, checked: boolean) => {
    const updated = checked
      ? [...filters.textures, texture]
      : filters.textures.filter((t) => t !== texture);
    onFiltersChange({ ...filters, textures: updated });
  };

  const getActiveFilterCount = () => {
    return (
      filters.materialTypes.length +
      filters.colors.length +
      filters.durabilityRating.length +
      filters.availabilityStatus.length +
      filters.applications.length +
      filters.textures.length +
      (filters.priceRange[0] > 0 || filters.priceRange[1] < 10000 ? 1 : 0)
    );
  };

  const activeCount = getActiveFilterCount();

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Material Filters
            {activeCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeCount} active
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {activeCount > 0 && (
              <Button variant="ghost" size="sm" onClick={onClearFilters}>
                <X className="h-4 w-4 mr-1" />
                Clear All
              </Button>
            )}
            {collapsible && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          {/* Material Type Filter */}
          <div className="space-y-2">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => toggleSection('materialType')}
            >
              <Label className="flex items-center gap-2 font-medium cursor-pointer">
                <Layers className="h-4 w-4" />
                Material Type ({filters.materialTypes.length})
              </Label>
              {expandedSections.materialType ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
            {expandedSections.materialType && (
              <div className="grid grid-cols-2 gap-2 pl-6">
                {MATERIAL_TYPES.map((type) => (
                  <div key={type} className="flex items-center space-x-2">
                    <Checkbox
                      id={`type-${type}`}
                      checked={filters.materialTypes.includes(type)}
                      onCheckedChange={(checked) =>
                        handleMaterialTypeChange(type, checked as boolean)
                      }
                    />
                    <Label htmlFor={`type-${type}`} className="text-sm cursor-pointer">
                      {type}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Color Filter */}
          <div className="space-y-2">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => toggleSection('color')}
            >
              <Label className="flex items-center gap-2 font-medium cursor-pointer">
                <Palette className="h-4 w-4" />
                Color ({filters.colors.length})
              </Label>
              {expandedSections.color ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
            {expandedSections.color && (
              <div className="grid grid-cols-2 gap-2 pl-6">
                {COLORS.map((color) => (
                  <div key={color} className="flex items-center space-x-2">
                    <Checkbox
                      id={`color-${color}`}
                      checked={filters.colors.includes(color)}
                      onCheckedChange={(checked) =>
                        handleColorChange(color, checked as boolean)
                      }
                    />
                    <Label htmlFor={`color-${color}`} className="text-sm cursor-pointer">
                      {color}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Price Range Filter */}
          <div className="space-y-2">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => toggleSection('price')}
            >
              <Label className="flex items-center gap-2 font-medium cursor-pointer">
                <DollarSign className="h-4 w-4" />
                Price Range
              </Label>
              {expandedSections.price ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
            {expandedSections.price && (
              <div className="space-y-3 pl-6">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>${filters.priceRange[0]}</span>
                  <span>${filters.priceRange[1]}</span>
                </div>
                <Slider
                  min={0}
                  max={10000}
                  step={100}
                  value={filters.priceRange}
                  onValueChange={handlePriceRangeChange}
                  className="w-full"
                />
              </div>
            )}
          </div>

          {/* Durability Rating Filter */}
          <div className="space-y-2">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => toggleSection('durability')}
            >
              <Label className="flex items-center gap-2 font-medium cursor-pointer">
                <Shield className="h-4 w-4" />
                Durability Rating ({filters.durabilityRating.length})
              </Label>
              {expandedSections.durability ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
            {expandedSections.durability && (
              <div className="flex gap-2 pl-6">
                {[1, 2, 3, 4, 5].map((rating) => (
                  <div key={rating} className="flex items-center space-x-1">
                    <Checkbox
                      id={`rating-${rating}`}
                      checked={filters.durabilityRating.includes(rating)}
                      onCheckedChange={(checked) =>
                        handleDurabilityChange(rating, checked as boolean)
                      }
                    />
                    <Label htmlFor={`rating-${rating}`} className="text-sm cursor-pointer">
                      {rating}★
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Availability Status Filter */}
          <div className="space-y-2">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => toggleSection('availability')}
            >
              <Label className="flex items-center gap-2 font-medium cursor-pointer">
                <Package className="h-4 w-4" />
                Availability ({filters.availabilityStatus.length})
              </Label>
              {expandedSections.availability ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
            {expandedSections.availability && (
              <div className="grid grid-cols-2 gap-2 pl-6">
                {AVAILABILITY_STATUS.map((status) => (
                  <div key={status} className="flex items-center space-x-2">
                    <Checkbox
                      id={`status-${status}`}
                      checked={filters.availabilityStatus.includes(status)}
                      onCheckedChange={(checked) =>
                        handleAvailabilityChange(status, checked as boolean)
                      }
                    />
                    <Label htmlFor={`status-${status}`} className="text-sm cursor-pointer">
                      {status}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Application Filter */}
          <div className="space-y-2">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => toggleSection('application')}
            >
              <Label className="flex items-center gap-2 font-medium cursor-pointer">
                <Building2 className="h-4 w-4" />
                Application ({filters.applications.length})
              </Label>
              {expandedSections.application ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
            {expandedSections.application && (
              <div className="grid grid-cols-2 gap-2 pl-6">
                {APPLICATIONS.map((app) => (
                  <div key={app} className="flex items-center space-x-2">
                    <Checkbox
                      id={`app-${app}`}
                      checked={filters.applications.includes(app)}
                      onCheckedChange={(checked) =>
                        handleApplicationChange(app, checked as boolean)
                      }
                    />
                    <Label htmlFor={`app-${app}`} className="text-sm cursor-pointer">
                      {app}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Texture Filter */}
          <div className="space-y-2">
            <div
              className="flex items-center justify-between cursor-pointer"
              onClick={() => toggleSection('texture')}
            >
              <Label className="flex items-center gap-2 font-medium cursor-pointer">
                <Sparkles className="h-4 w-4" />
                Texture ({filters.textures.length})
              </Label>
              {expandedSections.texture ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </div>
            {expandedSections.texture && (
              <div className="grid grid-cols-2 gap-2 pl-6">
                {TEXTURES.map((texture) => (
                  <div key={texture} className="flex items-center space-x-2">
                    <Checkbox
                      id={`texture-${texture}`}
                      checked={filters.textures.includes(texture)}
                      onCheckedChange={(checked) =>
                        handleTextureChange(texture, checked as boolean)
                      }
                    />
                    <Label htmlFor={`texture-${texture}`} className="text-sm cursor-pointer">
                      {texture}
                    </Label>
                  </div>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
};

