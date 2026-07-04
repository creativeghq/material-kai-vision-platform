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
import { ChevronLeft, ChevronRight, Factory, Info, Activity, Loader2, BookOpen, Database, Sparkles, Globe, Video, Box, Search, Palette, ScanText, Settings2, Star, Wrench, Droplets, ShoppingCart, Ruler, Package, Layers, ShieldCheck, Wand2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { buildTestOnRoomUrl } from '@/utils/testOnRoom';
import { Product, getMaterialCategory, MaterialCategory } from './types';
import { formatMaterialCategory } from '@/utils/productMetadata';
import { usePermissions } from '@/hooks/usePermissions';
import { AddToQuoteButton } from '@/modules/quotes/components/AddToQuoteButton';
import { AddToMoodboardButton } from '@/components/business/moodboard/AddToMoodboardButton';
import { ProductMonitorTab } from '@/components/business/price-monitoring/ProductMonitorTab';
import { MentionMonitorTab } from '@/components/business/mention-monitoring/MentionMonitorTab';
import ProductSEOTab from '@/components/business/seo-toolkit/ProductSEOTab';
import { PriceLookupDrawer } from '@/components/features/pricing/PriceLookupDrawer';
import { WorkspaceCostBadge } from '@/components/business/marketplace/WorkspaceCostBadge';
import { ProductMydataCard } from '@/components/business/marketplace/ProductMydataCard';
import { ProductPricingCard } from '@/components/business/marketplace/ProductPricingCard';
import { DollarSign } from 'lucide-react';
import { ProductRecommendationsPanel } from './ProductRecommendationsPanel';
import { supabase } from '@/integrations/supabase/client';
import { generateGroutRecommendations, formatGroutSuggestion } from '@/utils/groutSuggestions';
import {
  getCategoryDisplayConfig,
  resolveUploadCategory,
  type UploadCategory,
} from '@/lib/categoryFieldRegistry';

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

// Coerce a metadata field (typed as `unknown` because ProductMetadata
// fields are wrapper-or-primitive polymorphic) into a plain string for
// downstream APIs that expect `string | undefined`. Unwraps the
// {value, confidence} envelope when present.
const asMetaString = (v: unknown): string | undefined => {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
    const inner = (v as Record<string, unknown>).value;
    return inner == null || inner === '' ? undefined : String(inner);
  }
  return String(v);
};

// Per-field confidence — pulls from the {value, confidence} wrapper if
// present. Stage 0 AI extraction writes these wrappers on every field it
// extracts; Stage 4.5/4.6/4.7 fills also tag confidence under
// _extraction_metadata. We surface this as a small badge so low-confidence
// fields don't masquerade as authoritative.
const LOW_CONFIDENCE_THRESHOLD = 0.6;
const getFieldConfidence = (val: unknown): number | undefined => {
  if (!val || typeof val !== 'object') return undefined;
  const obj = val as Record<string, unknown>;
  // Wrapper shape: {value, confidence}
  if ('value' in obj && 'confidence' in obj) {
    const c = obj.confidence;
    if (typeof c === 'number') return c;
    if (typeof c === 'string') {
      const n = parseFloat(c);
      return Number.isFinite(n) ? n : undefined;
    }
  }
  return undefined;
};
const isLowConfidence = (val: unknown): boolean => {
  const c = getFieldConfidence(val);
  return typeof c === 'number' && c < LOW_CONFIDENCE_THRESHOLD;
};

// Display normalizers — upstream extractors emit inconsistent casing
// ("matte" vs "Matte") and size formatting ("11,8X11,8" vs "11,8x11,8 cm").
// Source data is left intact; we normalize at the render boundary.
const DISPLAY_SENTINEL = '—';
const titleCaseDisplay = (s: string): string =>
  s.toLowerCase().replace(/\b\p{L}/gu, c => c.toUpperCase());
const isSentinel = (s: string | undefined): boolean =>
  !s || s === DISPLAY_SENTINEL || s === 'N/A';
const normColor = (s: string): string =>
  isSentinel(s) ? DISPLAY_SENTINEL : titleCaseDisplay(s.trim());
const normPattern = (s: string): string =>
  isSentinel(s) ? DISPLAY_SENTINEL : titleCaseDisplay(s.trim());
const normFinish = (s: string | undefined): string | undefined =>
  isSentinel(s) ? s : titleCaseDisplay((s as string).trim());
const normSize = (s: string): string => {
  if (isSentinel(s)) return DISPLAY_SENTINEL;
  return s
    .trim()
    .replace(/(\d)\s*[xX×]\s*(\d)/g, '$1x$2')
    .replace(/\s+/g, ' ');
};
const normVariantName = (s: string): string =>
  isSentinel(s) ? DISPLAY_SENTINEL : s.trim().toUpperCase();
// Strip trailing units for dedup-key purposes so "11,8x11,8" and
// "11,8x11,8 cm" collapse onto the same row.
const sizeDedupKey = (s: string): string =>
  normSize(s).replace(/\s*(cm|mm|m)\s*$/i, '').trim().toLowerCase();
// snake_case_field → "Snake Case Field" for displaying raw metadata keys.
// Unicode-safe; handles accented chars, Greek letters, hyphens.
const prettyFieldLabel = (k: string): string =>
  k.replace(/_/g, ' ').replace(/\b\p{L}/gu, c => c.toUpperCase());

// Title-case for cert chips. Common all-caps acronyms stay all-caps. The
// matcher splits on whitespace AND hyphens so "ISO-14001" → "ISO-14001"
// (not "Iso-14001").
const CERT_ALL_CAPS = new Set(['iso', 'ce', 'en', 'leed', 'breeam', 'ul', 'astm', 'din', 'epd', 'voc', 'cri', 'fsc', 'pefc', 'reach', 'rohs']);
const normCertToken = (w: string): string => {
  // Word with digits like "14001" stays as-is; pure-alpha tokens get acronym/title rules.
  if (!/[a-zA-Z]/.test(w)) return w;
  return CERT_ALL_CAPS.has(w.toLowerCase()) ? w.toUpperCase() : titleCaseDisplay(w);
};
const normCertName = (s: string): string => {
  if (isSentinel(s)) return s;
  // Tokenize on whitespace, then per token re-tokenize on hyphens so each
  // hyphen-separated piece gets its own all-caps check.
  return s.trim().split(/\s+/).map(word =>
    word.split('-').map(normCertToken).join('-'),
  ).join(' ');
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

// Get category-specific color theme — supports all 10 DB categories + legacy display categories
const getCategoryTheme = (category: MaterialCategory): { primary: string; secondary: string } => {
  const themes: Record<string, { primary: string; secondary: string }> = {
    // DB categories (10)
    tiles:             { primary: '#3b82f6', secondary: '#dbeafe' },
    wood:              { primary: '#92400e', secondary: '#fef3c7' },
    decor:             { primary: '#8b5cf6', secondary: '#ede9fe' },
    furniture:         { primary: '#d97706', secondary: '#fef3c7' },
    general_materials: { primary: '#6b7280', secondary: '#f3f4f6' },
    paint_wall_decor:  { primary: '#10b981', secondary: '#d1fae5' },
    heating:           { primary: '#ef4444', secondary: '#fee2e2' },
    sanitary:          { primary: '#06b6d4', secondary: '#cffafe' },
    kitchen:           { primary: '#f59e0b', secondary: '#fef3c7' },
    lighting:          { primary: '#eab308', secondary: '#fef9c3' },
    // Legacy display categories
    stone:             { primary: '#6b7280', secondary: '#f3f4f6' },
    paint:             { primary: '#10b981', secondary: '#d1fae5' },
    fabric:            { primary: '#db2777', secondary: '#fce7f3' },
    metal:             { primary: '#374151', secondary: '#e5e7eb' },
    glass:             { primary: '#0891b2', secondary: '#cffafe' },
    composite:         { primary: '#059669', secondary: '#d1fae5' },
    other:             { primary: '#6b7280', secondary: '#f3f4f6' },
  };
  return themes[category] || themes.other;
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
  // #195 — admin diagnostic surfaces (embeddings/relevances, myDATA card, price lookup) gate on
  // node-admin via the unified capability layer (replaces the per-mount workspace_members fetch).
  // pricing.manage is granted to exactly the owner/admin personas (operator/dealer/architect),
  // preserving the old `workspace_members.role IN (owner,admin)` behaviour for the active workspace.
  const { can } = usePermissions();
  const isAdmin = can('pricing.manage');
  const navigate = useNavigate();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [images, setImages] = useState<any[]>([]);
  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [chunks, setChunks] = useState<any[]>([]);
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
  // Price lookup drawer (admin-only)
  const [priceLookupOpen, setPriceLookupOpen] = useState(false);

  // All hooks must be declared before any conditional return (Rules of Hooks)

  // Load stacked product when a recommendation card is clicked
  useEffect(() => {
    if (!stackedProductId) { setStackedProduct(null); return; }
    supabase
      .from('products')
      .select('*')
      .eq('id', stackedProductId)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setStackedProduct(data as unknown as Product);
      });
  }, [stackedProductId]);


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
  // Normalized to title case so "matte" / "Matte" / "MATTE" all render as "Matte".
  const finishRaw = extractValue(materialPropsData?.finish)
    || extractValue(allData?.finish)
    || '—';
  const finish = normFinish(finishRaw) || '—';
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

  // Smart color extraction — prefers product-specific available_colors, then tries to match by name.
  // Output is title-cased and deduped (case-insensitive) so "warm white" / "Warm White" /
  // duplicates from upstream sources collapse to one entry.
  const formatColorList = (raw: unknown): string | undefined => {
    if (!raw) return undefined;
    const arr = Array.isArray(raw)
      ? (raw as unknown[]).map(c => String(c).trim()).filter(Boolean)
      : typeof raw === 'string'
        ? raw.split(',').map(s => s.trim()).filter(Boolean)
        : [String(raw)];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of arr) {
      const t = titleCaseDisplay(c);
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
    return out.length ? out.join(', ') : undefined;
  };
  const extractProductColors = (): string | undefined => {
    // available_colors is a simple per-product array (most reliable for individual product rows)
    const avColors = allData?.available_colors;
    if (Array.isArray(avColors) && avColors.length > 0) {
      return formatColorList(avColors);
    }
    const colData = appearanceData?.colors;
    const colVal = (colData && typeof colData === 'object' && 'value' in (colData as Record<string, unknown>))
      ? (colData as Record<string, unknown>).value
      : colData;
    if (!colVal) return undefined;
    if (Array.isArray(colVal)) return formatColorList(colVal);
    if (typeof colVal === 'object' && colVal !== null) {
      const entries = Object.entries(colVal as Record<string, unknown>);
      // Try to find key matching this product
      const match = entries.find(([k]) => {
        const kn = normalizeMatch(k);
        return kn === productNameNorm || kn.includes(productNameNorm);
      });
      if (match) {
        const v = match[1];
        return Array.isArray(v) ? formatColorList(v) : formatColorList(String(v));
      }
      // No match for this product — leave empty
      return undefined;
    }
    return formatColorList(String(colVal));
  };

  // Appearance colors: prefer the explicit `available_colors` (per-product
  // primary colors from the AI extractor), then fall back to the vision-rollup
  // color list (20 perceptual shades across the images). Show both if they
  // differ meaningfully so users see both the "official" and the "observed"
  // palette.
  const primaryColors = extractProductColors() || formatColorList(extractValue(allData?.colors));
  const visionColorsRaw = appearanceData?.colors_from_vision;
  const visionColors = (() => {
    if (!Array.isArray(visionColorsRaw)) return undefined;
    const all = (visionColorsRaw as unknown[])
      .map(c => String(c).trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const deduped: string[] = [];
    for (const c of all) {
      const t = titleCaseDisplay(c);
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      deduped.push(t);
    }
    if (deduped.length === 0) return undefined;
    const cap = 12;
    const shown = deduped.slice(0, cap);
    const overflow = deduped.length - cap;
    return overflow > 0 ? `${shown.join(', ')} (+${overflow} more)` : shown.join(', ');
  })();
  // Compare primary vs observed as case-insensitive sets so "[White, Grey]" and
  // "[grey, white]" don't both render under different headings.
  const colorSetKey = (s: string | undefined): string =>
    !s ? '' : s.replace(/\s*\(\+\d+\s*more\)\s*$/, '')
      .split(',').map(c => c.trim().toLowerCase()).filter(Boolean).sort().join('|');
  const showObservedShades = visionColors && colorSetKey(visionColors) !== colorSetKey(primaryColors);

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
    const collect = (items: unknown[]): string[] => {
      const seen = new Set<string>();
      const out: string[] = [];
      items.forEach(p => {
        const s = String(p).trim();
        if (!s || isSentinel(s)) return;
        const t = titleCaseDisplay(s);
        const k = t.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        out.push(t);
      });
      return out.sort();
    };
    if (Array.isArray(inner)) return collect(inner as unknown[]);
    if (typeof inner === 'string' && inner.trim()) {
      return collect(inner.split(/[,;]/));
    }
    return [];
  })();

  // Vision-rolled-up textures (post-2026-05-04 schema fix) — list, deduped + title-cased
  const visionTexturesList: string[] = (() => {
    const raw = appearanceData?.textures ?? allData?.textures;
    const inner = (raw && typeof raw === 'object' && 'value' in (raw as Record<string, unknown>))
      ? (raw as Record<string, unknown>).value
      : raw;
    if (!Array.isArray(inner)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of inner as unknown[]) {
      const s = String(t).trim();
      if (!s || isSentinel(s)) continue;
      const pretty = titleCaseDisplay(s);
      const k = pretty.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(pretty);
    }
    return out.sort();
  })();

  const appearance = {
    'Colors': primaryColors,
    'Observed Shades': showObservedShades ? visionColors : undefined,
    'Primary Color': extractValue(appearanceData?.primary_color_hex),  // hex swatch (legacy field — typically empty post-2026-05-04)
    'Vision Category': normFinish(extractValue(appearanceData?.category)),
    'Vision Subcategory': normFinish(extractValue(appearanceData?.subcategory)),
    // Only show singular "Pattern" key if we DON'T have the aggregated list
    // (avoids duplicating information with the chip row above).
    'Pattern': patternsList.length === 0 ? normFinish(extractValue(appearanceData?.pattern)) : undefined,
    'Texture': visionTexturesList.length === 0 ? normFinish(extractValue(appearanceData?.texture)) : undefined,
    'Textures': visionTexturesList.length > 0 ? visionTexturesList.join(', ') : undefined,
    'Shade Variation': extractValue(appearanceData?.shade_variation),
    'Visual Effect': extractValue(appearanceData?.visual_effect),
    'Visual Description': extractValue(appearanceData?.vision_description),
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

  // Pretty-print recommended_use arrays as "Wall, Floor, Shower Wall".
  // Filters sentinels, dedups case-insensitively, sorts for stable rendering.
  const fmtList = (v: unknown): string | undefined => {
    if (!v) return undefined;
    const items: string[] = Array.isArray(v)
      ? (v as unknown[]).map(x => String(x))
      : typeof v === 'string'
        ? [v]
        : [String(v)];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of items) {
      const s = raw.replace(/_/g, ' ').trim();
      if (!s || isSentinel(s)) continue;
      const t = titleCaseDisplay(s);
      const k = t.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(t);
    }
    return out.length ? out.sort().join(', ') : undefined;
  };

  // Joint width: if the schema-locked `_mm` variant is present, append "mm".
  // Otherwise fall back to the raw field — append "mm" only when the raw
  // value is a bare number (avoids "8 mm mm" double-suffix).
  const formatJointWidth = (): string | undefined => {
    const mm = extractValue(applicationData?.joint_width_mm);
    if (mm) return `${mm} mm`;
    const raw = extractValue(applicationData?.joint_width) || extractValue(allData?.joint_width);
    if (!raw) return undefined;
    return /^\d+(?:[.,]\d+)?$/.test(raw.trim()) ? `${raw.trim()} mm` : raw;
  };

  const application = {
    // Single key — fmtList chains the three possible sources and dedups.
    'Recommended Use': fmtList([
      ...((Array.isArray(applicationData?.recommended_use) ? applicationData.recommended_use : [applicationData?.recommended_use]) as unknown[]),
      ...((Array.isArray(allData?.applications) ? allData.applications : [allData?.applications]) as unknown[]),
      ...((Array.isArray(allData?.recommended_use) ? allData.recommended_use : [allData?.recommended_use]) as unknown[]),
    ].filter(Boolean)),
    'Installation Method': extractValue(applicationData?.installation_method) || extractValue(applicationData?.installation),
    'Joint Width': formatJointWidth(),
    'Room Type': fmtList([
      ...((Array.isArray(applicationData?.room_type) ? applicationData.room_type : [applicationData?.room_type]) as unknown[]),
      ...((Array.isArray(applicationData?.suitable_rooms) ? applicationData.suitable_rooms : [applicationData?.suitable_rooms]) as unknown[]),
      ...((Array.isArray(allData?.room_type) ? allData.room_type : [allData?.room_type]) as unknown[]),
    ].filter(Boolean)),
  };

  const design = {
    'Designer': Array.isArray(designData?.designers)
      ? designData.designers.join(', ')
      : extractValue(designData?.designers) || extractValue(designData?.studio),
    'Studio': extractValue(designData?.studio),
    'Collection': collection,
    'Brand': extractValue(designData?.brand),
    // Style: prefer schema-locked `style`, fall back to legacy `design_style`. Title-cased.
    'Design Style': normFinish(extractValue(designData?.style) || extractValue(designData?.design_style)),
    'Material Subtype': normFinish(extractValue(materialPropsData?.material_subtype)),
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

    // ─── Dedup pass ────────────────────────────────────────────────────
    // Multiple sources (vision_variants, sku_codes, commercial.product_table)
    // can emit the same physical variant in different shapes — different SKU
    // formats (compound "VALENOVA TAUPE LT/11,8X11,8" vs catalog "39661"),
    // different casing ("taupe" vs "Taupe"), unit-trailing sizes
    // ("11,8x11,8" vs "11,8x11,8 cm"), or partially-populated patterns
    // ("—" vs "12 patterns"). Collapse these onto a single row, taking the
    // most-informative value per cell and unioning grout codes.
    const isMoreInformativeSku = (a: string, b: string): boolean => {
      // Prefer non-sentinel, then non-compound (no "/"), then numeric, then shorter
      if (a === DISPLAY_SENTINEL && b !== DISPLAY_SENTINEL) return false;
      if (b === DISPLAY_SENTINEL && a !== DISPLAY_SENTINEL) return true;
      const aCompound = a.includes('/');
      const bCompound = b.includes('/');
      if (aCompound !== bCompound) return !aCompound;
      const aNumeric = /^\d+$/.test(a);
      const bNumeric = /^\d+$/.test(b);
      if (aNumeric !== bNumeric) return aNumeric;
      return a.length < b.length;
    };
    const pickBetter = (a: string, b: string): string => {
      if (!a || a === DISPLAY_SENTINEL) return b || a;
      if (!b || b === DISPLAY_SENTINEL) return a;
      // Prefer the longer non-sentinel value (more info: "12 Patterns" > "—",
      // "11,8x11,8 cm" > "11,8x11,8")
      return b.length > a.length ? b : a;
    };

    const groups = new Map<string, Variant>();
    for (const v of variants) {
      // Dedup key: normalized name + color + size-without-unit. SKUs and grout
      // codes are NOT in the key — they're allowed to differ between siblings.
      const key = [
        normVariantName(v.name),
        normColor(v.color),
        sizeDedupKey(v.size),
      ].join('|');
      const existing = groups.get(key);
      if (!existing) {
        groups.set(key, { ...v, groutCodes: { ...v.groutCodes } });
        continue;
      }
      existing.sku = isMoreInformativeSku(v.sku, existing.sku) ? v.sku : existing.sku;
      existing.name = pickBetter(existing.name, v.name);
      existing.color = pickBetter(existing.color, v.color);
      existing.pattern = pickBetter(existing.pattern, v.pattern);
      existing.size = pickBetter(existing.size, v.size);
      // Union grout codes — keep first non-empty per supplier
      for (const [sup, code] of Object.entries(v.groutCodes || {})) {
        if (code && !existing.groutCodes[sup]) existing.groutCodes[sup] = code;
      }
    }

    return Array.from(groups.values());
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
    const out: string[] = [];
    for (const raw of candidates) {
      const cert = normCertName(raw);
      const norm = cert.toLowerCase().replace(/[\s-]/g, '');
      if (seen.has(norm)) continue;
      seen.add(norm);
      out.push(cert);
    }
    return out;
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
            <ShieldCheck className="h-4 w-4" />
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

  // Helper function to safely render any value (handles objects, arrays, primitives).
  // Strips internal metadata keys (confidence, source, extraction_method) that
  // should never be shown to end users.
  const INTERNAL_KEYS = new Set(['confidence', 'source', 'extraction_method', 'extraction_timestamp']);

  const renderValue = (value: unknown): string => {
    if (value === null || value === undefined) return 'N/A';

    // Handle {value, confidence} objects FIRST — extract just the value
    if (typeof value === 'object' && value !== null && 'value' in value) {
      const obj = value as Record<string, unknown>;
      const innerValue = obj.value;
      if (innerValue === null || innerValue === undefined) return 'N/A';
      return renderValue(innerValue); // Recurse to handle nested structures
    }

    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(v => renderValue(v)).filter(v => v !== 'N/A').join(', ');
    }

    // Handle plain objects — format as readable key: value pairs,
    // skipping internal/metadata keys
    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([k]) => !INTERNAL_KEYS.has(k));
      if (entries.length === 0) return 'N/A';
      // If only one meaningful entry, just show the value
      if (entries.length === 1) return renderValue(entries[0][1]);
      return entries
        .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${renderValue(v)}`)
        .join(', ');
    }

    // Handle primitives
    return String(value);
  };

  // Helper function to render metadata category.
  //
  // `lowConfidenceKeys` — optional set of display keys whose values were
  // extracted with confidence < LOW_CONFIDENCE_THRESHOLD. Populated by the
  // dynamic-discovery sections that have direct access to wrappers.
  // Low-confidence cells render at reduced opacity with a tooltip so users
  // know the value is less trustworthy than the un-marked ones.
  const renderMetadataCategory = (
    title: string,
    data: Record<string, unknown>,
    lowConfidenceKeys?: Set<string>,
    icon?: React.ReactNode,
  ) => {
    const filteredData = Object.entries(data).filter(([, value]) => {
      const str = renderValue(value);
      return str && str !== 'N/A' && str !== '';
    });
    if (filteredData.length === 0) return null;

    // CSS hex colors are exactly 3, 4, 6, or 8 chars after the `#` (rgb / rgba / rrggbb / rrggbbaa).
    // 5 and 7 char strings are not valid CSS — exclude them so we don't render bogus swatches.
    const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

    return (
      <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">{icon}{title}</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {filteredData.map(([key, value]) => {
            const str = renderValue(value);
            const lowConf = lowConfidenceKeys?.has(key) ?? false;
            const lowConfClass = lowConf ? 'opacity-60' : '';
            const lowConfTitle = lowConf ? 'Low extraction confidence — verify against source' : undefined;

            // Hex color values → render as color swatch + code
            if (HEX_RE.test(str)) {
              return (
                <div
                  key={key}
                  title={lowConfTitle}
                  className={`flex items-center justify-between py-2 border-b border-border/20 ${lowConfClass}`}
                >
                  <span className="text-xs text-muted-foreground">{key}{lowConf && <span className="ml-1 text-amber-500">·</span>}</span>
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-4 h-4 rounded border border-border/50 flex-shrink-0" style={{ backgroundColor: str }} />
                    <span className="text-xs font-semibold">{str}</span>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={key}
                title={lowConfTitle}
                className={`flex items-start justify-between py-2 border-b border-border/20 gap-4 ${lowConfClass}`}
              >
                <span className="text-xs text-muted-foreground shrink-0">{key}{lowConf && <span className="ml-1 text-amber-500">·</span>}</span>
                <span className="text-xs font-semibold text-right">{str}</span>
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
            <Layers className="h-4 w-4" />
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
                    <td className="px-3 py-2 font-medium">{normVariantName(variant.name)}</td>
                    <td className="px-3 py-2">
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full border border-border/50 flex-shrink-0"
                          style={{ backgroundColor: colorSwatch(variant.color) }}
                        />
                        {normColor(variant.color)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{normPattern(variant.pattern)}</td>
                    <td className="px-3 py-2 text-muted-foreground">{normSize(variant.size)}</td>
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
            <Package className="h-4 w-4" />
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

  // ─── Completeness infrastructure (category-agnostic) ────────────────────────
  // The Details tab must surface EVERY metadata field that has a value,
  // regardless of category. `consumedKeys` tracks every raw metadata key that
  // a curated/structured renderer has already shown, so the catch-all at the
  // bottom can render literally everything else without duplication. Seeded
  // with the keys consumed by the special cards (appearance / certifications /
  // variants) and the Key-Specs sidebar summary.
  const consumedKeys = new Set<string>([
    // Key Specs sidebar (summary) + packaging block
    'factory_name', 'factory_group_name', 'brand', 'origin', 'country_of_origin',
    'collection', 'material_category', 'zone_intent', 'body_type', 'finish',
    'material_subtype', 'available_sizes', 'dimensions', 'size', 'thickness',
    'rectified', 'pieces_per_box', 'planks_per_box', 'patterns_count',
    'm2_per_box', 'sqft_per_box', 'm2_per_pallet', 'sqft_per_pallet',
    'weight_per_box_kg', 'weight_per_box_lb', 'weight_kg', 'weight_lb',
    'coverage_m2', 'coverage_sqft', 'boxes_per_pallet', 'weight_per_pallet_kg',
    'weight_per_pallet_lb', 'pallet_dimensions_cm', 'per_variant',
    // Appearance card
    'colors', 'available_colors', 'colors_from_vision', 'primary_color_hex',
    'patterns', 'pattern', 'texture', 'textures', 'category', 'subcategory',
    'shade_variation', 'visual_effect', 'vision_description', 'detected_text',
    // Certifications card
    'certifications', 'standards', 'certifications_source', 'eco_friendly',
    'sustainability_rating', 'fire_rating',
    // Commercial card + Variants table
    'product_codes', 'sku_codes', 'grout_suppliers', 'grout_mapei',
    'grout_kerakoll', 'grout_isomat', 'grout_technica', 'grout_color_codes',
    'vision_variants', 'grout_details', 'product_table',
    // Internal / non-display / blobs
    'extraction_timestamp', 'extraction_method', 'confidence_scores',
    'source_page', 'chunk_index', 'product_name', 'name', 'description',
    'long_description', 'image_url', 'images', 'vision_confidence',
  ]);

  // Look up a registry field key across the top-level metadata and every known
  // nested group, so flat OR grouped storage both resolve. Returns the display
  // string + the raw wrapper (for low-confidence detection).
  const registryNestedGroups: Array<Record<string, unknown>> = [
    allData as Record<string, unknown>,
    materialPropsData as Record<string, unknown>,
    performanceData as Record<string, unknown>,
    applicationData as Record<string, unknown>,
    designData as Record<string, unknown>,
    appearanceData as Record<string, unknown>,
    commercialData as Record<string, unknown>,
    packagingData as Record<string, unknown>,
    complianceData as Record<string, unknown>,
  ];
  const lookupRegistryField = (key: string): { value: string; raw: unknown } | null => {
    for (const grp of registryNestedGroups) {
      if (grp && typeof grp === 'object' && Object.prototype.hasOwnProperty.call(grp, key)) {
        const raw = grp[key];
        const v = extractValue(raw);
        if (v && v !== 'N/A' && v !== '') return { value: v, raw };
      }
    }
    return null;
  };

  // Per-section heading icon. Falls back to a neutral icon for unmapped keys.
  const sectionIcon = (key: string): React.ReactNode => {
    const map: Record<string, React.ReactNode> = {
      material_specs: <Settings2 className="h-4 w-4" />,
      electrical_specs: <Settings2 className="h-4 w-4" />,
      thermal_performance: <Activity className="h-4 w-4" />,
      water_performance: <Droplets className="h-4 w-4" />,
      performance: <Activity className="h-4 w-4" />,
      application: <Wrench className="h-4 w-4" />,
      installation: <Wrench className="h-4 w-4" />,
      dimensions: <Ruler className="h-4 w-4" />,
      features: <Star className="h-4 w-4" />,
      coverage: <Ruler className="h-4 w-4" />,
      care: <Droplets className="h-4 w-4" />,
      design: <Sparkles className="h-4 w-4" />,
      commercial: <ShoppingCart className="h-4 w-4" />,
    };
    return map[key] || <Layers className="h-4 w-4" />;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      {/* grid-cols-1 caps the implicit grid track to the dialog width (the base
          DialogContent is display:grid with an auto column that otherwise sizes
          to max-content and overflows on mobile); min-w-0 lets children shrink
          and wrap. Tighter padding on mobile. */}
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto overflow-x-hidden grid-cols-1 [&>*]:min-w-0 p-4 sm:p-6">
        {/* Header with Factory/Brand Info + Quick Actions.
            Quote-based platform — no pricing/stock shown. Action buttons live
            in the header so users can quote / save from the first screen. */}
        <DialogHeader className="border-b pb-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0 sm:flex-1">
              <div className="flex items-center gap-2 mb-2 min-w-0">
                <Factory className="h-5 w-5 text-muted-foreground shrink-0" />
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-semibold truncate">{factory}</span>
                  {factory !== '—' && (
                    <button
                      type="button"
                      onClick={() => navigate(`/brand/${factory.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`)}
                      className="text-xs text-primary hover:underline shrink-0"
                      title="View brand knowledge page"
                    >
                      Brand page →
                    </button>
                  )}
                  {origin && (
                    <>
                      <span className="text-muted-foreground/40">•</span>
                      <span className="text-sm text-muted-foreground truncate">{origin}</span>
                    </>
                  )}
                </div>
              </div>
              <DialogTitle className="text-2xl sm:text-3xl mb-1 break-words font-display tracking-tight" style={{ fontWeight: 700 }}>
                {safeString(product.name, 'Unnamed Product')}
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                {collection && <span className="font-medium">{collection}</span>}
                {collection && <span className="text-muted-foreground/40">•</span>}
                <span>SKU: {safeString(product.sku, 'N/A')}</span>
              </div>
              {/* Key facets at a glance — same computed values as the spec cards below. */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                {material && material !== '—' && (
                  <span className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-border bg-muted px-2.5 py-1">
                    <span className="text-muted-foreground">Material</span><span className="font-medium text-foreground">{material}</span>
                  </span>
                )}
                {primaryColors && (
                  <span className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-border bg-muted px-2.5 py-1">
                    <span className="text-muted-foreground">Color</span><span className="font-medium text-foreground">{primaryColors.split(',')[0].trim()}</span>
                  </span>
                )}
                {finish && finish !== '—' && (
                  <span className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-border bg-muted px-2.5 py-1">
                    <span className="text-muted-foreground">Finish</span><span className="font-medium text-foreground">{finish}</span>
                  </span>
                )}
                {size && size !== 'N/A' && size !== '—' && (
                  <span className="inline-flex items-center gap-1.5 text-xs rounded-lg border border-border bg-muted px-2.5 py-1">
                    <span className="text-muted-foreground">Size</span><span className="font-medium text-foreground">{String(size).split(',')[0].trim()}</span>
                  </span>
                )}
              </div>
            </div>
            {/* Quick actions — full-width on mobile (below the title), compact on the right from sm up */}
            <div className="flex items-center gap-2 flex-shrink-0 pr-8 sm:pr-0">
              <AddToQuoteButton
                productId={product.id}
                productName={product.name}
                productImage={currentImage?.url}
                variant="default"
                size="sm"
                className="text-xs"
                category={resolveUploadCategory(product.metadata?.material_category || product.type || product.category)}
                materialType={asMetaString(product.metadata?.material_category)}
              />
              <AddToMoodboardButton
                productId={product.id}
                productName={product.name}
                productImage={currentImage?.url}
                variant="outline"
                size="sm"
                className="text-xs"
                category={resolveUploadCategory(product.metadata?.material_category || product.type || product.category)}
                materialType={asMetaString(product.metadata?.material_category)}
              />
            </div>
          </div>
          {/* Description moved to Details tab — avoids duplication with the
              full description card that also falls back to chunk content. */}
          <DialogDescription className="sr-only">
            Product details for {product.name}
          </DialogDescription>
        </DialogHeader>

        {/* Tabs — end-users see Details / Knowledge / Related.
            Admins additionally see Monitoring / SEO / Pricing after those. */}
        <Tabs defaultValue="details" className="mt-6">
          <TabsList className="w-full h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
            {/* End-user tabs (always visible) */}
            <TabsTrigger value="details" className="flex items-center gap-2">
              <Info className="h-4 w-4" />
              Details
            </TabsTrigger>
            <TabsTrigger value="knowledge" className="flex items-center gap-2">
              <BookOpen className="h-4 w-4" />
              Knowledge
            </TabsTrigger>
            <TabsTrigger value="related" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Related
            </TabsTrigger>
            {/* Admin-only tabs (after end-user tabs) */}
            {isAdmin && (
              <>
                <TabsTrigger value="monitoring" className="flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Monitoring
                </TabsTrigger>
                <TabsTrigger value="seo" className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  SEO
                </TabsTrigger>
                <TabsTrigger value="pricing" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Pricing &amp; Data
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
                <div className="relative aspect-square bg-muted/30 rounded-xl overflow-hidden border border-border group">
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
                      <button
                        onClick={handlePrevImage}
                        className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-background/90 border border-border/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-muted"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        onClick={handleNextImage}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-background/90 border border-border/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-muted"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </>
                  )}
                  <div className="absolute bottom-3 right-3 bg-black/70 text-white px-3 py-1.5 rounded-lg text-sm font-medium">
                    {currentImageIndex + 1} / {images.length}
                    {currentImage?.page_number && ` • Page ${currentImage.page_number}`}
                  </div>
                </div>

                {/* Thumbnail Slider */}
                {images.length > 1 && (() => {
                  const thumbStripRef = React.createRef<HTMLDivElement>();
                  const scrollBy = (dir: number) => {
                    thumbStripRef.current?.scrollBy({ left: dir * 200, behavior: 'smooth' });
                  };
                  return (
                    <div className="relative group/thumbs">
                      {/* Left arrow */}
                      <button
                        onClick={() => scrollBy(-1)}
                        className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-background/90 border border-border/50 flex items-center justify-center opacity-0 group-hover/thumbs:opacity-100 transition-opacity shadow-sm hover:bg-muted"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                      {/* Thumbnails */}
                      <div
                        ref={thumbStripRef}
                        className="flex gap-2 overflow-x-auto px-1"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                      >
                        <style>{'.thumb-strip::-webkit-scrollbar { display: none; }'}</style>
                        {images.map((image, index) => (
                          <button
                            key={image.id}
                            onClick={() => setCurrentImageIndex(index)}
                            className={`flex-shrink-0 w-16 h-16 rounded-lg border-2 overflow-hidden transition-all ${
                              index === currentImageIndex
                                ? 'border-primary ring-1 ring-primary ring-offset-1 ring-offset-background'
                                : 'border-border/50 hover:border-muted-foreground/50 opacity-70 hover:opacity-100'
                            }`}
                          >
                            <img src={image.url} alt={`Thumbnail ${index + 1}`} className="w-full h-full object-cover" loading="lazy" />
                          </button>
                        ))}
                      </div>
                      {/* Right arrow */}
                      <button
                        onClick={() => scrollBy(1)}
                        className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-7 h-7 rounded-full bg-background/90 border border-border/50 flex items-center justify-center opacity-0 group-hover/thumbs:opacity-100 transition-opacity shadow-sm hover:bg-muted"
                      >
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="relative aspect-square bg-muted/50 rounded-xl overflow-hidden border border-border flex items-center justify-center">
                <p className="text-muted-foreground">No images available</p>
              </div>
            )}
          </div>

          {/* Right Column: Technical Details (2/5 width) */}
          <div className="lg:col-span-2 space-y-4">
            {/* Key Specifications Card — category-adaptive.
                Universal rows (Factory, Origin, Collection, Material) always show.
                Category-specific rows are driven by the registry config.
                Packaging subsection only shows for categories that have it. */}
            {(() => {
              const catConfig = getCategoryDisplayConfig(product.metadata, product.type, product.category);
              const uploadCat = resolveUploadCategory(
                product.metadata?.material_category || product.type || product.category,
              );

              // ── Universal rows (always shown) ──────────────────────────
              const universalRows: Array<{ label: string; value: string }> = [];
              if (factory !== '—') universalRows.push({ label: 'Factory', value: factory });

              const group = extractValue(allData?.factory_group_name);
              if (group && group !== factory) universalRows.push({ label: 'Factory Group', value: String(group) });
              if (origin) universalRows.push({ label: 'Country of Origin', value: origin });
              if (collection) universalRows.push({ label: 'Collection', value: collection });
              universalRows.push({ label: 'Material', value: material });

              // ── Category-specific rows ─────────────────────────────────
              // Each category defines which specs matter most in the sidebar.
              const categorySpecRows: Array<{ label: string; value: string }> = [];

              // Helper to try extracting a value from multiple possible paths
              const tryExtract = (...paths: unknown[]): string | undefined => {
                for (const p of paths) {
                  const v = extractValue(p);
                  if (v && v !== 'N/A' && v !== '—') return v;
                }
                return undefined;
              };

              if (uploadCat === 'tiles') {
                const bodyType = tryExtract(materialPropsData?.body_type);
                if (bodyType) categorySpecRows.push({ label: 'Body Type', value: bodyType });
                categorySpecRows.push({ label: 'Finish', value: finish });
                const subtype = tryExtract(materialPropsData?.material_subtype);
                if (subtype) categorySpecRows.push({ label: 'Subtype', value: subtype });
                if (size !== 'N/A') categorySpecRows.push({ label: 'Size', value: size });
                if (thickness) categorySpecRows.push({ label: 'Thickness', value: thickness });
                const rectified = tryExtract(materialPropsData?.rectified, allData?.rectified);
                if (rectified) categorySpecRows.push({ label: 'Rectified', value: rectified });
              } else if (uploadCat === 'wood') {
                const species = tryExtract(allData?.species, materialPropsData?.species);
                if (species) categorySpecRows.push({ label: 'Species', value: species });
                const construction = tryExtract(allData?.construction, materialPropsData?.construction);
                if (construction) categorySpecRows.push({ label: 'Construction', value: construction });
                const wearLayer = tryExtract(allData?.wear_layer_mm);
                if (wearLayer) categorySpecRows.push({ label: 'Wear Layer', value: `${wearLayer} mm` });
                if (thickness) categorySpecRows.push({ label: 'Total Thickness', value: thickness });
                categorySpecRows.push({ label: 'Finish', value: finish });
                const clickSystem = tryExtract(allData?.click_system);
                if (clickSystem) categorySpecRows.push({ label: 'Click System', value: clickSystem });
                if (size !== 'N/A') categorySpecRows.push({ label: 'Plank Size', value: size });
              } else if (uploadCat === 'lighting') {
                const wattage = tryExtract(allData?.wattage_w, allData?.wattage);
                if (wattage) categorySpecRows.push({ label: 'Wattage', value: `${wattage}W` });
                const lumens = tryExtract(allData?.lumens_lm, allData?.lumens);
                if (lumens) categorySpecRows.push({ label: 'Lumens', value: `${lumens} lm` });
                const colorTemp = tryExtract(allData?.color_temperature_k, allData?.color_temperature);
                if (colorTemp) categorySpecRows.push({ label: 'Color Temp', value: `${colorTemp}K` });
                const cri = tryExtract(allData?.cri_ra, allData?.cri);
                if (cri) categorySpecRows.push({ label: 'CRI', value: `Ra ${cri}` });
                const dimmable = tryExtract(allData?.dimmable);
                if (dimmable) categorySpecRows.push({ label: 'Dimmable', value: dimmable });
                const lampType = tryExtract(allData?.lamp_type);
                if (lampType) categorySpecRows.push({ label: 'Lamp / Socket', value: lampType });
                const ipRating = tryExtract(allData?.ip_rating);
                if (ipRating) categorySpecRows.push({ label: 'IP Rating', value: ipRating });
                categorySpecRows.push({ label: 'Finish', value: finish });
              } else if (uploadCat === 'heating') {
                const heatOutput = tryExtract(allData?.heat_output_watts);
                if (heatOutput) categorySpecRows.push({ label: 'Heat Output', value: `${heatOutput}W` });
                const btu = tryExtract(allData?.heat_output_btu);
                if (btu) categorySpecRows.push({ label: 'BTU', value: `${btu} BTU/h` });
                const panelType = tryExtract(allData?.panel_type);
                if (panelType) categorySpecRows.push({ label: 'Panel Type', value: panelType });
                const energyClass = tryExtract(allData?.energy_class);
                if (energyClass) categorySpecRows.push({ label: 'Energy Class', value: energyClass });
                categorySpecRows.push({ label: 'Finish', value: finish });
                const thermostat = tryExtract(allData?.thermostat_type);
                if (thermostat) categorySpecRows.push({ label: 'Thermostat', value: thermostat });
              } else if (uploadCat === 'sanitary') {
                const productType = tryExtract(allData?.product_type);
                if (productType) categorySpecRows.push({ label: 'Product Type', value: productType });
                const bodyMat = tryExtract(allData?.body_material);
                if (bodyMat) categorySpecRows.push({ label: 'Material', value: bodyMat });
                categorySpecRows.push({ label: 'Finish', value: finish });
                const flowRate = tryExtract(allData?.flow_rate_l_min);
                if (flowRate) categorySpecRows.push({ label: 'Flow Rate', value: `${flowRate} L/min` });
                const flushVol = tryExtract(allData?.flush_volume_l);
                if (flushVol) categorySpecRows.push({ label: 'Flush Volume', value: `${flushVol}L` });
                const mounting = tryExtract(allData?.mounting_type);
                if (mounting) categorySpecRows.push({ label: 'Mounting', value: mounting });
              } else if (uploadCat === 'kitchen') {
                const productType = tryExtract(allData?.product_type);
                if (productType) categorySpecRows.push({ label: 'Product Type', value: productType });
                const bodyMat = tryExtract(allData?.body_material);
                if (bodyMat) categorySpecRows.push({ label: 'Body Material', value: bodyMat });
                const doorMat = tryExtract(allData?.door_material);
                if (doorMat) categorySpecRows.push({ label: 'Door Material', value: doorMat });
                categorySpecRows.push({ label: 'Finish', value: finish });
                const worktopThk = tryExtract(allData?.worktop_thickness_mm);
                if (worktopThk) categorySpecRows.push({ label: 'Worktop Thickness', value: `${worktopThk} mm` });
              } else if (uploadCat === 'furniture') {
                const frameMat = tryExtract(allData?.frame_material);
                if (frameMat) categorySpecRows.push({ label: 'Frame', value: frameMat });
                const upholstery = tryExtract(allData?.upholstery_material);
                if (upholstery) categorySpecRows.push({ label: 'Upholstery', value: upholstery });
                const topMat = tryExtract(allData?.top_material);
                if (topMat) categorySpecRows.push({ label: 'Top Surface', value: topMat });
                categorySpecRows.push({ label: 'Finish', value: finish });
                const seatH = tryExtract(allData?.seat_height_cm);
                if (seatH) categorySpecRows.push({ label: 'Seat Height', value: `${seatH} cm` });
                const weightCap = tryExtract(allData?.weight_capacity_kg);
                if (weightCap) categorySpecRows.push({ label: 'Weight Capacity', value: `${weightCap} kg` });
              } else if (uploadCat === 'paint_wall_decor') {
                const productType = tryExtract(allData?.product_type);
                if (productType) categorySpecRows.push({ label: 'Product Type', value: productType });
                const baseType = tryExtract(allData?.base_type);
                if (baseType) categorySpecRows.push({ label: 'Base Type', value: baseType });
                const sheen = tryExtract(allData?.finish_sheen, allData?.finish);
                if (sheen) categorySpecRows.push({ label: 'Finish / Sheen', value: sheen });
                const coverage = tryExtract(allData?.coverage_per_litre_m2);
                if (coverage) categorySpecRows.push({ label: 'Coverage', value: `${coverage} m²/L` });
                const voc = tryExtract(allData?.voc_level_g_l, allData?.voc_class);
                if (voc) categorySpecRows.push({ label: 'VOC', value: voc });
                const coats = tryExtract(allData?.coats_recommended);
                if (coats) categorySpecRows.push({ label: 'Coats', value: coats });
              } else if (uploadCat === 'decor') {
                const primaryMat = tryExtract(allData?.primary_material);
                if (primaryMat) categorySpecRows.push({ label: 'Material', value: primaryMat });
                categorySpecRows.push({ label: 'Finish', value: finish });
                const style = tryExtract(allData?.style, designData?.design_style);
                if (style) categorySpecRows.push({ label: 'Style', value: style });
                const handmade = tryExtract(allData?.handmade);
                if (handmade) categorySpecRows.push({ label: 'Handmade', value: handmade });
              } else {
                // general_materials or unknown — show generic specs
                const bodyType = tryExtract(materialPropsData?.body_type);
                if (bodyType) categorySpecRows.push({ label: 'Body Type', value: bodyType });
                categorySpecRows.push({ label: 'Finish', value: finish });
                const subtype = tryExtract(materialPropsData?.material_subtype);
                if (subtype) categorySpecRows.push({ label: 'Subtype', value: subtype });
                if (size !== 'N/A') categorySpecRows.push({ label: 'Size', value: size });
                if (thickness) categorySpecRows.push({ label: 'Thickness', value: thickness });
              }

              // Dimensions — shown for non-tile categories that have W/H/D
              if (uploadCat !== 'tiles' && uploadCat !== 'wood') {
                const w = tryExtract(allData?.width_mm, allData?.width_cm);
                const h = tryExtract(allData?.height_mm, allData?.height_cm);
                const d = tryExtract(allData?.depth_mm, allData?.depth_cm);
                const diamVal = tryExtract(allData?.diameter_mm, allData?.diameter_cm);
                const weightVal = tryExtract(allData?.weight_kg);
                const dims = [w && `W: ${w}`, h && `H: ${h}`, d && `D: ${d}`].filter(Boolean);
                if (dims.length > 0) categorySpecRows.push({ label: 'Dimensions', value: dims.join(' × ') });
                if (diamVal) categorySpecRows.push({ label: 'Diameter', value: diamVal });
                if (weightVal) categorySpecRows.push({ label: 'Weight', value: `${weightVal} kg` });
              }

              // Designer — universal but only if present
              if (Array.isArray(designData?.designers) && designData.designers.length > 0) {
                categorySpecRows.push({ label: 'Designer', value: designData.designers.join(', ') });
              }

              // ── Packaging subsection (only for categories that use it) ─
              const packagingCategories = new Set(['tiles', 'wood', 'general_materials']);
              const pkg = (allData?.packaging || {}) as Record<string, unknown>;
              const pickPkg = (k: string): string | null => {
                const v = pkg[k];
                if (v === null || v === undefined || v === '') return null;
                if (typeof v === 'number') return String(v);
                if (typeof v === 'string') return v;
                if (typeof v === 'object' && 'value' in (v as Record<string, unknown>)) {
                  const inner = (v as Record<string, unknown>).value;
                  return inner != null ? String(inner) : null;
                }
                return null;
              };

              let packagingRows: Array<{ label: string; value: string }> = [];
              if (packagingCategories.has(uploadCat)) {
                const pieces = pickPkg('pieces_per_box');
                const patternsCount = pickPkg('patterns_count');
                const boxes = pickPkg('boxes_per_pallet');
                const coverageM2 = pickPkg('m2_per_box') ?? pickPkg('coverage_m2');
                const coverageSqft = pickPkg('sqft_per_box') ?? pickPkg('coverage_sqft');
                const weightKg = pickPkg('weight_per_box_kg') ?? pickPkg('weight_kg');
                const weightLb = pickPkg('weight_per_box_lb') ?? pickPkg('weight_lb');
                const palletKg = pickPkg('weight_per_pallet_kg');
                const palletLb = pickPkg('weight_per_pallet_lb');
                const palletM2 = pickPkg('m2_per_pallet');
                const palletSqft = pickPkg('sqft_per_pallet');
                const palletDims = pickPkg('pallet_dimensions_cm');

                packagingRows = [
                  pieces && { label: uploadCat === 'wood' ? 'Planks / Pack' : 'Pieces / Box', value: pieces },
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
                  palletM2 && {
                    label: 'Coverage / Pallet',
                    value: palletSqft ? `${palletM2} m² (${palletSqft} sqft)` : `${palletM2} m²`,
                  },
                  palletKg && {
                    label: 'Pallet Weight',
                    value: palletLb ? `${palletKg} kg (${palletLb} lb)` : `${palletKg} kg`,
                  },
                  palletDims && { label: 'Pallet Dimensions', value: `${palletDims} cm` },
                ].filter(Boolean) as Array<{ label: string; value: string }>;
              }

              // ── Warranty (shown for categories that typically have it) ──
              const warrantyCategories = new Set(['heating', 'sanitary', 'kitchen', 'lighting', 'furniture']);
              if (warrantyCategories.has(uploadCat)) {
                const warranty = tryExtract(allData?.warranty_years, commercialData?.warranty_years);
                if (warranty) categorySpecRows.push({ label: 'Warranty', value: `${warranty} years` });
              }

              // ── Render ─────────────────────────────────────────────────
              return (
                <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
                  <div className="mb-4">
                    <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                      <Info className="h-4 w-4" />
                      Key Specifications
                    </h3>
                  </div>
                  <div className="space-y-0">
                    {universalRows.map((r, i) => (
                      <div key={r.label} className="flex justify-between items-center py-2 border-b border-border/30">
                        <span className="text-xs text-muted-foreground">{r.label}</span>
                        <span className="text-xs font-semibold">{r.value}</span>
                      </div>
                    ))}
                    {categorySpecRows.length > 0 && (
                      <>
                        <div className="pt-2 pb-1">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">
                            {catConfig.displayName} Specs
                          </p>
                        </div>
                        {categorySpecRows.map((r, i) => {
                          // Multi-value size rows render as a list
                          if (r.label === 'Size' || r.label === 'Plank Size') {
                            const parts = r.value.split(', ');
                            if (parts.length > 1) {
                              return (
                                <div key={r.label} className={`py-2 ${i < categorySpecRows.length - 1 ? 'border-b border-border/30' : ''}`}>
                                  <span className="text-xs text-muted-foreground">{r.label}</span>
                                  <ul className="mt-1 space-y-0.5">
                                    {parts.map((s, j) => (
                                      <li key={j} className="text-xs font-semibold flex items-center gap-1.5">
                                        <span className="w-1 h-1 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                                        {s.trim()}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              );
                            }
                          }
                          return (
                            <div key={r.label} className={`flex justify-between items-center py-2 ${i < categorySpecRows.length - 1 ? 'border-b border-border/30' : ''}`}>
                              <span className="text-xs text-muted-foreground">{r.label}</span>
                              <span className="text-xs font-semibold capitalize">{r.value}</span>
                            </div>
                          );
                        })}
                      </>
                    )}
                    {packagingRows.length > 0 && (
                      <>
                        <div className="pt-2 pb-1">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-semibold">Packaging</p>
                        </div>
                        {packagingRows.map((r, i) => (
                          <div
                            key={r.label}
                            className={`flex justify-between items-center py-2 ${i < packagingRows.length - 1 ? 'border-b border-border/30' : ''}`}
                          >
                            <span className="text-xs text-muted-foreground">{r.label}</span>
                            <span className="text-xs font-semibold">{r.value}</span>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              );
            })()}

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

            {/* Test on a room — always available; pre-pins this material into
                the Interior Designer agent, which then asks for a room photo. */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex items-center gap-1.5 text-xs rounded-full"
                onClick={() => {
                  navigate(buildTestOnRoomUrl({ productId: product.id, productName: product.name, productImage: currentImage?.url }));
                  onClose();
                }}
              >
                <Wand2 className="h-3.5 w-3.5" />
                Test on a room
              </Button>
            </div>
          </div>
        </div>

        {/* Metadata Sections — category-conditional rendering.
            The category display registry defines which sections each
            category should show. Sections with no data auto-hide via
            renderMetadataCategory returning null. The registry acts as
            a second filter: sections not in the registry for this category
            are never rendered even if data exists (prevents showing
            grout codes for lighting, PEI for furniture, etc.). */}
        {(() => {
          const sectionCatConfig = getCategoryDisplayConfig(product.metadata, product.type, product.category);
          const activeSectionKeys = new Set(sectionCatConfig.sections.map(s => s.key));
          const sectionUploadCat = resolveUploadCategory(
            product.metadata?.material_category || product.type || product.category,
          );

          // Appearance card — shared across all categories (colors/patterns are universal)
          const renderAppearanceCard = () => {
            const hasAppearanceFields = Object.values(appearance).some(
              v => v && v !== 'N/A' && v !== '',
            );
            if (patternsList.length === 0 && !hasAppearanceFields) return null;

            // Vision-confidence indicator: only shown when confidence is
            // BELOW our trust threshold (<0.7). High-confidence rows render
            // without any badge — the absence of the badge IS the signal.
            const visionConfidenceRaw = (allData?.vision_confidence ?? null);
            const visionConfidence = typeof visionConfidenceRaw === 'number' ? visionConfidenceRaw
              : typeof visionConfidenceRaw === 'string' ? parseFloat(visionConfidenceRaw) : NaN;
            const showLowConfidence = !isNaN(visionConfidence) && visionConfidence < 0.7;

            // Use the module-level Unicode-safe titleCaseDisplay (handles accented
            // chars, Greek, hyphens). The previous local titleCase used /\b\w/g
            // which is ASCII-only and broke on é/ü/μ/Greek/etc.
            const splitToChips = (val: unknown): string[] => {
              const raw = typeof val === 'string' ? val : renderValue(val);
              if (!raw || raw === 'N/A') return [];
              return raw.split(',').map(s => s.trim()).filter(Boolean).map(titleCaseDisplay);
            };

            const colorChips = splitToChips(appearance['Colors']);
            const shadeChips = splitToChips(appearance['Observed Shades']);

            const CHIP_ROW_KEYS = new Set(['Colors', 'Observed Shades']);
            // CSS hex colors are exactly 3, 4, 6, or 8 chars after the `#` (rgb / rgba / rrggbb / rrggbbaa).
    // 5 and 7 char strings are not valid CSS — exclude them so we don't render bogus swatches.
    const HEX_RE = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
            const gridFields = Object.entries(appearance).filter(
              ([k, v]) => !CHIP_ROW_KEYS.has(k) && v && v !== 'N/A' && v !== '',
            );

            const renderChipRow = (label: string, chips: string[]) => {
              if (chips.length === 0) return null;
              return (
                <div className="mb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {label} ({chips.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {chips.map(c => (
                      <Badge key={c} variant="outline" className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-muted/40 border-border/50">
                        {c}
                      </Badge>
                    ))}
                  </div>
                </div>
              );
            };

            return (
              <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-primary flex items-center gap-2"><Palette className="h-4 w-4" />Appearance</h3>
                  {showLowConfidence && (
                    <Badge
                      variant="outline"
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400"
                      title={`Vision confidence: ${(visionConfidence * 100).toFixed(0)}% — fields below were extracted with low certainty`}
                    >
                      Low confidence ({(visionConfidence * 100).toFixed(0)}%)
                    </Badge>
                  )}
                </div>
                {patternsList.length > 0 && (
                  <div className="mb-4 flex items-start gap-3 py-2 border-b border-border/20">
                    <span className="text-xs text-muted-foreground shrink-0 pt-0.5">Patterns</span>
                    <span className="text-xs font-semibold">
                      {patternsList.map(p => titleCaseDisplay(p)).join(', ')}
                    </span>
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
                              <span className="inline-block w-5 h-5 rounded border border-border/50 flex-shrink-0" style={{ backgroundColor: str }} />
                              <p className="text-xs font-semibold">{str}</p>
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div key={key} className="bg-muted/30 rounded-lg p-3">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{key}</p>
                          <p className="text-xs font-semibold">{titleCaseDisplay(str)}</p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          };

          // ── Registry-driven section cards (category-agnostic, complete) ──
          // Render EVERY section the registry defines for THIS category, with
          // EVERY field that has a value — looked up across flat + nested
          // metadata. Special sections rendered by dedicated cards below are
          // skipped here. Each rendered key is marked consumed so the catch-all
          // neither drops nor duplicates it. This is what lets lighting / wood /
          // sanitary / kitchen show their full spec sheet rather than a
          // tile-shaped subset (the old hardcoded lists were tile-centric).
          const SPECIAL_SECTION_KEYS = new Set(['appearance', 'certifications', 'packaging', 'commercial']);
          const registrySectionCards = sectionCatConfig.sections
            .filter(section => !SPECIAL_SECTION_KEYS.has(section.key))
            .map(section => {
              const data: Record<string, unknown> = {};
              const lowConf = new Set<string>();
              for (const field of section.fields) {
                const hit = lookupRegistryField(field.key);
                if (!hit) continue;
                consumedKeys.add(field.key);
                data[field.label] = hit.value;
                if (isLowConfidence(hit.raw)) lowConf.add(field.label);
              }
              if (Object.keys(data).length === 0) return null;
              return (
                <React.Fragment key={section.key}>
                  {renderMetadataCategory(section.label, data, lowConf, sectionIcon(section.key))}
                </React.Fragment>
              );
            })
            .filter(Boolean);

          // ── Detected text (vision OCR) — brand names, codes, dimensions
          // visible on the material image. Skipped when empty.
          const detectedTextRaw = (() => {
            const raw = appearanceData?.detected_text ?? allData?.detected_text;
            const inner = (raw && typeof raw === 'object' && 'value' in (raw as Record<string, unknown>))
              ? (raw as Record<string, unknown>).value
              : raw;
            if (!Array.isArray(inner)) return [];
            const seen = new Set<string>();
            const out: string[] = [];
            for (const t of inner as unknown[]) {
              const s = String(t).trim();
              if (!s) continue;
              const k = s.toLowerCase();
              if (seen.has(k)) continue;
              seen.add(k);
              out.push(s);
            }
            return out;
          })();

          const renderDetectedTextCard = () => {
            if (detectedTextRaw.length === 0) return null;
            return (
              <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                    <ScanText className="h-4 w-4" />
                    Detected Text ({detectedTextRaw.length})
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Text the vision model read off the product image (brand names, codes, dimensions).
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {detectedTextRaw.map(t => (
                    <Badge
                      key={t}
                      variant="outline"
                      className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-muted/40 border-border/50"
                    >
                      {t}
                    </Badge>
                  ))}
                </div>
              </div>
            );
          };

          return (
            <div className="space-y-6 mt-6">
              {renderAppearanceCard()}
              {renderDetectedTextCard()}

              {/* All registry-defined spec sections for THIS category, complete.
                  Every field with a value is shown — no category gating drops data. */}
              {registrySectionCards}

              {/* Commercial — curated (filters SKU/grout to THIS product, adds
                  grout suggestions). Auto-hides if empty. */}
              {renderMetadataCategory('Commercial Information', commercial, undefined, <ShoppingCart className="h-4 w-4" />)}

              {/* Variants table (per-variant SKU + grout) */}
              {(activeSectionKeys.has('commercial') || sectionUploadCat === 'tiles') && renderVariantsTable()}

              {/* Certifications (chips + compliance) — auto-hides if empty */}
              {renderCertificationsCard()}
            </div>
          );
        })()}

          {/* ── Dynamic groups + completeness net ───────────────────────────
              Fully data-driven. The registry above gives curated headlines for
              the 10 known categories. THIS block handles anything the registry
              doesn't know about:
                • An unknown nested group the extractor invented (e.g.
                  `acoustic_properties: {...}`) becomes its OWN card with a
                  headline derived from the group key itself — so new section
                  names appear automatically, no code change.
                • Leftover inner fields of known groups + flat orphan fields
                  collect into a single "Other Specifications" card.
              `consumedKeys` (sidebar + special cards + registry sections)
              guarantees no duplication and that nothing is ever dropped. */}
          {(() => {
            // Groups the registry already rendered above — their leftover inner
            // fields go to the generic bucket (not a duplicate titled card).
            const KNOWN_GROUPS = new Set([
              'design', 'appearance', 'material_properties', 'application',
              'commercial', 'packaging', 'performance', 'compliance', 'dimensions',
              '_extraction_metadata',
            ]);
            const seen = new Set<string>();
            const leafExtras: Array<{ key: string; label: string; value: string }> = [];
            const dynamicGroups: Array<{ key: string; title: string; fields: Array<{ key: string; label: string; value: string }> }> = [];

            // Collect the displayable, not-yet-consumed leaf fields of an object.
            const collectFields = (obj: Record<string, unknown>) => {
              const out: Array<{ key: string; label: string; value: string }> = [];
              for (const [ik, iv] of Object.entries(obj)) {
                if (!ik || ik.startsWith('_')) continue;
                if (consumedKeys.has(ik) || seen.has(ik)) continue;
                const str = extractValue(iv);
                if (!str || str === 'N/A' || str === '' || str === 'undefined' || str === 'null') continue;
                seen.add(ik);
                out.push({ key: ik, label: prettyFieldLabel(ik), value: str });
              }
              return out;
            };

            // AI-discovered unknown attributes → generic bucket.
            const discoveredExtra = allData?._discovered_extra;
            if (discoveredExtra && typeof discoveredExtra === 'object' && !Array.isArray(discoveredExtra)) {
              leafExtras.push(...collectFields(discoveredExtra as Record<string, unknown>));
            }

            // Walk every top-level metadata key.
            Object.entries(allData || {}).forEach(([k, v]) => {
              if (k.startsWith('_')) return;
              const inner = (v && typeof v === 'object' && 'value' in (v as Record<string, unknown>))
                ? (v as Record<string, unknown>).value
                : v;

              // Nested group (object, not array) → descend.
              if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
                const fields = collectFields(inner as Record<string, unknown>);
                if (fields.length === 0) return;
                if (KNOWN_GROUPS.has(k)) {
                  // Already-titled above — surface only its leftovers generically.
                  leafExtras.push(...fields);
                } else {
                  // Brand-new group the registry never heard of → its own card,
                  // headline derived from the data.
                  dynamicGroups.push({ key: k, title: prettyFieldLabel(k), fields });
                }
                return;
              }

              // Flat orphan leaf.
              if (consumedKeys.has(k) || seen.has(k)) return;
              const str = extractValue(v);
              if (!str || str === 'N/A' || str === '' || str === 'undefined' || str === 'null') return;
              seen.add(k);
              leafExtras.push({ key: k, label: prettyFieldLabel(k), value: str });
            });

            if (dynamicGroups.length === 0 && leafExtras.length === 0) return null;

            const renderGrid = (fields: Array<{ key: string; label: string; value: string }>) => (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {fields.map(({ key, label, value }) => (
                  <div key={key} className="bg-muted/30 rounded-lg p-3">
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                      {label}
                    </p>
                    <p className="text-xs font-semibold">{value}</p>
                  </div>
                ))}
              </div>
            );

            return (
              <div className="space-y-6 mt-6">
                {/* One card per unknown group — title comes from the data itself */}
                {dynamicGroups.map(group => (
                  <div key={group.key} className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        {group.title}
                      </h3>
                    </div>
                    {renderGrid(group.fields)}
                  </div>
                ))}

                {/* Everything else not slotted into a section above */}
                {leafExtras.length > 0 && (
                  <div className="dashboard-card rounded-2xl border-0 shadow-sm p-6">
                    <div className="mb-4">
                      <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        Other Specifications
                        <Badge variant="outline" className="text-[10px] font-normal">
                          {leafExtras.length}
                        </Badge>
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Every remaining field found in this product's data, not shown above.
                      </p>
                    </div>
                    {renderGrid(leafExtras)}
                  </div>
                )}
              </div>
            );
          })()}

      </TabsContent>

      {/* Knowledge Tab — visible to all users */}
      <TabsContent value="knowledge" className="mt-6">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Knowledge Base Articles
          </h3>
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
                return sortedKeys.map(groupKey => (
                  <div key={groupKey} className="space-y-3">
                    <h4 className="text-sm font-semibold text-primary">
                      {prettyFieldLabel(groupKey)}
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

      {/* Related Tab — Similar + Works Well With merged (visible to all users) */}
      <TabsContent value="related" className="mt-6">
        <div className="space-y-8">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Similar Products
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Other products from the same collection or with a matching visual style.
            </p>
            <ProductRecommendationsPanel
              productId={product.id}
              mode="similar"
              onProductClick={(id) => setStackedProductId(id)}
            />
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Works Well With
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              Products from different collections that pair well — complementary colors, textures, and categories.
            </p>
            <ProductRecommendationsPanel
              productId={product.id}
              mode="complementary"
              onProductClick={(id) => setStackedProductId(id)}
            />
          </div>
        </div>
      </TabsContent>

      {/* Monitoring Tab — Admin only: price tracking + mention/LLM-visibility merged */}
      {isAdmin && (
        <TabsContent value="monitoring" className="mt-6">
          <div className="space-y-8">
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Price Monitoring
              </h3>
              <ProductMonitorTab
                productId={product.id}
                productName={product.name}
                currentPrice={product.pricing?.retail}
                currency={product.pricing?.currency}
              />
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                <Sparkles className="h-4 w-4" />
                Mentions &amp; LLM Visibility
              </h3>
              <MentionMonitorTab
                productId={product.id}
                productName={product.name}
                manufacturer={(product as any).manufacturer}
              />
            </div>
          </div>
        </TabsContent>
      )}

      {/* SEO Tab — Admin only (DataForSEO research + ranking + domain snapshot) */}
      {isAdmin && (
        <TabsContent value="seo" className="mt-6">
          <ProductSEOTab
            productId={product.id}
            productName={product.name}
            manufacturer={(product as any).manufacturer || (product as any).manufacturer_name || (product.metadata as any)?.factory?.factory_name}
            homepageDomain={(product as any).manufacturer_homepage || (product.metadata as any)?.factory?.homepage_domain || null}
            category={(product as any).category || (product as any).subcategory || null}
          />
        </TabsContent>
      )}

      {/* Pricing & Data Tab — Admin / operator only.
          Moved out of the header: my-data (myDATA), catalog base price,
          workspace cost, and the price-lookup action all live here now. */}
      {isAdmin && (
        <TabsContent value="pricing" className="mt-6">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-primary flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Pricing &amp; My Data
              </h3>
              <Button
                variant="outline"
                size="sm"
                className="text-xs rounded-full"
                onClick={() => setPriceLookupOpen(true)}
                title="Get price from Pricing Knowledge Base"
              >
                <DollarSign className="h-3.5 w-3.5 mr-1" />
                Get price
              </Button>
            </div>
            <p className="text-xs text-muted-foreground -mt-2">
              Internal pricing &amp; fiscal data — visible to admins and operators only.
            </p>
            <WorkspaceCostBadge productId={product.id} />
            <ProductPricingCard productId={product.id} />
            <ProductMydataCard productId={product.id} />
          </div>
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

    {/* Price lookup drawer (admin only) — writes to product_prices on confirm */}
    {isAdmin && (
      <PriceLookupDrawer
        open={priceLookupOpen}
        onOpenChange={setPriceLookupOpen}
        productId={product.id}
        productName={product.name}
        sku={safeString(product.sku) || undefined}
        manufacturer={(product as any).manufacturer_name || (product.metadata as any)?.factory?.factory_name}
        commitToProductPrices
      />
    )}
      </DialogContent>
    </Dialog>
  );
};

export default ProductDetailModal;
