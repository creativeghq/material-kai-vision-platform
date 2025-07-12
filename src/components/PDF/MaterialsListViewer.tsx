import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Package, 
  Edit3, 
  Save, 
  X, 
  Plus,
  Image as ImageIcon,
  CheckCircle,
  AlertCircle,
  Tag,
  Palette
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface MaterialTile {
  id: string;
  page_number: number;
  tile_index: number;
  extracted_text: string;
  material_detected: boolean;
  material_type: string;
  material_confidence: number;
  structured_data: any;
  metadata_extracted: any;
  image_url?: string;
}

interface MaterialsListViewerProps {
  processingId: string;
  tiles: MaterialTile[];
}

interface DetectedMaterial {
  id: string;
  name: string;
  category: string;
  type: string;
  effects: string[];
  properties: Record<string, any>;
  confidence: number;
  sources: Array<{
    page: number;
    tile: number;
    text: string;
    image_url?: string;
  }>;
  catalogMatch?: {
    id: string;
    name: string;
    similarity: number;
  };
  metadata: Record<string, any>;
}

const MATERIAL_CATEGORIES = [
  'wood',
  'stone & marble', 
  'concrete',
  'brick',
  'metal',
  'mother-of-pearl',
  'terracotta',
  'fabric',
  'leather',
  'encaustic',
  'resin',
  'gold and precious metals',
  'terrazzo',
  'crackle glaze',
  'ceramics',
  'glass',
  'other'
];

export const MaterialsListViewer: React.FC<MaterialsListViewerProps> = ({ 
  processingId, 
  tiles 
}) => {
  const { toast } = useToast();
  const [materials, setMaterials] = useState<DetectedMaterial[]>([]);
  const [editingMaterial, setEditingMaterial] = useState<string | null>(null);
  const [catalogMaterials, setCatalogMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadMaterials();
    loadCatalogMaterials();
  }, [tiles]);

  const loadMaterials = () => {
    // Group tiles by material type to create consolidated materials
    const materialGroups: Record<string, MaterialTile[]> = {};
    
    tiles.filter(t => t.material_detected).forEach(tile => {
      const key = tile.material_type;
      if (!materialGroups[key]) {
        materialGroups[key] = [];
      }
      materialGroups[key].push(tile);
    });

    const detectedMaterials: DetectedMaterial[] = Object.entries(materialGroups).map(([type, groupTiles]) => {
      const firstTile = groupTiles[0];
      const avgConfidence = groupTiles.reduce((sum, t) => sum + (t.material_confidence || 0), 0) / groupTiles.length;
      
      // Extract properties and effects from structured data
      const properties: Record<string, any> = {};
      const effects: string[] = [];
      
      groupTiles.forEach(tile => {
        if (tile.structured_data) {
          Object.assign(properties, tile.structured_data);
        }
        if (tile.metadata_extracted?.effects) {
          effects.push(...tile.metadata_extracted.effects);
        }
      });

      return {
        id: `material-${type}-${Date.now()}`,
        name: type.charAt(0).toUpperCase() + type.slice(1),
        category: type,
        type: type,
        effects: [...new Set(effects)],
        properties,
        confidence: avgConfidence,
        sources: groupTiles.map(tile => ({
          page: tile.page_number,
          tile: tile.tile_index,
          text: tile.extracted_text,
          image_url: tile.image_url
        })),
        metadata: {
          processing_id: processingId,
          extraction_method: 'pdf_analysis',
          total_occurrences: groupTiles.length
        }
      };
    });

    setMaterials(detectedMaterials);
    setLoading(false);
  };

  const loadCatalogMaterials = async () => {
    try {
      const { data, error } = await supabase
        .from('materials_catalog')
        .select('id, name, category, properties, description')
        .limit(100);

      if (error) throw error;
      setCatalogMaterials(data || []);
    } catch (error) {
      console.error('Error loading catalog materials:', error);
    }
  };

  const saveMaterialToCatalog = async (material: DetectedMaterial) => {
    try {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('User not authenticated');

      const materialData = {
        name: material.name,
        category: material.category as any,
        description: `Extracted from PDF: ${material.sources.map(s => s.text).join('; ')}`,
        properties: {
          ...material.properties,
          effects: material.effects,
          confidence_score: material.confidence,
          extraction_sources: material.sources
        },
        created_by: userData.user.id
      };

      const { error } = await supabase
        .from('materials_catalog')
        .insert(materialData);

      if (error) throw error;

      toast({
        title: "Material Saved",
        description: `${material.name} has been added to the materials catalog.`,
      });

    } catch (error) {
      toast({
        title: "Save Failed",
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: "destructive",
      });
    }
  };

  const updateMaterial = (materialId: string, updates: Partial<DetectedMaterial>) => {
    setMaterials(prev => prev.map(m => 
      m.id === materialId ? { ...m, ...updates } : m
    ));
  };

  const filteredMaterials = materials.filter(material =>
    material.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    material.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    material.effects.some(effect => effect.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto mb-2"></div>
          <span>Processing materials...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Detected Materials</h3>
          <p className="text-sm text-muted-foreground">
            {materials.length} materials found across {tiles.filter(t => t.material_detected).length} tiles
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <Input
            placeholder="Search materials..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-64"
          />
        </div>
      </div>

      {filteredMaterials.length === 0 ? (
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No materials detected or found matching your search criteria.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-4">
          {filteredMaterials.map((material) => (
            <Card key={material.id} className="overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Package className="h-5 w-5 text-primary" />
                    {editingMaterial === material.id ? (
                      <Input
                        value={material.name}
                        onChange={(e) => updateMaterial(material.id, { name: e.target.value })}
                        className="font-semibold"
                      />
                    ) : (
                      <CardTitle className="text-lg">{material.name}</CardTitle>
                    )}
                    <Badge variant="outline" className="capitalize">
                      {material.category}
                    </Badge>
                    <Badge variant="secondary">
                      {Math.round(material.confidence * 100)}% confidence
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-2">
                    {editingMaterial === material.id ? (
                      <>
                        <Button 
                          size="sm" 
                          onClick={() => setEditingMaterial(null)}
                        >
                          <Save className="h-4 w-4 mr-1" />
                          Save
                        </Button>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setEditingMaterial(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => setEditingMaterial(material.id)}
                        >
                          <Edit3 className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                        <Button 
                          size="sm"
                          onClick={() => saveMaterialToCatalog(material)}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Add to Catalog
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-4">
                {/* Category and Type */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Category</Label>
                    {editingMaterial === material.id ? (
                      <Select 
                        value={material.category} 
                        onValueChange={(value) => updateMaterial(material.id, { category: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MATERIAL_CATEGORIES.map(cat => (
                            <SelectItem key={cat} value={cat} className="capitalize">
                              {cat}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="text-sm text-muted-foreground capitalize">{material.category}</p>
                    )}
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Type</Label>
                    {editingMaterial === material.id ? (
                      <Input
                        value={material.type}
                        onChange={(e) => updateMaterial(material.id, { type: e.target.value })}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground capitalize">{material.type}</p>
                    )}
                  </div>
                </div>

                {/* Effects */}
                {material.effects.length > 0 && (
                  <div>
                    <Label className="text-sm font-medium flex items-center gap-1">
                      <Palette className="h-4 w-4" />
                      Effects & Finishes
                    </Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {material.effects.map((effect, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {effect}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Properties */}
                {Object.keys(material.properties).length > 0 && (
                  <div>
                    <Label className="text-sm font-medium">Properties</Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-1">
                      {Object.entries(material.properties).map(([key, value]) => (
                        <div key={key} className="text-sm">
                          <span className="font-medium capitalize">{key.replace(/_/g, ' ')}:</span>
                          <span className="text-muted-foreground ml-1">
                            {typeof value === 'object' ? JSON.stringify(value) : value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Sources */}
                <div>
                  <Label className="text-sm font-medium">Source References ({material.sources.length})</Label>
                  <div className="space-y-2 mt-2">
                    {material.sources.slice(0, 3).map((source, index) => (
                      <div key={index} className="flex items-start space-x-3 p-3 bg-muted rounded-lg">
                        <div className="flex items-center space-x-1 text-xs text-muted-foreground">
                          <span>Page {source.page}</span>
                          <span>•</span>
                          <span>Tile {source.tile}</span>
                        </div>
                        {source.image_url && (
                          <ImageIcon className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        )}
                        <div className="flex-1">
                          <p className="text-sm">{source.text.substring(0, 200)}
                            {source.text.length > 200 && '...'}
                          </p>
                        </div>
                      </div>
                    ))}
                    {material.sources.length > 3 && (
                      <p className="text-xs text-muted-foreground">
                        +{material.sources.length - 3} more references
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};