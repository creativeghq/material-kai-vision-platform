/**
 * Product Detail Modal
 * Global component for displaying full product/material details
 * Supports category-based templates for different material types
 * Fetches images from image_product_associations table
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
import { ChevronLeft, ChevronRight, Factory, Info, Activity, Loader2, FileText, BookOpen, Database, RefreshCw, Sparkles, Puzzle, Globe, Video, Box } from 'lucide-react';
import { toast } from 'sonner';
import { Product, getMaterialCategory, MaterialCategory } from './types';
import { formatMaterialCategory } from '@/utils/productMetadata';
import { AddToQuoteButton } from '@/components/business/quotes/AddToQuoteButton';
import { AddToMoodboardButton } from '@/components/business/moodboard/AddToMoodboardButton';
import { ProductMonitorTab } from '@/components/business/price-monitoring/ProductMonitorTab';
import { ProductRecommendationsPanel } from './ProductRecommendationsPanel';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { generateGroutRecommendations, formatGroutSuggestion } from '@/utils/groutSuggestions';

interface ProductDetailModalProps {
  product: Product | null;
  isOpen: boolean;
  onClose: () => void;
  categoryColor?: string;
  onGenerateVR?: (imageUrl: string, context: { prompt?: string; roomType?: string; style?: string }) => void;
  onGenerateVideo?: (imageUrl: string) => void;
  onUseIn3DScene?: (imageUrl: string, productName: string) => void;
  vrGenerating?: boolean;
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
  onGenerateVR,
  onGenerateVideo,
  onUseIn3DScene,
  vrGenerating,
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
  // Knowledge base docs attached to this product (via kb_doc_attachments)
  const [kbDocs, setKbDocs] = useState<Array<{
    id: string;
    title: string;
    content: string;
    content_markdown?: string | null;
    summary?: string | null;
    metadata: Record<string, unknown>;
    relationship_type: string;
  }>>([]);
  // Modal stacking for recommendations — clicking a result opens that product
  const [stackedProductId, setStackedProductId] = useState<string | null>(null);
  const [stackedProduct, setStackedProduct] = useState<Product | null>(null);

  // All hooks must be declared before any conditional return (Rules of Hooks)

  // Load stacked product when a recommendation card is clicked
  useEffect(() => {
    if (!stackedProductId) { setStackedProduct(null); return; }
    supabase
      .from('products')
      .select('*')
      .eq('id', stackedProductId)
      .single()
      .then(({ data }) => {
        if (data) setStackedProduct(data as unknown as Product);
      });
  }, [stackedProductId]);

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

  // Load images from image_product_associations when modal opens
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

  // Load chunks for ALL users (not just admins). The Details tab's Description
  // card falls back to chunk content when product.description is empty, so
  // end-users also need chunks loaded. Admin-specific data (embedding status,
  // relevance counts) stays in the admin-gated effect below.
  useEffect(() => {
    const loadChunks = async () => {
      if (!product?.id || !isOpen) return;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(product.id)) return;

      try {
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
          return;
        }
        const loaded = (chunkRelations || [])
          .filter(rel => rel.document_chunks)
          .map(rel => ({
            id: rel.document_chunks.id,
            content: rel.document_chunks.content,
            page_number: rel.document_chunks.metadata?.page_number ?? null,
            chunk_index: rel.document_chunks.chunk_index,
            relevance_score: rel.relevance_score,
          }));
        setChunks(loaded);
      } catch (err) {
        console.error('[ProductDetailModal] loadChunks exception:', err);
        setChunks([]);
      }
    };
    loadChunks();
  }, [product?.id, isOpen]);

  // Load KB docs attached to this product via kb_doc_attachments.
  // Shown in the Knowledge tab for ALL users (not admin-only).
  useEffect(() => {
    const loadKbDocs = async () => {
      if (!product?.id || !isOpen) return;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(product.id)) return;
      try {
        const { data, error } = await supabase
          .from('kb_doc_attachments')
          .select(`
            relationship_type,
            kb_docs (
              id,
              title,
              content,
              content_markdown,
              summary,
              metadata,
              status
            )
          `)
          .eq('product_id', product.id);

        if (error) {
          console.error('[ProductDetailModal] loadKbDocs error:', error);
          setKbDocs([]);
          return;
        }

        const loaded = (data || [])
          .filter((row: any) => row.kb_docs && row.kb_docs.status === 'published')
          .map((row: any) => ({
            id: row.kb_docs.id,
            title: row.kb_docs.title,
            content: row.kb_docs.content || '',
            content_markdown: row.kb_docs.content_markdown,
            summary: row.kb_docs.summary,
            metadata: row.kb_docs.metadata || {},
            relationship_type: row.relationship_type,
          }));
        setKbDocs(loaded);
      } catch (err) {
        console.error('[ProductDetailModal] loadKbDocs exception:', err);
        setKbDocs([]);
      }
    };
    loadKbDocs();
  }, [product?.id, isOpen]);

  // Load admin data (embeddings, relevances — chunks are now loaded above)
  useEffect(() => {
    const loadAdminData = async () => {
      if (!product?.id || !isAdmin || !isOpen) return;
      // Skip DB queries for demo products (non-UUID IDs like "demo-wood-green-001")
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(product.id)) return;

      try {
        // Chunks already loaded by the effect above (for all users).
        // This effect only handles admin-specific embedding/relevance data.

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

  // Factory chain: primary → group → brand → em-dash (avoid hallucinated
  // "Unknown Factory" placeholder that reads like a real value).
  const factory = extractValue(allData?.factory_name)
    || extractValue(allData?.factory_group_name)
    || extractValue(allData?.brand)
    || '—';
  const origin = extractValue(allData?.origin) || extractValue(allData?.country_of_origin) || '';
  const collection = extractValue(designData?.collection) || extractValue(allData?.collection) || '';

  // Extract tile dimensions — prefer the structured `dimensions` array written
  // by Stage 4.7 enrichment (`{metric_cm: "11.8x11.8", imperial_in: "4.65x4.65"}`)
  // over the legacy `available_sizes` which used to be populated with
  // AI-hallucinated values by older extractor runs.
  const availableSizes = (Array.isArray(dimensionsData) && dimensionsData.length > 0)
    ? dimensionsData
    : (allData?.available_sizes || []);
  const size = Array.isArray(availableSizes) && availableSizes.length > 0
    ? availableSizes.map((d: unknown) => {
        if (typeof d === 'object' && d !== null) {
          const dim = d as Record<string, unknown>;
          // Structured dimension object from Stage 4.7 chunk regex extractor
          if (dim.metric_cm) {
            const metric = String(dim.metric_cm);
            const imperial = dim.imperial_in ? ` (${dim.imperial_in}")` : '';
            return `${metric} cm${imperial}`;
          }
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
            normalizeMatch(k).includes(productNameNorm),
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
        ),
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
  // Finish: AI-extracted first, vision_analysis rollup second, em-dash last.
  const finish = extractValue(materialPropsData?.finish)
    || extractValue(allData?.finish)
    || '—';
  // Material category chain: AI/vision-extracted → body_type → product.type.
  // Formatted via `formatMaterialCategory` so slugs like "ceramic_tile" become
  // "Ceramic Tile" for display. Returns "—" when nothing is set.
  const materialRaw = extractValue(allData?.material_category)
    || extractValue(materialPropsData?.body_type)
    || product.type
    || null;
  const material = formatMaterialCategory(materialRaw, '—');

  // Metadata categories
  // Extract commercial data
  const commercialData = allData?.commercial || {};
  const packagingData = allData?.packaging || {};
  const performanceData = allData?.performance || {};
  const complianceData = allData?.compliance || {};

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

  // Appearance colors: prefer the explicit `available_colors` (per-product
  // primary colors from the AI extractor), then fall back to the vision-rollup
  // color list (20 perceptual shades across the images). Show both if they
  // differ meaningfully so users see both the "official" and the "observed"
  // palette.
  const primaryColors = extractProductColors() || extractValue(allData?.colors);
  const visionColorsRaw = appearanceData?.colors_from_vision;
  const visionColors = Array.isArray(visionColorsRaw)
    ? (visionColorsRaw as string[])
        .map(c => String(c))
        .filter(Boolean)
        .slice(0, 12)  // cap for display
        .join(', ')
    : undefined;

  // Helper: pretty-print numeric/string values with optional unit suffix
  const pickPackagingValue = (obj: Record<string, unknown> | undefined, key: string): string | undefined => {
    if (!obj) return undefined;
    const v = obj[key];
    if (v === null || v === undefined || v === '') return undefined;
    if (typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
      const inner = (v as Record<string, unknown>).value;
      return inner != null ? String(inner) : undefined;
    }
    return String(v);
  };

  // ─── Patterns aggregated across variants (chip list) ──────────────
  // Vision rollup writes every unique pattern it saw on each variant image
  // into appearance.patterns. Rendered as a chip list above the Appearance
  // card key/value grid so multi-pattern products don't collapse into a
  // single "Pattern" line.
  const patternsList: string[] = (() => {
    const raw = appearanceData?.patterns ?? materialPropsData?.patterns ?? allData?.patterns;
    const inner = (raw && typeof raw === 'object' && 'value' in (raw as Record<string, unknown>))
      ? (raw as Record<string, unknown>).value
      : raw;
    if (Array.isArray(inner)) {
      const seen = new Set<string>();
      const out: string[] = [];
      (inner as unknown[]).forEach(p => {
        const s = String(p).trim();
        if (!s) return;
        const norm = s.toLowerCase();
        if (seen.has(norm)) return;
        seen.add(norm);
        out.push(s);
      });
      return out;
    }
    if (typeof inner === 'string' && inner.trim()) {
      return inner.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    }
    return [];
  })();

  const appearance = {
    'Colors': primaryColors,
    'Observed Shades': (visionColors && visionColors !== primaryColors) ? visionColors : undefined,
    'Primary Color': extractValue(appearanceData?.primary_color_hex),  // hex swatch
    // Only show singular "Pattern" key if we DON'T have the aggregated list
    // (avoids duplicating information with the chip row above).
    'Pattern': patternsList.length === 0 ? extractValue(appearanceData?.pattern) : undefined,
    'Texture': extractValue(appearanceData?.texture),
    'Textures': extractValue(allData?.textures),
    'Shade Variation': extractValue(appearanceData?.shade_variation),
    'Visual Effect': extractValue(appearanceData?.visual_effect),
  };

  const performance = {
    'Traffic Level': extractValue(performanceData?.traffic_level) || extractValue(applicationData?.traffic_level),
    'Slip Resistance': extractValue(performanceData?.slip_resistance) || extractValue(materialPropsData?.slip_resistance),
    'PEI Rating': extractValue(performanceData?.pei_rating),
    'Water Absorption': extractValue(performanceData?.water_absorption_class)
      || extractValue(performanceData?.water_absorption)
      || extractValue(materialPropsData?.water_absorption),
    'Water Absorption %': extractValue(performanceData?.water_absorption_pct),
    'Fire Rating': extractValue(performanceData?.fire_rating)
      || extractValue(materialPropsData?.fire_rating)
      || extractValue(complianceData?.fire_rating),
    'Abrasion Resistance': extractValue(performanceData?.abrasion_resistance),
    'Wear Rating': extractValue(performanceData?.wear_rating) || extractValue(materialPropsData?.wear_rating),
    'Surface Hardness': extractValue(performanceData?.surface_hardness) || extractValue(materialPropsData?.surface_hardness),
    'Shade Variation': extractValue(performanceData?.shade_variation),
    'Frost Resistance': extractValue(performanceData?.frost_resistance),
  };

  // Pretty-print recommended_use arrays as "Wall, Floor, Shower Wall"
  const fmtList = (v: unknown): string | undefined => {
    if (!v) return undefined;
    if (Array.isArray(v)) {
      return (v as unknown[]).map(x => String(x)).filter(Boolean).map(s => s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())).join(', ');
    }
    if (typeof v === 'string') return v.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    return String(v);
  };

  const application = {
    'Recommended Use': fmtList(applicationData?.recommended_use) || fmtList(allData?.applications) || fmtList(allData?.recommended_use),
    'Applications': fmtList(allData?.applications),
    'Installation Method': extractValue(applicationData?.installation_method) || extractValue(applicationData?.installation),
    'Joint Width': extractValue(applicationData?.joint_width_mm)
      ? `${extractValue(applicationData?.joint_width_mm)} mm`
      : extractValue(applicationData?.joint_width) || extractValue(allData?.joint_width),
    'Room Type': extractValue(applicationData?.room_type) || extractValue(applicationData?.suitable_rooms) || extractValue(allData?.room_type),
  };

  const design = {
    'Designer': Array.isArray(designData?.designers)
      ? designData.designers.join(', ')
      : extractValue(designData?.designers) || extractValue(designData?.studio),
    'Studio': extractValue(designData?.studio),
    'Collection': collection,
    'Brand': extractValue(designData?.brand),
    'Design Style': extractValue(designData?.design_style),
    'Material Subtype': extractValue(materialPropsData?.material_subtype),
    'Inspiration': extractValue(designData?.inspiration) || extractValue(allData?.inspiration),
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
      // Non-name keys (e.g., SKU numbers) — show all as plain text.
      // For nested values we flatten instead of relying on toString() which
      // would turn {dose: 100, supplier: "Mapei"} into "[object Object]".
      return entries.map(([k, v]) => {
        if (v === null || v === undefined) return `${k}: —`;
        if (Array.isArray(v)) {
          return `${k}: ${(v as unknown[]).map(String).join(', ')}`;
        }
        if (typeof v === 'object') {
          // Flatten nested object: {dose:100, supplier:"Mapei"} → "Mapei (100)"
          const nested = v as Record<string, unknown>;
          const supplier = nested.supplier ?? nested.brand ?? nested.name;
          const dose = nested.dose ?? nested.amount ?? nested.quantity;
          if (supplier && dose !== undefined) return `${k}: ${supplier} (${dose})`;
          // Fallback: join inner entries "key: val"
          const innerStr = Object.entries(nested)
            .map(([ik, iv]) => `${ik}: ${iv}`)
            .join(', ');
          return `${k}: ${innerStr}`;
        }
        return `${k}: ${v}`;
      }).join(', ');
    }
    return undefined;
  };

  // Extract code/SKU dictionaries filtered to entries that belong to THIS product.
  // Keys may be space-separated ("ONA MINT/12X45") or underscore-separated ("valenova_blue_30x60").
  const extractFilteredCodes = (val: unknown): string | undefined => {
    if (!val) return undefined;
    const inner = (typeof val === 'object' && !Array.isArray(val) && 'value' in (val as Record<string, unknown>))
      ? (val as Record<string, unknown>).value
      : val;
    if (!inner || typeof inner !== 'object' || Array.isArray(inner)) return extractValue(val);
    const entries = Object.entries(inner as Record<string, unknown>);
    const filtered = entries.filter(([k]) => {
      const underscorePrefix = normalizeMatch(k.split('_')[0]);
      const spacePrefix = normalizeMatch(k.split(' ')[0]);
      return underscorePrefix === productNameNorm || spacePrefix === productNameNorm;
    });
    if (filtered.length === 0) return undefined;
    return filtered.map(([k, v]) => `${k}: ${v}`).join(', ');
  };

  const commercial = {
    'Product Codes': extractFilteredCodes(commercialData?.product_codes),
    'SKU Codes': extractFilteredCodes(commercialData?.sku_codes),
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

  // Extract product variants using the new commercial schema.
  //
  // Data sources, in priority order:
  //   1. commercial.vision_variants  — Structured array produced by the Claude
  //      Vision spec extractor: [{sku, name, color, format, pattern?}].
  //      This is the canonical source when the spec vision pass has run.
  //   2. commercial.sku_codes        — Legacy dict keyed by variant slug
  //      ("valenova_blue_30x60": "V2BL3060"). Parsed into the same shape
  //      when vision_variants is absent.
  //
  // Grout code lookup per variant:
  //   - commercial.grout_details     — [{supplier, product, code, for_variant}]
  //     from the vision extractor. Match by for_variant (name or color).
  //   - commercial.grout_color_codes — Dict keyed by variant/color name.
  //
  // We return ONE row per variant with an object of grout codes keyed by
  // supplier ({mapei: "M142", kerakoll: "K05", ...}) so the table can render
  // whatever suppliers are present without hard-coding a single column.
  interface Variant {
    sku: string;
    name: string;
    color: string;
    pattern: string;
    size: string;
    groutCodes: Record<string, string>; // supplier → code
  }

  const extractVariants = (): Variant[] => {
    const variants: Variant[] = [];

    // Helper: unwrap {value, confidence} wrappers
    const unwrap = (v: unknown): unknown => {
      if (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
        return (v as Record<string, unknown>).value;
      }
      return v;
    };

    // ─── Grout lookup table ────────────────────────────────────────────
    // Build once per product: variantKey (lowercased) → {supplier: code}
    const groutByVariant: Record<string, Record<string, string>> = {};

    // grout_details: structured array from vision extractor
    const groutDetails = unwrap(commercialData?.grout_details);
    if (Array.isArray(groutDetails)) {
      groutDetails.forEach((g: any) => {
        const supplier = String(g?.supplier || '').toLowerCase().trim();
        const code = String(g?.code || g?.product || '').trim();
        const forVariant = String(g?.for_variant || '').toLowerCase().trim();
        if (!supplier || !code || !forVariant) return;
        if (!groutByVariant[forVariant]) groutByVariant[forVariant] = {};
        groutByVariant[forVariant][supplier] = code;
      });
    }

    // grout_color_codes: dict {variantName: code} or {variantName: {supplier: code}}
    const groutColorCodes = unwrap(commercialData?.grout_color_codes);
    if (groutColorCodes && typeof groutColorCodes === 'object' && !Array.isArray(groutColorCodes)) {
      Object.entries(groutColorCodes as Record<string, unknown>).forEach(([variantKey, code]) => {
        const key = variantKey.toLowerCase().trim();
        if (!groutByVariant[key]) groutByVariant[key] = {};
        if (typeof code === 'string' || typeof code === 'number') {
          // Single code — assume Mapei unless key says otherwise
          groutByVariant[key].mapei = String(code);
        } else if (code && typeof code === 'object') {
          Object.entries(code as Record<string, unknown>).forEach(([sup, c]) => {
            if (c !== null && c !== undefined) {
              groutByVariant[key][sup.toLowerCase()] = String(c);
            }
          });
        }
      });
    }

    // Legacy per-supplier dicts: commercial.grout_mapei = {color: code}, etc.
    (['mapei', 'kerakoll', 'isomat', 'technica'] as const).forEach(sup => {
      const supData = unwrap(commercialData?.[`grout_${sup}`]);
      if (supData && typeof supData === 'object' && !Array.isArray(supData)) {
        Object.entries(supData as Record<string, unknown>).forEach(([vkey, code]) => {
          const key = vkey.toLowerCase().trim();
          if (!groutByVariant[key]) groutByVariant[key] = {};
          if (code !== null && code !== undefined && !groutByVariant[key][sup]) {
            groutByVariant[key][sup] = String(code);
          }
        });
      }
    });

    const lookupGrout = (...keys: string[]): Record<string, string> => {
      for (const k of keys) {
        const lower = k.toLowerCase().trim();
        if (lower && groutByVariant[lower]) return groutByVariant[lower];
      }
      return {};
    };

    // ─── Source 1: commercial.vision_variants (preferred) ──────────────
    const visionVariants = unwrap(commercialData?.vision_variants);
    if (Array.isArray(visionVariants) && visionVariants.length > 0) {
      visionVariants.forEach((v: any) => {
        // Filter to this product only — vision_variants may be shared across
        // all products in a chunk and contain other product's rows.
        const vName = String(v?.name || '').trim();
        const vProduct = String(v?.product || v?.product_name || '').trim();
        const matchesProduct =
          !vProduct ||
          normalizeMatch(vProduct) === productNameNorm ||
          normalizeMatch(vName).includes(productNameNorm);
        if (!matchesProduct) return;

        const color = String(v?.color || '').trim();
        const pattern = String(v?.pattern || '').trim();
        const size = String(v?.format || v?.size || '').trim();
        const sku = String(v?.sku || v?.sku_code || '').trim();

        variants.push({
          sku: sku || '—',
          name: vName || [productNameUpper, pattern, color].filter(Boolean).join(' '),
          color: color || '—',
          pattern: pattern || '—',
          size: size || '—',
          groutCodes: lookupGrout(vName, color, sku),
        });
      });
    }

    // ─── Source 2: commercial.sku_codes (legacy fallback) ──────────────
    if (variants.length === 0) {
      const skuCodes = unwrap(commercialData?.sku_codes);
      if (skuCodes && typeof skuCodes === 'object' && !Array.isArray(skuCodes)) {
        Object.entries(skuCodes as Record<string, unknown>).forEach(([key, value]) => {
          // First segment of the key identifies the product
          // ("valenova_blue_30x60" → "VALENOVA").
          const keyBase = normalizeMatch(key.split('_')[0]);
          if (keyBase !== productNameNorm) return;

          const parts = key.toLowerCase().split('_');
          const sizeMatch = key.match(/(\d+)[xX](\d+)/);
          const size = sizeMatch ? `${sizeMatch[1]}×${sizeMatch[2]}` : '—';

          const colorKeywords = ['white', 'clay', 'sand', 'taupe', 'bordeaux', 'anthracite', 'anth', 'brown', 'mint', 'green', 'grey', 'gray', 'blue', 'red', 'black', 'beige', 'ivory', 'cream'];
          const color = parts.find(p => colorKeywords.includes(p)) || '';
          const colorLabel = color === 'anth' ? 'Anthracite' : color ? color.charAt(0).toUpperCase() + color.slice(1) : '—';

          const patternKeywords = ['3d', 'cloth', 'mosaic', 'waffle', 'wave', 'relief'];
          const pattern = parts.find(p => patternKeywords.includes(p)) || '';
          const patternLabel = pattern === '3d' ? '3D Relief' : pattern ? pattern.charAt(0).toUpperCase() + pattern.slice(1) : '—';

          const nameParts = parts.filter(p =>
            !colorKeywords.includes(p) && !patternKeywords.includes(p) && !/^\d+x\d+$/.test(p),
          );
          const nameLabel = nameParts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
          const variantName = [nameLabel, patternLabel !== '—' ? patternLabel : '', colorLabel !== '—' ? colorLabel : '']
            .filter(Boolean).join(' ').trim();

          variants.push({
            sku: String(value),
            name: variantName || key,
            color: colorLabel,
            pattern: patternLabel,
            size,
            groutCodes: lookupGrout(variantName, colorLabel, color, key),
          });
        });
      }
    }

    return variants;
  };

  const productVariants = extractVariants();

  const careAndMaintenance = {
    'Care Instructions': extractValue(applicationData?.care_instructions) || extractValue(allData?.care_instructions),
    'Maintenance': extractValue(applicationData?.maintenance) || extractValue(allData?.maintenance),
    'Cleaning': extractValue(allData?.cleaning),
  };

  // ─── Certifications as chip list ──────────────────────────────────
  // Certifications come from multiple sources and may live on either
  // top-level metadata or under compliance.certifications. The catalog
  // knowledge extractor propagates catalog-level certs (ISO / CE / EN / LEED)
  // to every product in the document, so even pages without a per-product
  // spec table will have a populated list.
  const extractCertList = (val: unknown): string[] => {
    if (!val) return [];
    const inner = (val && typeof val === 'object' && 'value' in (val as Record<string, unknown>))
      ? (val as Record<string, unknown>).value
      : val;
    if (Array.isArray(inner)) {
      return (inner as unknown[]).map(v => String(v).trim()).filter(Boolean);
    }
    if (typeof inner === 'string') {
      return inner.split(/[,;]/).map(s => s.trim()).filter(Boolean);
    }
    return [];
  };
  const certList: string[] = (() => {
    const candidates: string[] = [
      ...extractCertList(complianceData?.certifications),
      ...extractCertList(allData?.certifications),
      ...extractCertList(complianceData?.standards),
      ...extractCertList(allData?.standards),
    ];
    const seen = new Set<string>();
    return candidates.filter(c => {
      const norm = c.toLowerCase().replace(/[\s-]/g, '');
      if (seen.has(norm)) return false;
      seen.add(norm);
      return true;
    });
  })();
  const certSource = extractValue(complianceData?.certifications_source);

  // Remaining fields that still render as a normal key/value card.
  const certifications = {
    'Eco Friendly': extractValue(allData?.eco_friendly) || extractValue(complianceData?.eco_friendly),
    'Sustainability Rating': extractValue(allData?.sustainability_rating) || extractValue(complianceData?.sustainability_rating),
    'Fire Rating': extractValue(complianceData?.fire_rating) || extractValue(allData?.fire_rating),
  };

  // Renders the certifications section: a header, chip list, and the
  // remaining key/value fields below. Hidden entirely when there is nothing.
  const renderCertificationsCard = () => {
    const hasChips = certList.length > 0;
    const hasFields = Object.values(certifications).some(v => v && v !== 'N/A' && v !== '');
    if (!hasChips && !hasFields) return null;
    return (
      <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
            Certifications & Compliance
          </h3>
        </div>
        {hasChips && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Certifications
              {certSource === 'catalog_knowledge' && (
                <span className="ml-2 normal-case font-normal text-[10px] text-muted-foreground/60">
                  (catalog-wide)
                </span>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {certList.map(cert => (
                <Badge
                  key={cert}
                  variant="outline"
                  className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 border-primary/30 text-primary"
                >
                  {cert}
                </Badge>
              ))}
            </div>
          </div>
        )}
        {hasFields && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(certifications)
              .filter(([, v]) => v && v !== 'N/A' && v !== '')
              .map(([key, value]) => (
                <div key={key} className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{key}</p>
                  <p className="text-xs font-semibold">{renderValue(value)}</p>
                </div>
              ))}
          </div>
        )}
      </div>
    );
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

    const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;

    return (
      <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">{title}</h3>
        </div>
        {/* 2-column grid on all but tiny screens — product detail rows are short,
            so 2-col uses the horizontal space well without wasting vertical. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredData.map(([key, value]) => {
            const str = renderValue(value);
            const parts = str.split(', ').filter(p => p.trim());

            // Special-case: hex color values → render as color swatch + code
            if (HEX_RE.test(str)) {
              return (
                <div key={key} className="bg-muted/30 rounded-lg p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{key}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className="inline-block w-5 h-5 rounded border border-border/50 flex-shrink-0"
                      style={{ backgroundColor: str }}
                      aria-label={`Color swatch ${str}`}
                    />
                    <p className="text-xs font-semibold">{str}</p>
                  </div>
                </div>
              );
            }

            return (
              <div key={key} className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{key}</p>
                {parts.length >= 3 ? (
                  <ul className="space-y-0.5 mt-1">
                    {parts.map((part, i) => (
                      <li key={i} className="text-xs font-semibold flex items-start gap-1.5">
                        <span className="mt-1.5 w-1 h-1 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                        {part.trim()}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs font-semibold">{str}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // Helper function to render product variants table.
  // Columns are: SKU, Variant, Color, Pattern, Size, then ONE column per
  // grout supplier that actually has data for at least one variant.
  // Grout suppliers come from the new schema (commercial.grout_details +
  // commercial.grout_color_codes) via extractVariants().
  const renderVariantsTable = () => {
    if (productVariants.length === 0) return null;

    // Union of supplier keys across all variants, ordered canonically.
    const SUPPLIER_ORDER = ['mapei', 'kerakoll', 'isomat', 'technica'] as const;
    const supplierSet = new Set<string>();
    productVariants.forEach(v => {
      Object.keys(v.groutCodes || {}).forEach(s => supplierSet.add(s));
    });
    const suppliers: string[] = [
      ...SUPPLIER_ORDER.filter(s => supplierSet.has(s)),
      ...Array.from(supplierSet).filter(s => !(SUPPLIER_ORDER as readonly string[]).includes(s)),
    ];

    const colorSwatch = (color: string): string => {
      const c = color.toLowerCase();
      const map: Record<string, string> = {
        white: '#f5f5f5', anthracite: '#424242', sand: '#c2b280',
        bordeaux: '#800020', brown: '#795548', mint: '#98ff98',
        green: '#4caf50', grey: '#9e9e9e', gray: '#9e9e9e',
        taupe: '#8b8589', clay: '#b5651d', blue: '#1e88e5',
        red: '#e53935', black: '#212121', beige: '#d7c9a7',
        ivory: '#fffff0', cream: '#f5f0e1',
      };
      return map[c] || '#e0e0e0';
    };

    return (
      <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
            Product Variants ({productVariants.length})
          </h3>
        </div>
        <div className="overflow-hidden -mx-6 -mb-6 mt-2">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                <tr className="text-xs font-semibold text-muted-foreground">
                  <th className="text-left px-6 py-2.5 font-medium">SKU</th>
                  <th className="text-left px-3 py-2.5 font-medium">Variant Name</th>
                  <th className="text-left px-3 py-2.5 font-medium">Color</th>
                  <th className="text-left px-3 py-2.5 font-medium">Pattern</th>
                  <th className="text-left px-3 py-2.5 font-medium">Size</th>
                  {suppliers.map(sup => (
                    <th key={sup} className="text-left px-3 py-2.5 font-medium capitalize">
                      {sup}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {productVariants.map((variant, index) => (
                  <tr
                    key={`${variant.sku}-${index}`}
                    className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                  >
                    <td className="px-6 py-2 font-mono font-semibold">{variant.sku}</td>
                    <td className="px-3 py-2 font-medium">{variant.name}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full border border-border/50 flex-shrink-0"
                          style={{ backgroundColor: colorSwatch(variant.color) }}
                        />
                        {variant.color}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{variant.pattern}</td>
                    <td className="px-3 py-2 text-muted-foreground">{variant.size}</td>
                    {suppliers.map(sup => (
                      <td key={sup} className="px-3 py-2 font-mono text-muted-foreground">
                        {variant.groutCodes[sup] || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Packaging-per-variant table. The vision extractor emits
  // `packaging.per_variant` when the catalog's packing table has different
  // pieces/box or weight per format. We render one row per variant here;
  // when only scalar packaging exists the table is hidden (scalar values
  // already live in the Key Specs sidebar Packaging block).
  const renderPackagingPerVariantTable = () => {
    const packagingRaw = allData?.packaging;
    const packaging = (packagingRaw && typeof packagingRaw === 'object' && 'value' in packagingRaw)
      ? (packagingRaw as Record<string, unknown>).value
      : packagingRaw;
    const perVariantRaw = packaging && typeof packaging === 'object'
      ? (packaging as Record<string, unknown>).per_variant
      : undefined;
    const perVariant = (perVariantRaw && typeof perVariantRaw === 'object' && 'value' in (perVariantRaw as Record<string, unknown>))
      ? (perVariantRaw as Record<string, unknown>).value
      : perVariantRaw;

    if (!Array.isArray(perVariant) || perVariant.length === 0) return null;

    // Filter to rows belonging to this product if the extractor tagged them.
    const rows = (perVariant as Array<Record<string, unknown>>).filter(r => {
      const vProduct = r.product || r.product_name;
      if (!vProduct) return true; // untagged rows assumed for this product
      return normalizeMatch(String(vProduct)) === productNameNorm ||
             normalizeMatch(String(vProduct)).includes(productNameNorm);
    });
    if (rows.length === 0) return null;

    const cell = (v: unknown): string => {
      if (v === null || v === undefined || v === '') return '—';
      return String(v);
    };

    return (
      <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
            Packaging per Variant ({rows.length})
          </h3>
        </div>
        <div className="overflow-hidden -mx-6 -mb-6 mt-2">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted/50 border-b border-border/50">
                <tr className="text-xs font-semibold text-muted-foreground">
                  <th className="text-left px-6 py-2.5 font-medium">Variant</th>
                  <th className="text-left px-3 py-2.5 font-medium">Format</th>
                  <th className="text-left px-3 py-2.5 font-medium">Pcs / Box</th>
                  <th className="text-left px-3 py-2.5 font-medium">m² / Box</th>
                  <th className="text-left px-3 py-2.5 font-medium">Weight / Box</th>
                  <th className="text-left px-3 py-2.5 font-medium">Boxes / Pallet</th>
                  <th className="text-left px-6 py-2.5 font-medium">Pallet Weight</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const weightBoxKg = r.weight_box_kg ?? r.weight_per_box_kg;
                  const weightBoxLb = r.weight_box_lb ?? r.weight_per_box_lb;
                  const weightBox = weightBoxKg
                    ? (weightBoxLb ? `${weightBoxKg} kg (${weightBoxLb} lb)` : `${weightBoxKg} kg`)
                    : '—';
                  const m2Box = r.m2_box ?? r.m2_per_box;
                  const sqftBox = r.sqft_box ?? r.sqft_per_box;
                  const coverage = m2Box
                    ? (sqftBox ? `${m2Box} (${sqftBox} sqft)` : String(m2Box))
                    : '—';
                  const palletWeight = r.weight_pallet_kg ?? r.weight_per_pallet_kg;
                  return (
                    <tr
                      key={`pkgv-${i}`}
                      className="border-b border-border/30 hover:bg-muted/30 transition-colors"
                    >
                      <td className="px-6 py-2 font-medium">{cell(r.variant ?? r.name)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{cell(r.format ?? r.size)}</td>
                      <td className="px-3 py-2">{cell(r.pcs_box ?? r.pieces_per_box)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{coverage}</td>
                      <td className="px-3 py-2">{weightBox}</td>
                      <td className="px-3 py-2 text-muted-foreground">{cell(r.boxes_pallet ?? r.boxes_per_pallet)}</td>
                      <td className="px-6 py-2 text-muted-foreground">
                        {palletWeight ? `${palletWeight} kg` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        {/* Header with Factory/Brand Info + Quick Actions.
            Quote-based platform — no pricing/stock shown. Action buttons live
            in the header so users can quote / save from the first screen. */}
        <DialogHeader className="border-b pb-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <Factory className="h-5 w-5 text-muted-foreground" />
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{factory}</span>
                  {origin && (
                    <>
                      <span className="text-muted-foreground/40">•</span>
                      <span className="text-sm text-muted-foreground">{origin}</span>
                    </>
                  )}
                </div>
              </div>
              <DialogTitle className="text-2xl mb-1">
                {safeString(product.name, 'Unnamed Product')}
              </DialogTitle>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                {collection && <span className="font-medium">{collection}</span>}
                {collection && <span className="text-muted-foreground/40">•</span>}
                <span>SKU: {safeString(product.sku, 'N/A')}</span>
              </div>
            </div>
            {/* Quick actions — compact, right-aligned, mirrors the name area */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <AddToQuoteButton
                productId={product.id}
                productName={product.name}
                productImage={currentImage?.url}
                variant="default"
                size="sm"
                className="text-xs"
              />
              <AddToMoodboardButton
                productId={product.id}
                productName={product.name}
                productImage={currentImage?.url}
                variant="outline"
                size="sm"
                className="text-xs"
              />
            </div>
          </div>
          <DialogDescription className="text-sm text-muted-foreground mt-3">
            {safeString(product.description)}
          </DialogDescription>
        </DialogHeader>

        {/* Tabs — end-users see Details/Knowledge/Similar/Works Well With.
            Admins additionally see Chunks/Extraction/Monitor after those. */}
        <Tabs defaultValue="details" className="mt-6">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            {/* End-user tabs (always visible) */}
            <TabsTrigger value="details" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Info className="h-4 w-4" />
              Details
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <BookOpen className="h-4 w-4" />
              Knowledge
            </TabsTrigger>
            <TabsTrigger value="similar" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Sparkles className="h-4 w-4" />
              Similar
            </TabsTrigger>
            <TabsTrigger value="works-with" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Puzzle className="h-4 w-4" />
              Works Well With
            </TabsTrigger>
            {/* Admin-only tabs (after end-user tabs) */}
            {isAdmin && (
              <>
                <TabsTrigger value="chunks" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <FileText className="h-4 w-4" />
                  Chunks ({chunks.length})
                </TabsTrigger>
                <TabsTrigger value="extraction" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Database className="h-4 w-4" />
                  Extraction
                </TabsTrigger>
                <TabsTrigger value="monitor" className="flex items-center gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                  <Activity className="h-4 w-4" />
                  Monitor
                </TabsTrigger>
              </>
            )}
          </TabsList>

          {/* Details Tab */}
          <TabsContent value="details" className="mt-6">
            {/* Full description card — first thing on the Details tab so users
                see the narrative before diving into specs. Falls back through:
                  1. product.long_description
                  2. product.description
                  3. narrative paragraphs extracted from the product's chunks
                     (catches cases where the PDF had a description but the
                     AI extractor didn't populate the product column)
                Hidden entirely if no description can be found anywhere. */}
            {(() => {
              // Product.long_description is optional and not in the TS type;
              // cast through Record<string, unknown> so we can read it safely.
              const longDesc = safeString((product as unknown as Record<string, unknown>).long_description);
              const shortDesc = safeString(product.description);
              let fullDesc = longDesc || shortDesc;

              if (!fullDesc && chunks.length > 0) {
                // Pick narrative paragraphs from chunks — skip chunks that are
                // mostly SKU codes, page separators, or TOC-like lines, and
                // prefer chunks that mention the product name.
                const productNameLower = (product.name || '').toLowerCase();
                const candidates = chunks
                  .map(c => String(c.content || ''))
                  .filter(text => {
                    // Reject if mostly digits/codes (SKU tables)
                    const digitRatio = (text.match(/\d/g) || []).length / Math.max(text.length, 1);
                    if (digitRatio > 0.15) return false;
                    // Reject very short lines
                    if (text.trim().length < 80) return false;
                    return true;
                  })
                  .sort((a, b) => {
                    // Prefer chunks mentioning the product name
                    const aHasName = a.toLowerCase().includes(productNameLower) ? 1 : 0;
                    const bHasName = b.toLowerCase().includes(productNameLower) ? 1 : 0;
                    return bHasName - aHasName;
                  });

                if (candidates.length > 0) {
                  // Extract just the English narrative (skip "Page N" separators
                  // and bilingual duplicates). Take the first 2-3 sentences that
                  // look like product description.
                  const raw = candidates[0];
                  // Strip "--- # Page N ---" markers
                  const cleaned = raw
                    .replace(/---\s*#\s*Page\s*\d+\s*---/gi, '')
                    .replace(/Page\s*\d+/gi, '')
                    .replace(/^\d+\s+―/gm, '')
                    .replace(/\s{2,}/g, ' ')
                    .trim();
                  // Take up to the first 500 chars for a readable lead-in
                  fullDesc = cleaned.length > 500 ? cleaned.slice(0, 500).trim() + '…' : cleaned;
                }
              }

              if (!fullDesc) return null;
              return (
                <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6 mb-6">
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                      <Info className="h-4 w-4" />
                      Product Description
                    </h3>
                  </div>
                  <p className="text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
                    {fullDesc}
                  </p>
                </div>
              );
            })()}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Column: Image Slider (3/5 width) */}
          <div className="lg:col-span-3 space-y-4">
            {isLoadingImages ? (
              <div className="relative aspect-square bg-muted/30 rounded-xl overflow-hidden border border-border flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : images.length > 0 ? (
              <>
                <div className="relative aspect-square bg-muted/30 rounded-xl overflow-hidden border border-border">
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
                            ? 'border-primary ring-2 ring-primary ring-offset-2'
                            : 'border-border hover:border-muted-foreground/50'
                        }`}
                      >
                        <img src={image.url} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" loading="lazy" />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="relative aspect-square bg-muted/50 rounded-xl overflow-hidden border border-border flex items-center justify-center">
                <p className="text-muted-foreground">No images available</p>
              </div>
            )}
          </div>

          {/* Right Column: Technical Details (2/5 width) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Key Specifications Card */}
            <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
              <div className="mb-4">
                <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                  <Info className="h-4 w-4" />
                  Key Specifications
                </h3>
              </div>
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-border/30">
                  <span className="text-xs text-muted-foreground">Factory</span>
                  <span className="text-xs font-semibold">{factory}</span>
                </div>
                {(() => {
                  // Factory Group — only show when it is meaningfully different
                  // from Factory (groups like "Grupo Halcón" that own multiple brands).
                  const group = extractValue(allData?.factory_group_name);
                  if (!group || group === factory) return null;
                  return (
                    <div className="flex justify-between items-center py-2 border-b border-border/30">
                      <span className="text-xs text-muted-foreground">Factory Group</span>
                      <span className="text-xs font-semibold">{String(group)}</span>
                    </div>
                  );
                })()}
                {origin && (
                  <div className="flex justify-between items-center py-2 border-b border-border/30">
                    <span className="text-xs text-muted-foreground">Country of Origin</span>
                    <span className="text-xs font-semibold">{origin}</span>
                  </div>
                )}
                {collection && (
                  <div className="flex justify-between items-center py-2 border-b border-border/30">
                    <span className="text-xs text-muted-foreground">Collection</span>
                    <span className="text-xs font-semibold">{collection}</span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 border-b border-border/30">
                  <span className="text-xs text-muted-foreground">Material</span>
                  <span className="text-xs font-semibold">{material}</span>
                </div>
                {(() => {
                  const bodyType = extractValue(materialPropsData?.body_type);
                  if (!bodyType) return null;
                  return (
                    <div className="flex justify-between items-center py-2 border-b border-border/30">
                      <span className="text-xs text-muted-foreground">Body Type</span>
                      <span className="text-xs font-semibold capitalize">{String(bodyType)}</span>
                    </div>
                  );
                })()}
                <div className="flex justify-between items-center py-2 border-b border-border/30">
                  <span className="text-xs text-muted-foreground">Finish</span>
                  <span className="text-xs font-semibold capitalize">{finish}</span>
                </div>
                {(() => {
                  // Material subtype (from vision): "glazed relief", "3D embossed", etc.
                  const subtype = extractValue(materialPropsData?.material_subtype);
                  if (!subtype) return null;
                  return (
                    <div className="flex justify-between items-center py-2 border-b border-border/30">
                      <span className="text-xs text-muted-foreground">Subtype</span>
                      <span className="text-xs font-semibold capitalize">{String(subtype)}</span>
                    </div>
                  );
                })()}
                <div className="py-2 border-b border-border/30">
                  <span className="text-xs text-muted-foreground">Size</span>
                  {size === 'N/A' ? (
                    <span className="block text-xs font-semibold mt-1">—</span>
                  ) : (
                    <ul className="mt-1 space-y-0.5">
                      {size.split(', ').map((s, i) => (
                        <li key={i} className="text-xs font-semibold flex items-center gap-1.5">
                          <span className="w-1 h-1 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                          {s.trim()}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex justify-between items-center py-2 border-b border-border/30">
                  <span className="text-xs text-muted-foreground">Thickness</span>
                  <span className="text-xs font-semibold">{thickness || '—'}</span>
                </div>
                {Array.isArray(designData?.designers) && designData.designers.length > 0 && (
                  <div className="flex justify-between items-center py-2 border-b border-border/30">
                    <span className="text-xs text-muted-foreground">Designer</span>
                    <span className="text-xs font-semibold">{designData.designers.join(', ')}</span>
                  </div>
                )}

                {/* Packaging subsection — inside Key Specs card, below Material Properties.
                    Only renders rows whose values are non-empty, so sparse products
                    still show a clean card without placeholder junk. */}
                {(() => {
                  const pkg = (allData?.packaging || {}) as Record<string, unknown>;
                  const pick = (k: string): string | null => {
                    const v = pkg[k];
                    if (v === null || v === undefined || v === '') return null;
                    if (typeof v === 'number') return String(v);
                    if (typeof v === 'string') return v;
                    // {value, confidence} wrapper
                    if (typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
                      const inner = (v as Record<string, unknown>).value;
                      return inner != null ? String(inner) : null;
                    }
                    return null;
                  };
                  const pieces = pick('pieces_per_box');
                  const patternsCount = pick('patterns_count');
                  const boxes = pick('boxes_per_pallet');
                  const coverageM2 = pick('m2_per_box') ?? pick('coverage_m2');
                  const coverageSqft = pick('sqft_per_box') ?? pick('coverage_sqft');
                  const weightKg = pick('weight_per_box_kg') ?? pick('weight_kg');
                  const weightLb = pick('weight_per_box_lb') ?? pick('weight_lb');
                  const palletKg = pick('weight_per_pallet_kg');

                  const rows = [
                    pieces && { label: 'Pieces / Box', value: pieces },
                    patternsCount && { label: 'Patterns', value: patternsCount },
                    coverageM2 && {
                      label: 'Coverage / Box',
                      value: coverageSqft ? `${coverageM2} m² (${coverageSqft} sqft)` : `${coverageM2} m²`,
                    },
                    weightKg && {
                      label: 'Weight / Box',
                      value: weightLb ? `${weightKg} kg (${weightLb} lb)` : `${weightKg} kg`,
                    },
                    boxes && { label: 'Boxes / Pallet', value: boxes },
                    palletKg && { label: 'Pallet Weight', value: `${palletKg} kg` },
                  ].filter(Boolean) as Array<{ label: string; value: string }>;

                  if (rows.length === 0) return null;
                  return (
                    <>
                      <div className="pt-2 pb-1">
                        <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">Packaging</p>
                      </div>
                      {rows.map((r, i) => (
                        <div
                          key={r.label}
                          className={`flex justify-between items-center py-2 ${i < rows.length - 1 ? 'border-b border-border/30' : ''}`}
                        >
                          <span className="text-xs text-muted-foreground">{r.label}</span>
                          <span className="text-xs font-semibold">{r.value}</span>
                        </div>
                      ))}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Pricing & Availability intentionally removed —
                quote-based platform, retail/wholesale/stock aren't tracked.
                Quick quote/moodboard actions live in the DialogHeader. */}

            {/* VR / Video / 3D Actions */}
            {(onGenerateVR || onGenerateVideo || onUseIn3DScene) && currentImage?.url && (
              <div className="flex flex-wrap gap-2">
                {onUseIn3DScene && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1.5 text-xs rounded-full"
                    onClick={() => { onUseIn3DScene(currentImage.url, product.name); onClose(); }}
                  >
                    <Box className="h-3.5 w-3.5" />
                    Use in 3D Scene
                  </Button>
                )}
                {onGenerateVR && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1.5 text-xs rounded-full"
                    disabled={vrGenerating}
                    onClick={() => { onGenerateVR(currentImage.url, { prompt: product.name }); onClose(); }}
                  >
                    <Globe className="h-3.5 w-3.5" />
                    {vrGenerating ? 'Generating...' : 'VR World'}
                  </Button>
                )}
                {onGenerateVideo && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1.5 text-xs rounded-full"
                    onClick={() => { onGenerateVideo(currentImage.url); onClose(); }}
                  >
                    <Video className="h-3.5 w-3.5" />
                    Generate Video
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Metadata Sections.
            Layout rules:
              - Material Properties is NOT rendered here — Material Category,
                Body Type, Finish, Subtype, Thickness, Size, Designer all live
                in the Key Specifications sidebar.
              - Packaging, Dimensions, Manufacturing are NOT rendered here
                either (also in sidebar).
              - Appearance: full-width (colors + patterns + textures).
              - Performance + Application share a row.
              - Certifications + Care & Maintenance share a row.
              - Design and Commercial follow full-width.
              - Variants table at the very bottom. */}
        <div className="mt-6 space-y-4">
          {(() => {
            // Appearance card layout:
            //   1. Patterns chip row          (full width, if any)
            //   2. Colors chip row            (full width, if any)
            //   3. Observed Shades chip row   (full width, if any)
            //   4. Remaining scalar fields    (2-column grid)
            // Colors/Shades used to render as bulleted lists stacked vertically
            // which wasted space. They're now compact horizontal chips,
            // capitalized per word.
            const hasAppearanceFields = Object.values(appearance).some(
              v => v && v !== 'N/A' && v !== '',
            );
            if (patternsList.length === 0 && !hasAppearanceFields) return null;

            // Title-case every word: "terracotta red" → "Terracotta Red"
            const titleCase = (s: string): string =>
              s.replace(/\b\w/g, c => c.toUpperCase());

            // Split a comma-separated value into clean, capitalized items.
            const splitToChips = (val: unknown): string[] => {
              const raw = typeof val === 'string' ? val : renderValue(val);
              if (!raw || raw === 'N/A') return [];
              return raw
                .split(',')
                .map(s => s.trim())
                .filter(Boolean)
                .map(titleCase);
            };

            const colorChips = splitToChips(appearance['Colors']);
            const shadeChips = splitToChips(appearance['Observed Shades']);

            // Everything else (Primary Color hex, Pattern, Texture, etc.) still
            // renders in the 2-col grid. Exclude the multi-value list fields
            // that are now shown as chip rows above.
            const CHIP_ROW_KEYS = new Set(['Colors', 'Observed Shades']);
            const HEX_RE = /^#[0-9a-fA-F]{3,8}$/;
            const gridFields = Object.entries(appearance).filter(
              ([k, v]) => !CHIP_ROW_KEYS.has(k) && v && v !== 'N/A' && v !== '',
            );

            // Compact chip-row block reused for Colors + Observed Shades.
            const renderChipRow = (label: string, chips: string[]) => {
              if (chips.length === 0) return null;
              return (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {label} ({chips.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {chips.map(c => (
                      <Badge
                        key={c}
                        variant="outline"
                        className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-muted/40 border-border/50"
                      >
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            };

            return (
              <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
                <div className="mb-4">
                  <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                    Appearance
                  </h3>
                </div>
                {patternsList.length > 0 && (
                  <div className="mb-4">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                      Available Patterns ({patternsList.length})
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {patternsList.map(p => (
                        <Badge
                          key={p}
                          variant="outline"
                          className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-primary/10 border-primary/30 text-primary"
                        >
                          {titleCase(p)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                {renderChipRow('Colors', colorChips)}
                {renderChipRow('Observed Shades', shadeChips)}
                {gridFields.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {gridFields.map(([key, value]) => {
                      const str = renderValue(value);
                      if (HEX_RE.test(str)) {
                        return (
                          <div key={key} className="bg-muted/30 rounded-lg p-3">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{key}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <span
                                className="inline-block w-5 h-5 rounded border border-border/50 flex-shrink-0"
                                style={{ backgroundColor: str }}
                                aria-label={`Color swatch ${str}`}
                              />
                              <p className="text-xs font-semibold">{str}</p>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={key} className="bg-muted/30 rounded-lg p-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{key}</p>
                          <p className="text-xs font-semibold">{titleCase(str)}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {renderMetadataCategory('Performance', performance)}
            {renderMetadataCategory('Application & Installation', application)}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {renderCertificationsCard()}
            {renderMetadataCategory('Care & Maintenance', careAndMaintenance)}
          </div>
          {renderMetadataCategory('Design & Style', design)}
          {renderMetadataCategory('Commercial Information', commercial)}
          {renderVariantsTable()}
          {renderPackagingPerVariantTable()}
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
                      <p className="text-sm text-foreground whitespace-pre-wrap">
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
                        <p className="text-sm text-muted-foreground">
                          This product has a source document but no chunk relationships.
                        </p>
                        <p className="text-sm text-muted-foreground">
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
      {/* Knowledge Tab — visible to all users */}
      <TabsContent value="knowledge" className="mt-6">
        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Knowledge Base Articles</h3>
          {kbDocs.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8 text-muted-foreground">
                  <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No knowledge base articles yet</p>
                  <p className="text-sm mt-2">
                    Cleaning, handling, installation and regulation guides will appear here
                    once the catalog knowledge extractor has run.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {(() => {
                // Group KB docs by relationship_type so related content displays together
                const groups: Record<string, typeof kbDocs> = {};
                for (const d of kbDocs) {
                  const g = d.relationship_type || 'other';
                  (groups[g] = groups[g] || []).push(d);
                }
                // Preferred display order
                const order = [
                  'packaging',
                  'care',
                  'installation',
                  'regulation',
                  'certification',
                  'compliance',
                  'sustainability',
                  'reference',
                  'legal',
                  'brand',
                  'other',
                ];
                const sortedKeys = Object.keys(groups).sort((a, b) => {
                  const ai = order.indexOf(a);
                  const bi = order.indexOf(b);
                  return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
                });
                const prettyLabel = (k: string) =>
                  k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                return sortedKeys.map(groupKey => (
                  <div key={groupKey} className="space-y-3">
                    <h4 className="text-sm font-semibold text-primary">
                      {prettyLabel(groupKey)}
                    </h4>
                    {groups[groupKey].map(doc => (
                      <Card key={doc.id} className="dashboard-card rounded-2xl border-0 shadow-sm">
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base flex items-center gap-2">
                            <BookOpen className="h-4 w-4" />
                            {doc.title}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {doc.summary && (
                            <p className="text-sm text-muted-foreground mb-3 italic">
                              {doc.summary}
                            </p>
                          )}
                          <div className="text-sm whitespace-pre-wrap leading-relaxed text-foreground/90">
                            {(doc.content_markdown || doc.content || '').slice(0, 1500)}
                            {(doc.content_markdown || doc.content || '').length > 1500 && '…'}
                          </div>
                          {Array.isArray((doc.metadata as any)?.key_points) &&
                            (doc.metadata as any).key_points.length > 0 && (
                            <ul className="mt-3 space-y-1">
                              {((doc.metadata as any).key_points as string[]).slice(0, 6).map((p, i) => (
                                <li key={i} className="text-xs flex items-start gap-2 text-muted-foreground">
                                  <span className="mt-1.5 w-1 h-1 rounded-full bg-muted-foreground/60 flex-shrink-0" />
                                  {p}
                                </li>
                              ))}
                            </ul>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ));
              })()}
            </div>
          )}
        </div>
      </TabsContent>

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
      {/* Similar Products Tab */}
      <TabsContent value="similar" className="mt-6">
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Similar Products</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Other products from the same collection or with a matching visual style.
          </p>
          <ProductRecommendationsPanel
            productId={product.id}
            mode="similar"
            onProductClick={(id) => setStackedProductId(id)}
          />
        </div>
      </TabsContent>

      {/* Works Well With Tab */}
      <TabsContent value="works-with" className="mt-6">
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-foreground">Works Well With</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Products from different collections that pair well — complementary colors, textures, and categories.
          </p>
          <ProductRecommendationsPanel
            productId={product.id}
            mode="complementary"
            onProductClick={(id) => setStackedProductId(id)}
          />
        </div>
      </TabsContent>

      {/* Monitor Tab — Admin only (price tracking / supply monitoring) */}
      {isAdmin && (
        <TabsContent value="monitor" className="mt-6">
          <ProductMonitorTab
            productId={product.id}
            productName={product.name}
            currentPrice={product.pricing?.retail}
            currency={product.pricing?.currency}
          />
        </TabsContent>
      )}
    </Tabs>

    {/* Stacked product modal — opened when clicking a recommendation card */}
    {stackedProduct && (
      <ProductDetailModal
        product={stackedProduct}
        isOpen={true}
        onClose={() => { setStackedProductId(null); setStackedProduct(null); }}
      />
    )}
      </DialogContent>
    </Dialog>
  );
};

export default ProductDetailModal;
