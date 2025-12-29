/**
 * Product Detail Modal
 * Global component for displaying full product/material details
 * Supports category-based templates for different material types
 * Fetches images from product_image_relationships table
 */

import React, { useState, useEffect } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChevronLeft, ChevronRight, Factory, Info, Activity, Loader2 } from 'lucide-react';
import { Product, getMaterialCategory, MaterialCategory } from './types';
import { AddToQuoteButton } from '@/components/Quotes/AddToQuoteButton';
import { AddToMoodboardButton } from '@/components/MoodBoard/AddToMoodboardButton';
import { SimilarMaterials } from '@/components/recommendations';
import { ProductMonitorTab } from '@/components/PriceMonitoring/ProductMonitorTab';
import { supabase } from '@/integrations/supabase/client';

interface ProductDetailModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  categoryColor?: string;
}

// Helper to extract value from {value, confidence} objects or plain values
const extractValue = (val: unknown): string | undefined => {
  if (val === null || val === undefined) return undefined;
  if (typeof val === 'object' && 'value' in (val as Record<string, unknown>)) {
    return String((val as Record<string, unknown>).value);
  }
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
};

// Get category-specific color theme
const getCategoryTheme = (category: MaterialCategory): { primary: string; secondary: string } => {
  const themes: Record<MaterialCategory, { primary: string; secondary: string }> = {
    tiles: { primary: '#3b82f6', secondary: '#dbeafe' },
    wood: { primary: '#92400e', secondary: '#fef3c7' },
    stone: { primary: '#6b7280', secondary: '#f3f4f6' },
    paint: { primary: '#7c3aed', secondary: '#ede9fe' },
    fabric: { primary: '#db2777', secondary: '#fce7f3' },
    metal: { primary: '#374151', secondary: '#e5e7eb' },
    glass: { primary: '#0891b2', secondary: '#cffafe' },
    composite: { primary: '#059669', secondary: '#d1fae5' },
    other: { primary: '#6b7280', secondary: '#f3f4f6' },
  };
  return themes[category];
};

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  isOpen,
  onClose,
  categoryColor,
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [images, setImages] = useState<any[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(true);

  if (!product) return null;

  const materialCategory = getMaterialCategory(product);
  const theme = getCategoryTheme(materialCategory);
  const effectiveColor = categoryColor || theme.primary;

  // Load images from product_image_relationships when modal opens
  useEffect(() => {
    const loadImages = async () => {
      if (!product?.id) return;

      try {
        setIsLoadingImages(true);
        console.log('[ProductDetailModal] Loading images for product:', product.id, product.name);

        // Fetch images from product_image_relationships table
        const { data: imageRelations, error } = await supabase
          .from('product_image_relationships')
          .select(`
            image_id,
            relevance_score,
            relationship_type,
            created_at,
            document_images (
              id,
              image_url,
              page_number,
              caption,
              metadata
            )
          `)
          .eq('product_id', product.id)
          .order('relevance_score', { ascending: false });

        if (error) {
          console.error('[ProductDetailModal] Error loading images:', error);
          setImages([]);
          return;
        }

        if (imageRelations && imageRelations.length > 0) {
          // Extract images with relationship metadata
          const loadedImages = imageRelations
            .filter(rel => rel.document_images)
            .map(rel => ({
              id: rel.document_images.id,
              url: rel.document_images.image_url,
              page_number: rel.document_images.page_number,
              caption: rel.document_images.caption,
              metadata: rel.document_images.metadata,
              relationship_score: rel.relevance_score,
              relationship_type: rel.relationship_type,
            }));

          console.log('[ProductDetailModal] Loaded images:', loadedImages.length);
          setImages(loadedImages);
        } else {
          console.log('[ProductDetailModal] No images found for product');
          setImages([]);
        }
      } catch (error) {
        console.error('[ProductDetailModal] Failed to load images:', error);
        setImages([]);
      } finally {
        setIsLoadingImages(false);
      }
    };

    if (isOpen) {
      loadImages();
    }
  }, [product?.id, isOpen]);

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) =>
      prev === 0 ? images.length - 1 : prev - 1
    );
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) =>
      prev === images.length - 1 ? 0 : prev + 1
    );
  };

  const currentImage = images[currentImageIndex];

  // Extract key metadata from all possible sources
  const allData = {
    ...product.metadata,
    ...product.properties,
    ...product.specifications
  };

  // Extract from correct nested paths
  const designData = allData?.design || {};
  const appearanceData = allData?.appearance || {};
  const materialPropsData = allData?.material_properties || {};
  const applicationData = allData?.application || {};
  const dimensionsData = allData?.dimensions || [];

  const factory = allData?.factory_name || allData?.factory_group_name || 'Unknown Factory';
  const origin = allData?.origin || allData?.country_of_origin || '';
  const collection = designData?.collection || allData?.collection || '';

  // Extract tile dimensions from available_sizes or dimensions (not page_range!)
  const availableSizes = allData?.available_sizes || dimensionsData || [];
  const size = Array.isArray(availableSizes) && availableSizes.length > 0
    ? availableSizes.map((d: unknown) => {
        if (typeof d === 'object' && d !== null) {
          const dim = d as Record<string, unknown>;
          // Format: width x height (e.g., "15×38 cm")
          if (dim.width && dim.height) {
            const unit = dim.unit || 'cm';
            return `${dim.width}×${dim.height}${dim.depth ? `×${dim.depth}` : ''} ${unit}`;
          }
          return JSON.stringify(d);
        }
        return String(d);
      }).join(', ')
    : extractValue(allData?.dimensions) || 'N/A';
  const thickness = extractValue(materialPropsData?.thickness) || 'N/A';
  const finish = extractValue(materialPropsData?.finish) || 'N/A';
  const material = allData?.material_category || product.type || 'N/A';

  // Metadata categories
  const materialProperties = {
    'Material Category': material,
    'Composition': extractValue(materialPropsData?.composition),
    'Body Type': extractValue(materialPropsData?.body_type),
    'Finish': finish,
    'Patterns': extractValue(materialPropsData?.patterns),
    'Surface': extractValue(materialPropsData?.surface),
    'Thickness': thickness
  };

  const dimensions = {
    'Available Sizes': size,
    'Thickness': thickness !== 'N/A' ? thickness : undefined,
  };

  const appearance = {
    'Colors': extractValue(appearanceData?.colors),
    'Shade Variation': extractValue(appearanceData?.shade_variation),
    'Visual Effect': extractValue(appearanceData?.visual_effect),
  };

  const performance = {
    'Traffic Level': extractValue(applicationData?.traffic_level),
    'Slip Resistance': extractValue(materialPropsData?.slip_resistance),
    'Water Resistance': extractValue(materialPropsData?.water_resistance),
    'Fire Rating': extractValue(materialPropsData?.fire_rating)
  };

  const application = {
    'Recommended Use': extractValue(applicationData?.recommended_use),
    'Installation': extractValue(applicationData?.installation),
  };

  const design = {
    'Designer': Array.isArray(designData?.designers)
      ? designData.designers.join(', ')
      : extractValue(designData?.designers) || extractValue(designData?.studio),
    'Collection': collection,
    'Brand': extractValue(designData?.brand),
  };

  const manufacturing = {
    'Factory': factory,
    'Factory Group': allData?.factory_group_name || undefined,
    'Country of Origin': origin || undefined
  };

  // Helper function to render metadata category
  const renderMetadataCategory = (title: string, data: Record<string, unknown>) => {
    const filteredData = Object.entries(data).filter(([, value]) => value && value !== 'N/A' && value !== '');
    if (filteredData.length === 0) return null;

    return (
      <Card className="bg-white border-gray-200">
        <CardHeader className="bg-gray-50 border-b border-gray-200 py-3">
          <CardTitle className="text-base font-bold text-gray-900">{title}</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {filteredData.map(([key, value]) => (
              <div key={key} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{key}</p>
                <p className="text-sm font-bold text-gray-900">
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-white">
        {/* Header with Factory/Brand Info */}
        <DialogHeader className="border-b pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Factory className="h-5 w-5 text-gray-600" />
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{factory}</span>
                  {origin && (
                    <>
                      <span className="text-gray-400">•</span>
                      <span className="text-sm text-gray-600">{origin}</span>
                    </>
                  )}
                </div>
              </div>
              <DialogTitle className="text-3xl font-bold text-gray-900 mb-1">
                {product.name}
              </DialogTitle>
              <div className="flex items-center gap-3 text-sm text-gray-600">
                {collection && <span className="font-medium">{collection}</span>}
                <span className="text-gray-400">•</span>
                <span>SKU: {product.sku}</span>
              </div>
            </div>
            <Badge
              className="text-sm px-3 py-1"
              style={{
                backgroundColor: `${effectiveColor}20`,
                color: effectiveColor,
                borderColor: effectiveColor,
                border: '1px solid',
              }}
            >
              {product.status}
            </Badge>
          </div>
          <DialogDescription className="text-base text-gray-700 mt-3">
            {product.description}
          </DialogDescription>
        </DialogHeader>

        {/* Tabs for Details and Monitor */}
        <Tabs defaultValue="details" className="mt-6">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="details" className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              Product Details
            </TabsTrigger>
            <TabsTrigger value="monitor" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Price Monitor
            </TabsTrigger>
          </TabsList>

          {/* Details Tab */}
          <TabsContent value="details" className="mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Column: Image Slider (3/5 width) */}
          <div className="lg:col-span-3 space-y-4">
            {isLoadingImages ? (
              <div className="relative aspect-square bg-gray-50 rounded-xl overflow-hidden border border-gray-200 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
              </div>
            ) : images.length > 0 ? (
              <>
                <div className="relative aspect-square bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
                  <img
                    src={currentImage?.url}
                    alt={product.name}
                    className="w-full h-full object-contain"
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      target.style.display = 'none';
                    }}
                  />
                  {images.length > 1 && (
                    <>
                      <Button
                        onClick={handlePrevImage}
                        variant="secondary"
                        size="icon"
                        className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white shadow-lg"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </Button>
                      <Button
                        onClick={handleNextImage}
                        variant="secondary"
                        size="icon"
                        className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white shadow-lg"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </Button>
                    </>
                  )}
                  <div className="absolute bottom-3 right-3 bg-black/70 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
                    {currentImageIndex + 1} / {images.length}
                    {currentImage?.page_number && ` • Page ${currentImage.page_number}`}
                  </div>
                </div>

                {/* Thumbnail Strip */}
                {images.length > 1 && (
                  <div className="flex gap-2 overflow-x-auto pb-2">
                    {images.map((image, index) => (
                      <button
                        key={image.id}
                        onClick={() => setCurrentImageIndex(index)}
                        className={`flex-shrink-0 w-20 h-20 rounded-lg border-2 overflow-hidden transition-all ${
                          index === currentImageIndex
                            ? 'border-gray-900 ring-2 ring-gray-900 ring-offset-2'
                            : 'border-gray-200 hover:border-gray-400'
                        }`}
                      >
                        <img src={image.url} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="relative aspect-square bg-gray-100 rounded-xl overflow-hidden border border-gray-200 flex items-center justify-center">
                <p className="text-gray-500">No images available</p>
              </div>
            )}
          </div>

          {/* Right Column: Technical Details (2/5 width) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Key Specifications Card */}
            <Card className="bg-gray-50 border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg font-bold text-gray-900">Key Specifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-600">Material</span>
                  <span className="text-sm font-semibold text-gray-900">{material}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-600">Size</span>
                  <span className="text-sm font-semibold text-gray-900">{size}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-600">Thickness</span>
                  <span className="text-sm font-semibold text-gray-900">{thickness}</span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm font-medium text-gray-600">Finish</span>
                  <span className="text-sm font-semibold text-gray-900">{finish}</span>
                </div>
              </CardContent>
            </Card>

            {/* Pricing & Stock */}
            <Card className="bg-white border-gray-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold text-gray-900">Pricing & Availability</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Retail Price</p>
                    <p className="text-xl font-bold text-gray-900">
                      {product.pricing.currency === 'EUR' ? '€' : '$'}
                      {product.pricing.retail.toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Wholesale</p>
                    <p className="text-xl font-bold text-gray-900">
                      {product.pricing.currency === 'EUR' ? '€' : '$'}
                      {product.pricing.wholesale.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="pt-3 border-t border-gray-200">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">In Stock:</span>
                    <Badge
                      className={`text-sm px-3 py-1 ${
                        product.stock.status === 'High'
                          ? 'bg-green-100 text-green-800 border-green-300'
                          : product.stock.status === 'Medium'
                            ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                            : 'bg-red-100 text-red-800 border-red-300'
                      }`}
                    >
                      {product.stock.quantity} {product.stock.unit}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <AddToQuoteButton
                productId={product.id}
                productName={product.name}
                productImage={currentImage?.url}
                variant="default"
                size="lg"
                className="w-full"
              />
              <AddToMoodboardButton
                productId={product.id}
                productName={product.name}
                productImage={currentImage?.url}
                variant="outline"
                size="lg"
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Metadata Sections */}
        <div className="mt-6 space-y-4">
          {renderMetadataCategory('Material Properties', materialProperties)}
          {renderMetadataCategory('Dimensions', dimensions)}
          {renderMetadataCategory('Appearance', appearance)}
          {renderMetadataCategory('Performance', performance)}
          {renderMetadataCategory('Application', application)}
          {renderMetadataCategory('Design', design)}
          {renderMetadataCategory('Manufacturing', manufacturing)}
        </div>

        {/* Tags Section */}
        <Card className="mt-4 bg-white border-gray-200">
          <CardHeader>
            <CardTitle className="text-base font-bold text-gray-900">Product Tags</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {product.tags.map((tag, index) => (
                <Badge
                  key={index}
                  variant="outline"
                  className="text-sm capitalize px-3 py-1 bg-gray-50 text-gray-700 border-gray-300 hover:bg-gray-100"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Similar Materials Section */}
        <div className="mt-6">
          <SimilarMaterials materialId={product.id} limit={10} />
        </div>
      </TabsContent>

      {/* Monitor Tab */}
      <TabsContent value="monitor" className="mt-6">
        <ProductMonitorTab
          productId={product.id}
          productName={product.name}
          currentPrice={product.pricing?.retail}
          currency={product.pricing?.currency}
        />
      </TabsContent>
    </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default ProductDetailModal;