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

  // Handle {value, confidence} wrapper objects
  if (typeof val === 'object' && 'value' in (val as Record<string, unknown>)) {
    const innerValue = (val as Record<string, unknown>).value;

    // If inner value is null/undefined, return undefined
    if (innerValue === null || innerValue === undefined) return undefined;

    // If inner value is an object (dictionary), format it nicely
    if (typeof innerValue === 'object' && !Array.isArray(innerValue)) {
      // Format as "key: value" pairs
      const entries = Object.entries(innerValue as Record<string, unknown>);
      if (entries.length === 0) return undefined;
      return entries.map(([k, v]) => `${k}: ${v}`).join(', ');
    }

    // If inner value is an array, join it
    if (Array.isArray(innerValue)) {
      return innerValue.join(', ');
    }

    return String(innerValue);
  }

  // Handle plain arrays
  if (Array.isArray(val)) return val.join(', ');

  // Handle plain objects (dictionaries)
  if (typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>);
    if (entries.length === 0) return undefined;
    return entries.map(([k, v]) => `${k}: ${v}`).join(', ');
  }

  return String(val);
};

// Safe string extraction for direct JSX rendering (prevents React error #310)
const safeString = (val: unknown, fallback = ''): string => {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object' && 'value' in (val as Record<string, unknown>)) {
    const innerValue = (val as Record<string, unknown>).value;
    return innerValue != null ? String(innerValue) : fallback;
  }
  if (typeof val === 'object') return fallback;
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

  // All hooks must be declared before any conditional return (Rules of Hooks)

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
      // Skip DB queries for demo products (non-UUID IDs like "demo-wood-green-001")
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(product.id)) return;

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
      // Skip DB queries for demo products (non-UUID IDs like "demo-wood-green-001")
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(product.id)) return;

      try {
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
              metadata,
              chunk_index
            )
          `)
          .eq('product_id', product.id)
          .order('relevance_score', { ascending: false });

        if (chunkError) {
          console.error('[ProductDetailModal] Error loading chunks:', JSON.stringify(chunkError));
          setChunks([]);
        } else if (chunkRelations && chunkRelations.length > 0) {
          const loadedChunks = chunkRelations
            .filter(rel => rel.document_chunks)
            .map(rel => ({
              id: rel.document_chunks.id,
              content: rel.document_chunks.content,
              page_number: rel.document_chunks.metadata?.page_number ?? null,
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

        // ── Embedding status (7-vector suite) ──────────────────────────────
        // Text: exists whenever chunks were created (embedded together via Voyage AI)
        const hasText = (chunkCount ?? 0) > 0;

        // Visual SLIG + Phase 2: use get_product_embedding_status RPC.
        // The Python backend sets has_slig_embedding / has_understanding_embedding /
        // has_color_slig / has_texture_slig / has_style_slig / has_material_slig on
        // document_images immediately after each successful VECS write — 100% accurate.
        let hasVisualSlig = false;
        let hasUnderstanding = false;
        let hasColorSlig = false;
        let hasTextureSlig = false;
        let hasStyleSlig = false;
        let hasMaterialSlig = false;

        const { data: embStatus } = await supabase
          .rpc('get_product_embedding_status', { p_product_id: product.id });

        if (embStatus) {
          hasVisualSlig    = (embStatus.has_slig_embedding ?? 0) > 0;
          hasUnderstanding = (embStatus.has_understanding ?? 0) > 0;
          hasColorSlig     = (embStatus.has_color_slig ?? 0) > 0;
          hasTextureSlig   = (embStatus.has_texture_slig ?? 0) > 0;
          hasStyleSlig     = (embStatus.has_style_slig ?? 0) > 0;
          hasMaterialSlig  = (embStatus.has_material_slig ?? 0) > 0;
        }

        setEmbeddings({
          'Text 1024D (Voyage)':          hasText,
          'Visual SLIG 768D':             hasVisualSlig,
          'Understanding 1024D (Voyage)': hasUnderstanding,
          'Color SLIG 768D':              hasColorSlig,
          'Texture SLIG 768D':            hasTextureSlig,
          'Style SLIG 768D':              hasStyleSlig,
          'Material SLIG 768D':           hasMaterialSlig,
        });
      } catch (error) {
        console.error('[ProductDetailModal] Failed to load admin data:', error);
      }
    };

    loadAdminData();
  }, [product?.id, isAdmin, isOpen]);

  // AI grout suggestions — must be a hook so it lives before the conditional return
  const groutRecommendations = React.useMemo(() => {
    if (!product) return generateGroutRecommendations({});
    const data = {
      ...product.metadata,
      ...product.properties,
      ...product.specifications,
    };
    return generateGroutRecommendations(data || {});
  }, [product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!product) return null;

  const materialCategory = getMaterialCategory(product);
  const theme = getCategoryTheme(materialCategory);
  const effectiveColor = categoryColor || theme.primary;

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

  // Product name uppercased for matching against product-keyed metadata dicts
  const productNameUpper = (typeof product.name === 'string' ? product.name : '').toUpperCase().trim();
  // Accent-stripped normalised form (e.g. "PIQUÉ" → "PIQUE") used for all key comparisons
  const normalizeMatch = (s: string) =>
    s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
  const productNameNorm = normalizeMatch(productNameUpper);

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
        if (dimValue && dimValue !== 'N/A') return dimValue;

        // Priority: use product_lines[productName].sizes if available (catalog products)
        const productLines = allData?.product_lines;
        if (productLines && typeof productLines === 'object') {
          const lineKey = Object.keys(productLines).find(k =>
            normalizeMatch(k) === productNameNorm ||
            normalizeMatch(k).includes(productNameNorm)
          );
          if (lineKey) {
            const lineData = (productLines as Record<string, unknown>)[lineKey] as Record<string, unknown>;
            const lineSizes = lineData?.sizes;
            const lineSizesVal = (lineSizes && typeof lineSizes === 'object' && 'value' in (lineSizes as Record<string, unknown>))
              ? (lineSizes as Record<string, unknown>).value
              : lineSizes;
            if (Array.isArray(lineSizesVal) && lineSizesVal.length > 0) {
              return (lineSizesVal as string[]).join(', ');
            }
          }
        }

        // Smart fallback: Extract sizes from SKU codes, filtered to THIS product only
        const extractedSizes = new Set<string>();

        // Extract from SKU codes — only keys that belong to this product
        const skuCodes = allData?.commercial?.sku_codes;
        if (skuCodes) {
          const skuObj = typeof skuCodes === 'object' && 'value' in skuCodes
            ? skuCodes.value as Record<string, unknown>
            : skuCodes as Record<string, unknown>;
          if (typeof skuObj === 'object') {
            const normSkuProduct = productNameUpper.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
            Object.keys(skuObj).forEach(key => {
              // Only extract from keys whose first segment exactly matches this product name
              const keyBase = key.split('_')[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
              if (keyBase === normSkuProduct) {
                const sizeMatch = key.match(/(\d+)[Xx](\d+)/);
                if (sizeMatch) {
                  extractedSizes.add(`${sizeMatch[1]}×${sizeMatch[2]} cm`);
                }
              }
            });
          }
        }

        if (extractedSizes.size > 0) {
          return Array.from(extractedSizes).sort().join(', ');
        }

        return 'N/A';
      })();
  // Smart thickness extraction — returns ONLY this product's thickness, or undefined
  const thickness = (() => {
    const thData = materialPropsData?.thickness;
    if (!thData) return undefined;
    // Unwrap {value, confidence} wrapper
    const thVal = (typeof thData === 'object' && !Array.isArray(thData) && 'value' in (thData as Record<string, unknown>))
      ? (thData as Record<string, unknown>).value
      : thData;
    if (!thVal) return undefined;
    // Simple string — belongs to this product
    if (typeof thVal === 'string') return thVal || undefined;
    if (typeof thVal === 'number') return String(thVal);
    // Array of per-product-line objects: [{product, thickness_mm, thickness_inch}, ...]
    if (Array.isArray(thVal)) {
      const arr = thVal as Array<Record<string, string>>;
      const match = arr.find(t =>
        t.product && (
          normalizeMatch(t.product) === productNameNorm ||
          normalizeMatch(t.product).includes(productNameNorm)
        )
      );
      if (match) {
        const inch = match.thickness_inch && match.thickness_inch !== 'Not specified' ? ` (${match.thickness_inch}")` : '';
        return `${match.thickness_mm}mm${inch}`;
      }
      // No match for this product — leave empty
      return undefined;
    }
    // Plain object: try common patterns like {mm: "10", inch: "0.4"} or {thickness_mm: "10"}
    if (typeof thVal === 'object' && thVal !== null) {
      const obj = thVal as Record<string, unknown>;
      const mm = obj.mm || obj.thickness_mm;
      if (mm) {
        const inch = (obj.inch || obj.thickness_inch) && String(obj.inch || obj.thickness_inch) !== 'Not specified'
          ? ` (${obj.inch || obj.thickness_inch}")` : '';
        return `${mm}mm${inch}`;
      }
      return undefined; // Unknown object shape — leave empty
    }
    return undefined;
  })();
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
    'Available Sizes': size !== 'N/A' ? size : undefined,
    'Thickness': thickness,
  };

  // Smart color extraction — prefers product-specific available_colors, then tries to match by name
  const extractProductColors = (): string | undefined => {
    // available_colors is a simple per-product array (most reliable for individual product rows)
    const avColors = allData?.available_colors;
    if (Array.isArray(avColors) && avColors.length > 0) {
      return (avColors as string[]).map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(', ');
    }
    const colData = appearanceData?.colors;
    const colVal = (colData && typeof colData === 'object' && 'value' in (colData as Record<string, unknown>))
      ? (colData as Record<string, unknown>).value
      : colData;
    if (!colVal) return undefined;
    if (Array.isArray(colVal)) return (colVal as unknown[]).map(String).join(', ');
    if (typeof colVal === 'object' && colVal !== null) {
      const entries = Object.entries(colVal as Record<string, unknown>);
      // Try to find key matching this product
      const match = entries.find(([k]) => {
        const kn = normalizeMatch(k);
        return kn === productNameNorm || kn.includes(productNameNorm);
      });
      if (match) {
        const v = match[1];
        return Array.isArray(v) ? (v as unknown[]).map(String).join(', ') : String(v);
      }
      // No match for this product — leave empty
      return undefined;
    }
    return String(colVal);
  };

  const appearance = {
    'Colors': extractProductColors() || extractValue(allData?.colors),
    'Textures': extractValue(allData?.textures),
    'Shade Variation': extractValue(appearanceData?.shade_variation),
    'Visual Effect': extractValue(appearanceData?.visual_effect),
  };

  const performance = {
    'Traffic Level': extractValue(applicationData?.traffic_level),
    'Slip Resistance': extractValue(materialPropsData?.slip_resistance) || extractValue(performanceData?.slip_resistance),
    'Water Resistance': extractValue(materialPropsData?.water_resistance) || extractValue(performanceData?.water_resistance),
    'Water Absorption': extractValue(performanceData?.water_absorption) || extractValue(materialPropsData?.water_absorption),
    'Fire Rating': extractValue(materialPropsData?.fire_rating) || extractValue(performanceData?.fire_rating),
    'Abrasion Resistance': extractValue(performanceData?.abrasion_resistance),
    'Wear Rating': extractValue(performanceData?.wear_rating) || extractValue(materialPropsData?.wear_rating),
    'Surface Hardness': extractValue(performanceData?.surface_hardness) || extractValue(materialPropsData?.surface_hardness),
    'Frost Resistance': extractValue(performanceData?.frost_resistance),
  };

  const application = {
    'Recommended Use': extractValue(applicationData?.recommended_use) || extractValue(allData?.applications),
    'Installation Method': extractValue(applicationData?.installation_method) || extractValue(applicationData?.installation),
    'Joint Width': extractValue(applicationData?.joint_width) || extractValue(allData?.joint_width),
    'Room Type': extractValue(applicationData?.room_type) || extractValue(applicationData?.suitable_rooms) || extractValue(allData?.room_type),
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

  // Extract a value that may be keyed by product/variant names — returns undefined if no match for this product
  const extractProductValue = (val: unknown): string | undefined => {
    if (!val) return undefined;
    const inner = (typeof val === 'object' && !Array.isArray(val) && 'value' in (val as Record<string, unknown>))
      ? (val as Record<string, unknown>).value
      : val;
    if (!inner) return undefined;
    if (typeof inner === 'string') return inner || undefined;
    if (typeof inner === 'number') return String(inner);
    if (Array.isArray(inner)) return (inner as unknown[]).map(String).join(', ');
    if (typeof inner === 'object' && inner !== null) {
      const entries = Object.entries(inner as Record<string, unknown>);
      // Check if keys are product/variant name-like (contain letters, not just digits)
      const hasNameKeys = entries.some(([k]) => /[A-Za-zÀ-ú]/.test(k));
      if (hasNameKeys) {
        // Filter to entries whose key matches this product
        const matches = entries.filter(([k]) => {
          const kn = normalizeMatch(k);
          return kn === productNameNorm || kn.includes(productNameNorm);
        });
        if (matches.length > 0) {
          return matches.map(([k, v]) => {
            if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
              // Nested object e.g. {kg: "1.39", lb: "3.06"}
              const inner2 = Object.entries(v as Record<string, unknown>)
                .map(([ik, iv]) => `${iv} ${ik}`).join(' / ');
              return `${k}: ${inner2}`;
            }
            return `${k}: ${Array.isArray(v) ? (v as unknown[]).join(', ') : v}`;
          }).join(', ');
        }
        return undefined; // Keyed dict but no match — leave empty
      }
      // Non-name keys (e.g., SKU numbers) — show all as plain text
      return entries.map(([k, v]) => `${k}: ${v}`).join(', ');
    }
    return undefined;
  };

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
    'Grout Color Codes': extractProductValue(commercialData?.grout_color_codes),
  };

  const packaging = {
    'Pieces per Box': extractProductValue(packagingData?.pieces_per_box),
    'Boxes per Pallet': extractProductValue(packagingData?.boxes_per_pallet),
    'Weight per Box (kg)': extractProductValue(packagingData?.weight_per_box) || extractValue(packagingData?.weight_kg),
    'Weight per Box (lb)': extractProductValue(packagingData?.weight_per_box_lb) || extractValue(packagingData?.weight_lb),
    'Coverage per Box (m²)': extractProductValue(packagingData?.coverage_per_box) || extractValue(packagingData?.coverage_m2),
    'Coverage per Box (sqft)': extractProductValue(packagingData?.coverage_per_box_sqft) || extractValue(packagingData?.coverage_sqft),
  };

  // Extract product variants from SKU codes and commercial data
  const extractVariants = (): Array<{
    sku: string;
    name: string;
    color: string;
    pattern: string;
    size: string;
    groutCode: string;
  }> => {
    const variants: Array<{
      sku: string;
      name: string;
      color: string;
      pattern: string;
      size: string;
      groutCode: string;
    }> = [];

    // Try to get variants from sku_codes object
    const skuCodes = commercialData?.sku_codes;
    if (skuCodes) {
      const skuObj = typeof skuCodes === 'object' && 'value' in skuCodes
        ? skuCodes.value as Record<string, unknown>
        : skuCodes as Record<string, unknown>;

      if (typeof skuObj === 'object' && skuObj !== null) {
        // Helper: strip accents and uppercase for accent-insensitive comparison
        const normalizeForMatch = (s: string) =>
          s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
        const normProductName = normalizeForMatch(productNameUpper);

        Object.entries(skuObj).forEach(([key, value]) => {
          // Only include SKU variants that belong to THIS product.
          // The first underscore-delimited segment of the key identifies the product/variant
          // (e.g. "ona_mint_12x45" → "ONA", "pique_3d_anth_10x10" → "PIQUE").
          const keyBase = normalizeForMatch(key.split('_')[0]);
          if (keyBase !== normProductName) return; // skip other products' variants

          // Parse variant info from key (e.g., "pique_3d_anth_10x10" or "ona_mint_12x45")
          const parts = key.toLowerCase().split('_');

          // Extract size (look for pattern like "10x10", "20x40")
          const sizeMatch = key.match(/(\d+)x(\d+)/i);
          const size = sizeMatch ? `${sizeMatch[1]}x${sizeMatch[2]}` : '';

          // Extract color (common colors to look for)
          const colorKeywords = ['white', 'clay', 'sand', 'taupe', 'bordeaux', 'anthracite', 'anth', 'brown', 'mint', 'green', 'grey', 'gray'];
          let color = '';
          for (const colorKey of colorKeywords) {
            if (parts.includes(colorKey)) {
              color = colorKey === 'anth' ? 'Anthracite' : colorKey.charAt(0).toUpperCase() + colorKey.slice(1);
              break;
            }
          }

          // Extract pattern
          const patternKeywords = ['3d', 'cloth', 'mosaic', 'waffle', 'wave'];
          let pattern = '';
          for (const patternKey of patternKeywords) {
            if (parts.includes(patternKey)) {
              pattern = patternKey === '3d' ? '3D Relief' : patternKey.charAt(0).toUpperCase() + patternKey.slice(1);
              break;
            }
          }

          // Build variant name
          const productName = parts.filter(p =>
            !colorKeywords.includes(p) &&
            !patternKeywords.includes(p) &&
            !p.match(/\d+x\d+/)
          ).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');

          const variantName = [productName, pattern, color].filter(Boolean).join(' ').trim();

          // Get grout code from commercial data if available
          let groutCode = '';
          const groutMapei = commercialData?.grout_mapei;
          if (groutMapei && typeof groutMapei === 'object' && 'value' in groutMapei) {
            const groutObj = groutMapei.value as Record<string, unknown>;
            if (typeof groutObj === 'object' && groutObj !== null) {
              // Try to match by color
              const colorLower = color.toLowerCase();
              if (groutObj[colorLower]) {
                groutCode = String(groutObj[colorLower]);
              }
            }
          }

          variants.push({
            sku: String(value),
            name: variantName || key,
            color: color || '-',
            pattern: pattern || '-',
            size: size || '-',
            groutCode: groutCode || '-',
          });
        });
      }
    }

    // Also try to get from variants array if exists
    const variantsArray = allData?.variants || commercialData?.variants;
    if (Array.isArray(variantsArray)) {
      variantsArray.forEach((v: any) => {
        variants.push({
          sku: extractValue(v.sku) || extractValue(v.sku_code) || '-',
          name: extractValue(v.name) || extractValue(v.variant_name) || '-',
          color: extractValue(v.color) || '-',
          pattern: extractValue(v.pattern) || '-',
          size: extractValue(v.size) || extractValue(v.dimensions) || '-',
          groutCode: extractValue(v.grout_code) || extractValue(v.mapei_code) || '-',
        });
      });
    }

    return variants;
  };

  const productVariants = extractVariants();

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
            {filteredData.map(([key, value]) => {
              const str = renderValue(value);
              const parts = str.split(', ').filter(p => p.trim());
              return (
                <div key={key} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{key}</p>
                  {parts.length >= 3 ? (
                    <ul className="space-y-0.5 mt-1">
                      {parts.map((part, i) => (
                        <li key={i} className="text-sm font-semibold text-gray-900 flex items-start gap-1.5">
                          <span className="mt-2 w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" />
                          {part.trim()}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm font-bold text-gray-900">{str}</p>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  // Helper function to render product variants table
  const renderVariantsTable = () => {
    if (productVariants.length === 0) return null;

    return (
      <Card className="bg-white border-gray-200">
        <CardHeader className="bg-gray-50 border-b border-gray-200 py-3">
          <CardTitle className="text-base font-bold text-gray-900">
            Product Variants ({productVariants.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 bg-gray-50">SKU</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 bg-gray-50">Variant Name</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 bg-gray-50">Color</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 bg-gray-50">Pattern</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 bg-gray-50">Size</th>
                  <th className="text-left py-3 px-4 font-semibold text-gray-700 bg-gray-50">Mapei Code</th>
                </tr>
              </thead>
              <tbody>
                {productVariants.map((variant, index) => (
                  <tr
                    key={`${variant.sku}-${index}`}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                      index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                    }`}
                  >
                    <td className="py-3 px-4 font-mono font-bold text-gray-900">{variant.sku}</td>
                    <td className="py-3 px-4 text-gray-800">{variant.name}</td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full border border-gray-300"
                          style={{
                            backgroundColor:
                              variant.color.toLowerCase() === 'white' ? '#f5f5f5' :
                              variant.color.toLowerCase() === 'anthracite' ? '#424242' :
                              variant.color.toLowerCase() === 'sand' ? '#c2b280' :
                              variant.color.toLowerCase() === 'bordeaux' ? '#800020' :
                              variant.color.toLowerCase() === 'brown' ? '#795548' :
                              variant.color.toLowerCase() === 'mint' ? '#98ff98' :
                              variant.color.toLowerCase() === 'green' ? '#4caf50' :
                              variant.color.toLowerCase() === 'grey' || variant.color.toLowerCase() === 'gray' ? '#9e9e9e' :
                              variant.color.toLowerCase() === 'taupe' ? '#8b8589' :
                              variant.color.toLowerCase() === 'clay' ? '#b5651d' :
                              '#e0e0e0'
                          }}
                        />
                        {variant.color}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-gray-700">{variant.pattern}</td>
                    <td className="py-3 px-4 text-gray-700">{variant.size}</td>
                    <td className="py-3 px-4 font-mono text-gray-600">{variant.groutCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                {safeString(product.name, 'Unnamed Product')}
              </DialogTitle>
              <div className="flex items-center gap-3 text-sm text-gray-600">
                {collection && <span className="font-medium">{collection}</span>}
                <span className="text-gray-400">•</span>
                <span>SKU: {safeString(product.sku, 'N/A')}</span>
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
              {safeString(product.status, 'active')}
            </Badge>
          </div>
          <DialogDescription className="text-base text-gray-700 mt-3">
            {safeString(product.description)}
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
                <div className="py-2 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-600">Size</span>
                  {size === 'N/A' ? (
                    <span className="block text-sm font-semibold text-gray-900 mt-1">N/A</span>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {size.split(', ').map((s, i) => (
                        <li key={i} className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-gray-400 flex-shrink-0" />
                          {s.trim()}
                        </li>
                      ))}
                    </ul>
                  )}
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
                        product.stock?.status === 'High'
                          ? 'bg-green-100 text-green-800 border-green-300'
                          : product.stock?.status === 'Medium'
                            ? 'bg-yellow-100 text-yellow-800 border-yellow-300'
                            : 'bg-red-100 text-red-800 border-red-300'
                      }`}
                    >
                      {product.stock?.quantity ?? 0} {product.stock?.unit ?? 'pcs'}
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
          {renderVariantsTable()}
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
                        {chunk.content}
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

            {/* Embeddings Summary — 7-vector suite */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">7-Vector Embeddings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(embeddings).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                      <span className="text-sm font-medium">{key}</span>
                      <Badge variant={value ? 'default' : 'outline'}>
                        {value ? '✓' : '✗'}
                      </Badge>
                    </div>
                  ))}
                </div>
                {Object.values(embeddings).some(v => !v) && (
                  <p className="text-xs text-muted-foreground mt-3">
                    ✗ = Phase 2 not yet run. Understanding + SLIG specialized embeddings are generated asynchronously after upload.
                  </p>
                )}
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
