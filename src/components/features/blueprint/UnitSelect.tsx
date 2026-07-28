import React from 'react';

/**
 * Standard rate bases for a blueprint/plan line — so a work can be priced
 * "per day", "per m²", "per point", etc. without free-typing. Keeps units
 * consistent across blueprints and lets the engine pair the rate with the right
 * dimension formula. Any pre-existing custom unit is preserved as an option.
 */
/**
 * Blueprint pricing units. The VALUES are canonical keys from src/lib/units.ts (so a
 * blueprint line and an order line for the same work agree); the labels stay
 * blueprint-flavoured ("per m²") because that is how an estimator reads them.
 */
export const STANDARD_UNITS: { value: string; label: string }[] = [
  { value: 'm2', label: 'per m² (area)' },
  { value: 'm', label: 'per metre' },
  { value: 'point', label: 'per point' },
  { value: 'pcs', label: 'per piece' },
  { value: 'room', label: 'per room' },
  { value: 'bath', label: 'per bathroom' },
  { value: 'day', label: 'per day' },
  { value: 'hour', label: 'per hour' },
  { value: 'job', label: 'per job (lump)' },
];

export function UnitSelect({
  value, onChange, disabled, className,
}: {
  value: string | null | undefined;
  onChange: (v: string | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const v = value ?? '';
  const known = STANDARD_UNITS.some((u) => u.value === v);
  return (
    <select
      value={v}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value || null)}
      className={`h-8 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-60 ${className ?? ''}`}
    >
      <option value="">unit…</option>
      {STANDARD_UNITS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
      {v && !known && <option value={v}>{v}</option>}
    </select>
  );
}
