/**
 * "Which job is this for?" — for a document whose only link column is `project_id`.
 *
 * An invoice and a quote each carry exactly one free link: the job. They have no
 * `covers_order_id`, no `trip_report_id`, no `property_id`, so the full "what is this for?"
 * control would offer rows that cannot be stored — and a row that silently does nothing is the
 * failure this codebase keeps paying for. This narrows `OrderLinkPicker` to the one group those
 * documents can answer with.
 *
 * It is an ADAPTER, not a second picker. The search, the workspace scoping and the legality rules
 * are still `search_order_link_targets`; what lives here is the project-only configuration and the
 * label resolution, in one place so the invoice and the quote cannot drift apart — which is how
 * "the same field behaves differently over here" starts.
 *
 * The label is resolved rather than stored: a denormalized copy is one more thing to keep in step
 * with a rename.
 */
import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { OrderLinkPicker } from '@/modules/finance/components/OrderLinkPicker';
import type { OrderLinkTarget } from '@/modules/finance/services/ordersService';

export const ProjectLinkField: React.FC<{
  workspaceId: string;
  /** The stored value. `null` renders as unassigned. */
  projectId: string | null;
  /** Called with the new project id, or `null` when the operator clears it. */
  onChange: (projectId: string | null) => void | Promise<void>;
  disabled?: boolean;
  /** Inline mode — sits in a header row rather than as a stacked form field. */
  compact?: boolean;
  label?: string;
  hint?: React.ReactNode;
}> = ({ workspaceId, projectId, onChange, disabled, compact, label = 'Project', hint }) => {
  const [value, setValue] = useState<OrderLinkTarget>({ kind: 'none' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!projectId) { setValue({ kind: 'none' }); return; }
      const { data } = await supabase.from('projects').select('id, name').eq('id', projectId).maybeSingle();
      if (cancelled) return;
      setValue({ kind: 'project', projectId, label: (data?.name as string | null) ?? 'Project' });
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  return (
    <OrderLinkPicker
      workspaceId={workspaceId}
      value={value}
      onChange={(v) => {
        // Project or nothing — every other group is off above, so these are the only two the
        // control can emit. Narrowed explicitly rather than casting, so turning a group back on
        // without handling it is a type error rather than a row that does nothing.
        if (v.kind === 'project') { setValue(v); void onChange(v.projectId); return; }
        if (v.kind === 'none') { setValue(v); void onChange(null); }
      }}
      allowProject
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
