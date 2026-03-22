/**
 * GeminiEditModal
 *
 * Structured 2-step modal for Gemini targeted image edits.
 * Step 1 — pick edit category (Colors, Lighting, Flooring, Walls, Plants, Style, Furniture, Custom)
 * Step 2 — configure category-specific options → auto-generates an editable prompt
 *
 * On confirm, calls onGenerate({ prompt }) which triggers mode=image-edit in generation-tools.
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
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Categories ─────────────────────────────────────────────────────────────────

const EDIT_CATEGORIES = [
  { id: 'colors',    label: 'Colors',          icon: Palette,    description: 'Wall & accent palette' },
  { id: 'lighting',  label: 'Lighting',         icon: Sun,        description: 'Mood, warmth & time of day' },
  { id: 'flooring',  label: 'Flooring',         icon: Layers,     description: 'Material & finish' },
  { id: 'walls',     label: 'Walls',            icon: Square,     description: 'Surface, texture & finish' },
  { id: 'plants',    label: 'Plants & Decor',   icon: TreePine,   description: 'Greenery & decorative items' },
  { id: 'style',     label: 'Overall Style',    icon: Sparkles,   description: 'Retheme the whole design' },
  { id: 'furniture', label: 'Furniture',        icon: Sofa,       description: 'Add, swap or remove pieces' },
  { id: 'custom',    label: 'Custom Edit',      icon: PencilLine, description: 'Describe anything freely' },
] as const;

type EditCategoryId = typeof EDIT_CATEGORIES[number]['id'];

// ── Per-category options ────────────────────────────────────────────────────────

const COLORS = [
  { label: 'Warm White',   value: 'warm white',            swatch: '#F5F0E8' },
  { label: 'Cool White',   value: 'cool white',            swatch: '#F0F4F8' },
  { label: 'Light Grey',   value: 'light grey',            swatch: '#C8CDD4' },
  { label: 'Sage Green',   value: 'sage green',            swatch: '#9CAD8E' },
  { label: 'Dusty Pink',   value: 'dusty rose',            swatch: '#D4A5A5' },
  { label: 'Terracotta',   value: 'terracotta',            swatch: '#C07A55' },
  { label: 'Deep Teal',    value: 'deep teal',             swatch: '#2A6B6A' },
  { label: 'Navy',         value: 'navy blue',             swatch: '#1E3456' },
  { label: 'Charcoal',     value: 'charcoal',              swatch: '#3A3A3A' },
  { label: 'Off-Black',    value: 'near-black / off-black',swatch: '#1A1A1A' },
  { label: 'Sand',         value: 'warm sand / beige',     swatch: '#D6C5A0' },
  { label: 'Limewash',     value: 'limewash white',        swatch: '#EAE5D8' },
];

const LIGHTING_PRESETS = [
  { label: 'Golden Hour',    value: 'golden hour — warm amber sunlight streaming in at a low angle, long soft shadows, cosy atmosphere' },
  { label: 'Bright Midday',  value: 'bright midday daylight — crisp, even natural light, no harsh shadows' },
  { label: 'Soft Overcast',  value: 'soft overcast daylight — diffused natural light, no direct sun, calm serene mood' },
  { label: 'Warm Evening',   value: 'warm evening ambiance — soft warm artificial lighting, cosy glow, no daylight' },
  { label: 'Candlelight',    value: 'candlelight / intimate evening — low warm candlelight, flickering glow, dramatic shadows' },
  { label: 'Cool Daylight',  value: 'cool bright daylight — clean, clinical, minimal shadows, modern feel' },
  { label: 'Night',          value: 'night time interior — dark outside, warm interior lights fully on, atmospheric' },
  { label: 'Dramatic Spot',  value: 'dramatic spotlight / accent lighting — targeted beams highlighting key surfaces' },
];

const FLOORING_MATERIALS = [
  { label: 'Polished Marble',  value: 'polished white marble with subtle grey veining' },
  { label: 'Matte Marble',     value: 'honed / matte marble in warm beige tones' },
  { label: 'Light Oak',        value: 'light oak wide-plank engineered wood floor, satin finish' },
  { label: 'Dark Walnut',      value: 'dark walnut wide-plank hardwood, matte finish' },
  { label: 'Herringbone Oak',  value: 'chevron/herringbone oak parquet, natural finish' },
  { label: 'Concrete',         value: 'polished concrete, medium grey, subtle aggregate texture' },
  { label: 'Terrazzo',         value: 'terrazzo — white base with coloured stone chips, polished' },
  { label: 'Large-Format Tile',value: 'large-format 120×120cm porcelain tile, light grey' },
  { label: 'Travertine',       value: 'travertine stone tiles, filled and honed, warm ivory tone' },
  { label: 'Dark Stone',       value: 'dark basalt / black slate natural stone, matte' },
  { label: 'Plush Carpet',     value: 'wall-to-wall plush carpet in warm light grey' },
  { label: 'Zellige Tile',     value: 'handmade Zellige terracotta / cream ceramic tiles' },
];

const WALL_FINISHES = [
  { label: 'Smooth Paint',       value: 'smooth matte painted walls' },
  { label: 'Limewash',           value: 'limewash painted walls with natural texture and depth' },
  { label: 'Microcement',        value: 'microcement wall finish, seamless, industrial-organic' },
  { label: 'Venetian Plaster',   value: 'Venetian plaster — polished, multi-layer, marble-like sheen' },
  { label: 'Fluted Panels',      value: 'vertical fluted/reeded wood panels, warm oak' },
  { label: 'Wall Paneling',      value: 'classic wall paneling / wainscoting, painted white' },
  { label: 'Exposed Brick',      value: 'exposed brick wall — raw, whitewashed or original' },
  { label: 'Large Stone Cladding',value:'large natural stone cladding panels, travertine' },
  { label: 'Geometric Tile',     value: 'decorative geometric tile pattern, feature wall' },
  { label: 'Wallpaper',          value: 'luxury textured wallpaper — botanical / abstract / linen' },
  { label: 'Shiplap',            value: 'horizontal shiplap wooden cladding, whitewashed' },
];

const PLANT_OPTIONS = [
  { label: 'Fiddle Leaf Fig',  value: 'tall fiddle leaf fig tree in a ceramic pot' },
  { label: 'Monstera',         value: 'large monstera deliciosa plant in a woven rattan basket' },
  { label: 'Olive Tree',       value: 'sculptural olive tree in a terracotta pot' },
  { label: 'Bonsai',           value: 'curated bonsai tree on a side table' },
  { label: 'Snake Plant',      value: 'tall snake plant (sansevieria) in a textured planter' },
  { label: 'Hanging Plants',   value: 'hanging trailing plants (pothos or string of pearls) near windows' },
  { label: 'Mixed Tropical',   value: 'mixed tropical plant arrangement — multiple varieties, abundant greenery' },
  { label: 'Dried Botanicals', value: 'dried pampas grass and botanicals in tall vases' },
  { label: 'Remove Plants',    value: 'remove all plants and replace with clean minimal decor' },
  { label: 'More Greenery',    value: 'significantly more greenery throughout — plants everywhere, biophilic design' },
];

const STYLE_PRESETS = [
  'Modern', 'Scandinavian', 'Japandi', 'Mid-Century Modern',
  'Coastal', 'Urban Industrial', 'Rustic Farmhouse', 'Transitional Luxury',
  'Modern Organic', 'Maximalist', 'Minimalist', 'Art Deco',
  'Mediterranean', 'Wabi-Sabi', 'Hamptons', 'Contemporary',
];

// ── Prompt builders ─────────────────────────────────────────────────────────────

function buildPrompt(category: EditCategoryId, selected: string[], custom: string): string {
  const keep = 'Keep all furniture positions, fixtures, walls, windows, doors, and architecture exactly where they are. Only modify the specified element. Photorealistic result.';

  switch (category) {
    case 'colors': {
      const color = selected[0] || custom;
      return `Change the wall color to ${color}. Apply the new color to all visible wall surfaces consistently. ${keep}`;
    }
    case 'lighting': {
      const lighting = selected[0] || custom;
      return `Change the lighting atmosphere to: ${lighting}. Adjust the light quality, shadows, and mood accordingly. ${keep}`;
    }
    case 'flooring': {
      const floor = selected[0] || custom;
      return `Replace the floor material with: ${floor}. Apply it consistently across the entire floor area. ${keep}`;
    }
    case 'walls': {
      const wall = selected[0] || custom;
      return `Replace the wall surface finish with: ${wall}. Apply it consistently to all visible wall surfaces. ${keep}`;
    }
    case 'plants': {
      const plants = selected[0] || custom;
      return `Update the plants and decorative greenery: ${plants}. Integrate them naturally into the existing layout. ${keep}`;
    }
    case 'style': {
      const style = selected[0] || custom;
      return `Restyle this room in a ${style} design. Update all surfaces, materials, colors, and lighting to match the style — floors, walls, ceiling, fixtures, and decor. Keep the room's spatial layout and fixed architecture intact.`;
    }
    case 'furniture': {
      return custom || `Update the furniture in this room. Keep the room proportions and architecture the same.`;
    }
    case 'custom':
    default:
      return custom;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export interface GeminiEditParams {
  prompt: string;
}

interface GeminiEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGenerate: (params: GeminiEditParams) => void;
  generating?: boolean;
}

export const GeminiEditModal: React.FC<GeminiEditModalProps> = ({
  isOpen,
  onClose,
  onGenerate,
  generating = false,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [category, setCategory] = useState<EditCategoryId | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [prompt, setPrompt] = useState('');

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setCategory(null);
      setSelected([]);
      setCustom('');
      setPrompt('');
    }
  }, [isOpen]);

  // Auto-rebuild prompt when options change
  useEffect(() => {
    if (category && (selected.length > 0 || custom)) {
      setPrompt(buildPrompt(category, selected, custom));
    }
  }, [category, selected, custom]);

  const handleCategorySelect = (id: EditCategoryId) => {
    setCategory(id);
    setSelected([]);
    setCustom('');
    setPrompt('');
    setStep(2);
  };

  const toggleOption = (value: string) => {
    setSelected([value]); // single-select for now (cleaner prompts)
  };

  const handleGenerate = () => {
    const finalPrompt = prompt.trim() || buildPrompt(category!, selected, custom);
    if (!finalPrompt) return;
    onGenerate({ prompt: finalPrompt });
    onClose();
  };

  const canGenerate = prompt.trim().length > 0 || (selected.length > 0) || (category === 'custom' && custom.trim().length > 0);

  const categoryMeta = EDIT_CATEGORIES.find(c => c.id === category);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            {step === 2 && (
              <button
                onClick={() => setStep(1)}
                className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div className="flex-1">
              <DialogTitle className="text-base font-semibold">
                {step === 1 ? 'Edit Image' : categoryMeta?.label ?? 'Edit Image'}
              </DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {step === 1
                  ? 'What would you like to change?'
                  : categoryMeta?.description ?? 'Configure your edit'}
              </p>
            </div>
            {/* Step dots */}
            <div className="flex items-center gap-1.5">
              {[1, 2].map((s) => (
                <div
                  key={s}
                  className={cn(
                    'w-2 h-2 rounded-full transition-colors',
                    s === step ? 'bg-primary' : s < step ? 'bg-primary/40' : 'bg-muted',
                  )}
                />
              ))}
            </div>
          </div>
        </DialogHeader>

        <div className="p-6 max-h-[70vh] overflow-y-auto">
          {/* ── Step 1: Category picker ─────────────────────────────── */}
          {step === 1 && (
            <div className="grid grid-cols-2 gap-2">
              {EDIT_CATEGORIES.map(({ id, label, icon: Icon, description }) => (
                <button
                  key={id}
                  onClick={() => handleCategorySelect(id)}
                  className="flex items-start gap-3 p-3.5 rounded-xl border-2 border-border hover:border-primary/40 hover:bg-muted/50 text-left transition-all group"
                >
                  <div className="p-1.5 rounded-lg bg-primary/5 group-hover:bg-primary/10 transition-colors mt-0.5">
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

          {/* ── Step 2: Options + prompt ────────────────────────────── */}
          {step === 2 && category && (
            <div className="space-y-5">
              {/* Color swatches */}
              {category === 'colors' && (
                <div className="grid grid-cols-4 gap-2">
                  {COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => toggleOption(c.value)}
                      className={cn(
                        'flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition-all',
                        selected[0] === c.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:border-primary/30',
                      )}
                    >
                      <div
                        className="w-8 h-8 rounded-full border border-gray-200 shadow-sm relative"
                        style={{ background: c.swatch }}
                      >
                        {selected[0] === c.value && (
                          <Check className="w-3.5 h-3.5 text-primary absolute inset-0 m-auto drop-shadow" />
                        )}
                      </div>
                      <span className="text-[10px] font-medium text-center leading-tight">{c.label}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Lighting presets */}
              {category === 'lighting' && (
                <div className="grid grid-cols-2 gap-2">
                  {LIGHTING_PRESETS.map((l) => (
                    <button
                      key={l.value}
                      onClick={() => toggleOption(l.value)}
                      className={cn(
                        'flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-left',
                        selected[0] === l.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-primary/30 hover:bg-muted/50',
                      )}
                    >
                      {l.label}
                      {selected[0] === l.value && <Check className="w-3.5 h-3.5 flex-shrink-0 ml-1" />}
                    </button>
                  ))}
                </div>
              )}

              {/* Flooring */}
              {category === 'flooring' && (
                <div className="grid grid-cols-2 gap-2">
                  {FLOORING_MATERIALS.map((m) => (
                    <button
                      key={m.value}
                      onClick={() => toggleOption(m.value)}
                      className={cn(
                        'flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-left',
                        selected[0] === m.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-primary/30 hover:bg-muted/50',
                      )}
                    >
                      {m.label}
                      {selected[0] === m.value && <Check className="w-3.5 h-3.5 flex-shrink-0 ml-1" />}
                    </button>
                  ))}
                </div>
              )}

              {/* Walls */}
              {category === 'walls' && (
                <div className="grid grid-cols-2 gap-2">
                  {WALL_FINISHES.map((w) => (
                    <button
                      key={w.value}
                      onClick={() => toggleOption(w.value)}
                      className={cn(
                        'flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-left',
                        selected[0] === w.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-primary/30 hover:bg-muted/50',
                      )}
                    >
                      {w.label}
                      {selected[0] === w.value && <Check className="w-3.5 h-3.5 flex-shrink-0 ml-1" />}
                    </button>
                  ))}
                </div>
              )}

              {/* Plants */}
              {category === 'plants' && (
                <div className="grid grid-cols-2 gap-2">
                  {PLANT_OPTIONS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => toggleOption(p.value)}
                      className={cn(
                        'flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-left',
                        selected[0] === p.value
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-primary/30 hover:bg-muted/50',
                      )}
                    >
                      {p.label}
                      {selected[0] === p.value && <Check className="w-3.5 h-3.5 flex-shrink-0 ml-1" />}
                    </button>
                  ))}
                </div>
              )}

              {/* Style */}
              {category === 'style' && (
                <div className="grid grid-cols-2 gap-2">
                  {STYLE_PRESETS.map((s) => (
                    <button
                      key={s}
                      onClick={() => toggleOption(s)}
                      className={cn(
                        'flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-left',
                        selected[0] === s
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-primary/30 hover:bg-muted/50',
                      )}
                    >
                      {s}
                      {selected[0] === s && <Check className="w-3.5 h-3.5 flex-shrink-0 ml-1" />}
                    </button>
                  ))}
                </div>
              )}

              {/* Furniture / Custom — text only */}
              {(category === 'furniture' || category === 'custom') && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    {category === 'furniture'
                      ? 'Describe what to add, swap or remove'
                      : 'Describe the change you want'}
                  </label>
                  <textarea
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    rows={3}
                    autoFocus
                    className="w-full text-sm rounded-xl border border-border bg-background px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary leading-relaxed"
                    placeholder={
                      category === 'furniture'
                        ? 'e.g. Replace the sofa with a grey curved sectional. Remove the floor lamp on the left.'
                        : 'e.g. Make the room feel more luxurious with gold accents and marble surfaces.'
                    }
                  />
                </div>
              )}

              {/* Prompt preview (for option-based categories) */}
              {category !== 'furniture' && category !== 'custom' && (
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Generated prompt — edit to customise
                  </label>
                  <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    rows={4}
                    className="w-full text-sm rounded-xl border border-border bg-background px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary leading-relaxed text-muted-foreground"
                    placeholder={selected.length === 0 ? 'Select an option above to generate a prompt…' : ''}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Auto-generated from your selection. Edit freely before generating.
                  </p>
                </div>
              )}

              <Button
                onClick={handleGenerate}
                disabled={generating || !canGenerate}
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
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
