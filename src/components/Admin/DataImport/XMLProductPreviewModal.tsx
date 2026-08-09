/**
 * XML Product Preview Modal
 *
 * Shows a preview of a single product before starting the import
 * Allows users to verify data accuracy and field mappings
 */

import React, { useState } from 'react';
import { formatLabel } from '@/lib/labelUtils';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Separator } from '@/components/core/ui/separator';
import { formatNumber } from '@/utils/decimal';
import {
  CheckCircle,
  AlertTriangle,
  Upload,
  Edit,
  Image as ImageIcon,
  Package,
  Factory,
  Tag,
  FileText,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

interface PreviewProduct {
  name: string;
  description?: string;
  factory_name: string;
  factory_group_name?: string;
  material_category: string;
  images: string[];
  metadata: Record<string, any>;
}

interface XMLProductPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: PreviewProduct | null;
  // Per-target provenance: 'xml' = value came from the mapped XML tag,
  // 'default' = filled in from the operator's job-level fallback in the
  // Fill-the-Gaps panel. Used to render the "from default" badge so the
  // operator sees exactly what their fallback covered.
  valueSources?: Record<string, 'xml' | 'default'>;
  onConfirm: () => void;
  onEdit: () => void;
  totalProducts: number;
}

const SourceBadge: React.FC<{ source?: 'xml' | 'default' }> = ({ source }) => {
  if (source === 'default') {
    return (
      <Badge variant="outline" className="text-[10px] h-4 px-1 border-warning/40 text-warning">
        from default
      </Badge>
    );
  }
  if (source === 'xml') {
    return (
      <Badge variant="outline" className="text-[10px] h-4 px-1 border-success/30 text-success">
        from XML
      </Badge>
    );
  }
  return null;
};

export const XMLProductPreviewModal: React.FC<XMLProductPreviewModalProps> = ({
  isOpen,
  onClose,
  product,
  valueSources = {},
  onConfirm,
  onEdit,
  totalProducts,
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  if (!product) return null;

  const hasAllRequiredFields = product.name && product.factory_name && product.material_category;
  const hasImages = product.images && product.images.length > 0;
  const currentImage = hasImages ? product.images[currentImageIndex] : null;

  const nextImage = () => {
    if (hasImages && currentImageIndex < product.images.length - 1) {
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
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-6 w-6 text-primary" />
            Product Preview
          </DialogTitle>
          <DialogDescription>
            Review this sample product before importing {formatNumber(totalProducts)} products
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Validation Status */}
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
            {hasAllRequiredFields ? (
              <>
                <CheckCircle className="h-5 w-5 text-success" />
                <span className="text-sm font-medium">All required fields present</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-5 w-5 text-warning" />
                <span className="text-sm font-medium">Missing required fields</span>
              </>
            )}
            {!hasImages && (
              <>
                <Separator orientation="vertical" className="h-5" />
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span className="text-sm text-muted-foreground">No images</span>
              </>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left: Image Gallery */}
            <div className="space-y-3">
              <h3 className="font-semibold flex items-center gap-2">
                <ImageIcon className="h-4 w-4" />
                Images {hasImages && `(${product.images.length})`}
              </h3>
              <div className="relative aspect-square bg-muted rounded-lg overflow-hidden border">
                {currentImage ? (
                  <>
                    <img
                      src={currentImage}
                      alt={product.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100"%3E%3Crect fill="%23f0f0f0" width="100" height="100"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" dy=".3em" fill="%23999"%3ENo Image%3C/text%3E%3C/svg%3E';
                      }}
                    />
                    {product.images.length > 1 && (
                      <div className="absolute bottom-2 left-0 right-0 flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={prevImage}
                          disabled={currentImageIndex === 0}
                          className="h-8 w-8 p-0"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <span className="text-xs bg-black/70 text-white px-2 py-1 rounded">
                          {currentImageIndex + 1} / {product.images.length}
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={nextImage}
                          disabled={currentImageIndex === product.images.length - 1}
                          className="h-8 w-8 p-0"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No images available</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: Product Details */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-lg">{product.name}</h3>
                  <SourceBadge source={valueSources.name} />
                </div>
                {product.description && (
                  <div className="flex items-start gap-2">
                    <p className="text-sm text-muted-foreground line-clamp-3 flex-1">
                      {product.description}
                    </p>
                    <SourceBadge source={valueSources.description} />
                  </div>
                )}
              </div>

              <Separator />

              {/* Required Fields */}
              <div className="space-y-3">
                <div className="flex items-start gap-2">
                  <Factory className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-muted-foreground">Brand</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{product.factory_name || '—'}</p>
                      <SourceBadge source={valueSources.factory_name} />
                    </div>
                  </div>
                  {product.factory_name ? (
                    <CheckCircle className="h-4 w-4 text-success" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-warning" />
                  )}
                </div>

                <div className="flex items-start gap-2">
                  <Tag className="h-4 w-4 mt-0.5 text-muted-foreground" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-muted-foreground">Material Category</p>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{product.material_category || '—'}</p>
                      <SourceBadge source={valueSources.material_category} />
                    </div>
                  </div>
                  {product.material_category ? (
                    <CheckCircle className="h-4 w-4 text-success" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-warning" />
                  )}
                </div>

                {product.factory_group_name && (
                  <div className="flex items-start gap-2">
                    <Package className="h-4 w-4 mt-0.5 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-xs font-medium text-muted-foreground">Brand Group</p>
                      <div className="flex items-center gap-2">
                        <p className="text-sm">{product.factory_group_name}</p>
                        <SourceBadge source={valueSources.factory_group_name} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Additional Metadata */}
          {product.metadata && Object.keys(product.metadata).length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Additional Fields
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(product.metadata)
                    .filter(([key]) => !['source_type', 'extraction_date', 'extraction_method'].includes(key))
                    .slice(0, 9)
                    .map(([key, value]) => (
                      <div key={key} className="bg-muted/50 rounded-lg p-2 border">
                        <p className="text-xs font-medium text-muted-foreground">
                          {formatLabel(key)}
                        </p>
                        <p className="text-sm font-semibold truncate" title={String(value)}>
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </p>
                      </div>
                    ))}
                </div>
                {Object.keys(product.metadata).length > 9 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    +{Object.keys(product.metadata).length - 9} more fields
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Import Summary */}
          <div className="bg-[hsl(var(--info-bg))] border border-[hsl(var(--info))]/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Upload className="h-5 w-5 text-[hsl(var(--info))] mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Ready to Import</p>
                <p className="text-sm text-muted-foreground mt-1">
                  This is a preview of 1 product. Clicking "Start Import" will process all{' '}
                  <strong>{formatNumber(totalProducts)}</strong> products with the same field mappings.
                </p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={onEdit}>
              <Edit className="h-4 w-4 mr-2" />
              Edit mappings
            </Button>
            <Button onClick={onConfirm} disabled={!hasAllRequiredFields}>
              <Upload className="h-4 w-4 mr-2" />
              Start import
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default XMLProductPreviewModal;


