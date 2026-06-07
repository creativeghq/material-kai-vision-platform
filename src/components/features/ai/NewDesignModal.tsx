/**
 * NewDesignModal
 *
 * Upfront input collector for a from-scratch 3D interior design (generate_3d /
 * text-to-image). Mirrors the VirtualStagingModal / GeminiEditModal pattern so
 * EVERY generation tool gathers its extra inputs in one modal BEFORE sending —
 * instead of the agent asking clarifying questions in a second chat turn.
 *
 * 3-step flow: Room type → Style → optional details → Compose & Generate.
 * Returns a complete natural-language prompt (room + style + details) so the
 * interior-designer agent has everything it needs and calls generate_3d
 * immediately with no follow-up question.
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
  Sofa, Bed, UtensilsCrossed, Droplets, Monitor, Trees, Baby, Wind,
  ChevronLeft, ChevronRight, Check, Sparkles, Image as ImageIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Constants ─────────────────────────────────────────────────────────────────

const DESIGN_ROOMS = [
  { value: 'living room', label: 'Living Room', icon: Sofa },
  { value: 'bedroom',     label: 'Bedroom',     icon: Bed },
  { value: 'kitchen',     label: 'Kitchen',     icon: UtensilsCrossed },
  { value: 'bathroom',    label: 'Bathroom',    icon: Droplets },
  { value: 'dining room', label: 'Dining Room', icon: UtensilsCrossed },
  { value: 'home office', label: 'Office',      icon: Monitor },
  { value: "kids' room",  label: "Kids' Room",  icon: Baby },
  { value: 'outdoor space', label: 'Outdoor',   icon: Trees },
  { value: 'balcony',     label: 'Balcony',     icon: Wind },
] as const;

const DESIGN_STYLES = [
  'Modern', 'Minimalist', 'Scandinavian', 'Industrial',
  'Mid-Century Modern', 'Contemporary', 'Traditional', 'Rustic',
  'Farmhouse', 'Coastal', 'Modern Organic', 'Bohemian',
  'Art Deco', 'Japandi', 'Mediterranean', 'Luxury',
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

interface NewDesignModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Carried over from the main input box so a first prompt isn't lost. */
  initialDetails?: string;
  /** True when the user already attached a reference image. */
  hasReferenceImage?: boolean;
  /** Receives the fully composed prompt; caller sends it to the agent. */
  onGenerate: (composedPrompt: string) => void;
  generating?: boolean;
}

export const NewDesignModal: React.FC<NewDesignModalProps> = ({
  isOpen,
  onClose,
  initialDetails,
  hasReferenceImage = false,
  onGenerate,
  generating = false,
}) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [selectedRoom, setSelectedRoom] = useState<string>('');
  const [selectedStyle, setSelectedStyle] = useState<string>('');
  const [details, setDetails] = useState<string>('');

  // Reset on each open; seed details from whatever the user already typed.
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedRoom('');
      setSelectedStyle('');
      setDetails(initialDetails?.trim() || '');
    }
  }, [isOpen, initialDetails]);

  const handleStyleSelect = (style: string) => {
    setSelectedStyle(style);
    setStep(3);
  };

  const composePrompt = (): string => {
    const base = `Generate a ${selectedStyle.toLowerCase()} ${selectedRoom} interior design.`;
    const extra = details.trim();
    const refNote = hasReferenceImage
      ? ' Use my uploaded image as the reference room to redesign.'
      : '';
    return extra ? `${base} Include: ${extra}.${refNote}` : `${base}${refNote}`;
  };

  const handleGenerate = () => {
    onGenerate(composePrompt());
    onClose();
  };

  const stepLabel = step === 1
    ? 'Select Room Type'
    : step === 2
      ? 'Choose Style'
      : 'Add Details (optional)';

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
              <DialogTitle className="text-base font-semibold">New Interior Design</DialogTitle>
              <p className="text-xs text-muted-foreground mt-0.5">{stepLabel}</p>
            </div>
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
                {DESIGN_ROOMS.map(({ value, label, icon: Icon }) => (
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
                onClick={() => selectedRoom && setStep(2)}
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
            <div className="grid grid-cols-2 gap-2">
              {DESIGN_STYLES.map((style) => (
                <button
                  key={style}
                  onClick={() => handleStyleSelect(style)}
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
          )}

          {/* Step 3: Optional details + Generate */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="px-2 py-1 bg-primary/10 text-primary rounded-full font-medium capitalize">{selectedRoom}</span>
                <span className="px-2 py-1 bg-primary/10 text-primary rounded-full font-medium">{selectedStyle}</span>
              </div>
              {hasReferenceImage && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                  <ImageIcon className="w-3.5 h-3.5 flex-shrink-0" />
                  Your uploaded image will be used as the reference room.
                </div>
              )}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Materials, colors, mood, must-haves — optional
                </label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={4}
                  className="w-full text-sm rounded-xl border border-border bg-background px-3 py-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary leading-relaxed"
                  placeholder="e.g. oak flooring, white walls, warm lighting, a large sectional sofa, indoor plants…"
                />
                <p className="text-[11px] text-muted-foreground">
                  Leave blank to let the AI choose. Anything you add here is built into the design prompt.
                </p>
              </div>
              <Button
                onClick={handleGenerate}
                disabled={generating}
                className="w-full rounded-full gap-2"
              >
                {generating ? (
                  <>Generating…</>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Design
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
