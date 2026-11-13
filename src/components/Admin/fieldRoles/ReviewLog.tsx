import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';

export interface ReviewDecision {
  id: string;
  kind: 'conflict' | 'suggestion' | 'field_role';
  item_ref: string;
  field_name: string | null;
  decision: string;
  applied: boolean;
  outcome: string | null;
  reason: string;
  created_at: string;
  undone_at: string | null;
}

const DECISION_LABEL: Record<string, string> = {
  keep_survivor: 'kept the current value',
  keep_loser: 'took the merged-away value',
  accept: 'accepted the suggestion',
  dismiss: 'dismissed the suggestion',
  identity: 'identity',
  descriptive: 'descriptive',
  abstain: 'left for you',
};

const KIND_LABEL: Record<ReviewDecision['kind'], string> = {
  conflict: 'Conflict',
  suggestion: 'Suggestion',
  field_role: 'Field Role',
};

interface Props {
  decisions: readonly ReviewDecision[];
  onChanged: () => void;
  onAskJarvis: () => void;
  asking: boolean;
}

/** Every decision JARVIS made on Field Roles, with its reason; a person can reverse any of them. */
export const ReviewLog: React.FC<Props> = ({ decisions, onChanged, onAskJarvis, asking }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const reverse = async (d: ReviewDecision) => {
    setBusy(d.id);
    const { data, error } = await supabase.rpc('undo_field_review_decision', { p_id: d.id });
    setBusy(null);
    const res = data as { applied?: boolean; reason?: string } | null;
    if (error || res?.applied === false) {
      toast({ title: 'Not reversed', description: error?.message ?? res?.reason, variant: 'destructive' });
      return;
    }
    toast({ title: 'Reversed', description: 'Recorded as your decision; JARVIS will not revisit it.' });
    onChanged();
  };

  if (decisions.length === 0) {
    return (
      <HubEmptyState
        title="JARVIS has not reviewed anything yet"
        description="JARVIS works this queue every 5th day and reports at 23:00 UTC. Every decision lands here with its reason."
        action={<Button size="sm" onClick={onAskJarvis} disabled={asking}>Ask JARVIS to review</Button>}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Item</TableHead>
          <TableHead>Decision</TableHead>
          <TableHead className="hidden md:table-cell">Reason</TableHead>
          <TableHead className="hidden sm:table-cell text-right">When</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {decisions.map(d => {
          const reversible = d.applied && !d.undone_at && d.decision !== 'abstain';
          return (
            <TableRow key={d.id} className="align-top">
              <TableCell>
                <div className="text-xs text-muted-foreground">{KIND_LABEL[d.kind]}</div>
                <div className="break-all">{d.field_name ?? d.item_ref}</div>
              </TableCell>
              <TableCell className="text-sm">
                <div className={d.decision === 'abstain' ? 'text-warning' : d.applied ? undefined : 'text-muted-foreground line-through'}>
                  {DECISION_LABEL[d.decision] ?? d.decision}
                </div>
                {!d.applied && d.decision !== 'abstain' && d.outcome && (
                  <div className="text-xs text-muted-foreground">refused: {d.outcome}</div>
                )}
                {d.undone_at && <div className="text-xs text-muted-foreground">reversed {formatDate(d.undone_at)}</div>}
              </TableCell>
              <TableCell className="hidden text-xs text-muted-foreground max-w-md break-words md:table-cell">{d.reason}</TableCell>
              <TableCell className="hidden sm:table-cell text-right text-xs text-muted-foreground tabular-nums">{formatDate(d.created_at)}</TableCell>
              <TableCell>
                {reversible ? (
                  <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy === d.id} onClick={() => reverse(d)}>
                    {busy === d.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Reverse'}
                  </Button>
                ) : <span className="text-muted-foreground">—</span>}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};
