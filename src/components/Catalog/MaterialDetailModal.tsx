import React from 'react';
import { Material } from '@/types/materials';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Camera, Edit, Heart, Share2, Download, Calendar, User } from 'lucide-react';

interface MaterialDetailModalProps {
  material: Material | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (material: Material) => void;
}

export const MaterialDetailModal: React.FC<MaterialDetailModalProps> = ({
  material,
  isOpen,
  onClose,
  onEdit
}) => {
  if (!material) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl">{material.name}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Material Image */}
          <div className="space-y-4">
            <div className="aspect-square bg-muted rounded-lg overflow-hidden">
              {material.imageUrl ? (
                <img
                  src={material.imageUrl}
                  alt={material.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Camera className="w-16 h-16 text-muted-foreground" />
                </div>
              )}
            </div>
            
            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => onEdit?.(material)} className="flex-1">
                <Edit className="w-4 h-4 mr-2" />
                Edit Material
              </Button>
              <Button variant="outline" size="icon">
                <Heart className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon">
                <Share2 className="w-4 h-4" />
              </Button>
              <Button variant="outline" size="icon">
                <Download className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Material Details */}
          <div className="space-y-6">
            {/* Basic Information */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{material.category}</Badge>
                {material.metadata.brand && (
                  <Badge variant="secondary">{material.metadata.brand}</Badge>
                )}
              </div>
              
              {material.description && (
                <p className="text-muted-foreground">{material.description}</p>
              )}
            </div>

            <Separator />

            {/* Material Properties */}
            <div className="space-y-4">
              <h3 className="font-semibold">Material Properties</h3>
              
              <div className="grid grid-cols-2 gap-4">
                {material.metadata.color && (
                  <div>
                    <span className="text-sm text-muted-foreground">Color</span>
                    <p className="font-medium capitalize">{material.metadata.color}</p>
                  </div>
                )}
                
                {material.metadata.finish && (
                  <div>
                    <span className="text-sm text-muted-foreground">Finish</span>
                    <p className="font-medium capitalize">{material.metadata.finish}</p>
                  </div>
                )}
                
                {material.metadata.size && (
                  <div>
                    <span className="text-sm text-muted-foreground">Size</span>
                    <p className="font-medium">{material.metadata.size}</p>
                  </div>
                )}
                
                {material.metadata.brand && (
                  <div>
                    <span className="text-sm text-muted-foreground">Brand</span>
                    <p className="font-medium">{material.metadata.brand}</p>
                  </div>
                )}
              </div>
            </div>

            {/* SVBRDF Properties */}
            {material.metadata.properties && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="font-semibold">Surface Properties</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    {material.metadata.properties.diffuse && (
                      <div>
                        <span className="text-sm text-muted-foreground">Diffuse Color</span>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-6 h-6 rounded border"
                            style={{ backgroundColor: material.metadata.properties.diffuse }}
                          />
                          <span className="font-mono text-sm">
                            {material.metadata.properties.diffuse}
                          </span>
                        </div>
                      </div>
                    )}
                    
                    {material.metadata.properties.roughness !== undefined && (
                      <div>
                        <span className="text-sm text-muted-foreground">Roughness</span>
                        <p className="font-medium">
                          {(material.metadata.properties.roughness * 100).toFixed(0)}%
                        </p>
                      </div>
                    )}
                    
                    {material.metadata.properties.metallic !== undefined && (
                      <div>
                        <span className="text-sm text-muted-foreground">Metallic</span>
                        <p className="font-medium">
                          {(material.metadata.properties.metallic * 100).toFixed(0)}%
                        </p>
                      </div>
                    )}
                    
                    {material.metadata.properties.specular && (
                      <div>
                        <span className="text-sm text-muted-foreground">Specular</span>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-6 h-6 rounded border"
                            style={{ backgroundColor: material.metadata.properties.specular }}
                          />
                          <span className="font-mono text-sm">
                            {material.metadata.properties.specular}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <Separator />

            {/* Metadata */}
            <div className="space-y-4">
              <h3 className="font-semibold">Metadata</h3>
              
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>Created: {material.createdAt.toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>Updated: {material.updatedAt.toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <User className="w-4 h-4" />
                  <span>ID: {material.id}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};