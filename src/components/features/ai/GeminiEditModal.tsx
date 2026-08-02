/**
 * GeminiEditModal
 *
 * 3-step structured modal for targeted image edits.
 *   Step 1 — Category (Colors, Lighting, Flooring, Walls, Plants, Style, Furniture, Region, Custom)
 *   Step 2 — Category-specific options that build a detailed prompt automatically
 *   Step 3 — Surface targeting + model selection + editable prompt preview → Apply
 *
 * On confirm, calls onApply({ prompt, modelTier }) which triggers generation directly.
 * The modal closes and the edit is submitted without user needing to press Send.
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import {
  Palette,
  Sun,
  Layers,
  Square,
  TreePine,
  Sofa,
  Sparkles,
  PencilLine,
  ChevronLeft,
  Check,
  Crop,
  Zap,
  Crown,
  Wand2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Categories ──────────────────────────────────────────────────────────────

const EDIT_CATEGORIES = [
  { id: 'colors',    label: 'Colors',          icon: Palette,    description: 'Wall & accent palette' },
  { id: 'lighting',  label: 'Lighting',         icon: Sun,        description: 'Mood, warmth & time of day' },
  { id: 'flooring',  label: 'Flooring',         icon: Layers,     description: 'Material, format & finish' },
  { id: 'walls',     label: 'Walls',            icon: Square,     description: 'Surface, texture & zone' },
  { id: 'plants',    label: 'Plants & Decor',   icon: TreePine,   description: 'Greenery & decorative items' },
  { id: 'style',     label: 'Overall Style',    icon: Sparkles,   description: 'Retheme the whole design' },
  { id: 'furniture', label: 'Furniture',        icon: Sofa,       description: 'Add, swap or remove pieces' },
  // Region Edit skips steps 2+3, so the user never reaches the 6/15/15 model-tier
  // picker — it goes straight to generate-region-edit, which is a fixed 20-credit
  // inpaint. The card must state that price, or it is invisible until the failure
  // toast quotes it.
  { id: 'region',    label: 'Region Edit',      icon: Crop,       description: 'Draw on image & change that area — 20 credits' },
  { id: 'custom',    label: 'Custom Edit',      icon: PencilLine, description: 'Describe anything freely' },
] as const;

type EditCategoryId = typeof EDIT_CATEGORIES[number]['id'];

// ── Per-category options ─────────────────────────────────────────────────────

const COLORS = [
  { label: 'Warm White',   value: 'warm white (#F5F0E8)',            swatch: '#F5F0E8' },
  { label: 'Cool White',   value: 'cool white (#F0F4F8)',            swatch: '#F0F4F8' },
  { label: 'Light Grey',   value: 'light grey (#C8CDD4)',            swatch: '#C8CDD4' },
  { label: 'Sage Green',   value: 'sage green (#9CAD8E)',            swatch: '#9CAD8E' },
  { label: 'Dusty Pink',   value: 'dusty rose (#D4A5A5)',            swatch: '#D4A5A5' },
  { label: 'Terracotta',   value: 'terracotta (#C07A55)',            swatch: '#C07A55' },
  { label: 'Deep Teal',    value: 'deep teal (#2A6B6A)',             swatch: '#2A6B6A' },
  { label: 'Navy',         value: 'navy blue (#1E3456)',             swatch: '#1E3456' },
  { label: 'Charcoal',     value: 'charcoal (#3A3A3A)',              swatch: '#3A3A3A' },
  { label: 'Off-Black',    value: 'near-black / off-black (#1A1A1A)',swatch: '#1A1A1A' },
  { label: 'Sand',         value: 'warm sand / beige (#D6C5A0)',     swatch: '#D6C5A0' },
  { label: 'Limewash',     value: 'limewash white (#EAE5D8)',        swatch: '#EAE5D8' },
];

const COLOR_FINISHES = ['matte', 'satin', 'gloss', 'metallic sheen'];

const LIGHTING_PRESETS = [
  { label: 'Golden Hour',    value: 'golden hour — warm amber sunlight at a low angle, long soft shadows, cosy' },
  { label: 'Bright Midday',  value: 'bright midday daylight — crisp, even natural light, no harsh shadows' },
  { label: 'Soft Overcast',  value: 'soft overcast daylight — diffused natural light, calm serene mood' },
  { label: 'Warm Evening',   value: 'warm evening ambiance — soft warm artificial lighting, cosy glow, no daylight' },
  { label: 'Candlelight',    value: 'candlelight / intimate evening — low warm candlelight, flickering glow' },
  { label: 'Cool Daylight',  value: 'cool bright daylight — clean, clinical, minimal shadows, modern feel' },
  { label: 'Night',          value: 'night time interior — dark outside, warm interior lights on, atmospheric' },
  { label: 'Dramatic Spot',  value: 'dramatic spotlight / accent lighting — targeted beams on key surfaces' },
];

const FLOORING_MATERIALS = [
  { label: 'Polished Marble',   value: 'polished white Calacatta marble, large-format 120×60cm slabs, gold veining, high gloss' },
  { label: 'Honed Marble',      value: 'honed matte marble in warm beige tones, filled joints, stone texture' },
  { label: 'Light Oak',         value: 'light oak wide-plank engineered wood, 200mm planks, satin finish, natural grain' },
  { label: 'Dark Walnut',       value: 'dark walnut wide-plank hardwood, matte lacquer, rich chocolate tone' },
  { label: 'Herringbone Oak',   value: 'herringbone oak parquet, 70×280mm blocks, natural oil finish' },
  { label: 'Chevron Parquet',   value: 'chevron parquet oak, premium oil finish, warm honey tone' },
  { label: 'Concrete',          value: 'polished concrete, medium grey, subtle aggregate texture, micro-pores visible' },
  { label: 'Terrazzo',          value: 'terrazzo — white base with coloured stone chips, polished to a mirror finish' },
  { label: 'Large-Format Tile', value: 'large-format 120×120cm porcelain tile, light grey, rectified edges, 3mm grout' },
  { label: 'Travertine',        value: 'travertine stone tiles, filled and honed, warm ivory, linear pattern' },
  { label: 'Dark Stone',        value: 'dark basalt / black slate natural stone, matte, raw texture' },
  { label: 'Zellige Tile',      value: 'handmade Zellige ceramic tiles, ivory/cream, irregular glossy surface' },
];

const FLOORING_GROUT = ['matching grout', 'contrasting dark grout', 'white grout', 'light grey grout'];

const WALL_FINISHES = [
  { label: 'Smooth Paint',        value: 'smooth matte painted walls' },
  { label: 'Limewash',            value: 'limewash painted walls with natural chalky texture and subtle depth' },
  { label: 'Microcement',         value: 'microcement wall finish, seamless, industrial-organic feel' },
  { label: 'Venetian Plaster',    value: 'Venetian plaster — polished, multi-layer application, marble-like sheen' },
  { label: 'Fluted Panels',       value: 'vertical fluted / reeded wood panels, warm oak, tight grooves' },
  { label: 'Wall Paneling',       value: 'classic wall paneling / wainscoting, painted in a sophisticated tone' },
  { label: 'Exposed Brick',       value: 'exposed brick wall — original or whitewashed, raw tactile texture' },
  { label: 'Stone Cladding',      value: 'large natural stone cladding panels, travertine or limestone' },
  { label: 'Geometric Tile',      value: 'decorative geometric tile pattern, feature wall treatment' },
  { label: 'Luxury Wallpaper',    value: 'luxury textured wallpaper — botanical / abstract / linen look' },
  { label: 'Shiplap',             value: 'horizontal shiplap wooden cladding, whitewashed finish' },
];

const WALL_ZONES = [
  { label: 'All surfaces',    value: 'all visible wall surfaces from floor to ceiling, edge to edge' },
  { label: 'Feature wall',    value: 'the main feature / accent wall only — all other walls stay identical' },
  { label: 'Upper zone only', value: 'upper wall zone only (above 120cm), lower zone unchanged' },
  { label: 'Lower dado only', value: 'lower dado zone only (below 90cm), upper walls unchanged' },
];

const PLANT_OPTIONS = [
  { label: 'Fiddle Leaf Fig',  value: 'tall fiddle leaf fig tree in a ceramic pot' },
  { label: 'Monstera',         value: 'large monstera deliciosa in a woven rattan basket' },
  { label: 'Olive Tree',       value: 'sculptural olive tree in a terracotta pot' },
  { label: 'Bonsai',           value: 'curated bonsai tree on a side table' },
  { label: 'Snake Plant',      value: 'tall snake plant in a textured planter' },
  { label: 'Hanging Plants',   value: 'hanging trailing pothos near windows' },
  { label: 'Mixed Tropical',   value: 'mixed tropical plants — multiple varieties, abundant biophilic greenery' },
  { label: 'Dried Botanicals', value: 'dried pampas grass and botanicals in tall vases' },
  { label: 'Remove Plants',    value: 'remove all plants and replace with clean minimal decor' },
  { label: 'More Greenery',    value: 'significantly more greenery throughout — biophilic design everywhere' },
];

const STYLE_PRESETS = [
  'Modern', 'Scandinavian', 'Japandi', 'Mid-Century Modern',
  'Coastal', 'Urban Industrial', 'Rustic Farmhouse', 'Transitional Luxury',
  'Modern Organic', 'Maximalist', 'Minimalist', 'Art Deco',
  'Mediterranean', 'Wabi-Sabi', 'Hamptons', 'Contemporary',
];

const STYLE_INTENSITIES = [
  { label: 'Subtle refresh',          value: 'subtle — update materials and accents while keeping the overall character' },
  { label: 'Moderate transformation', value: 'moderate — clear style change across all surfaces and fixtures' },
  { label: 'Complete retheme',        value: 'complete — total transformation, every element updated to match the new style' },
];

// ── Spatial lock clause (auto-appended to every prompt) ──────────────────────

const SPATIAL_LOCK = 'Keep all furniture positions, fixtures, walls, windows, doors, and architecture exactly where they are. Only modify the specified element. Photorealistic result. 24mm architectural lens, corrected verticals, no fisheye.';

// ── Prompt builders ──────────────────────────────────────────────────────────

function buildPrompt(
  category: EditCategoryId,
  selected: string[],
  selectedSub: string[],
  custom: string,
  wallZone: string,
  roomContext?: string | null,
): string {
  // Append room context if available (e.g. "This is a kitchen." or "This is a modern bedroom.")
  const roomSuffix = roomContext ? ` Room context: ${roomContext}.` : '';
  switch (category) {
    case 'colors': {
      const color = selected[0] || custom;
      const finish = selectedSub[0] ? `, ${selectedSub[0]} finish` : '';
      return `Change the wall color to ${color}${finish}. Apply the new color to ${wallZone || 'all visible wall surfaces'} floor-to-ceiling, edge-to-edge — zero original finish remaining visible anywhere. ${SPATIAL_LOCK}${roomSuffix}`;
    }
    case 'lighting': {
      const lighting = selected[0] || custom;
      return `Transform the lighting atmosphere to: ${lighting}. Adjust light quality, color temperature, shadows, highlights, and reflections on all surfaces consistently. ${SPATIAL_LOCK}${roomSuffix}`;
    }
    case 'flooring': {
      const floor = selected[0] || custom;
      const grout = selectedSub[0] ? ` Use ${selectedSub[0]}.` : '';
      return `Replace the entire floor with: ${floor}. Cover the complete floor area edge-to-edge with no gaps.${grout} ${SPATIAL_LOCK}${roomSuffix}`;
    }
    case 'walls': {
      const wall = selected[0] || custom;
      const zone = selectedSub[0] || wallZone || 'all visible wall surfaces';
      return `Replace the wall surface finish with: ${wall}. Apply it to ${zone}. Every surface in that zone must be fully covered — no original finish remains visible. ${SPATIAL_LOCK}${roomSuffix}`;
    }
    case 'plants': {
      const plants = selected[0] || custom;
      return `Update the plants and greenery: ${plants}. Integrate them naturally into the existing layout. ${SPATIAL_LOCK}${roomSuffix}`;
    }
    case 'style': {
      const styleChoice = selected[0] || custom;
      const intensity = selectedSub[0] || 'complete — total transformation, every element updated to match the new style';
      return `Restyle this entire room in ${styleChoice} design — ${intensity}. Update floors, walls, ceiling, fixtures, furniture, lighting, and decor to perfectly match the style. Room spatial layout and fixed architecture stay intact.${roomSuffix}`;
    }
    case 'furniture': {
      return (custom || 'Update the furniture in this room. Keep the room proportions and architecture unchanged.') + roomSuffix;
    }
    case 'region':
    case 'custom':
    default:
      return custom + roomSuffix;
  }
}

// ── Model options ────────────────────────────────────────────────────────────

const MODEL_OPTIONS = [
  {
    id: 'fast' as const,
    label: 'Fast',
    description: 'Gemini Flash — quick iterations',
    credits: 6,
    icon: Zap,
    color: 'text-blue-500',
    bg: 'bg-blue-50 border-blue-200',
    active: 'bg-blue-600 border-blue-600 text-white',
  },
  {
    id: 'pro' as const,
    label: 'Pro',
    description: 'Gemini Pro — high quality',
    credits: 15,
    icon: Crown,
    color: 'text-violet-500',
    bg: 'bg-violet-50 border-violet-200',
    active: 'bg-violet-600 border-violet-600 text-white',
  },
  {
    id: 'grok' as const,
    label: 'Grok',
    description: 'Aurora — best spatial accuracy',
    credits: 15,
    icon: Wand2,
    color: 'text-amber-500',
    bg: 'bg-amber-50 border-amber-200',
    active: 'bg-amber-500 border-amber-500 text-white',
  },
] as const;

export type EditModelTier = 'fast' | 'pro' | 'grok';

// ── Exported types ───────────────────────────────────────────────────────────

export interface GeminiEditParams {
  prompt: string;
  modelTier: EditModelTier;
  /** Set to true when the user chose Region Edit — triggers canvas mode in AgentHub */
  regionEdit?: boolean;
}

interface GeminiEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with final prompt + model tier. Modal auto-closes before calling. */
  onApply: (params: GeminiEditParams) => void;
  generating?: boolean;
  /** Room type context from the image being edited (e.g. 'bedroom', 'kitchen'). When provided, it's appended to the prompt for better results. */
  roomType?: string | null;
  /** Style context from the image being edited (e.g. 'modern', 'scandinavian'). */
  style?: string | null;
}

// ── Component ────────────────────────────────────────────────────────────────

export const GeminiEditModal: React.FC<GeminiEditModalProps> = ({
  isOpen,
  onClose,
  onApply,
  generating = false,
  roomType = null,
  style = null,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [category, setCategory] = useState<EditCategoryId | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedSub, setSelectedSub] = useState<string[]>([]);
  const [wallZone, setWallZone] = useState('');
  const [custom, setCustom] = useState('');
  const [prompt, setPrompt] = useState('');
  const [modelTier, setModelTier] = useState<EditModelTier>('fast');

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setCategory(null);
      setSelected([]);
      setSelectedSub([]);
      setWallZone('');
      setCustom('');
      setPrompt('');
      setModelTier('fast');
    }
  }, [isOpen]);

  // Build room context string from props
  const roomContext = roomType
    ? `${style ? `${style} ` : ''}${roomType.replace(/_/g, ' ')}`
    : style || null;

  // Auto-rebuild prompt when options change
  useEffect(() => {
    if (category && (selected.length > 0 || custom)) {
      setPrompt(buildPrompt(category, selected, selectedSub, custom, wallZone, roomContext));
    }
  }, [category, selected, selectedSub, custom, wallZone, roomContext]);

  const handleCategorySelect = (id: EditCategoryId) => {
    // Region edit bypasses steps 2+3 — goes straight to canvas mode. `modelTier` is
    // therefore always the untouched 'fast' default here (the picker lives on step 3),
    // and AgentHub's regionEdit branch discards it: generate-region-edit is a fixed
    // 20-credit inpaint with no tier. Passed only to satisfy the shared onApply
    // contract — do not add a tier UI to this path without also plumbing it through
    // generate-region-edit's CREDITS_REQUIRED.
    if (id === 'region') {
      onClose();
      onApply({ prompt: '', modelTier, regionEdit: true });
      return;
    }
    setCategory(id);
    setSelected([]);
    setSelectedSub([]);
    setWallZone('');
    setCustom('');
    setPrompt('');
    setStep(2);
  };

  const togglePrimary = (value: string) => setSelected([value]);
  const toggleSub = (value: string) =>
    setSelectedSub((prev) => (prev[0] === value ? [] : [value]));

  const handleApply = () => {
    const finalPrompt = prompt.trim() || buildPrompt(category!, selected, selectedSub, custom, wallZone);
    if (!finalPrompt) return;
    onClose();
    onApply({ prompt: finalPrompt, modelTier });
  };

  const canProceedToStep3 = selected.length > 0 || (category && ['furniture', 'custom'].includes(category) && custom.trim().length > 0);
  const canApply = prompt.trim().length > 0;
  const categoryMeta = EDIT_CATEGORIES.find((c) => c.id === category);
  const isTextOnly = category === 'furniture' || category === 'custom';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden">
        {/* ── Header ── */}
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button
                onClick={() => setStep((s) => (s === 3 ? 2 : 1) as 1 | 2 | 3)}
                className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div className="flex-1">
              <DialogTitle className="font-semibold">
                {step === 1
                  ? 'Edit Image'
                  : step === 2
                  ? categoryMeta?.label ?? 'Configure'
                  : 'Review & Apply'}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {step === 1
                  ? 'What would you like to change?'
                  : step === 2
                  ? categoryMeta?.description ?? 'Select options'
                  : 'Choose model and apply your edit'}
              </p>
            </div>
            {/* Step dots. Current-vs-done was carried by colour alone (WCAG 1.4.1) with no
                "Step 2 of 3" anywhere, so a screen reader announced nothing and a
                colour-blind user could not tell position. The dots are decorative; the
                sr-only text is the actual announcement. */}
            <div className="flex items-center gap-1.5" role="group" aria-label={`Step ${step} of 3`}>
              <span className="sr-only">{`Step ${step} of 3`}</span>
              {[1, 2, 3].map((s) => (
                <div
                  key={s}
                  className={cn(
                    'w-2 h-2 rounded-full transition-colors',
                    s === step ? 'bg-primary' : s < step ? 'bg-primary/40' : 'bg-muted',
                  )}
                  aria-hidden="true"
                />
              ))}
            </div>
          </div>
        </DialogHeader>

        <div className="p-5 max-h-[72vh] overflow-y-auto space-y-4">
          {/* ── Step 1: Category picker ──────────────────────────────────── */}
          {step === 1 && (
            <div className="grid grid-cols-2 gap-2">
              {EDIT_CATEGORIES.map(({ id, label, icon: Icon, description }) => (
                <button
                  key={id}
                  onClick={() => handleCategorySelect(id)}
                  className="flex items-start gap-3 p-3.5 rounded-xl border-2 border-border hover:border-primary/40 hover:bg-muted/50 text-left transition-all group"
                >
                  <div className="p-1.5 rounded-lg bg-primary/5 group-hover:bg-primary/10 transition-colors mt-0.5 shrink-0">
                    <Icon className="w-4 h-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{label}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5 leading-snug">{description}</div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ── Step 2: Category-specific options ───────────────────────── */}
          {step === 2 && category && (
            <>
              {/* Colors */}
              {category === 'colors' && (
                <>
                  <div className="grid grid-cols-4 gap-2">
                    {COLORS.map((c) => (
                      <button
                        key={c.value}
                        onClick={() => togglePrimary(c.value)}
                        className={cn(
                          'flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all',
                          selected[0] === c.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/30',
                        )}
                      >
                        <div className="w-8 h-8 rounded-full border border-gray-200 shadow-sm relative" style={{ background: c.swatch }}>
                          {selected[0] === c.value && <Check className="w-3.5 h-3.5 text-primary absolute inset-0 m-auto drop-shadow" />}
                        </div>
                        <span className="text-[10px] font-medium text-center leading-tight">{c.label}</span>
                      </button>
                    ))}
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Paint finish</p>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_FINISHES.map((f) => (
                        <button key={f} onClick={() => toggleSub(f)}
                          className={cn('px-3 py-1.5 rounded-full border text-xs font-medium transition-all',
                            selectedSub[0] === f ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/40')}
                        >{f}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Lighting */}
              {category === 'lighting' && (
                <div className="grid grid-cols-2 gap-2">
                  {LIGHTING_PRESETS.map((l) => (
                    <button key={l.value} onClick={() => togglePrimary(l.value)}
                      className={cn('flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-left',
                        selected[0] === l.value ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/30 hover:bg-muted/50')}
                    >
                      {l.label}
                      {selected[0] === l.value && <Check className="w-3.5 h-3.5 shrink-0 ml-1" />}
                    </button>
                  ))}
                </div>
              )}

              {/* Flooring */}
              {category === 'flooring' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {FLOORING_MATERIALS.map((m) => (
                      <button key={m.value} onClick={() => togglePrimary(m.value)}
                        className={cn('flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-left',
                          selected[0] === m.value ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/30 hover:bg-muted/50')}
                      >
                        <span className="leading-tight">{m.label}</span>
                        {selected[0] === m.value && <Check className="w-3.5 h-3.5 shrink-0 ml-1" />}
                      </button>
                    ))}
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Grout color</p>
                    <div className="flex flex-wrap gap-2">
                      {FLOORING_GROUT.map((g) => (
                        <button key={g} onClick={() => toggleSub(g)}
                          className={cn('px-3 py-1.5 rounded-full border text-xs font-medium transition-all',
                            selectedSub[0] === g ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/40')}
                        >{g}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Walls */}
              {category === 'walls' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {WALL_FINISHES.map((w) => (
                      <button key={w.value} onClick={() => togglePrimary(w.value)}
                        className={cn('flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-left',
                          selected[0] === w.value ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/30 hover:bg-muted/50')}
                      >
                        <span className="leading-tight">{w.label}</span>
                        {selected[0] === w.value && <Check className="w-3.5 h-3.5 shrink-0 ml-1" />}
                      </button>
                    ))}
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Which surfaces?</p>
                    <div className="flex flex-col gap-1.5">
                      {WALL_ZONES.map((z) => (
                        <button key={z.value} onClick={() => setWallZone(z.value)}
                          className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm transition-all text-left',
                            wallZone === z.value ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border hover:border-primary/30')}
                        >
                          {wallZone === z.value && <Check className="w-3.5 h-3.5 shrink-0" />}
                          {z.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Plants */}
              {category === 'plants' && (
                <div className="grid grid-cols-2 gap-2">
                  {PLANT_OPTIONS.map((p) => (
                    <button key={p.value} onClick={() => togglePrimary(p.value)}
                      className={cn('flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-left',
                        selected[0] === p.value ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/30 hover:bg-muted/50')}
                    >
                      <span className="leading-tight">{p.label}</span>
                      {selected[0] === p.value && <Check className="w-3.5 h-3.5 shrink-0 ml-1" />}
                    </button>
                  ))}
                </div>
              )}

              {/* Style */}
              {category === 'style' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {STYLE_PRESETS.map((s) => (
                      <button key={s} onClick={() => togglePrimary(s)}
                        className={cn('flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-left',
                          selected[0] === s ? 'border-primary bg-primary/5 text-primary' : 'border-border hover:border-primary/30 hover:bg-muted/50')}
                      >
                        {s}
                        {selected[0] === s && <Check className="w-3.5 h-3.5 shrink-0 ml-1" />}
                      </button>
                    ))}
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-muted-foreground mb-1.5">Transformation intensity</p>
                    <div className="flex flex-col gap-1.5">
                      {STYLE_INTENSITIES.map((i) => (
                        <button key={i.value} onClick={() => toggleSub(i.value)}
                          className={cn('flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm transition-all text-left',
                            selectedSub[0] === i.value ? 'border-primary bg-primary/5 text-primary font-medium' : 'border-border hover:border-primary/30')}
                        >
                          {selectedSub[0] === i.value && <Check className="w-3.5 h-3.5 shrink-0" />}
                          {i.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Furniture / Custom — text only */}
              {isTextOnly && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {category === 'furniture' ? 'Describe what to add, swap or remove' : 'Describe the change you want'}
                  </label>
                  <textarea
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    rows={4}
                    autoFocus
                    className="w-full text-sm rounded-xl border border-border bg-background px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary leading-relaxed"
                    placeholder={
                      category === 'furniture'
                        ? 'e.g. Replace the sofa with a curved grey sectional. Remove the floor lamp.'
                        : 'e.g. Make it feel more luxurious — gold accents and marble surfaces.'
                    }
                  />
                </div>
              )}

              <Button
                onClick={() => {
                  // For text-only categories, build prompt from custom and advance
                  if (isTextOnly && custom.trim()) {
                    setPrompt(custom.trim());
                  }
                  setStep(3);
                }}
                disabled={!canProceedToStep3}
                className="w-full rounded-full gap-2"
                variant="outline"
              >
                Next — Review & Model
                <ChevronLeft className="w-4 h-4 rotate-180" />
              </Button>
            </>
          )}

          {/* ── Step 3: Prompt preview + model picker + apply ─────────── */}
          {step === 3 && (
            <>
              {/* Prompt preview */}
              <div className="space-y-1.5">
                <label htmlFor="geminieditmodal-edit-instruction-edit-freely-before-appl" className="text-xs font-medium text-muted-foreground">
                  Edit instruction — edit freely before applying
                </label>
                <textarea id="geminieditmodal-edit-instruction-edit-freely-before-appl"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  rows={5}
                  autoFocus
                  className="w-full text-sm rounded-xl border border-border bg-muted/30 px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary leading-relaxed"
                  placeholder="Your edit instruction will appear here…"
                />
                <p className="text-[11px] text-muted-foreground">
                  Auto-generated from your selections. Edit freely.
                </p>
              </div>

              {/* Model picker */}
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Generation model</p>
                <div className="grid grid-cols-3 gap-2">
                  {MODEL_OPTIONS.map(({ id, label, description, credits, icon: Icon, active, bg }) => (
                    <button
                      key={id}
                      onClick={() => setModelTier(id)}
                      className={cn(
                        'flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-all',
                        modelTier === id ? active : `${bg} hover:opacity-80`,
                      )}
                    >
                      <div className="flex items-center gap-1.5 w-full">
                        <Icon className={cn('w-3.5 h-3.5', modelTier === id ? 'text-current' : '')} />
                        <span className="text-xs font-semibold">{label}</span>
                      </div>
                      <span className={cn('text-[10px] leading-snug', modelTier === id ? 'text-current/80' : 'text-muted-foreground')}>
                        {description}
                      </span>
                      <span className={cn('text-[10px] font-medium mt-0.5', modelTier === id ? 'text-current' : 'text-muted-foreground')}>
                        {credits} credits
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleApply}
                disabled={generating || !canApply}
                className="w-full rounded-full gap-2"
              >
                {generating ? (
                  <>Generating…</>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Apply Edit
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
