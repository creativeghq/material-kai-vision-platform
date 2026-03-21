/**
 * VirtualStagingModal
 *
 * 3-step flow: Room picker → Style picker → Furniture items (editable) → Accept & Generate
 *
 * Used from:
 *  - ProgressiveImageGrid (AI-generated images) — "direct" mode
 *  - User message uploaded images — "direct" mode
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Sofa, Bed, UtensilsCrossed, Droplets, Monitor, Wind, Trees, Waves, ChevronLeft, ChevronRight, Check, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Constants ─────────────────────────────────────────────────────────────────

export const STAGING_ROOMS = [
  { value: 'Living Room',  label: 'Living Room',  icon: Sofa },
  { value: 'Bedroom',      label: 'Bedroom',      icon: Bed },
  { value: 'Dining Room',  label: 'Dining Room',  icon: UtensilsCrossed },
  { value: 'Kitchen',      label: 'Kitchen',      icon: UtensilsCrossed },
  { value: 'Bathroom',     label: 'Bathroom',     icon: Droplets },
  { value: 'Office',       label: 'Office',       icon: Monitor },
  { value: 'Balcony',      label: 'Balcony',      icon: Wind },
  { value: 'Garden',       label: 'Garden',       icon: Trees },
  { value: 'Swimming Pool',label: 'Pool',         icon: Waves },
] as const;

export const STAGING_STYLES = [
  'Modern', 'Scandinavian', 'Transitional', 'Rustic',
  'Mid-Century Modern', 'Urban Industrial', 'Farmhouse', 'Coastal',
  'Traditional', 'Modern Organic', 'Scandinavian Oasis', 'Transitional Luxury',
  'B&W Modern', 'Farmhouse Hacienda', 'Metro Industrial', 'NYC Modern',
] as const;

// Style → suggested furniture_items
const STYLE_FURNITURE: Record<string, string> = {
  'Modern':               'low-profile sofa in light grey, walnut coffee table, abstract wall art, geometric rug, warm accent floor lamp',
  'Scandinavian':         'linen sofa in warm white, birch wood side tables, chunky knit throw, potted fiddle leaf fig, ceramic vases, soft pendant light',
  'Transitional':         'upholstered sofa in boucle, warm walnut case goods, layered neutral rugs, brass floor lamp, linen curtains',
  'Rustic':               'reclaimed wood furniture, distressed leather armchair, natural stone accents, woven baskets, warm Edison bulb pendants',
  'Mid-Century Modern':   'tapered-leg walnut sofa, Eames-style lounge chair, arc floor lamp, bold teal or mustard accent cushions, teak sideboard',
  'Urban Industrial':     'steel-frame sofa in aged leather, raw concrete side table, factory-style pendant lights, metal shelving, charcoal area rug',
  'Farmhouse':            'shaker-style furniture in cream or sage, butcher-block surfaces, wicker accents, ceramic pitchers, plaid wool throw',
  'Coastal':              'white-washed wood furniture, natural rattan armchair, linen in sand and ocean blue, driftwood decor, woven jute rug',
  'Traditional':          'tufted sofa in deep jewel tones, mahogany side tables, Persian rug, brass table lamps, ornate framed art',
  'Modern Organic':       'sculptural bouclé sofa, travertine coffee table, dried pampas grass, terracotta pots, limewash wall texture',
  'Scandinavian Oasis':   'light oak furniture, moss wall panel, hanging planters, rattan pendant, abundant indoor plants, warm white palette',
  'Transitional Luxury':  'bespoke velvet sofa in champagne, gold accent tables, statement sculptural lamp, large format art, layered silk cushions',
  'B&W Modern':           'matte black steel sofa frame in white boucle, marble coffee table with black veining, monochrome art, polished chrome accents',
  'Farmhouse Hacienda':   'terracotta tile accents, whitewashed adobe-style sideboard, wrought iron fixtures, bold geometric textile, olive branch decor',
  'Metro Industrial':     'dark leather sofa on iron hairpin legs, factory window mirror, aged oak shelving, Edison pendant cluster, charcoal rug',
  'NYC Modern':           'designer sectional in stone grey, lacquered side table, statement chandelier, large abstract artwork, high-gloss marble tray',
};

const getFurnitureItems = (room: string, style: string): string => {
  const base = STYLE_FURNITURE[style] || 'furniture appropriate to the style and room';
  return base;
};

// ── Component ─────────────────────────────────────────────────────────────────

export interface VirtualStagingParams {
  room: string;
  style: string;
  furnitureItems: string;
}

interface VirtualStagingModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultRoom?: string;
  onGenerate: (params: VirtualStagingParams) => void;
  generating?: boolean;
}

export const VirtualStagingModal: React.FC<VirtualStagingModalProps> = ({
  isOpen,
  onClose,
  defaultRoom,
  onGenerate,
  generating = false,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedRoom, setSelectedRoom] = useState<string>(defaultRoom || '');
  const [selectedStyle, setSelectedStyle] = useState<string>('');
  const [furnitureItems, setFurnitureItems] = useState<string>('');

  // Reset when reopened
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedRoom(defaultRoom || '');
      setSelectedStyle('');
      setFurnitureItems('');
    }
  }, [isOpen, defaultRoom]);

  const handleRoomNext = () => {
    if (!selectedRoom) return;
    setStep(2);
  };

  const handleStyleNext = (style: string) => {
    setSelectedStyle(style);
    setFurnitureItems(getFurnitureItems(selectedRoom, style));
    setStep(3);
  };

  const handleGenerate = () => {
    onGenerate({ room: selectedRoom, style: selectedStyle, furnitureItems });
    onClose();
  };

  const stepLabel = step === 1 ? 'Select Room Type' : step === 2 ? 'Choose Style' : 'Review & Edit Prompt';

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg w-full p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            {step > 1 && (
              <button
                onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
                className="p-1 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <div className="flex-1">
              <DialogTitle className="text-base font-semibold">Virtual Staging</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{stepLabel}</p>
            </div>
            {/* Step indicators */}
            <div className="flex items-center gap-1.5">
              {[1, 2, 3].map((s) => (
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

        <div className="p-6">
          {/* Step 1: Room picker */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-2">
                {STAGING_ROOMS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setSelectedRoom(value)}
                    className={cn(
                      'flex flex-col items-center gap-2 p-3 rounded-xl border-2 transition-all text-sm font-medium',
                      selectedRoom === value
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:border-primary/40 hover:bg-muted/50 text-muted-foreground',
                    )}
                  >
                    <Icon className="w-5 h-5" />
                    {label}
                  </button>
                ))}
              </div>
              <Button
                onClick={handleRoomNext}
                disabled={!selectedRoom}
                className="w-full rounded-full"
              >
                Next — Choose Style
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}

          {/* Step 2: Style picker */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {STAGING_STYLES.map((style) => (
                  <button
                    key={style}
                    onClick={() => handleStyleNext(style)}
                    className={cn(
                      'flex items-center justify-between px-3 py-2.5 rounded-xl border-2 text-sm font-medium transition-all text-left',
                      selectedStyle === style
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border hover:border-primary/40 hover:bg-muted/50',
                    )}
                  >
                    {style}
                    {selectedStyle === style && <Check className="w-3.5 h-3.5 flex-shrink-0 ml-1" />}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Editable furniture items + Accept */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-1 bg-primary/10 text-primary rounded-full font-medium">{selectedRoom}</span>
                <span className="px-2 py-1 bg-primary/10 text-primary rounded-full font-medium">{selectedStyle}</span>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Furniture &amp; items to include — edit to customise
                </label>
                <textarea
                  value={furnitureItems}
                  onChange={(e) => setFurnitureItems(e.target.value)}
                  rows={4}
                  className="w-full text-sm rounded-xl border border-border bg-background px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary leading-relaxed"
                  placeholder="Describe the furniture and decor items to include…"
                />
                <p className="text-[11px] text-muted-foreground">
                  This is sent as the furniture specification to the AI model. Add or remove items as needed.
                </p>
              </div>
              <Button
                onClick={handleGenerate}
                disabled={generating || !furnitureItems.trim()}
                className="w-full rounded-full gap-2"
              >
                {generating ? (
                  <>Generating…</>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Accept &amp; Generate
                    <span className="text-primary-foreground/60 text-xs ml-1">20 credits</span>
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
