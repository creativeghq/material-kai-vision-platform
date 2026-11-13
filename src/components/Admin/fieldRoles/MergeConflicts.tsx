import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface MergeConflict {
  id: string;
  product_id: string;
  product_name: string | null;
  loser_field: string;
  survivor_field: string;
  loser_value: unknown;
  survivor_value: unknown;
}

const show = (v: unknown): string => {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && !Array.isArray(v) && 'value' in (v as Record<string, unknown>)) {
    return show((v as Record<string, unknown>).value);
  }
  if (Array.isArray(v)) return v.map(show).join(', ');
  return JSON.stringify(v);
};

interface Props {
  conflicts: readonly MergeConflict[];
  onResolved: () => void;
  onShowFields: () => void;
}

/** Products where a merged field and its survivor held two different values. */
export const MergeConflicts: React.FC<Props> = ({ conflicts, onResolved, onShowFields }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const resolve = async (c: MergeConflict, keep: 'survivor' | 'loser') => {
    setBusy(c.id);
    const { data, error } = await supabase.rpc('resolve_field_merge_conflict', { p_id: c.id, p_keep: keep });
    setBusy(null);
    const res = data as { applied?: boolean; reason?: string } | null;
    if (error || res?.applied === false) {
      toast({ title: 'Not resolved', description: error?.message ?? res?.reason, variant: 'destructive' });
      return;
    }
    onResolved();
  };

  if (conflicts.length === 0) {
    return (
      <HubEmptyState
        title="No conflicts to resolve"
        description="A merge lists a product here when the two fields held different values on it, so nothing is overwritten without you."
        action={<Button variant="outline" size="sm" onClick={onShowFields}>Review fields</Button>}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead>Kept Value</TableHead>
          <TableHead>Merged-Away Value</TableHead>
          <TableHead>Decision</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {conflicts.map(c => (
          <TableRow key={c.id} className="align-top">
            <TableCell className="max-w-[14rem] break-words">{c.product_name ?? c.product_id}</TableCell>
            <TableCell className="max-w-xs break-words">
              <div className="text-xs text-muted-foreground">{c.survivor_field}</div>
              {show(c.survivor_value)}
            </TableCell>
            <TableCell className="max-w-xs break-words">
              <div className="text-xs text-muted-foreground">{c.loser_field}</div>
              {show(c.loser_value)}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === c.id} onClick={() => resolve(c, 'survivor')}>
                  {busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Keep current'}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy === c.id} onClick={() => resolve(c, 'loser')}>
                  Use merged-away
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
