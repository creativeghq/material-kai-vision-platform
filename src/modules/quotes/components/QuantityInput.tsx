import React, { useEffect, useState } from 'react';
import { Input } from '@/components/core/ui/input';
import { parseDecimal } from '@/utils/decimal';

export function parseQuantity(raw: string): number | null {
  const n = parseDecimal(raw);
  return n !== null && n > 0 ? n : null;
}

interface QuantityInputProps extends Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> {
  value: number;
  onCommit: (quantity: number) => void;
}

export const QuantityInput: React.FC<QuantityInputProps> = ({ value, onCommit, onBlur, onKeyDown, ...rest }) => {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(String(value)); }, [value]);

  const commit = () => {
    const n = parseQuantity(draft);
    if (n === null) { setDraft(String(value)); return; }
    if (n !== value) onCommit(n);
  };

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => { commit(); onBlur?.(e); }}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); onKeyDown?.(e); }}
    />
  );
};
