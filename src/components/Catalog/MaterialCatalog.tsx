import React, { useState, useEffect } from 'react';
import { Material } from '@/types/materials';
import { materialCatalogAPI } from '@/services/materialCatalogAPI';
import { CatalogFilters, FilterOptions } from './CatalogFilters';
import { MaterialCard } from './MaterialCard';
import { MaterialDetailModal } from './MaterialDetailModal';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, RefreshCw, Grid3X3, List, Package } from 'lucide-react';

export const MaterialCatalog: React.FC = () => {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [filteredMaterials, setFilteredMaterials] = useState<Material[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [filters, setFilters] = useState<FilterOptions>({
    searchQuery: '',
    category: 'all',
    color: '',
    finish: '',
    brand: '',
    sortBy: 'name',
    sortOrder: 'asc'
  });

  // Load materials on component mount
  useEffect(() => {
    loadMaterials();
  }, []);

  // Apply filters when materials or filters change
  useEffect(() => {
    applyFilters();
  }, [materials, filters]);

  const loadMaterials = async () => {
    setIsLoading(true);
    try {
      const data = await materialCatalogAPI.getAllMaterials();
      setMaterials(data);
    } catch (error) {
      console.error('Error loading materials:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...materials];

    // Search filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter(material =>
        material.name.toLowerCase().includes(query) ||
        material.description?.toLowerCase().includes(query) ||
        material.metadata.brand?.toLowerCase().includes(query) ||
        material.metadata.color?.toLowerCase().includes(query)
      );
    }

    // Category filter
    if (filters.category !== 'all') {
      filtered = filtered.filter(material => material.category === filters.category);
    }

    // Color filter
    if (filters.color) {
      filtered = filtered.filter(material => material.metadata.color === filters.color);
    }

    // Finish filter
    if (filters.finish) {
      filtered = filtered.filter(material => material.metadata.finish === filters.finish);
    }

    // Brand filter
    if (filters.brand) {
      filtered = filtered.filter(material => material.metadata.brand === filters.brand);
    }

    // Sorting
    filtered.sort((a, b) => {
      let aValue: string | Date;
      let bValue: string | Date;

      switch (filters.sortBy) {
        case 'name':
          aValue = a.name;
          bValue = b.name;
          break;
        case 'date':
          aValue = a.createdAt;
          bValue = b.createdAt;
          break;
        case 'category':
          aValue = a.category;
          bValue = b.category;
          break;
        default:
          aValue = a.name;
          bValue = b.name;
      }

      if (filters.sortOrder === 'desc') {
        [aValue, bValue] = [bValue, aValue];
      }

      if (aValue < bValue) return -1;
      if (aValue > bValue) return 1;
      return 0;
    });

    setFilteredMaterials(filtered);
  };

  const handleViewMaterial = (material: Material) => {
    setSelectedMaterial(material);
    setIsDetailModalOpen(true);
  };

  const handleEditMaterial = (material: Material) => {
    // TODO: Implement edit functionality
    console.log('Edit material:', material);
  };

  const handleFavoriteMaterial = (material: Material) => {
    // TODO: Implement favorite functionality
    console.log('Favorite material:', material);
  };

  const refreshCatalog = () => {
    loadMaterials();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Material Catalog</h1>
          <p className="text-muted-foreground">
            Browse and manage your material library
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="icon"
            onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
          >
            {viewMode === 'grid' ? <List className="w-4 h-4" /> : <Grid3X3 className="w-4 h-4" />}
          </Button>
          <Button variant="outline" size="icon" onClick={refreshCatalog}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Add Material
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Materials</p>
                <p className="text-2xl font-bold">{materials.length}</p>
              </div>
              <Package className="w-8 h-8 text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Filtered Results</p>
                <p className="text-2xl font-bold">{filteredMaterials.length}</p>
              </div>
              <Badge variant="secondary">{((filteredMaterials.length / materials.length) * 100).toFixed(0)}%</Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Categories</p>
                <p className="text-2xl font-bold">
                  {new Set(materials.map(m => m.category)).size}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Brands</p>
                <p className="text-2xl font-bold">
                  {new Set(materials.map(m => m.metadata.brand).filter(Boolean)).size}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <CatalogFilters
        filters={filters}
        onFiltersChange={setFilters}
        materials={materials}
        isLoading={isLoading}
      />

      {/* Materials Grid/List */}
      {isLoading ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" />
            <p className="text-muted-foreground">Loading materials...</p>
          </CardContent>
        </Card>
      ) : filteredMaterials.length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center">
            <Package className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">No materials found</h3>
            <p className="text-muted-foreground mb-4">
              {materials.length === 0 
                ? 'No materials in the catalog yet.'
                : 'Try adjusting your search or filter criteria.'
              }
            </p>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add First Material
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className={
          viewMode === 'grid' 
            ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
            : 'space-y-4'
        }>
          {filteredMaterials.map((material) => (
            <MaterialCard
              key={material.id}
              material={material}
              onView={handleViewMaterial}
              onEdit={handleEditMaterial}
              onFavorite={handleFavoriteMaterial}
            />
          ))}
        </div>
      )}

      {/* Material Detail Modal */}
      <MaterialDetailModal
        material={selectedMaterial}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedMaterial(null);
        }}
        onEdit={handleEditMaterial}
      />
    </div>
  );
};