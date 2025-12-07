import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  ChevronLeft,
  ChevronRight,
  Factory,
  Ruler,
  Palette,
  Zap,
  Wrench,
  Shield,
  Sparkles,
  Building2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface ProductDetailModalProps {
  product: any;
  onClose: () => void;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  onClose,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [images, setImages] = useState<any[]>([]);
  const [chunks, setChunks] = useState<any[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    loadProductDetails();
  }, [product.id]);

  const loadProductDetails = async () => {
    try {
      setIsLoading(true);
      console.log('[ProductDetailModal] Loading details for product:', product.id, product.name);

      // Load images related to this product
      const { data: imageRelations, error: relError } = await supabase
        .from('product_image_relationships')
        .select('image_id')
        .eq('product_id', product.id);

      console.log('[ProductDetailModal] Image relationships found:', imageRelations?.length || 0);
      if (relError) console.error('[ProductDetailModal] Error loading relationships:', relError);

      if (imageRelations && imageRelations.length > 0) {
        const imageIds = imageRelations.map((r) => r.image_id);
        const { data: imagesData, error: imgError } = await supabase
          .from('document_images')
          .select('*')
          .in('id', imageIds);

        console.log('[ProductDetailModal] Images loaded:', imagesData?.length || 0);
        if (imgError) console.error('[ProductDetailModal] Error loading images:', imgError);

        setImages(imagesData || []);
      }

      // Load chunks related to this product
      const { data: chunkRelations } = await supabase
        .from('chunk_product_relationships')
        .select('chunk_id')
        .eq('product_id', product.id);

      if (chunkRelations && chunkRelations.length > 0) {
        const chunkIds = chunkRelations.map((r) => r.chunk_id);
        const { data: chunksData } = await supabase
          .from('document_chunks')
          .select('*')
          .in('id', chunkIds);
        setChunks(chunksData || []);
      }
    } catch (error) {
      console.error('Failed to load product details:', error);
    } finally {
      setIsLoading(false);
    }
  };

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

  // Extract metadata from product - handling nested structure
  const allData = product.metadata || {};

  // Helper to extract value from {value, confidence} objects or plain values
  const extractValue = (val: unknown): string | undefined => {
    if (val === null || val === undefined) return undefined;
    if (typeof val === 'object' && 'value' in (val as Record<string, unknown>)) {
      return String((val as Record<string, unknown>).value);
    }
    if (Array.isArray(val)) return val.join(', ');
    return String(val);
  };

  // Extract from correct nested paths
  const factory = allData?.factory_name || allData?.factory_group_name || 'Unknown Factory';
  const collection = allData?.design?.collection || '';
  const designData = allData?.design || {};
  const appearanceData = allData?.appearance || {};
  const materialPropsData = allData?.material_properties || {};
  const applicationData = allData?.application || {};
  const commercialData = allData?.commercial || {};
  const dimensionsData = allData?.dimensions || [];

  // Get material category and finish from correct paths
  const material = allData?.material_category || 'N/A';
  const finish = extractValue(materialPropsData?.finish) || 'N/A';
  const thickness = extractValue(materialPropsData?.thickness) || 'N/A';

  // Organize metadata into categories - reading from correct nested paths
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
    'Size': Array.isArray(dimensionsData) && dimensionsData.length > 0
      ? dimensionsData.map((d: unknown) => typeof d === 'object' ? JSON.stringify(d) : String(d)).join(', ')
      : 'N/A',
    'Page Range': allData?.page_range?.join(' - ') || 'N/A'
  };

  const appearance = {
    'Colors': extractValue(appearanceData?.colors),
    'Shade Variation': extractValue(appearanceData?.shade_variation),
    'Visual Effect': extractValue(appearanceData?.visual_effect),
    'Color Variants': Object.keys(appearanceData)
      .filter(k => k.startsWith('color_'))
      .map(k => extractValue(appearanceData[k]))
      .filter(Boolean)
      .join(', ') || undefined
  };

  const performance = {
    'Traffic Level': extractValue(applicationData?.traffic_level),
    'Slip Resistance': extractValue(materialPropsData?.slip_resistance),
    'Water Resistance': extractValue(materialPropsData?.water_resistance)
  };

  const application = {
    'Recommended Use': extractValue(applicationData?.recommended_use),
    'Installation': extractValue(applicationData?.installation),
    'Recommended Joint (Mapei)': extractValue(applicationData?.recommended_joint_color_mapei),
    'Recommended Joint (Kerakoll)': extractValue(applicationData?.recommended_joint_color_kerakoll)
  };

  const compliance = {
    'Certifications': extractValue(allData?.certifications),
    'Standards': extractValue(allData?.standards)
  };

  const design = {
    'Designer': Array.isArray(designData?.designers)
      ? designData.designers.join(', ')
      : extractValue(designData?.designers) || extractValue(designData?.studio),
    'Collection': collection,
    'Brand': extractValue(designData?.brand),
    'Aesthetic Style': extractValue(designData?.aesthetic_style),
    'Philosophy': extractValue(designData?.philosophy)
  };

  const manufacturing = {
    'Factory': factory,
    'Factory Group': allData?.factory_group_name || undefined,
    'SKU Codes': commercialData?.sku_codes
      ? Object.entries(commercialData.sku_codes).map(([k, v]) => `${k}: ${v}`).join(', ')
      : undefined,
    'Grout Codes': extractValue(commercialData?.grout_color_codes?.codes)
  };

  const renderMetadataSection = (title: string, data: Record<string, any>, icon?: React.ReactNode) => {
    const filteredData = Object.entries(data).filter(([_, value]) => value !== undefined && value !== null && value !== 'N/A' && value !== '');

    if (filteredData.length === 0) return null;

    return (
      <Card className="bg-white border-gray-200">
        <CardHeader className="bg-gray-50 border-b border-gray-200">
          <CardTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
            {icon || <Factory className="h-5 w-5 text-gray-700" />}
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {filteredData.map(([key, value]) => (
              <div key={key} className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:border-gray-400 transition-colors">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  {key}
                </p>
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
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-3xl font-bold">{product.name}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column: Image Slider */}
            <div className="space-y-4">
              {images.length > 0 ? (
                <>
                  <div className="relative bg-gray-100 rounded-lg overflow-hidden aspect-square">
                    <img
                      src={images[currentImageIndex]?.image_url}
                      alt={product.name}
                      className="w-full h-full object-contain"
                    />
                    {images.length > 1 && (
                      <>
                        <Button
                          onClick={handlePrevImage}
                          className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white"
                          size="icon"
                          variant="outline"
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          onClick={handleNextImage}
                          className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white"
                          size="icon"
                          variant="outline"
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                  {images.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto">
                      {images.map((image, idx) => (
                        <button
                          key={image.id}
                          onClick={() => setCurrentImageIndex(idx)}
                          className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                            idx === currentImageIndex
                              ? 'border-primary'
                              : 'border-gray-200 hover:border-gray-400'
                          }`}
                        >
                          <img
                            src={image.image_url}
                            alt={`Thumbnail ${idx + 1}`}
                            className="w-full h-full object-cover"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="text-sm text-muted-foreground text-center">
                    Image {currentImageIndex + 1} of {images.length}
                    {images[currentImageIndex]?.page_number && (
                      <> • Page {images[currentImageIndex].page_number}</>
                    )}
                  </div>
                </>
              ) : (
                <div className="bg-gray-100 rounded-lg aspect-square flex items-center justify-center">
                  <p className="text-muted-foreground">No images available</p>
                </div>
              )}

              {/* Chunks Section */}
              {chunks.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Product Description</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {chunks.slice(0, 3).map((chunk, index) => (
                      <div key={chunk.id} className="text-sm text-gray-700 leading-relaxed">
                        {chunk.content}
                      </div>
                    ))}
                    {chunks.length > 3 && (
                      <p className="text-xs text-muted-foreground">
                        +{chunks.length - 3} more chunks
                      </p>
                    )}
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column: Product Details */}
            <div className="space-y-4 overflow-y-auto max-h-[calc(90vh-8rem)]">
              {/* Factory/Manufacturer */}
              {factory && factory !== 'Unknown Factory' && (
                <div className="flex items-center gap-2 text-lg">
                  <Factory className="h-5 w-5 text-gray-600" />
                  <span className="font-semibold text-gray-900">{factory}</span>
                </div>
              )}

              {/* Category Badge */}
              {allData?.material_category && (
                <Badge className="text-sm px-3 py-1" style={{ backgroundColor: 'hsl(var(--primary))' }}>
                  {allData.material_category}
                </Badge>
              )}

              {/* Metadata Sections */}
              {renderMetadataSection('Material Properties', materialProperties, <Sparkles className="h-5 w-5" />)}
              {renderMetadataSection('Dimensions', dimensions, <Ruler className="h-5 w-5" />)}
              {renderMetadataSection('Appearance', appearance, <Palette className="h-5 w-5" />)}
              {renderMetadataSection('Performance', performance, <Zap className="h-5 w-5" />)}
              {renderMetadataSection('Application', application, <Wrench className="h-5 w-5" />)}
              {renderMetadataSection('Compliance & Certifications', compliance, <Shield className="h-5 w-5" />)}
              {renderMetadataSection('Design', design, <Sparkles className="h-5 w-5" />)}
              {renderMetadataSection('Manufacturing', manufacturing, <Building2 className="h-5 w-5" />)}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

