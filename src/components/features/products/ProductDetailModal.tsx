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
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import { ChevronLeft, ChevronRight, Factory, Info, Activity, Loader2, FileText, BookOpen, Database, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Product, getMaterialCategory, MaterialCategory } from './types';
import { AddToQuoteButton } from '@/components/business/quotes/AddToQuoteButton';
import { AddToMoodboardButton } from '@/components/business/moodboard/AddToMoodboardButton';
import { SimilarMaterials } from '@/components/features/recommendations';
import { ProductMonitorTab } from '@/components/business/price-monitoring/ProductMonitorTab';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { generateGroutRecommendations, formatGroutSuggestion } from '@/utils/groutSuggestions';

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
  const { user } = useAuth();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [images, setImages] = useState<any[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [chunks, setChunks] = useState<any[]>([]);
  const [embeddings, setEmbeddings] = useState<any>({});
  const [relevanceCounts, setRelevanceCounts] = useState({ chunks: 0, images: 0 });
  const [isRelinking, setIsRelinking] = useState(false);

  if (!product) return null;

  const materialCategory = getMaterialCategory(product);
  const theme = getCategoryTheme(materialCategory);
  const effectiveColor = categoryColor || theme.primary;

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('workspace_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      setIsAdmin(data?.role === 'admin' || data?.role === 'owner');
    };
    checkAdmin();
  }, [user]);

  // Load images from product_image_relationships when modal opens
  useEffect(() => {
    const loadImages = async () => {
      if (!product?.id) return;

      try {
        setIsLoadingImages(true);
        console.log('[ProductDetailModal] Loading images for product:', product.id, product.name);

        // Fetch images from image_product_associations table (created during PDF processing)
        const { data: imageRelations, error } = await supabase
          .from('image_product_associations')
          .select(`
            image_id,
            overall_score,
            reasoning,
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
          .order('overall_score', { ascending: false });

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
              relationship_score: rel.overall_score,
              relationship_type: rel.reasoning || 'associated',
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

  // Load admin data (chunks, embeddings, relevances)
  useEffect(() => {
    const loadAdminData = async () => {
      if (!product?.id || !isAdmin || !isOpen) return;

      try {
        // Embeddings are stored in separate tables/VECS, not in products table
        // Skip embedding status check for now - these columns don't exist in products table
        setEmbeddings({
          text_embedding_1024: false,
          visual_clip_embedding_512: false,
          multimodal_fusion_embedding_2048: false,
          color_embedding_256: false,
          texture_embedding_256: false,
          application_embedding_512: false,
        });

        // Load chunks from chunk_product_relationships table
        const { data: chunkRelations, error: chunkError } = await supabase
          .from('chunk_product_relationships')
          .select(`
            chunk_id,
            relevance_score,
            created_at,
            document_chunks (
              id,
              content,
              page_number,
              chunk_index
            )
          `)
          .eq('product_id', product.id)
          .order('relevance_score', { ascending: false });

        if (chunkError) {
          console.error('[ProductDetailModal] Error loading chunks:', chunkError);
          setChunks([]);
        } else if (chunkRelations && chunkRelations.length > 0) {
          const loadedChunks = chunkRelations
            .filter(rel => rel.document_chunks)
            .map(rel => ({
              id: rel.document_chunks.id,
              content: rel.document_chunks.content,
              page_number: rel.document_chunks.page_number,
              chunk_index: rel.document_chunks.chunk_index,
              relevance_score: rel.relevance_score,
            }));
          console.log('[ProductDetailModal] Loaded chunks:', loadedChunks.length);
          setChunks(loadedChunks);
        } else {
          setChunks([]);
        }

        // Get relationship counts
        const { count: chunkCount } = await supabase
          .from('chunk_product_relationships')
          .select('*', { count: 'exact', head: true })
          .eq('product_id', product.id);

        const { count: imageCount } = await supabase
          .from('image_product_associations')
          .select('*', { count: 'exact', head: true })
          .eq('product_id', product.id);

        setRelevanceCounts({
          chunks: chunkCount || 0,
          images: imageCount || 0,
        });
      } catch (error) {
        console.error('[ProductDetailModal] Failed to load admin data:', error);
      }
    };

    loadAdminData();
  }, [product?.id, isAdmin, isOpen]);

  const handlePrevImage = () => {
    setCurrentImageIndex((prev) =>
      prev === 0 ? images.length - 1 : prev - 1,
    );
  };

  const handleNextImage = () => {
    setCurrentImageIndex((prev) =>
      prev === images.length - 1 ? 0 : prev + 1,
    );
  };

  const handleRelinkChunks = async () => {
    if (!product?.source_document_id) {
      console.error('[ProductDetailModal] No source_document_id found');
      return;
    }

    try {
      setIsRelinking(true);
      console.log('[ProductDetailModal] Re-linking chunks for document:', product.source_document_id);

      const response = await fetch('https://v1api.materialshub.gr/api/admin/linking/link-chunks-to-products', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          document_id: product.source_document_id,
        }),
      });

      const result = await response.json();

      if (result.success) {
        console.log('[ProductDetailModal] Re-linking successful:', result);

        // chunk_product_relationships table doesn't exist - skip reload
        setChunks([]);
        setRelevanceCounts(prev => ({
          ...prev,
          chunks: 0,
        }));

        toast.success(`✅ Successfully created ${result.chunk_product_links} chunk-product relationships!`);
      } else {
        console.error('[ProductDetailModal] Re-linking failed:', result.error);
        toast.error(`❌ Re-linking failed: ${result.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('[ProductDetailModal] Re-linking error:', error);
      toast.error(`❌ Re-linking error: ${error}`);
    } finally {
      setIsRelinking(false);
    }
  };

  const currentImage = images[currentImageIndex];

  // Extract key metadata from all possible sources
  const allData = {
    ...product.metadata,
    ...product.properties,
    ...product.specifications,
  };

  // Extract from correct nested paths
  const designData = allData?.design || {};
  const appearanceData = allData?.appearance || {};
  const materialPropsData = allData?.material_properties || {};
  const applicationData = allData?.application || {};
  const dimensionsData = allData?.dimensions || [];

  const factory = extractValue(allData?.factory_name) || extractValue(allData?.factory_group_name) || 'Unknown Factory';
  const origin = extractValue(allData?.origin) || extractValue(allData?.country_of_origin) || '';
  const collection = extractValue(designData?.collection) || extractValue(allData?.collection) || '';

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
          // Handle string format like "15×38 cm"
          if (typeof dim === 'string') {
            return dim;
          }
          return JSON.stringify(d);
        }
        return String(d);
      }).join(', ')
    : (() => {
        // Try multiple fallback sources
        const dimValue = extractValue(allData?.dimensions) ||
                        extractValue(allData?.size) ||
                        extractValue(allData?.dimension);
        return dimValue || 'N/A';
      })();
  const thickness = extractValue(materialPropsData?.thickness) || 'N/A';
  const finish = extractValue(materialPropsData?.finish) || 'N/A';
  const material = extractValue(allData?.material_category) || product.type || 'N/A';

  // Metadata categories
  // Extract commercial data
  const commercialData = allData?.commercial || {};
  const packagingData = allData?.packaging || {};
  const performanceData = allData?.performance || {};

  const materialProperties = {
    'Material Category': material,
    'Materials': extractValue(allData?.materials),
    'Composition': extractValue(materialPropsData?.composition),
    'Body Type': extractValue(materialPropsData?.body_type),
    'Finish': finish,
    'Finishes': extractValue(allData?.finishes),
    'Patterns': extractValue(materialPropsData?.patterns) || extractValue(appearanceData?.patterns),
    'Surface': extractValue(materialPropsData?.surface),
    'Thickness': thickness,
  };

  const dimensions = {
    'Available Sizes': size,
    'Thickness': thickness !== 'N/A' ? thickness : undefined,
  };

  const appearance = {
    'Colors': extractValue(appearanceData?.colors) || extractValue(allData?.colors),
    'Textures': extractValue(allData?.textures),
    'Shade Variation': extractValue(appearanceData?.shade_variation),
    'Visual Effect': extractValue(appearanceData?.visual_effect),
  };

  const performance = {
    'Traffic Level': extractValue(applicationData?.traffic_level),
    'Slip Resistance': extractValue(materialPropsData?.slip_resistance) || extractValue(performanceData?.slip_resistance),
    'Water Resistance': extractValue(materialPropsData?.water_resistance) || extractValue(performanceData?.water_resistance),
    'Fire Rating': extractValue(materialPropsData?.fire_rating) || extractValue(performanceData?.fire_rating),
    'Abrasion Resistance': extractValue(performanceData?.abrasion_resistance),
    'Frost Resistance': extractValue(performanceData?.frost_resistance),
  };

  const application = {
    'Recommended Use': extractValue(applicationData?.recommended_use) || extractValue(allData?.applications),
    'Installation': extractValue(applicationData?.installation),
  };

  const design = {
    'Designer': Array.isArray(designData?.designers)
      ? designData.designers.join(', ')
      : extractValue(designData?.designers) || extractValue(designData?.studio),
    'Studio': extractValue(designData?.studio),
    'Collection': collection,
    'Brand': extractValue(designData?.brand),
    'Philosophy': extractValue(designData?.philosophy),
    'Studio Founded': extractValue(designData?.studio_founded),
  };

  const manufacturing = {
    'Factory': factory,
    'Factory Group': extractValue(allData?.factory_group_name) || undefined,
    'Country of Origin': origin || undefined,
  };

  // Generate AI grout suggestions if not present
  const groutRecommendations = React.useMemo(() => {
    return generateGroutRecommendations(allData || {});
  }, [allData]);

  const commercial = {
    'Product Codes': extractValue(commercialData?.product_codes),
    'SKU Codes': extractValue(commercialData?.sku_codes),
    'Grout Suppliers': extractValue(commercialData?.grout_suppliers),
    'Grout Mapei': extractValue(commercialData?.grout_mapei) ||
      (groutRecommendations.mapei ? `${formatGroutSuggestion(groutRecommendations.mapei)} (AI Suggested)` : undefined),
    'Grout Kerakoll': extractValue(commercialData?.grout_kerakoll) ||
      (groutRecommendations.kerakoll ? `${formatGroutSuggestion(groutRecommendations.kerakoll)} (AI Suggested)` : undefined),
    'Grout Isomat': extractValue(commercialData?.grout_isomat) ||
      (groutRecommendations.isomat ? `${formatGroutSuggestion(groutRecommendations.isomat)} (AI Suggested)` : undefined),
    'Grout Technica': extractValue(commercialData?.grout_technica) ||
      (groutRecommendations.technica ? `${formatGroutSuggestion(groutRecommendations.technica)} (AI Suggested)` : undefined),
    'Grout Color Codes': extractValue(commercialData?.grout_color_codes),
  };

  const packaging = {
    'Pieces per Box': extractValue(packagingData?.pieces_per_box),
    'Boxes per Pallet': extractValue(packagingData?.boxes_per_pallet),
    'Weight per Box': extractValue(packagingData?.weight_per_box),
    'Coverage per Box': extractValue(packagingData?.coverage_per_box),
  };

  // Extract compliance data
  const complianceData = allData?.compliance || {};

  const careAndMaintenance = {
    'Care Instructions': extractValue(applicationData?.care_instructions) || extractValue(allData?.care_instructions),
    'Maintenance': extractValue(applicationData?.maintenance) || extractValue(allData?.maintenance),
    'Cleaning': extractValue(allData?.cleaning),
  };

  const certifications = {
    'Certifications': extractValue(allData?.certifications) || extractValue(complianceData?.certifications),
    'Standards': extractValue(allData?.standards) || extractValue(complianceData?.standards),
    'Eco Friendly': extractValue(allData?.eco_friendly) || extractValue(complianceData?.eco_friendly),
    'Sustainability Rating': extractValue(allData?.sustainability_rating) || extractValue(complianceData?.sustainability_rating),
    'Fire Rating': extractValue(complianceData?.fire_rating) || extractValue(allData?.fire_rating),
  };

  // Helper function to safely render any value (handles objects, arrays, primitives)
  const renderValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'N/A';

    // Handle {value, confidence} objects FIRST
    if (typeof value === 'object' && value !== null && 'value' in value) {
      const obj = value as Record<string, unknown>;
      const innerValue = obj.value;
      // Recursively handle the inner value
      if (innerValue === null || innerValue === undefined) return 'N/A';
      if (typeof innerValue === 'object') {
        // If inner value is still an object, stringify it
        try {
          return JSON.stringify(innerValue);
        } catch {
          return String(innerValue);
        }
      }
      return String(innerValue);
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(v => {
        // For each array item, extract if it's an object
        if (typeof v === 'object' && v !== null && 'value' in v) {
          return String((v as Record<string, unknown>).value ?? 'N/A');
        }
        return String(v);
      }).join(', ');
    }

    // Handle plain objects - stringify them
    if (typeof value === 'object') {
      try {
        return JSON.stringify(value);
      } catch {
        return '[Object]';
      }
    }

    // Handle primitives
    return String(value);
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
                  {renderValue(value)}
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
          <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-5' : 'grid-cols-2'}`}>
            <TabsTrigger value="details" className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              Details
            </TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value="chunks" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Chunks ({chunks.length})
                </TabsTrigger>
                <TabsTrigger value="knowledge" className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4" />
                  Knowledge
                </TabsTrigger>
                <TabsTrigger value="extraction" className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Extraction
                </TabsTrigger>
              </>
            )}
            <TabsTrigger value="monitor" className="flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Monitor
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
                      {product.pricing?.currency === 'EUR' ? '€' : '$'}
                      {(product.pricing?.retail || 0).toFixed(2)}
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Wholesale</p>
                    <p className="text-xl font-bold text-gray-900">
                      {product.pricing?.currency === 'EUR' ? '€' : '$'}
                      {(product.pricing?.wholesale || 0).toFixed(2)}
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
          {renderMetadataCategory('Care & Maintenance', careAndMaintenance)}
          {renderMetadataCategory('Certifications & Compliance', certifications)}
          {renderMetadataCategory('Design', design)}
          {renderMetadataCategory('Manufacturing', manufacturing)}
          {renderMetadataCategory('Commercial Information', commercial)}
          {renderMetadataCategory('Packaging', packaging)}
        </div>

        {/* Similar Materials Section */}
        <div className="mt-6">
          <SimilarMaterials materialId={product.id} limit={10} />
        </div>
      </TabsContent>

      {/* Chunks Tab - Admin Only */}
      {isAdmin && (
        <TabsContent value="chunks" className="mt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Related Chunks ({chunks.length})</h3>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{relevanceCounts.chunks} total relevances</Badge>
                <Button
                  onClick={handleRelinkChunks}
                  disabled={isRelinking || !product?.source_document_id}
                  size="sm"
                  variant="outline"
                  className="gap-2"
                >
                  {isRelinking ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Re-linking...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="h-4 w-4" />
                      Re-link Chunks
                    </>
                  )}
                </Button>
              </div>
            </div>

            {chunks.length > 0 ? (
              <div className="space-y-3">
                {chunks.map((chunk: any, index: number) => (
                  <Card key={chunk.id}>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm">Chunk #{index + 1}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">Page {chunk.page_number}</Badge>
                          <Badge>Score: {(chunk.relevance_score * 100).toFixed(0)}%</Badge>
                          <Badge variant="secondary">{chunk.relationship_type}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {chunk.chunk_text}
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="border-dashed">
                <CardContent className="pt-6">
                  <div className="text-center py-8">
                    <FileText className="h-12 w-12 mx-auto mb-4 opacity-50 text-muted-foreground" />
                    <p className="text-muted-foreground mb-4">No chunks linked to this product</p>
                    {product?.source_document_id && (
                      <div className="space-y-2">
                        <p className="text-sm text-gray-600">
                          This product has a source document but no chunk relationships.
                        </p>
                        <p className="text-sm text-gray-600">
                          Click "Re-link Chunks" above to create chunk-product relationships.
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>
      )}

      {/* Knowledge Tab - Admin Only */}
      {isAdmin && (
        <TabsContent value="knowledge" className="mt-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Knowledge Base Articles</h3>
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Knowledge base linking coming soon</p>
                  <p className="text-sm mt-2">
                    This will show cleaning instructions, maintenance guides, and related documentation
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      )}

      {/* Extraction Tab - Admin Only */}
      {isAdmin && (
        <TabsContent value="extraction" className="mt-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Extraction Metadata</h3>

            {/* Embeddings Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Embeddings Attached</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(embeddings).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <span className="text-sm font-medium">{key.replace(/_/g, ' ')}</span>
                      <Badge variant={value ? 'default' : 'outline'}>
                        {value ? '✓' : '✗'}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Relevances Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Relevances</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Chunk Relevances:</span>
                    <Badge>{relevanceCounts.chunks}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Image Relevances:</span>
                    <Badge>{relevanceCounts.images}</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Total Relationships:</span>
                    <Badge variant="secondary">
                      {relevanceCounts.chunks + relevanceCounts.images}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      )}

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
