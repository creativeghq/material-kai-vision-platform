/**
 * "Which building is this at?" — for a record whose only real-estate link is `property_id`.
 *
 * Sibling of `ProjectLinkField`, and an ADAPTER for the same reason: the search, the workspace
 * scoping and the legality rules stay in `search_order_link_targets`, and what lives here is the
 * property-only configuration plus the label, in one place so every surface that asks the question
 * gets the same answer.
 *
 * The label comes from `propertyLabel` — the platform’s single answer to what a building is called
 * — so the field cannot read `Untitled property` right after the operator picked one by name.
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { OrderLinkPicker } from '@/modules/finance/components/OrderLinkPicker';
import { propertyLabel, type OrderLinkTarget } from '@/modules/finance/services/ordersService';

export const PropertyLinkField: React.FC<{
  workspaceId: string;
  /** The stored value. `null` renders as unassigned. */
  propertyId: string | null;
  /** Called with the new property id, or `null` when the operator clears it. */
  onChange: (propertyId: string | null) => void | Promise<void>;
  disabled?: boolean;
  compact?: boolean;
  label?: string;
  hint?: React.ReactNode;
}> = ({ workspaceId, propertyId, onChange, disabled, compact, label = 'Property', hint }) => {
  const [value, setValue] = useState<OrderLinkTarget>({ kind: 'none' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!propertyId) { setValue({ kind: 'none' }); return; }
      const { data } = await supabase.from('properties')
        .select('id, title, address, reference_code').eq('id', propertyId).maybeSingle();
      if (cancelled) return;
      setValue({
        kind: 'property',
        propertyId,
        label: propertyLabel({
          title: (data?.title as string | null) ?? null,
          address: (data?.address as string | null) ?? null,
          reference_code: (data?.reference_code as string | null) ?? null,
        }),
      });
    })();
    return () => { cancelled = true; };
  }, [propertyId]);

  return (
    <OrderLinkPicker
      workspaceId={workspaceId}
      value={value}
      onChange={(v) => {
        // Property or nothing — every other group is off below, so these are the only two this
        // control can emit. Narrowed explicitly rather than cast, so turning a group back on
        // without handling it is a type error rather than a row that silently does nothing.
        if (v.kind === 'property') { setValue(v); void onChange(v.propertyId); return; }
        if (v.kind === 'none') { setValue(v); void onChange(null); }
      }}
      allowProperty
      allowProject={false}
      allowCustomer={false}
      allowMerge={false}
      allowRaiseCustomerOrder={false}
      compact={compact}
      disabled={disabled}
      label={label}
      hint={hint}
    />
  );
};
