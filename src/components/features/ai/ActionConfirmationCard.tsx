/**
 * ActionConfirmationCard — human-in-the-loop gate for sensitive agent actions (invariant 9).
 *
 * Every action one turn proposed is ONE card with ONE Approve: approving runs them in order and
 * marks each with its own outcome, so a failure is named on its line rather than hidden in a total.
 */
import React from 'react';
import { ShieldCheck, AlertTriangle, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';

export type ActionConfirmationStatus = 'pending' | 'running' | 'approved' | 'declined';

export interface ActionConfirmationItem {
  tool: string;
  input: Record<string, unknown>;
  title: string;
  summary: string;
  danger?: boolean;
  toolkitId?: string;
  /** Set once the action has run. */
  outcome?: { ok: boolean; error?: string };
}

interface Props {
  items: ActionConfirmationItem[];
  status?: ActionConfirmationStatus;
  /** Approved automatically because Auto-approve was on. */
  autoApproved?: boolean;
  onApprove: () => void;
  onDecline: () => void;
}

export const ActionConfirmationCard: React.FC<Props> = ({
  items, status = 'pending', autoApproved, onApprove, onDecline,
}) => {
  const danger = items.some((i) => i.danger);
  const many = items.length > 1;
  const failed = items.filter((i) => i.outcome && !i.outcome.ok).length;
  const title = many ? `${items.length} actions need your approval` : (items[0]?.title ?? 'Confirm action');

  return (
    <div className={[
      'rounded-sm border p-4',
      danger ? 'border-destructive/40 bg-destructive/5' : 'border-primary/40 bg-primary/5',
    ].join(' ')}>
      <div className="flex items-start gap-2.5">
        <span className={[
          'flex h-8 w-8 items-center justify-center rounded-sm shrink-0',
          danger ? 'bg-destructive/15 text-destructive' : 'bg-primary/15 text-primary',
        ].join(' ')}>
          {danger ? <AlertTriangle className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium leading-tight">{title}</div>
          {many ? (
            <ul className="mt-2 divide-y divide-[hsl(var(--hairline))] border-y border-[hsl(var(--hairline))]">
              {items.map((item, i) => (
                <li key={i} className="flex items-start gap-2 py-2">
                  <span className="mt-0.5 w-4 shrink-0 text-xs">
                    {item.outcome
                      ? (item.outcome.ok
                        ? <Check className="h-3.5 w-3.5 text-[hsl(var(--success))]" />
                        : <X className="h-3.5 w-3.5 text-destructive" />)
                      : status === 'running'
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        : <span className="text-muted-foreground tabular-nums">{i + 1}.</span>}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[13px] text-foreground whitespace-pre-line">{item.summary || item.title}</p>
                    {item.outcome && !item.outcome.ok && (
                      <p className="mt-0.5 text-xs text-destructive">{item.outcome.error || 'This one did not go through.'}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <>
              <p className="mt-1 text-[13px] text-muted-foreground whitespace-pre-line">{items[0]?.summary}</p>
              {items[0]?.outcome && !items[0].outcome.ok && (
                <p className="mt-1 text-xs text-destructive">{items[0].outcome.error || 'This did not go through.'}</p>
              )}
            </>
          )}
        </div>
      </div>

      {status === 'pending' ? (
        <div className="mt-3.5 flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={onDecline}>
            <X className="h-3.5 w-3.5" /> {many ? 'Decline all' : 'Decline'}
          </Button>
          <Button size="sm" variant={danger ? 'destructive' : 'default'} className="gap-1.5" onClick={onApprove}>
            <Check className="h-3.5 w-3.5" /> {many ? `Approve all ${items.length}` : 'Approve'}
          </Button>
        </div>
      ) : (
        <div className={[
          'mt-3 text-xs font-medium',
          status === 'declined' ? 'text-muted-foreground' : failed > 0 ? 'text-destructive' : 'text-[hsl(var(--success))]',
        ].join(' ')}>
          {status === 'running' && 'Approved. Running…'}
          {status === 'declined' && 'Declined. No action was taken.'}
          {status === 'approved' && (failed > 0
            ? `${items.length - failed} of ${items.length} done, ${failed} failed.`
            : `${autoApproved ? 'Auto-approved' : 'Approved'}. ${many ? `All ${items.length} done.` : 'Done.'}`)}
        </div>
      )}
    </div>
  );
};

export default ActionConfirmationCard;
