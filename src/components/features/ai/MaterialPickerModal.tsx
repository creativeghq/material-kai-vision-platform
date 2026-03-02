/**
 * MaterialPickerModal
 * Search materials, preview them composited into the zone, build a replacement queue,
 * and run sequential FLUX Fill inpainting. Returns the final Storage URL to caller.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Badge } from '@/components/core/ui/badge';
import { ScrollArea } from '@/components/core/ui/scroll-area';
import {
  Search,
  X,
  Loader2,
  Plus,
  Sparkles,
  Check,
  Paintbrush,
  Package,
  Zap,
  Star,
  Layers,
  ChevronRight,
  AlertCircle,
  Info,
  Camera,
} from 'lucide-react';
import { mivaaApi } from '@/services/mivaaApiClient';
import { SegmentWithResults } from '@/hooks/useSegmentation';
import { supabase } from '@/integrations/supabase/client';
import { INPAINTING_CREDIT_COSTS, INPAINTING_MODEL_LABELS, InpaintingModel } from '@/services/vrWorldService';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface PickedMaterial {
  id: string;
  name: string;
  category: string;
  imageUrl?: string;
  finish?: string;
  dominantColor?: string;
  materialType?: string;
  price?: number;
  currency?: string;
  raw: any;
}

export interface QueueItem {
  queueId: string;
  zone: SegmentWithResults | null;
  maskBase64: string;
  material: PickedMaterial;
  colorOverride?: string;
  quality: InpaintingModel;
}

export interface AppliedMaterial {
  zone_label: string;
  product_id: string;
  product_name: string;
  price?: number;
  colorOverride?: string;
}

export interface EditedImageResult {
  storageUrl: string;
  appliedMaterials: AppliedMaterial[];
}

interface MaterialPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  zone: SegmentWithResults | null;
  maskBase64: string;
  sourceImageUrl: string;
  jobId: string;
  workspaceId?: string;
  preSelectedMaterial?: PickedMaterial | null;
  onEditedImage: (result: EditedImageResult) => void;
  onAddAnotherZone?: () => void;
}

// ── Zone-aware category system ─────────────────────────────────────────────────

interface ZoneCat {
  label: string;
  queryTerms: string;
}

const CATEGORY_QUERY_TERMS: Record<string, string> = {
  Tiles:          'tiles ceramic porcelain floor wall',
  Wood:           'wood hardwood oak parquet timber flooring',
  Laminate:       'laminate engineered floor panel',
  Vinyl:          'vinyl LVT luxury vinyl floor',
  Stone:          'stone marble granite travertine natural',
  Carpet:         'carpet rug pile textile floor',
  Paint:          'paint wall colour finish coat',
  Wallpaper:      'wallpaper wall covering pattern texture',
  Concrete:       'concrete cement polished floor wall',
  Fabric:         'fabric upholstery textile weave',
  Leather:        'leather upholstery couch sofa',
  Velvet:         'velvet soft fabric plush',
  'Bouclé':       'bouclé boucle textured loop fabric',
  Linen:          'linen curtain fabric natural weave',
  Sheer:          'sheer voile curtain translucent fabric',
  'Natural Fiber': 'jute sisal natural fiber woven',
  Wool:           'wool textile warm knit pile',
  Ceramic:        'ceramic tile porcelain glaze',
  Glass:          'glass transparent panel architectural',
  Metal:          'metal steel aluminium iron fixture',
  Composite:      'composite engineered panel cladding',
  Lacquer:        'lacquer gloss painted cabinet finish',
  Sofas:          'sofa couch lounge seating upholstered furniture',
  Chairs:         'chair dining seat upholstered furniture',
  Armchairs:      'armchair accent lounge chair furniture',
  Tables:         'table dining coffee side furniture',
  Cabinets:       'cabinet sideboard storage unit furniture',
  Shelving:       'shelf shelving bookcase storage furniture',
};

const z = (label: string): ZoneCat => ({ label, queryTerms: CATEGORY_QUERY_TERMS[label] ?? label.toLowerCase() });

const ZONE_CATEGORY_MAP: Record<string, ZoneCat[]> = {
  // Floors
  floor:              [z('Tiles'), z('Wood'), z('Laminate'), z('Stone'), z('Carpet'), z('Vinyl')],
  'hardwood floor':   [z('Wood'), z('Laminate'), z('Stone')],
  'tile floor':       [z('Tiles'), z('Stone'), z('Ceramic')],
  parquet:            [z('Wood'), z('Laminate')],
  // Walls
  wall:               [z('Paint'), z('Tiles'), z('Stone'), z('Wood'), z('Wallpaper')],
  'back wall':        [z('Paint'), z('Tiles'), z('Stone'), z('Wallpaper')],
  'feature wall':     [z('Paint'), z('Stone'), z('Wood'), z('Tiles')],
  ceiling:            [z('Paint'), z('Wood'), z('Concrete')],
  // Upholstered furniture
  sofa:               [z('Sofas'), z('Fabric'), z('Leather'), z('Velvet'), z('Bouclé')],
  couch:              [z('Sofas'), z('Fabric'), z('Leather'), z('Velvet')],
  chair:              [z('Chairs'), z('Fabric'), z('Leather'), z('Wood')],
  armchair:           [z('Armchairs'), z('Fabric'), z('Leather')],
  // Soft furnishings
  rug:                [z('Carpet'), z('Fabric'), z('Natural Fiber'), z('Wool')],
  carpet:             [z('Carpet'), z('Fabric'), z('Wool')],
  curtain:            [z('Fabric'), z('Linen'), z('Sheer'), z('Velvet')],
  cushion:            [z('Fabric'), z('Velvet'), z('Linen')],
  // Hard surfaces / wet areas
  countertop:         [z('Stone'), z('Ceramic'), z('Wood'), z('Metal'), z('Composite')],
  kitchen:            [z('Stone'), z('Ceramic'), z('Metal'), z('Wood')],
  bathroom:           [z('Tiles'), z('Stone'), z('Ceramic'), z('Glass')],
  shower:             [z('Tiles'), z('Stone'), z('Glass')],
  // Furniture
  table:              [z('Tables'), z('Wood'), z('Stone'), z('Metal'), z('Glass')],
  'dining table':     [z('Tables'), z('Wood'), z('Stone'), z('Metal')],
  cabinet:            [z('Cabinets'), z('Wood'), z('Metal'), z('Lacquer')],
  shelves:            [z('Shelving'), z('Wood'), z('Metal'), z('Glass')],
  door:               [z('Wood'), z('Metal'), z('Glass')],
  window:             [z('Glass'), z('Wood'), z('Metal')],
};

const GENERIC_CATEGORIES: ZoneCat[] = [
  z('Wood'), z('Stone'), z('Ceramic'), z('Fabric'), z('Metal'), z('Paint'),
];

function getCategoriesForZone(zone: SegmentWithResults | null): ZoneCat[] {
  if (!zone) return GENERIC_CATEGORIES;

  // zone_intent overrides — hard-coded for reliability regardless of label
  switch (zone.zone_intent) {
    case 'sub_element':
      return [z('Paint'), z('Metal'), z('Wood'), z('Lacquer')];
    case 'upholstery':
      return [z('Fabric'), z('Leather'), z('Velvet'), z('Linen'), z('Bouclé'), z('Wool')];
    // full_object + surface fall through to label-based lookup
  }

  const key = zone.label.toLowerCase().trim();
  return ZONE_CATEGORY_MAP[key]
    ?? ZONE_CATEGORY_MAP[key.split(' ')[0]]
    ?? GENERIC_CATEGORIES;
}

function bestCategoryForZone(zone: SegmentWithResults | null, cats: ZoneCat[]): ZoneCat | null {
  if (!zone || cats.length === 0) return null;
  const mt = (zone.material_type ?? '').toLowerCase();
  const pairs: [string, string][] = [
    ['tile', 'Tiles'], ['ceramic', 'Tiles'], ['porcelain', 'Tiles'],
    ['wood', 'Wood'], ['oak', 'Wood'], ['parquet', 'Wood'], ['timber', 'Wood'],
    ['laminate', 'Laminate'], ['vinyl', 'Vinyl'], ['lvt', 'Vinyl'],
    ['stone', 'Stone'], ['marble', 'Stone'], ['granite', 'Stone'],
    ['carpet', 'Carpet'], ['rug', 'Carpet'],
    ['fabric', 'Fabric'], ['velvet', 'Velvet'], ['linen', 'Linen'],
    ['leather', 'Leather'], ['bouclé', 'Bouclé'], ['boucle', 'Bouclé'],
    ['paint', 'Paint'], ['concrete', 'Concrete'],
    ['glass', 'Glass'], ['metal', 'Metal'],
    ['sofa', 'Sofas'], ['couch', 'Sofas'],
    ['chair', 'Chairs'], ['table', 'Tables'],
  ];
  for (const [term, label] of pairs) {
    if (mt.includes(term)) {
      const found = cats.find(c => c.label === label);
      if (found) return found;
    }
  }
  return cats[0];
}

// ── Custom Color sentinel ──────────────────────────────────────────────────────

const CUSTOM_COLOR_MATERIAL: PickedMaterial = {
  id: '__custom_color__',
  name: 'Custom Color',
  category: 'paint',
  imageUrl: undefined,
  raw: {},
};

// ── Helper: build search query from zone metadata ──────────────────────────────

function zoneSearchQuery(zone: SegmentWithResults | null): string {
  if (!zone) return '';
  return zone.search_query || `${zone.label} ${zone.material_type} ${zone.finish}`.trim();
}

// ── Helper: extract PickedMaterial from raw product API result ─────────────────

function toPickedMaterial(raw: any): PickedMaterial {
  const primaryImage = raw.images?.find((i: any) => i.isPrimary) || raw.images?.[0];
  return {
    id: raw.id,
    name: raw.name || 'Unknown Material',
    category: raw.category || raw.metadata?.material_category || 'Other',
    imageUrl: primaryImage?.url || raw.metadata?.image_url,
    finish: raw.metadata?.finish,
    dominantColor: raw.metadata?.dominant_color,
    materialType: raw.metadata?.material_type || raw.type,
    price: raw.pricing?.retail,
    currency: raw.pricing?.currency || 'EUR',
    raw,
  };
}

// ── Helper: generate inpainting prompt from zone + material context ────────────

function buildInpaintingPrompt(zone: SegmentWithResults | null, material: PickedMaterial, colorOverride?: string): string {
  const zoneLabel = zone?.label || 'surface';
  const intent = zone?.zone_intent ?? 'surface';

  // Custom color sentinel — always FLUX, no reference image
  if (material.id === '__custom_color__' && colorOverride) {
    return `Paint the ${zoneLabel} with color ${colorOverride}, smooth flat finish, even coat, photorealistic interior`;
  }

  // AI-prompt sentinel — description stored in raw.aiPromptDescription
  if (material.id.startsWith('__ai-prompt__')) {
    const desc = material.raw?.aiPromptDescription || material.name;
    return `Photorealistic ${zoneLabel} replacement in an interior scene. ${desc}. Seamless edges, natural interior lighting, correct perspective, professional architectural photography quality.`;
  }

  const name = material.name;

  switch (intent) {
    case 'full_object':
      return `Replace the entire ${zoneLabel} with ${name}. Match scene lighting and perspective. Seamless integration, photorealistic interior.`;

    case 'upholstery':
      return `Reupholster the ${zoneLabel} in ${name}. Keep the frame, legs, and silhouette identical. Only the fabric surface changes. Seamless edges, natural lighting.`;

    case 'sub_element': {
      const col = colorOverride || material.dominantColor || '';
      return `Change the ${zoneLabel} finish to ${name}${col ? ` (${col})` : ''}. All surrounding elements remain unchanged. Photorealistic finish, correct perspective.`;
    }

    default: { // surface
      const finish = material.finish || zone?.finish || 'natural';
      const color = colorOverride ? `custom color ${colorOverride}` : (material.dominantColor ? `color tone ${material.dominantColor}` : '');
      const matType = material.materialType || material.category;
      return [
        `Photorealistic ${zoneLabel} replacement in an interior scene.`,
        `Replace with ${name}: ${matType} material,`,
        `${finish} finish${color ? `, ${color}` : ''},`,
        `high-resolution surface texture, seamless edges, natural interior lighting,`,
        `correct perspective for ${zoneLabel}, professional architectural photography quality.`,
      ].join(' ');
    }
  }
}

// ── Canvas preview: composite material into zone using mask ───────────────────

async function renderMaterialPreview(
  canvas: HTMLCanvasElement,
  sourceImageUrl: string,
  maskBase64: string,
  material: PickedMaterial,
  colorOverride?: string,
): Promise<void> {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const loadImg = (src: string, crossOrigin = false): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image();
      if (crossOrigin) img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = src;
    });

  try {
    // Draw base image
    const srcImg = await loadImg(sourceImageUrl, true);
    canvas.width = srcImg.naturalWidth;
    canvas.height = srcImg.naturalHeight;
    ctx.drawImage(srcImg, 0, 0);

    // Build material layer on temp canvas (clipped to mask)
    const tmp = document.createElement('canvas');
    tmp.width = canvas.width;
    tmp.height = canvas.height;
    const tmpCtx = tmp.getContext('2d');
    if (!tmpCtx) return;

    // Draw mask as stencil
    const maskImg = await loadImg(`data:image/png;base64,${maskBase64}`);
    tmpCtx.drawImage(maskImg, 0, 0, tmp.width, tmp.height);

    // Fill inside mask shape with material
    tmpCtx.globalCompositeOperation = 'source-in';
    if (!colorOverride && material.imageUrl) {
      try {
        const matImg = await loadImg(material.imageUrl, true);
        const pattern = tmpCtx.createPattern(matImg, 'repeat');
        if (pattern) {
          tmpCtx.fillStyle = pattern;
          tmpCtx.fillRect(0, 0, tmp.width, tmp.height);
        }
      } catch {
        // fallback to color
        tmpCtx.fillStyle = material.dominantColor || '#888888';
        tmpCtx.fillRect(0, 0, tmp.width, tmp.height);
      }
    } else {
      tmpCtx.fillStyle = colorOverride || material.dominantColor || '#888888';
      tmpCtx.fillRect(0, 0, tmp.width, tmp.height);
    }

    // Composite material layer with blend
    ctx.globalAlpha = 0.85;
    ctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(tmp, 0, 0);
    ctx.globalAlpha = 1.0;
    ctx.globalCompositeOperation = 'source-over';
  } catch {
    // If anything fails, just show source image
    try {
      const srcImg = await loadImg(sourceImageUrl, true);
      ctx.drawImage(srcImg, 0, 0, canvas.width || 400, canvas.height || 300);
    } catch { /* ignore */ }
  }
}

// ── Main Component ─────────────────────────────────────────────────────────────

export const MaterialPickerModal: React.FC<MaterialPickerModalProps> = ({
  isOpen,
  onClose,
  zone,
  maskBase64,
  sourceImageUrl,
  jobId,
  workspaceId,
  preSelectedMaterial,
  onEditedImage,
  onAddAnotherZone,
}) => {
  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<ZoneCat | null>(null); // null = All
  const [searchResults, setSearchResults] = useState<PickedMaterial[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Selection state
  const [selectedMaterial, setSelectedMaterial] = useState<PickedMaterial | null>(preSelectedMaterial || null);
  const [colorOverride, setColorOverride] = useState<string>('');
  const [quality, setQuality] = useState<InpaintingModel>('flux-fill-pro');

  // Queue state
  const [queue, setQueue] = useState<QueueItem[]>([]);

  // Preview canvas
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const [previewRendering, setPreviewRendering] = useState(false);

  // Inpainting state
  const [applying, setApplying] = useState(false);
  const [applyStep, setApplyStep] = useState('');
  const [applyProgress, setApplyProgress] = useState(0);
  const [applyError, setApplyError] = useState<string | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Upload + visual search state (3a)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(null);
  const [visualSearchLoading, setVisualSearchLoading] = useState(false);

  // Describe mode state (3c)
  const [describeExpanded, setDescribeExpanded] = useState(false);
  const [describeText, setDescribeText] = useState('');
  const [showAiFallback, setShowAiFallback] = useState(false);

  // DB-driven category chips (Step 10)
  const [dbCategories, setDbCategories] = useState<ZoneCat[]>([]);

  // ── Auto-search on open + fetch DB categories ────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    // Fetch workspace categories from DB non-blocking
    if (workspaceId) {
      supabase
        .rpc('get_product_categories', { p_workspace_id: workspaceId })
        .then(({ data }) => {
          if (data && data.length >= 3) {
            const mapped = (data as { category: string; product_count: number }[])
              .map((row) => ({ label: row.category, queryTerms: CATEGORY_QUERY_TERMS[row.category] ?? row.category }))
              .filter((c) => c.label);
            setDbCategories(mapped);
          }
        })
        .catch(() => { /* ignore — hardcoded map is the fallback */ });
    }

    const cats = getCategoriesForZone(zone);
    const best = bestCategoryForZone(zone, cats);
    setActiveCategory(best);
    const q = zoneSearchQuery(zone);
    setSearchQuery(q);
    if (q) runSearch(q, best);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, zone]);

  // ── Debounced search on query change ────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      runSearch(searchQuery, activeCategory);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, activeCategory, isOpen]);

  // ── Re-render preview when selection or color changes ───────────────────────

  useEffect(() => {
    if (!selectedMaterial || !previewCanvasRef.current || !isOpen) return;
    setPreviewRendering(true);
    renderMaterialPreview(
      previewCanvasRef.current,
      sourceImageUrl,
      maskBase64,
      selectedMaterial,
      colorOverride || undefined,
    ).finally(() => setPreviewRendering(false));
  }, [selectedMaterial, colorOverride, sourceImageUrl, maskBase64, isOpen]);

  // ── Reset on close ───────────────────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) {
      setApplying(false);
      setApplyError(null);
      setApplyStep('');
      setApplyProgress(0);
      setUploadedImagePreview(null);
      setVisualSearchLoading(false);
      setDescribeExpanded(false);
      setDescribeText('');
      setShowAiFallback(false);
    }
  }, [isOpen]);

  // ── Search function ──────────────────────────────────────────────────────────

  const runSearch = useCallback(async (query: string, cat: ZoneCat | null) => {
    if (!query.trim()) { setSearchResults([]); return; }
    setSearchLoading(true);
    setSearchError(null);
    try {
      const effectiveQuery = cat ? `${query} ${cat.queryTerms}`.trim() : query;
      const res = await mivaaApi.searchMultiVector({
        query: effectiveQuery,
        workspace_id: workspaceId || '',
        limit: 24,
        similarity_threshold: 0.5,
      });
      if (res.success && res.data?.results) {
        setSearchResults(res.data.results.map(toPickedMaterial));
      } else {
        setSearchResults([]);
      }
    } catch {
      setSearchError('Search failed. Please try again.');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [workspaceId]);

  // ── Visual search from uploaded image (3a) ────────────────────────────────────

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(',')[1];
      setUploadedImagePreview(dataUrl);
      setVisualSearchLoading(true);
      setSearchError(null);
      try {
        const res = await mivaaApi.searchByImageCrop({
          image_base64: base64,
          query: '',
          workspace_id: workspaceId || '',
          top_k: 24,
        });
        if (res.success && res.data?.results) {
          setSearchResults((res.data.results as any[]).map(toPickedMaterial));
        } else {
          setSearchResults([]);
        }
      } catch {
        setSearchError('Visual search failed. Please try again.');
        setSearchResults([]);
      } finally {
        setVisualSearchLoading(false);
      }
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  }, [workspaceId]);

  // ── Describe-it search (3c) ───────────────────────────────────────────────────

  const handleDescribeSearch = useCallback(async () => {
    if (!describeText.trim()) return;
    setSearchLoading(true);
    setSearchError(null);
    setShowAiFallback(false);
    setUploadedImagePreview(null);
    setSearchQuery(describeText);
    try {
      const res = await mivaaApi.searchMultiVector({
        query: describeText,
        workspace_id: workspaceId || '',
        limit: 24,
        similarity_threshold: 0.5,
      });
      if (res.success && res.data?.results) {
        const results = (res.data.results as any[]).map(toPickedMaterial);
        setSearchResults(results);
        // Show AI fallback if no results or top score below 0.65
        const topScore = res.data.results[0]?.combined_score ?? res.data.results[0]?.similarity ?? 0;
        if (results.length === 0 || topScore < 0.65) {
          setShowAiFallback(true);
        }
      } else {
        setSearchResults([]);
        setShowAiFallback(true);
      }
    } catch {
      setSearchError('Search failed. Please try again.');
      setSearchResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [describeText, workspaceId]);

  // ── Add current selection to queue ──────────────────────────────────────────

  const handleAddToQueue = () => {
    if (!selectedMaterial) return;
    const item: QueueItem = {
      queueId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      zone,
      maskBase64,
      material: selectedMaterial,
      colorOverride: colorOverride || undefined,
      quality,
    };
    setQueue(prev => [...prev, item]);
    setSelectedMaterial(null);
    setColorOverride('');
  };

  const handleRemoveFromQueue = (queueId: string) => {
    setQueue(prev => prev.filter(i => i.queueId !== queueId));
  };

  // ── Apply all queued inpaintings ──────────────────────────────────────────────

  const handleApplyAll = async () => {
    // Build full queue: if something is selected and not queued yet, add it first
    const finalQueue = [...queue];
    if (selectedMaterial && finalQueue.length === 0) {
      finalQueue.push({
        queueId: 'final',
        zone,
        maskBase64,
        material: selectedMaterial,
        colorOverride: colorOverride || undefined,
        quality,
      });
    }
    if (finalQueue.length === 0) return;

    setApplying(true);
    setApplyError(null);
    setApplyProgress(0);

    try {
      let currentImageUrl = sourceImageUrl;
      const appliedMaterials: AppliedMaterial[] = [];

      for (let i = 0; i < finalQueue.length; i++) {
        const item = finalQueue[i];
        setApplyStep(`Applying change ${i + 1} of ${finalQueue.length}: ${item.material.name}...`);
        setApplyProgress(Math.round((i / finalQueue.length) * 80));

        // ai-prompt sentinel: fetch Claude-generated prompt from backend (3c)
        let prompt: string;
        if (item.material.id.startsWith('__ai-prompt__')) {
          try {
            const promptRes = await mivaaApi.generateInpaintingPrompt({
              zone_label: item.zone?.label || 'surface',
              description: item.material.raw?.aiPromptDescription || item.material.name,
              zone_context: item.zone ? { material_type: item.zone.material_type, finish: item.zone.finish } : undefined,
            });
            prompt = promptRes.success && promptRes.data?.prompt
              ? promptRes.data.prompt
              : buildInpaintingPrompt(item.zone, item.material, item.colorOverride);
          } catch {
            prompt = buildInpaintingPrompt(item.zone, item.material, item.colorOverride);
          }
        } else {
          prompt = buildInpaintingPrompt(item.zone, item.material, item.colorOverride);
        }
        const negativePrompt = 'blurry, artifacts, distorted, low quality, unrealistic, cartoon, illustration, collage edges, visible seams';

        // AnyDoor path: use actual catalog product photo when available (not a sentinel)
        const referenceImageUrl =
          item.material.imageUrl &&
          !item.material.id.startsWith('__')
            ? item.material.imageUrl
            : undefined;

        const res = await mivaaApi.inpaintRegion({
          image_url: currentImageUrl,
          mask_base64: item.maskBase64,
          prompt,
          negative_prompt: negativePrompt,
          model: item.quality,
          job_id: jobId,
          workspace_id: workspaceId,
          reference_image_url: referenceImageUrl,
        });

        if (!res.success || !res.data?.storage_url) {
          throw new Error(res.error || `Inpainting failed for item ${i + 1}`);
        }

        currentImageUrl = res.data.storage_url;
        appliedMaterials.push({
          zone_label: item.zone?.label || 'custom area',
          product_id: item.material.id,
          product_name: item.material.name,
          price: item.material.price,
          colorOverride: item.colorOverride,
        });
      }

      setApplyProgress(100);
      setApplyStep('Done!');

      onEditedImage({
        storageUrl: currentImageUrl,
        appliedMaterials,
      });

      // Small delay so user sees "Done!" before close
      setTimeout(() => {
        setApplying(false);
        onClose();
      }, 800);

    } catch (err: any) {
      setApplyError(err?.message || 'Inpainting failed. Please try again.');
      setApplying(false);
    }
  };

  // ── Credit calculations ───────────────────────────────────────────────────────

  const queueCredits = queue.reduce((sum, item) => sum + INPAINTING_CREDIT_COSTS[item.quality], 0);
  const currentItemCredits = INPAINTING_CREDIT_COSTS[quality];
  const totalCredits = queueCredits + (selectedMaterial ? currentItemCredits : 0);

  const hasAnythingToApply = selectedMaterial !== null || queue.length > 0;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !applying) onClose(); }}>
      <DialogContent className="max-w-5xl w-full h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">

        {/* Header */}
        <DialogHeader className="flex-shrink-0 px-6 py-4 border-b border-border bg-gradient-to-r from-violet-50 to-purple-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
                <Paintbrush className="w-4 h-4 text-white" />
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">
                  Replace Material{zone ? `: ${zone.label}` : ''}
                </DialogTitle>
                {zone && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {zone.material_type} · {zone.finish} · {zone.dominant_color}
                  </p>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Loading screen */}
        {applying ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
            <div className="w-16 h-16 rounded-full bg-violet-100 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
            </div>
            <div className="text-center space-y-1">
              <p className="font-medium text-foreground">{applyStep || 'Processing...'}</p>
              <p className="text-sm text-muted-foreground">FLUX Fill Pro is working its magic</p>
            </div>
            {/* Progress bar */}
            <div className="w-full max-w-xs bg-muted rounded-full h-2">
              <div
                className="bg-violet-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${applyProgress}%` }}
              />
            </div>
            {applyError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {applyError}
              </div>
            )}
          </div>
        ) : (
          /* Main content: left + right panels */
          <div className="flex-1 flex overflow-hidden min-h-0">

            {/* ── Left panel: Search ─────────────────────────────────────────── */}
            <div className="w-2/5 flex flex-col border-r border-border min-h-0">
              {/* Search area */}
              <div className="flex-shrink-0 p-3 border-b border-border space-y-2">

                {/* Text search input */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setUploadedImagePreview(null); }}
                    placeholder="Search materials..."
                    className="pl-9 h-8 text-sm"
                  />
                  {(searchLoading || visualSearchLoading) && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground animate-spin" />
                  )}
                </div>

                {/* ── 3-mode button row ─────────────────────────────────────── */}
                <div className="flex gap-1.5">
                  {/* Custom Color */}
                  <button
                    onClick={() => {
                      if (selectedMaterial?.id === '__custom_color__') {
                        setSelectedMaterial(null);
                      } else {
                        setSelectedMaterial(CUSTOM_COLOR_MATERIAL);
                        setDescribeExpanded(false);
                      }
                    }}
                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                      selectedMaterial?.id === '__custom_color__'
                        ? 'bg-violet-600 border-violet-600 text-white'
                        : 'bg-white border-border text-muted-foreground hover:border-violet-300 hover:text-violet-700'
                    }`}
                  >
                    <Paintbrush className="w-3 h-3 flex-shrink-0" />
                    Custom Color
                  </button>

                  {/* Describe it */}
                  <button
                    onClick={() => {
                      setDescribeExpanded(v => !v);
                      if (selectedMaterial?.id === '__custom_color__') setSelectedMaterial(null);
                    }}
                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                      describeExpanded
                        ? 'bg-violet-600 border-violet-600 text-white'
                        : 'bg-white border-border text-muted-foreground hover:border-violet-300 hover:text-violet-700'
                    }`}
                  >
                    <Sparkles className="w-3 h-3 flex-shrink-0" />
                    Describe
                  </button>

                  {/* Upload Image */}
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg border text-[11px] font-medium transition-all ${
                      uploadedImagePreview
                        ? 'bg-violet-600 border-violet-600 text-white'
                        : 'bg-white border-border text-muted-foreground hover:border-violet-300 hover:text-violet-700'
                    }`}
                  >
                    <Camera className="w-3 h-3 flex-shrink-0" />
                    Upload
                  </button>
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                </div>

                {/* Describe textarea (shown when describeExpanded) */}
                {describeExpanded && (
                  <div className="space-y-1.5">
                    <textarea
                      rows={2}
                      value={describeText}
                      onChange={e => setDescribeText(e.target.value)}
                      placeholder="e.g. warm terracotta floor tiles with subtle texture…"
                      className="w-full text-xs rounded border border-border px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-violet-400"
                    />
                    <Button
                      size="sm"
                      onClick={handleDescribeSearch}
                      disabled={!describeText.trim() || searchLoading}
                      className="w-full h-7 text-xs bg-violet-600 hover:bg-violet-700 text-white"
                    >
                      {searchLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Search'}
                    </Button>
                    {showAiFallback && (
                      <div className="flex items-start gap-1.5 px-2 py-1.5 bg-amber-50 border border-amber-200 rounded text-xs text-amber-800">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        <span className="flex-1">No great catalog matches.{' '}
                          <button
                            onClick={() => {
                              setSelectedMaterial({
                                id: `__ai-prompt__${Date.now()}`,
                                name: describeText.slice(0, 60),
                                category: 'ai-generated',
                                imageUrl: undefined,
                                raw: { aiPromptDescription: describeText },
                              });
                              setShowAiFallback(false);
                            }}
                            className="font-semibold underline hover:no-underline"
                          >Generate with AI instead</button>
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Visual search thumbnail */}
                {uploadedImagePreview && (
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-violet-50 border border-violet-200 rounded text-xs text-violet-700">
                    <img src={uploadedImagePreview} alt="upload" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                    <span className="flex-1 line-clamp-1">{visualSearchLoading ? 'Searching visually…' : 'Visual search results'}</span>
                    <button onClick={() => { setUploadedImagePreview(null); setSearchResults([]); }} className="text-violet-400 hover:text-violet-700">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {/* Zone-aware category chips — DB list when available, hardcoded fallback */}
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setActiveCategory(null)}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      activeCategory === null ? 'bg-violet-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    All
                  </button>
                  {(dbCategories.length >= 3 ? dbCategories : getCategoriesForZone(zone)).map(cat => (
                    <button
                      key={cat.label}
                      onClick={() => setActiveCategory(cat)}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                        activeCategory?.label === cat.label ? 'bg-violet-600 text-white' : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

              </div>

              {/* Results grid */}
              <ScrollArea className="flex-1 min-h-0">
                <div className="p-2">
                  {searchError && (
                    <div className="flex items-center gap-2 text-xs text-destructive p-2">
                      <AlertCircle className="w-3.5 h-3.5" />
                      {searchError}
                    </div>
                  )}
                  {!searchLoading && !searchError && searchResults.length === 0 && searchQuery && (
                    <p className="text-xs text-muted-foreground text-center py-6">No results found</p>
                  )}
                  {!searchQuery && (
                    <p className="text-xs text-muted-foreground text-center py-6">Type to search materials</p>
                  )}
                  <div className="grid grid-cols-3 gap-1.5">
                    {searchResults.map(mat => (
                      <button
                        key={mat.id}
                        onClick={() => setSelectedMaterial(mat)}
                        className={`relative rounded-lg overflow-hidden border-2 transition-all group ${
                          selectedMaterial?.id === mat.id
                            ? 'border-violet-600 shadow-md'
                            : 'border-transparent hover:border-violet-300'
                        }`}
                        title={mat.name}
                      >
                        {/* Material thumbnail */}
                        <div className="aspect-square bg-muted relative">
                          {mat.imageUrl ? (
                            <img
                              src={mat.imageUrl}
                              alt={mat.name}
                              className="w-full h-full object-cover"
                              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          ) : (
                            <div
                              className="w-full h-full"
                              style={{ backgroundColor: mat.dominantColor || '#e5e7eb' }}
                            />
                          )}
                          {selectedMaterial?.id === mat.id && (
                            <div className="absolute inset-0 bg-violet-600/20 flex items-center justify-center">
                              <div className="w-5 h-5 bg-violet-600 rounded-full flex items-center justify-center">
                                <Check className="w-3 h-3 text-white" />
                              </div>
                            </div>
                          )}
                        </div>
                        {/* Name */}
                        <div className="p-1 bg-white/90 backdrop-blur-sm">
                          <p className="text-[10px] font-medium text-foreground line-clamp-1 leading-tight">{mat.name}</p>
                          {mat.dominantColor && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <div
                                className="w-2.5 h-2.5 rounded-full border border-border flex-shrink-0"
                                style={{ backgroundColor: mat.dominantColor }}
                              />
                              <span className="text-[9px] text-muted-foreground">{mat.category}</span>
                            </div>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </ScrollArea>
            </div>

            {/* ── Right panel: Preview + config ──────────────────────────────── */}
            <div className="flex-1 flex flex-col min-h-0">

              {/* Empty state */}
              {!selectedMaterial ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
                  <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
                    <Package className="w-6 h-6 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">Select a material</p>
                    <p className="text-xs text-muted-foreground mt-1">Click any result on the left to preview it in your render</p>
                  </div>
                </div>
              ) : selectedMaterial.id === '__custom_color__' ? (
                /* Custom Color right panel — color picker only (3b) */
                <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full border border-border" style={{ backgroundColor: colorOverride || '#888888' }} />
                    <span className="text-sm font-semibold">Custom Color</span>
                    <button onClick={() => setSelectedMaterial(null)} className="ml-auto text-muted-foreground hover:text-foreground">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <input
                    type="color"
                    value={colorOverride || '#888888'}
                    onChange={e => setColorOverride(e.target.value)}
                    className="w-24 h-24 rounded-xl cursor-pointer border-2 border-border p-1 bg-transparent"
                    title="Pick paint color"
                  />
                  <div className="flex flex-wrap gap-2 justify-center">
                    {['#FFFFFF', '#F5F5DC', '#8B7355', '#2F4F4F', '#708090', '#4A4A4A', '#C8A97A', '#E8D5B7',
                      '#B5D3E7', '#D4A5A5', '#A8C5A0', '#E8C99A'].map(c => (
                      <button
                        key={c}
                        onClick={() => setColorOverride(c)}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${colorOverride === c ? 'border-violet-600 scale-110' : 'border-border'}`}
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                  </div>
                  {colorOverride && (
                    <p className="text-xs text-muted-foreground font-mono">{colorOverride.toUpperCase()}</p>
                  )}
                </div>
              ) : (
                <ScrollArea className="flex-1 min-h-0">
                  <div className="p-4 space-y-4">

                    {/* Material info */}
                    <div className="flex gap-3 items-start">
                      <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden border border-border bg-muted">
                        {selectedMaterial.imageUrl ? (
                          <img
                            src={selectedMaterial.imageUrl}
                            alt={selectedMaterial.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div
                            className="w-full h-full"
                            style={{ backgroundColor: selectedMaterial.dominantColor || '#e5e7eb' }}
                          />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm text-foreground line-clamp-2">{selectedMaterial.name}</h3>
                        <div className="flex flex-wrap gap-1 mt-1">
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{selectedMaterial.category}</Badge>
                          {selectedMaterial.finish && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{selectedMaterial.finish}</Badge>
                          )}
                        </div>
                        {selectedMaterial.price != null && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {selectedMaterial.currency === 'EUR' ? '€' : '$'}{selectedMaterial.price?.toFixed(2)}
                            {selectedMaterial.raw?.metadata?.price_unit ? ` / ${selectedMaterial.raw.metadata.price_unit}` : ''}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => setSelectedMaterial(null)}
                        className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Canvas preview */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-violet-600" />
                        <span className="text-xs font-medium text-foreground">Preview</span>
                        {previewRendering && <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />}
                      </div>
                      <div className="relative rounded-lg overflow-hidden border border-border bg-muted" style={{ aspectRatio: '16/9' }}>
                        <canvas
                          ref={previewCanvasRef}
                          className="w-full h-full object-contain"
                          style={{ display: 'block' }}
                        />
                        <div className="absolute bottom-1 right-1">
                          <Badge className="text-[10px] bg-black/60 text-white border-0 px-1.5 py-0">Preview</Badge>
                        </div>
                      </div>
                    </div>

                    {/* Color override */}
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <div
                          className="w-3.5 h-3.5 rounded-full border border-border"
                          style={{ backgroundColor: colorOverride || selectedMaterial.dominantColor || '#888888' }}
                        />
                        <span className="text-xs font-medium text-foreground">Color override</span>
                        {colorOverride && (
                          <button
                            onClick={() => setColorOverride('')}
                            className="text-[10px] text-muted-foreground hover:text-foreground ml-auto"
                          >
                            Reset
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={colorOverride || selectedMaterial.dominantColor || '#888888'}
                          onChange={e => setColorOverride(e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer border border-border p-0.5 bg-transparent"
                          title="Pick a color override"
                        />
                        {/* Common interior swatches */}
                        <div className="flex gap-1 flex-wrap">
                          {['#FFFFFF', '#F5F5DC', '#8B7355', '#2F4F4F', '#708090', '#4A4A4A', '#C8A97A', '#E8D5B7'].map(c => (
                            <button
                              key={c}
                              onClick={() => setColorOverride(c)}
                              className={`w-5 h-5 rounded-full border-2 transition-all ${
                                colorOverride === c ? 'border-violet-600 scale-110' : 'border-border'
                              }`}
                              style={{ backgroundColor: c }}
                              title={c}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Quality selector */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-medium text-foreground">Quality</span>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(Object.keys(INPAINTING_CREDIT_COSTS) as InpaintingModel[]).map(model => {
                          const icons = { 'sd-inpainting': <Zap className="w-3 h-3" />, 'flux-fill-dev': <Layers className="w-3 h-3" />, 'flux-fill-pro': <Star className="w-3 h-3" /> };
                          return (
                            <button
                              key={model}
                              onClick={() => setQuality(model)}
                              className={`flex flex-col items-center gap-0.5 p-2 rounded-lg border-2 text-center transition-all ${
                                quality === model
                                  ? 'border-violet-600 bg-violet-50 text-violet-700'
                                  : 'border-border hover:border-violet-300 text-foreground'
                              }`}
                            >
                              {icons[model]}
                              <span className="text-[10px] font-medium leading-tight">{INPAINTING_MODEL_LABELS[model]}</span>
                              <span className="text-[10px] text-muted-foreground">{INPAINTING_CREDIT_COSTS[model]} cr</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Add to queue button */}
                    {queue.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleAddToQueue}
                        className="w-full text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
                      >
                        <Plus className="w-3.5 h-3.5 mr-1.5" />
                        Add to queue ({INPAINTING_CREDIT_COSTS[quality]} cr) and add another
                      </Button>
                    )}

                  </div>
                </ScrollArea>
              )}

              {/* ── Queue panel ──────────────────────────────────────────────── */}
              {queue.length > 0 && (
                <div className="flex-shrink-0 border-t border-border p-3 bg-muted/30 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-violet-600" />
                    <span className="text-xs font-medium text-foreground">Queue ({queue.length} zones)</span>
                  </div>
                  <div className="space-y-1">
                    {queue.map(item => (
                      <div key={item.queueId} className="flex items-center gap-2 bg-background rounded px-2 py-1.5 border border-border text-xs">
                        {item.material.imageUrl && (
                          <img src={item.material.imageUrl} alt="" className="w-5 h-5 rounded object-cover flex-shrink-0" />
                        )}
                        <span className="text-muted-foreground flex-shrink-0">{item.zone?.label || 'Area'}</span>
                        <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                        <span className="font-medium line-clamp-1 flex-1">{item.material.name}</span>
                        {item.colorOverride && (
                          <div className="w-3.5 h-3.5 rounded-full border border-border flex-shrink-0" style={{ backgroundColor: item.colorOverride }} />
                        )}
                        <span className="text-muted-foreground flex-shrink-0">{INPAINTING_CREDIT_COSTS[item.quality]}cr</span>
                        <button
                          onClick={() => handleRemoveFromQueue(item.queueId)}
                          className="text-muted-foreground hover:text-destructive transition-colors flex-shrink-0"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        {/* ── Footer ─────────────────────────────────────────────────────────── */}
        {!applying && (
          <div className="flex-shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-t border-border bg-white/80 backdrop-blur-sm">
            {/* Left: Add another zone */}
            <div className="flex items-center gap-2">
              {onAddAnotherZone && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (selectedMaterial) handleAddToQueue();
                    onAddAnotherZone();
                  }}
                  className="text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add another zone
                </Button>
              )}
              {applyError && (
                <div className="flex items-center gap-1.5 text-xs text-destructive">
                  <AlertCircle className="w-3.5 h-3.5" />
                  {applyError}
                </div>
              )}
            </div>

            {/* Right: credits + apply */}
            <div className="flex items-center gap-3">
              {hasAnythingToApply && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Info className="w-3 h-3" />
                  <span>{totalCredits} credits total</span>
                </div>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={onClose}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleApplyAll}
                disabled={!hasAnythingToApply}
                className="text-xs bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-50"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1.5" />
                Apply{queue.length > 0 ? ` ${queue.length + (selectedMaterial ? 1 : 0)} changes` : ''} · {totalCredits} cr
              </Button>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
};

export type { MaterialPickerModalProps };
