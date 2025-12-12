/**
 * Asset Library Panel - Left panel with asset categories and search
 */
import React, { useState } from 'react';
import { Search, Package, Sofa, Utensils, Bed, Lamp } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { useAssetStore } from '@/stores/assetStore';
import { useUIStore } from '@/stores/uiStore';
import { cn } from '@/lib/utils';
import { assetLibrary } from '@/data/assetLibrary';

// Categories with counts from asset library
const categories = [
  {
    id: 'kitchen',
    name: 'Kitchen',
    icon: Utensils,
    count: assetLibrary.filter(a => a.category_id === 'kitchen').length
  },
  {
    id: 'living-room',
    name: 'Living Room',
    icon: Sofa,
    count: assetLibrary.filter(a => a.category_id === 'living-room').length
  },
  {
    id: 'bedroom',
    name: 'Bedroom',
    icon: Bed,
    count: assetLibrary.filter(a => a.category_id === 'bedroom').length
  },
  {
    id: 'lighting',
    name: 'Lighting',
    icon: Lamp,
    count: assetLibrary.filter(a => a.category_id === 'lighting').length
  },
  {
    id: 'storage',
    name: 'Storage',
    icon: Package,
    count: assetLibrary.filter(a => a.category_id === 'storage').length
  },
];

export const AssetLibraryPanel: React.FC = () => {
  const { selectedCategory, setSelectedCategory, searchQuery, setSearchQuery } = useAssetStore();
  const { setHoveredAssetId, setIsDragging } = useUIStore();
  const [hoveredAsset, setHoveredAsset] = useState<string | null>(null);

  const filteredAssets = assetLibrary.filter((asset) => {
    const matchesCategory = !selectedCategory || asset.category_id === selectedCategory;
    const matchesSearch =
      !searchQuery || asset.name.toLowerCase().includes(searchQuery.toLowerCase());
    const isActive = asset.is_active;
    return matchesCategory && matchesSearch && isActive;
  });

  const handleDragStart = (e: React.DragEvent, assetId: string) => {
    e.dataTransfer.setData('assetId', assetId);
    e.dataTransfer.effectAllowed = 'copy';
    setHoveredAssetId(assetId);
    setIsDragging(true);
  };

  const handleDragEnd = () => {
    setHoveredAssetId(null);
    setIsDragging(false);
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b p-4">
        <h2 className="mb-3 text-lg font-semibold">Asset Library</h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="border-b p-4">
        <h3 className="mb-2 text-sm font-medium text-muted-foreground">Categories</h3>
        <div className="space-y-1">
          <Button
            variant={selectedCategory === null ? 'secondary' : 'ghost'}
            className="w-full justify-start"
            onClick={() => setSelectedCategory(null)}
          >
            <Package className="mr-2 h-4 w-4" />
            All Assets
          </Button>
          {categories.map((category) => {
            const Icon = category.icon;
            return (
              <Button
                key={category.id}
                variant={selectedCategory === category.id ? 'secondary' : 'ghost'}
                className="w-full justify-start"
                onClick={() => setSelectedCategory(category.id)}
              >
                <Icon className="mr-2 h-4 w-4" />
                {category.name}
                <span className="ml-auto text-xs text-muted-foreground">{category.count}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Assets Grid */}
      <ScrollArea className="flex-1">
        <div className="grid grid-cols-2 gap-3 p-4">
          {filteredAssets.map((asset) => (
            <div
              key={asset.id}
              draggable
              onDragStart={(e) => handleDragStart(e, asset.id)}
              onDragEnd={handleDragEnd}
              onMouseEnter={() => setHoveredAsset(asset.id)}
              onMouseLeave={() => setHoveredAsset(null)}
              className={cn(
                'group cursor-move rounded-lg border bg-card p-2 transition-all hover:border-primary hover:shadow-md',
                hoveredAsset === asset.id && 'border-primary shadow-md'
              )}
            >
              <div className="mb-2 aspect-square overflow-hidden rounded-md bg-muted">
                <img
                  src={asset.thumbnail}
                  alt={asset.name}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="space-y-1">
                <p className="text-xs font-medium leading-none">{asset.name}</p>
                <p className="text-xs text-muted-foreground">{asset.dimensions}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
};

