/**
 * ActionConfirmationCard — human-in-the-loop gate for sensitive agent actions (#275).
 *
 * A sensitive tool (issue invoice, send WhatsApp/campaign, contract e-sign) previews instead of
 * mutating and emits an `action_confirmation` chunk. AgentHub renders this card inline. Approve
 * re-invokes the tool with `confirm:true` (via the direct_tool path); Decline does nothing.
 * Satisfies CLAUDE.md invariant #9 (state-mutating agent tools require explicit confirmation).
 */
import React from 'react';
import { ShieldCheck, AlertTriangle, Check, X } from 'lucide-react';
import { Button } from '@/components/core/ui/button';

export type ActionConfirmationStatus = 'pending' | 'approved' | 'declined';

interface Props {
  title: string;
  summary: string;
  /** Destructive/irreversible action → red styling + destructive Approve button. */
  danger?: boolean;
  status?: ActionConfirmationStatus;
  onApprove: () => void;
  onDecline: () => void;
}

export const ActionConfirmationCard: React.FC<Props> = ({
  title, summary, danger, status = 'pending', onApprove, onDecline,
}) => {
  return (
    <div className={[
      'rounded-xl border p-4',
      danger ? 'border-destructive/40 bg-destructive/5' : 'border-primary/40 bg-primary/5',
    ].join(' ')}>
      <div className="flex items-start gap-2.5">
        <span className={[
          'flex h-8 w-8 items-center justify-center rounded-lg shrink-0',
          danger ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary',
        ].join(' ')}>
          {danger ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-tight">{title}</div>
          <p className="mt-1 text-[13px] text-muted-foreground whitespace-pre-line">{summary}</p>
          <p className="mt-1.5 text-[11px] uppercase tracking-wide text-muted-foreground/70">
            This action needs your approval.
          </p>
        </div>
      </div>

      {status === 'pending' ? (
        <div className="mt-3.5 flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onDecline}>
            <X className="h-3.5 w-3.5" /> Decline
          </Button>
          <Button size="sm" variant={danger ? 'destructive' : 'default'} className="gap-1.5" onClick={onApprove}>
            <Check className="h-3.5 w-3.5" /> Approve
          </Button>
        </div>
      ) : (
        <div className={[
          'mt-3 text-xs font-medium',
          status === 'approved' ? 'text-[hsl(var(--success))]' : 'text-muted-foreground',
        ].join(' ')}>
          {status === 'approved' ? '✓ Approved — running the action…' : 'Declined — no action was taken.'}
        </div>
      )}
    </div>
  );
};

export default ActionConfirmationCard;
