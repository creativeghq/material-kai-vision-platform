import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CATEGORY_COLORS } from './categoryColors';

interface Props {
  value: string;
  onChange: (hex: string) => void;
  className?: string;
}

export const CategoryColorPicker: React.FC<Props> = ({ value, onChange, className }) => {
  const isCustom = !CATEGORY_COLORS.includes(value.toLowerCase());
  return (
    <div className={cn('flex flex-wrap items-center gap-1.5', className)} role="radiogroup" aria-label="Colour">
      {CATEGORY_COLORS.map((hex) => {
        const selected = value.toLowerCase() === hex;
        return (
          <button
            key={hex}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={hex}
            onClick={() => onChange(hex)}
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition',
              selected ? 'ring-2 ring-foreground' : 'hover:scale-110',
            )}
            style={{ backgroundColor: hex }}
          >
            {selected && <Check className="h-3.5 w-3.5 text-white" />}
          </button>
        );
      })}
      <label
        className={cn(
          'relative flex h-6 w-6 cursor-pointer items-center justify-center overflow-hidden rounded-full border border-dashed border-muted-foreground/60 ring-offset-2 ring-offset-background',
          isCustom && 'ring-2 ring-foreground',
        )}
        title="Custom colour"
        style={isCustom ? { backgroundColor: value } : undefined}
      >
        {!isCustom && <span className="text-xs text-muted-foreground">+</span>}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="Custom colour"
        />
      </label>
    </div>
  );
};
