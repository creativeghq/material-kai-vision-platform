/**
 * A quantity control that can reach zero.
 *
 * Accessories used to be on/off switches, which is why every one of them was stuck at exactly one:
 * you could not ask for three wire baskets. A switch cannot express a count, and the moment it has
 * to, the honest control is a stepper whose zero means "none" — so ONE gesture sets both how many
 * and whether it is in at all, and the two can never disagree.
 */

import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/core/ui/button';

export interface QuantityStepperProps {
  value: number;
  onChange: (next: number) => void;
  /** 0 for things that can be absent, 1 for a row that only exists because you added it. */
  min?: number;
  max?: number;
  disabled?: boolean;
  /** Named for screen readers — "One more stainless waste bin" beats "increment". */
  label: string;
}

export const QuantityStepper: React.FC<QuantityStepperProps> = ({
  value, onChange, min = 0, max, disabled, label,
}) => {
  const clamp = (n: number) => Math.max(min, Math.min(max ?? Number.MAX_SAFE_INTEGER, n));
  return (
    <div className="flex items-center gap-1 shrink-0">
      <Button
        type="button" variant="outline" size="icon" className="h-8 w-8"
        disabled={disabled || value <= min}
        aria-label={`One fewer ${label}`}
        onClick={() => onChange(clamp(value - 1))}
      >
        <Minus className="h-3.5 w-3.5" />
      </Button>
      <span className="w-7 text-center text-sm tabular-nums" aria-label={`${label} quantity`}>{value}</span>
      <Button
        type="button" variant="outline" size="icon" className="h-8 w-8"
        disabled={disabled || (max != null && value >= max)}
        aria-label={`One more ${label}`}
        onClick={() => onChange(clamp(value + 1))}
      >
        <Plus className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
};
