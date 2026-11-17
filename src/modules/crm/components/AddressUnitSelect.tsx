import React, { useEffect, useState } from 'react';

import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { addressUnitsAPI, formatAddressLine, type AddressUnit } from '@/services/crm.service';

const MAIN = '__main__';

interface Props {
  /** Exactly one of companyId / contactId identifies the selected party. */
  companyId?: string | null;
  contactId?: string | null;
  /** Selected sub-unit id, or null for the party's main address. */
  value: string | null;
  onChange: (unitId: string | null, unit: AddressUnit | null) => void;
  label?: string;
  /** One-line summary of the main address, shown next to the "Main address" option. */
  mainAddressLine?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Dropdown to pick which address of a CRM party a document is addressed to: the party's
 * main address, or one of its sub-units. Renders nothing extra when the party has no
 * sub-units (it still shows, so the choice is explicit, but only the main option appears).
 * Auto-selects a party's default sub-unit when the picker first loads with no value set.
 */
export const AddressUnitSelect: React.FC<Props> = ({
  companyId, contactId, value, onChange, label = 'Address', mainAddressLine, className, disabled,
}) => {
  const [units, setUnits] = useState<AddressUnit[]>([]);
  const hasParty = !!companyId || !!contactId;

  useEffect(() => {
    let cancelled = false;
    if (!hasParty) { setUnits([]); return; }
    (async () => {
      try {
        const list = await addressUnitsAPI.list(
          companyId ? { companyId } : { contactId: contactId! },
        );
        if (cancelled) return;
        setUnits(list);
        // First load with no explicit choice → adopt the party's default unit if one exists.
        if (!value) {
          const def = list.find((u) => u.is_default);
          if (def) onChange(def.id, def);
        }
      } catch (e) {
        if (!cancelled) setUnits([]);
        console.error('Failed to load address units', e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, contactId]);

  // Don't render the picker when there's nothing to choose between.
  if (!hasParty || units.length === 0) return null;

  return (
    <div className={className}>
      <Label className="mb-1 block">{label}</Label>
      <Select
        value={value ?? MAIN}
        disabled={disabled}
        onValueChange={(v) => {
          if (v === MAIN) { onChange(null, null); return; }
          onChange(v, units.find((u) => u.id === v) ?? null);
        }}
      >
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={MAIN}>
            Main address{mainAddressLine ? ` — ${mainAddressLine}` : ''}
          </SelectItem>
          {units.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.label}
              {u.branch_number != null ? ` (Branch #${u.branch_number})` : ''}
              {formatAddressLine(u) ? ` — ${formatAddressLine(u)}` : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};

export default AddressUnitSelect;
