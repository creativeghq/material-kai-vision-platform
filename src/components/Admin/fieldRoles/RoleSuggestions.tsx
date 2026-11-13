import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/core/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';

export interface RoleProposal {
  id: string;
  field_name: string;
  proposed_role: string;
  signal: string;
  confidence: number | null;
  reason: string | null;
  category: string | null;
  occurrences: number;
  last_seen_at: string;
}

const SIGNAL_EVIDENCE: Record<string, string> = {
  sku_correlation: 'the catalogue gave these variants different SKUs',
  plurality: 'the catalogue listed several values',
  warehouse_feedback: 'two stocked rows differed',
  llm: 'model verdict',
};

interface Props {
  proposals: readonly RoleProposal[];
  currentRole: (field: string) => string | undefined;
  onDecided: () => void;
  onShowFields: () => void;
}

export const RoleSuggestions: React.FC<Props> = ({ proposals, currentRole, onDecided, onShowFields }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);

  const decide = async (p: RoleProposal, accept: boolean) => {
    setBusy(p.id);
    const { data, error } = await supabase.rpc('decide_field_role_proposal', { p_id: p.id, p_accept: accept });
    setBusy(null);
    const res = data as { applied?: boolean; reason?: string } | null;
    if (error || res?.applied === false) {
      toast({ title: 'Not applied', description: error?.message ?? res?.reason, variant: 'destructive' });
      return;
    }
    toast({ title: accept ? `${p.field_name} is now ${p.proposed_role}` : `Suggestion for ${p.field_name} dismissed` });
    onDecided();
  };

  if (proposals.length === 0) {
    return (
      <HubEmptyState
        title="No suggestions waiting"
        description="When an ingestion finds evidence that an existing field is a variant axis, or is not one, it lands here for you to decide."
        action={<Button variant="outline" size="sm" onClick={onShowFields}>Review fields</Button>}
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Field</TableHead>
          <TableHead>Suggested</TableHead>
          <TableHead className="hidden md:table-cell">Evidence</TableHead>
          <TableHead className="hidden sm:table-cell text-right">Seen</TableHead>
          <TableHead>Decision</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {proposals.map(p => (
          <TableRow key={p.id} className="align-top">
            <TableCell>
              <div className="break-all">{p.field_name}</div>
              <div className="text-xs text-muted-foreground">now {currentRole(p.field_name) ?? '—'}</div>
            </TableCell>
            <TableCell className={p.proposed_role === 'identity' ? 'text-primary' : 'text-muted-foreground'}>
              {p.proposed_role}
            </TableCell>
            <TableCell className="hidden text-xs md:table-cell max-w-md break-words">
              <div>{SIGNAL_EVIDENCE[p.signal] ?? p.signal}{p.category ? ` (${p.category})` : ''}</div>
              {p.reason && <div className="text-muted-foreground">{p.reason}</div>}
            </TableCell>
            <TableCell className="hidden sm:table-cell text-right text-xs tabular-nums">
              <div>{p.occurrences}×</div>
              <div className="text-muted-foreground">{formatDate(p.last_seen_at)}</div>
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy === p.id} onClick={() => decide(p, true)}>
                  {busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : `Make ${p.proposed_role}`}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy === p.id} onClick={() => decide(p, false)}>
                  Dismiss
                </Button>
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
