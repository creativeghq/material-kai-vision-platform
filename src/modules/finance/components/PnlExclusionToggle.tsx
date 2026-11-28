import React, { useEffect, useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { financeService, type PnlExclusionKind } from '@/modules/finance/services/financeService';

interface Props {
  kind: PnlExclusionKind;
  id: string;
  checked: boolean;
  onChanged?: (next: boolean) => void;
  disabled?: boolean;
  compact?: boolean;
  lockedReason?: string;
}

/**
 * One action whose label is what pressing it will do: «Exclude from P&L» while the document
 * counts, «Include in P&L» once it is excluded. It used to be a checkbox next to a fixed
 * «Exclude from P&L» label, which read as a box in the name and never said the current state.
 */
export const PnlExclusionToggle: React.FC<Props> = ({ kind, id, checked, onChanged, disabled, compact, lockedReason }) => {
  const { toast } = useToast();
  const [excluded, setExcluded] = useState(checked);
  const [saving, setSaving] = useState(false);
  useEffect(() => setExcluded(checked), [checked]);
  const locked = disabled || !!lockedReason;

  const toggle = async () => {
    const next = !excluded;
    setSaving(true);
    setExcluded(next);
    try {
      await financeService.setDocumentPnlExclusion(kind, id, next);
      toast({ title: next ? 'Excluded from P&L' : 'Included in P&L' });
      onChanged?.(next);
    } catch (err: any) {
      setExcluded(!next);
      toast({ title: 'Could not change the P&L setting', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const Icon = saving ? Loader2 : excluded ? Eye : EyeOff;
  return (
    <span className={`inline-flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
      <button
        type="button"
        disabled={locked || saving}
        title={lockedReason ?? (excluded
          ? 'Left out of P&L, revenue, expense and profit totals. Press to count it again.'
          : 'Leave out of P&L, revenue, expense and profit totals. VAT, myDATA, balances and cash still count it.')}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); void toggle(); }}
        className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:bg-muted ${locked || saving ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <Icon className={`${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'} ${saving ? 'animate-spin' : ''}`} />
        <span>{excluded ? 'Include in P&L' : 'Exclude from P&L'}</span>
      </button>
      {!compact && (
        <span className="text-xs text-muted-foreground">
          {lockedReason ?? (excluded ? '— excluded; still counts for VAT, myDATA, balances and cash' : '— still counts for VAT, myDATA, balances and cash')}
        </span>
      )}
    </span>
  );
};
