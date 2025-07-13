import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Search, 
  Save, 
  ExternalLink, 
  Image as ImageIcon, 
  Package, 
  Tag,
  DollarSign,
  Building,
  Edit,
  Check,
  X
} from 'lucide-react';

interface ScrapedMaterial {
  name: string;
  description?: string;
  category?: string;
  price?: string;
  images: string[];
  properties: Record<string, any>;
  sourceUrl: string;
  supplier?: string;
}

interface ScrapedMaterialsViewerProps {
  materials: ScrapedMaterial[];
  onMaterialsUpdate: (materials: ScrapedMaterial[]) => void;
}

const materialCategories = [
  'metals', 'plastics', 'ceramics', 'composites', 'textiles',
  'wood', 'glass', 'rubber', 'concrete', 'other'
] as const;

type MaterialCategory = typeof materialCategories[number];

const effects = [
  'Wood', 'Stone & marble', 'Concrete', 'Brick', 'Metal',
  'Mother-of-pearl', 'Terracotta', 'Fabric', 'Leather', 'Encaustic',
  'Resin', 'Gold and precious metals', 'Terrazzo', 'Crackle glaze'
];

export const ScrapedMaterialsViewer: React.FC<ScrapedMaterialsViewerProps> = ({
  materials,
  onMaterialsUpdate
}) => {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [editingMaterial, setEditingMaterial] = useState<number | null>(null);
  const [savingMaterials, setSavingMaterials] = useState<Set<number>>(new Set());

  const filteredMaterials = materials.filter(material => {
    const matchesSearch = material.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         material.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         material.supplier?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = selectedCategory === 'all' || material.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const updateMaterial = (index: number, updates: Partial<ScrapedMaterial>) => {
    const updatedMaterials = [...materials];
    updatedMaterials[index] = { ...updatedMaterials[index], ...updates };
    onMaterialsUpdate(updatedMaterials);
  };

  const saveMaterialToCatalog = async (material: ScrapedMaterial, index: number) => {
    setSavingMaterials(prev => new Set(prev).add(index));
    
    try {
      const { data: user } = await supabase.auth.getUser();
      if (!user.user) {
        throw new Error('Please sign in to save materials');
      }

      // Prepare material data for database
      const validCategory: MaterialCategory = materialCategories.includes(material.category as MaterialCategory)
        ? (material.category as MaterialCategory)
        : 'other';

      const materialData = {
        name: material.name,
        description: material.description || '',
        category: validCategory,
        properties: {
          ...material.properties,
          price: material.price,
          supplier: material.supplier,
          sourceUrl: material.sourceUrl,
          effects: [material.category] // Using category as effect for now
        },
        chemical_composition: {},
        safety_data: {},
        standards: [],
        thumbnail_url: material.images[0] || null,
        created_by: user.user.id
      };

      const { error } = await supabase
        .from('materials_catalog')
        .insert(materialData);

      if (error) {
        console.error('Database error:', error);
        throw new Error('Failed to save material to catalog');
      }

      toast({
        title: "Success",
        description: `${material.name} saved to material catalog`,
      });

    } catch (error) {
      console.error('Save error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save material",
        variant: "destructive",
      });
    } finally {
      setSavingMaterials(prev => {
        const newSet = new Set(prev);
        newSet.delete(index);
        return newSet;
      });
    }
  };

  const MaterialCard: React.FC<{ material: ScrapedMaterial; index: number }> = ({ material, index }) => {
    const isEditing = editingMaterial === index;
    const isSaving = savingMaterials.has(index);

    return (
      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div className="flex-1">
              {isEditing ? (
                <Input
                  value={material.name}
                  onChange={(e) => updateMaterial(index, { name: e.target.value })}
                  className="font-semibold"
                />
              ) : (
                <CardTitle className="text-lg">{material.name}</CardTitle>
              )}
              
              <div className="flex flex-wrap gap-2 mt-2">
                <Badge variant="secondary" className="text-xs">
                  <Tag className="w-3 h-3 mr-1" />
                  {material.category || 'Uncategorized'}
                </Badge>
                {material.supplier && (
                  <Badge variant="outline" className="text-xs">
                    <Building className="w-3 h-3 mr-1" />
                    {material.supplier}
                  </Badge>
                )}
                {material.price && (
                  <Badge variant="outline" className="text-xs">
                    <DollarSign className="w-3 h-3 mr-1" />
                    {material.price}
                  </Badge>
                )}
              </div>
            </div>
            
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingMaterial(isEditing ? null : index)}
              >
                {isEditing ? <Check className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => window.open(material.sourceUrl, '_blank')}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-4">
          {/* Images */}
          {material.images.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1">
                <ImageIcon className="w-4 h-4" />
                Images ({material.images.length})
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {material.images.slice(0, 6).map((imageUrl, imgIndex) => (
                  <div key={imgIndex} className="relative aspect-square rounded overflow-hidden bg-muted">
                    <img
                      src={imageUrl}
                      alt={`${material.name} ${imgIndex + 1}`}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Description</Label>
            {isEditing ? (
              <Textarea
                value={material.description || ''}
                onChange={(e) => updateMaterial(index, { description: e.target.value })}
                rows={3}
              />
            ) : (
              <p className="text-sm text-muted-foreground">
                {material.description || 'No description available'}
              </p>
            )}
          </div>

          {/* Category Selection */}
          {isEditing && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Category</Label>
              <Select
                value={material.category || 'other'}
                onValueChange={(value) => updateMaterial(index, { category: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {materialCategories.map(category => (
                    <SelectItem key={category} value={category}>
                      {category.charAt(0).toUpperCase() + category.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Properties */}
          {Object.keys(material.properties).length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium flex items-center gap-1">
                <Package className="w-4 h-4" />
                Properties
              </Label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(material.properties).map(([key, value]) => (
                  value && (
                    <div key={key} className="bg-muted/50 p-2 rounded">
                      <span className="font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}:</span>
                      <br />
                      <span className="text-muted-foreground">{String(value)}</span>
                    </div>
                  )
                ))}
              </div>
            </div>
          )}

          {/* Save Button */}
          <Button
            onClick={() => saveMaterialToCatalog(material, index)}
            disabled={isSaving}
            className="w-full"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin mr-2" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save to Catalog
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  };

  if (materials.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Search className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Materials Found</h3>
          <p className="text-muted-foreground text-center">
            Start by scraping a material supplier website to see results here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label htmlFor="search" className="sr-only">Search materials</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search materials..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {materialCategories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category.charAt(0).toUpperCase() + category.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Results Summary */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">
          Scraped Materials ({filteredMaterials.length} of {materials.length})
        </h2>
        {materials.length > filteredMaterials.length && (
          <Badge variant="secondary">
            {materials.length - filteredMaterials.length} filtered out
          </Badge>
        )}
      </div>

      {/* Materials Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMaterials.map((material, index) => {
          const originalIndex = materials.findIndex(m => m === material);
          return (
            <MaterialCard
              key={`${material.name}-${originalIndex}`}
              material={material}
              index={originalIndex}
            />
          );
        })}
      </div>
    </div>
  );
};