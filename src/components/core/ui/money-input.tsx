import * as React from 'react';
import { Input } from '@/components/core/ui/input';
import { parseDecimal } from '@/utils/decimal';

type MoneyInputProps = Omit<
  React.ComponentProps<typeof Input>,
  'value' | 'onChange' | 'type'
> & {
  /** Current numeric value (canonical, dot-decimal). */
  value: number | null | undefined;
  /** Called with the parsed number (or null when the field is cleared). */
  onValueChange: (value: number | null) => void;
  /** Decimal places to show when the field is NOT focused. `null` shows the raw number. Default 2. */
  displayDecimals?: number | null;
};

/**
 * Locale-tolerant money / amount input for number-backed state.
 *
 * Plain `<Input type="number">` rejects European-format numbers like
 * `2.249,86` (the browser hands back an empty string), and a controlled
 * `value={someNumber}` would also wipe the comma mid-typing. This component
 * keeps a free-text draft while focused so the user can type any common
 * format (`2.249,86`, `2,249.86`, `2249,86`, `12.999`, …) and emits the
 * parsed number via {@link parseDecimal}. When blurred it shows the canonical
 * value formatted to `displayDecimals`.
 *
 * Use this for inputs whose parent stores a `number`. For inputs that already
 * keep the raw typed string in state, just use `<Input type="text" inputMode="decimal">`
 * + `parseDecimal`/`parseDecimalOr` at the compute site instead.
 */
export function MoneyInput({
  value,
  onValueChange,
  displayDecimals = 2,
  onFocus,
  onBlur,
  ...rest
}: MoneyInputProps) {
  const [focused, setFocused] = React.useState(false);
  const [draft, setDraft] = React.useState('');

  const isEmpty = value === null || value === undefined || Number.isNaN(value as number);

  const display = focused
    ? draft
    : isEmpty
      ? ''
      : displayDecimals === null
        ? String(value)
        : (value as number).toFixed(displayDecimals);

  return (
    <Input
      {...rest}
      type="text"
      inputMode="decimal"
      value={display}
      onFocus={(e) => {
        setFocused(true);
        setDraft(isEmpty ? '' : String(value));
        onFocus?.(e);
      }}
      onChange={(e) => {
        setDraft(e.target.value);
        onValueChange(parseDecimal(e.target.value));
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
    />
  );
}
