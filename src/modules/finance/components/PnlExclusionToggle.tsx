import React, { useEffect, useState } from 'react';
import { Checkbox } from '@/components/core/ui/checkbox';
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

export const PnlExclusionToggle: React.FC<Props> = ({ kind, id, checked, onChanged, disabled, compact, lockedReason }) => {
  const { toast } = useToast();
  const [value, setValue] = useState(checked);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(checked), [checked]);
  const locked = disabled || !!lockedReason;

  const toggle = async (next: boolean) => {
    setSaving(true);
    setValue(next);
    try {
      await financeService.setDocumentPnlExclusion(kind, id, next);
      toast({ title: next ? 'Excluded from P&L' : 'Included in P&L' });
      onChanged?.(next);
    } catch (err: any) {
      setValue(!next);
      toast({ title: 'Could not change the P&L setting', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const boxId = `pnl-${kind}-${id}`;
  const Wrapper = compact ? 'span' : 'label';
  return (
    <Wrapper
      htmlFor={compact ? undefined : boxId}
      title={lockedReason ?? 'Left out of P&L, revenue, expense and profit totals. VAT, myDATA, balances and cash still count it.'}
      onClick={(e: React.MouseEvent) => { e.stopPropagation(); if (compact) e.preventDefault(); }}
      className={`inline-flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'} ${locked || saving ? 'opacity-70' : 'cursor-pointer'}`}
    >
      <Checkbox id={boxId} className="h-4 w-4 rounded" checked={value} disabled={locked || saving} onCheckedChange={(v) => void toggle(v === true)} />
      <span>{compact ? 'Not in P&L' : 'Exclude from P&L'}</span>
      {!compact && (
        <span className="text-xs text-muted-foreground">
          {lockedReason ?? '— still counts for VAT, myDATA, balances and cash'}
        </span>
      )}
    </Wrapper>
  );
};
