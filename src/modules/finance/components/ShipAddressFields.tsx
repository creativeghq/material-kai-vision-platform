import React from 'react';

import { Input } from '@/components/core/ui/input';

/** A loading or delivery point as myDATA takes it: four separate fields, all required. */
export type ShipAddress = { street: string; number: string; postal: string; city: string };

export const EMPTY_SHIP_ADDRESS: ShipAddress = { street: '', number: '', postal: '', city: '' };

export const isCompleteShipAddress = (a: ShipAddress): boolean =>
  !!(a.street.trim() && a.postal.trim() && a.city.trim());

export const formatShipAddress = (a: ShipAddress): string =>
  [[a.street, a.number].filter((x) => x.trim()).join(' '), [a.postal, a.city].filter((x) => x.trim()).join(' ')]
    .filter(Boolean).join(', ');

export const ShipAddressFields: React.FC<{ value: ShipAddress; onChange: (a: ShipAddress) => void; idPrefix?: string }> = ({ value, onChange, idPrefix }) => (
  <div className="grid grid-cols-2 gap-2">
    <Input id={idPrefix ? `${idPrefix}-street` : undefined} aria-label="Street" className="h-8 text-xs col-span-2" value={value.street} onChange={(e) => onChange({ ...value, street: e.target.value })} placeholder="Street" />
    <Input aria-label="Number" className="h-8 text-xs" value={value.number} onChange={(e) => onChange({ ...value, number: e.target.value })} placeholder="No." />
    <Input aria-label="Postal Code" className="h-8 text-xs" value={value.postal} onChange={(e) => onChange({ ...value, postal: e.target.value })} placeholder="Postal Code" />
    <Input aria-label="City" className="h-8 text-xs col-span-2" value={value.city} onChange={(e) => onChange({ ...value, city: e.target.value })} placeholder="City" />
  </div>
);
