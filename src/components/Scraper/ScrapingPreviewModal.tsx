/**
 * Scraping Preview Modal
 * 
 * Shows a preview of scraped materials before starting the full scraping session
 * Similar to XML preview - allows users to verify data accuracy
 */

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle,
  AlertTriangle,
  Play,
  Edit,
  Image as ImageIcon,
  Package,
  Factory,
  Tag,
  FileText,
  ChevronLeft,
  ChevronRight,
  Globe,
} from 'lucide-react';

interface PreviewMaterial {
  name: string;
  description?: string;
  category?: string;
  price?: string;
  images: string[];
  properties: Record<string, any>;
  supplier?: string;
}

interface ScrapingPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  materials: PreviewMaterial[];
  url: string;
  totalPages: number;
  onConfirm: () => void;
  onEdit: () => void;
}

export const ScrapingPreviewModal: React.FC<ScrapingPreviewModalProps> = ({
  isOpen,
  onClose,
  materials,
  url,
  totalPages,
  onConfirm,
  onEdit,
}) => {
  const [currentMaterialIndex, setCurrentMaterialIndex] = useState(0);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  if (materials.length === 0) return null;

  const currentMaterial = materials[currentMaterialIndex];
  const hasImages = currentMaterial.images && currentMaterial.images.length > 0;
  const currentImage = hasImages ? currentMaterial.images[currentImageIndex] : null;

  const nextMaterial = () => {
    if (currentMaterialIndex < materials.length - 1) {
      setCurrentMaterialIndex(currentMaterialIndex + 1);
      setCurrentImageIndex(0);
    }
  };

  const prevMaterial = () => {
    if (currentMaterialIndex > 0) {
      setCurrentMaterialIndex(currentMaterialIndex - 1);
      setCurrentImageIndex(0);
    }
  };

  const nextImage = () => {
    if (hasImages && currentImageIndex < currentMaterial.images.length - 1) {
      setCurrentImageIndex(currentImageIndex + 1);
    }
  };

  const prevImage = () => {
    if (currentImageIndex > 0) {
      setCurrentImageIndex(currentImageIndex - 1);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl flex items-center gap-2">
            <Globe className="h-6 w-6 text-primary" />
            Scraping Preview
          </DialogTitle>
          <DialogDescription>
            Found {materials.length} material{materials.length !== 1 ? 's' : ''} on sample page. 
            Review before scraping {totalPages} page{totalPages !== 1 ? 's' : ''}.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Material Navigation */}
          {materials.length > 1 && (
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
              <Button
                variant="outline"
                size="sm"
                onClick={prevMaterial}
                disabled={currentMaterialIndex === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">
                Material {currentMaterialIndex + 1} of {materials.length}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={nextMaterial}
                disabled={currentMaterialIndex === materials.length - 1}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Validation Status */}
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
            {currentMaterial.name ? (
              <>
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="text-sm font-medium">Material name found</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <span className="text-sm font-medium">Missing material name</span>
              </>
            )}
            {!hasImages && (
              <>
                <Separator orientation="vertical" className="h-5" />
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <span className="text-sm text-muted-foreground">No images</span>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Image Gallery */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Images {hasImages && `(${currentMaterial.images.length})`}
              </h3>
              <div className="relative aspect-square bg-muted rounded-lg overflow-hidden border">
                {currentImage ? (
                  <>
                    <img
                      src={currentImage}
                      alt={currentMaterial.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = '/placeholder-image.png';
                      }}
                    />
                    {currentMaterial.images.length > 1 && (
                      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-full">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-white hover:bg-white/20"
                          onClick={prevImage}
                          disabled={currentImageIndex === 0}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-xs text-white font-medium">
                          {currentImageIndex + 1} / {currentMaterial.images.length}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-white hover:bg-white/20"
                          onClick={nextImage}
                          disabled={currentImageIndex === currentMaterial.images.length - 1}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <div className="text-center">
                      <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No image available</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Material Details */}
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold flex items-center gap-2 mb-2">
                  <Package className="h-4 w-4" />
                  Material Name
                </h3>
                <p className="text-lg font-bold">{currentMaterial.name || 'N/A'}</p>
              </div>

              {currentMaterial.description && (
                <div>
                  <h3 className="font-semibold flex items-center gap-2 mb-2">
                    <FileText className="h-4 w-4" />
                    Description
                  </h3>
                  <p className="text-sm text-muted-foreground line-clamp-3">
                    {currentMaterial.description}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {currentMaterial.category && (
                  <div>
                    <h3 className="font-semibold flex items-center gap-2 mb-1 text-sm">
                      <Tag className="h-3 w-3" />
                      Category
                    </h3>
                    <Badge variant="secondary">{currentMaterial.category}</Badge>
                  </div>
                )}

                {currentMaterial.supplier && (
                  <div>
                    <h3 className="font-semibold flex items-center gap-2 mb-1 text-sm">
                      <Factory className="h-3 w-3" />
                      Supplier
                    </h3>
                    <p className="text-sm">{currentMaterial.supplier}</p>
                  </div>
                )}

                {currentMaterial.price && (
                  <div>
                    <h3 className="font-semibold flex items-center gap-2 mb-1 text-sm">
                      Price
                    </h3>
                    <p className="text-sm font-semibold text-green-600">
                      {currentMaterial.price}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Additional Properties */}
          {currentMaterial.properties && Object.keys(currentMaterial.properties).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Additional Properties
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(currentMaterial.properties)
                    .slice(0, 9)
                    .map(([key, value]) => (
                      <div key={key} className="bg-muted/50 rounded-lg p-2 border">
                        <p className="text-xs font-medium text-muted-foreground capitalize">
                          {key.replace(/_/g, ' ')}
                        </p>
                        <p className="text-sm font-semibold truncate" title={String(value)}>
                          {String(value)}
                        </p>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Scraping Summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Globe className="h-5 w-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-blue-900">Ready to Scrape</p>
                <p className="text-sm text-blue-700 mt-1">
                  This is a preview from <strong>{url}</strong>.
                  Clicking "Start Scraping" will process <strong>{totalPages}</strong> page{totalPages !== 1 ? 's' : ''}
                  with the same extraction settings.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Edit Settings
            </Button>
            <Button onClick={onConfirm} disabled={!currentMaterial.name}>
              <Play className="h-4 w-4 mr-2" />
              Start Scraping
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ScrapingPreviewModal;

