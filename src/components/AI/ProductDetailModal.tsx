/**
 * Product Detail Modal
 * Displays full product/material details with image slider and metadata
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
import { ChevronLeft, ChevronRight, ShoppingCart, Factory } from 'lucide-react';
import { Product } from './ProductCard';

interface ProductDetailModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  categoryColor?: string;
}

export const ProductDetailModal: React.FC<ProductDetailModalProps> = ({
  product,
  isOpen,
  onClose,
  categoryColor = '#3b82f6',
}) => {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  if (!product) return null;

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) =>
      prev === 0 ? product.images.length - 1 : prev - 1
    );
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) =>
      prev === product.images.length - 1 ? 0 : prev + 1
    );
  };

  const currentImage = product.images[currentImageIndex];

  // Extract key metadata from all possible sources (metadata, properties, specifications)
  const allData = {
    ...product.metadata,
    ...product.properties,
    ...product.specifications
  };

  const factory = allData?.factory || allData?.manufacturer || 'Unknown Factory';
  const origin = allData?.origin || allData?.country_of_origin || '';
  const collection = allData?.collection || '';
  const size = allData?.size || allData?.dimensions || 'N/A';
  const thickness = allData?.thickness || 'N/A';
  const finish = allData?.finish || 'N/A';
  const material = allData?.material_type || allData?.material || product.type;

  // Organize metadata into comprehensive categories matching DynamicMetadataExtractor
  // Category 1: Material Properties
  const materialProperties = {
    'Material Type': material,
    'Composition': allData?.composition,
    'Type': allData?.type,
    'Blend': allData?.blend,
    'Fiber Content': allData?.fiber_content,
    'Texture': allData?.texture,
    'Finish': finish,
    'Pattern': allData?.pattern,
    'Weight': allData?.weight,
    'Density': allData?.density,
    'Durability Rating': allData?.durability_rating || allData?.durability
  };

  // Category 2: Dimensions
  const dimensions = {
    'Size': size,
    'Length': allData?.length,
    'Width': allData?.width,
    'Height': allData?.height,
    'Thickness': thickness,
    'Diameter': allData?.diameter,
    'Area': allData?.area,
    'Volume': allData?.volume
  };

  // Category 3: Appearance
  const appearance = {
    'Color': allData?.color,
    'Color Code': allData?.color_code,
    'Gloss Level': allData?.gloss_level,
    'Sheen': allData?.sheen,
    'Transparency': allData?.transparency,
    'Grain': allData?.grain,
    'Visual Effect': allData?.visual_effect
  };

  // Category 4: Performance
  const performance = {
    'Water Resistance': allData?.water_resistance || allData?.water_absorption,
    'Fire Rating': allData?.fire_rating,
    'Slip Resistance': allData?.slip_resistance || allData?.class,
    'Wear Rating': allData?.wear_rating,
    'Abrasion Resistance': allData?.abrasion_resistance,
    'Tensile Strength': allData?.tensile_strength,
    'Breaking Strength': allData?.breaking_strength,
    'Hardness': allData?.hardness
  };

  // Category 5: Application
  const application = {
    'Recommended Use': allData?.recommended_use || allData?.application,
    'Installation Method': allData?.installation_method,
    'Room Type': allData?.room_type,
    'Traffic Level': allData?.traffic_level,
    'Care Instructions': allData?.care_instructions,
    'Maintenance': allData?.maintenance
  };

  // Category 6: Compliance
  const compliance = {
    'Certifications': allData?.certifications,
    'Standards': allData?.standards,
    'Eco Friendly': allData?.eco_friendly,
    'Sustainability Rating': allData?.sustainability_rating,
    'VOC Rating': allData?.voc_rating,
    'Safety Rating': allData?.safety_rating
  };

  // Category 7: Design
  const design = {
    'Designer': allData?.designer || allData?.studio,
    'Studio': allData?.studio,
    'Collection': collection,
    'Series': allData?.series,
    'Aesthetic Style': allData?.aesthetic_style,
    'Design Era': allData?.design_era
  };

  // Category 8: Manufacturing
  const manufacturing = {
    'Factory': factory,
    'Manufacturer': allData?.manufacturer || allData?.factory_group,
    'Factory Group': allData?.factory_group,
    'Country of Origin': allData?.country_of_origin || origin,
    'Manufacturing Process': allData?.manufacturing_process,
    'Construction': allData?.construction
  };

  // Category 9: Commercial
  const commercial = {
    'Pricing': allData?.pricing,
    'Availability': allData?.availability,
    'Supplier': allData?.supplier,
    'SKU': allData?.sku || product.sku,
    'Warranty': allData?.warranty
  };

  // Get all other metadata not in the above categories
  const excludedKeys = new Set([
    // Material Properties
    'material_type', 'material', 'composition', 'type', 'blend', 'fiber_content',
    'texture', 'finish', 'pattern', 'weight', 'density', 'durability_rating', 'durability',
    // Dimensions
    'size', 'dimensions', 'length', 'width', 'height', 'thickness', 'diameter', 'area', 'volume',
    // Appearance
    'color', 'color_code', 'gloss_level', 'sheen', 'transparency', 'grain', 'visual_effect',
    // Performance
    'water_resistance', 'water_absorption', 'fire_rating', 'slip_resistance', 'class',
    'wear_rating', 'abrasion_resistance', 'tensile_strength', 'breaking_strength', 'hardness',
    // Application
    'recommended_use', 'application', 'installation_method', 'room_type', 'traffic_level',
    'care_instructions', 'maintenance',
    // Compliance
    'certifications', 'standards', 'eco_friendly', 'sustainability_rating', 'voc_rating', 'safety_rating',
    // Design
    'designer', 'studio', 'collection', 'series', 'aesthetic_style', 'design_era',
    // Manufacturing
    'factory', 'manufacturer', 'factory_group', 'country_of_origin', 'origin',
    'manufacturing_process', 'construction',
    // Commercial
    'pricing', 'availability', 'supplier', 'sku', 'warranty',
    // System fields
    'thumbnail_url', 'image_url', '_extraction_metadata', 'category'
  ]);

  const additionalMetadata: Record<string, any> = {};
  Object.entries(allData || {}).forEach(([key, value]) => {
    if (!excludedKeys.has(key) && value !== null && value !== undefined && value !== '') {
      additionalMetadata[key] = value;
    }
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto bg-white">
        {/* Header with Factory/Brand Info */}
        <DialogHeader className="border-b pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              {/* Factory/Brand */}
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

              {/* Product Name */}
              <DialogTitle className="text-3xl font-bold text-gray-900 mb-1">
                {product.name}
              </DialogTitle>

              {/* Collection & SKU */}
              <div className="flex items-center gap-3 text-sm text-gray-600">
                {collection && (
                  <span className="font-medium">{collection}</span>
                )}
                <span className="text-gray-400">•</span>
                <span>SKU: {product.sku}</span>
              </div>
            </div>

            {/* Status Badge */}
            <Badge
              className="text-sm px-3 py-1"
              style={{
                backgroundColor: `${categoryColor}20`,
                color: categoryColor,
                borderColor: categoryColor,
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

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 mt-6">
          {/* Left Column: Image Slider (3/5 width) */}
          <div className="lg:col-span-3 space-y-4">
            <div className="relative aspect-square bg-gray-50 rounded-xl overflow-hidden border border-gray-200">
              {currentImage && (
                <img
                  src={currentImage.url}
                  alt={currentImage.alt}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              )}

              {/* Navigation Arrows */}
              {product.images.length > 1 && (
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

              {/* Image Counter */}
              <div className="absolute bottom-3 right-3 bg-black/70 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
                {currentImageIndex + 1} / {product.images.length}
              </div>
            </div>

            {/* Thumbnail Strip */}
            {product.images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-2">
                {product.images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setCurrentImageIndex(index)}
                    className={`flex-shrink-0 w-24 h-24 rounded-lg border-2 overflow-hidden transition-all ${
                      index === currentImageIndex
                        ? 'border-gray-900 ring-2 ring-gray-900 ring-offset-2'
                        : 'border-gray-200 hover:border-gray-400'
                    }`}
                  >
                    <img
                      src={image.url}
                      alt={image.alt}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
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
                {/* Material Type */}
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-600">Material</span>
                  <span className="text-sm font-semibold text-gray-900">{material}</span>
                </div>

                {/* Size */}
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-600">Size</span>
                  <span className="text-sm font-semibold text-gray-900">{size}</span>
                </div>

                {/* Thickness */}
                <div className="flex justify-between items-center py-2 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-600">Thickness</span>
                  <span className="text-sm font-semibold text-gray-900">{thickness}</span>
                </div>

                {/* Finish */}
                <div className="flex justify-between items-center py-2">
                  <span className="text-sm font-medium text-gray-600">Finish</span>
                  <span className="text-sm font-semibold text-gray-900">{finish}</span>
                </div>
              </CardContent>
            </Card>

            {/* Available Sizes (Variants) */}
            {product.variants && product.variants.length > 0 && (
              <Card className="bg-white border-gray-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold text-gray-900">Available Sizes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-2">
                    {product.variants.map((variant, index) => (
                      <button
                        key={index}
                        className="flex items-center justify-between p-3 border-2 border-gray-200 rounded-lg hover:border-gray-900 hover:bg-gray-50 transition-all text-left"
                      >
                        <span className="font-medium text-sm text-gray-900">{variant.name}</span>
                        <span className="text-xs text-gray-500">{variant.sku}</span>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

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

            {/* Add to Quote Button */}
            <Button
              className="w-full bg-gray-900 hover:bg-gray-800 text-white"
              size="lg"
            >
              <ShoppingCart className="h-5 w-5 mr-2" />
              Add to Quote
            </Button>
          </div>
        </div>

        {/* Comprehensive Metadata Sections - 9 Categories */}
        <div className="mt-6 space-y-4">
          {/* Helper function to render metadata category */}
          {(() => {
            const renderMetadataCategory = (title: string, data: Record<string, any>, icon?: React.ReactNode) => {
              const filteredData = Object.entries(data).filter(([_, value]) => value && value !== 'N/A' && value !== '');
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
              <>
                {renderMetadataCategory('Material Properties', materialProperties)}
                {renderMetadataCategory('Dimensions', dimensions)}
                {renderMetadataCategory('Appearance', appearance)}
                {renderMetadataCategory('Performance', performance)}
                {renderMetadataCategory('Application', application)}
                {renderMetadataCategory('Compliance & Certifications', compliance)}
                {renderMetadataCategory('Design', design)}
                {renderMetadataCategory('Manufacturing', manufacturing)}
                {renderMetadataCategory('Commercial', commercial)}
              </>
            );
          })()}

          {/* Additional Metadata (if any) */}
          {Object.keys(additionalMetadata).length > 0 && (
            <Card className="bg-white border-gray-200">
              <CardHeader className="bg-gray-50 border-b border-gray-200">
                <CardTitle className="text-lg font-bold text-gray-900">
                  Additional Information
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  {Object.entries(additionalMetadata).map(([key, value]) => (
                    <div key={key} className="bg-gray-50 border border-gray-200 rounded-lg p-4 hover:border-gray-400 transition-colors">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        {key.replace(/_/g, ' ')}
                      </p>
                      <p className="text-sm font-bold text-gray-900">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
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
      </DialogContent>
    </Dialog>
  );
};

export default ProductDetailModal;

