/** Quotes built from a takeoff: says when the drawings moved. A quantity changes only when a person says so. */
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { formatNumber } from '@/utils/decimal';
import { unitSuffix } from '@/lib/units';
import { useToast } from '@/hooks/use-toast';
import { projectSectionPath } from '../projectSections';
import { takeoffService, type ProjectTakeoffSummary } from '../services/takeoffService';

const Banner: React.FC<{ title: string; detail?: React.ReactNode; action?: React.ReactNode }> = ({ title, detail, action }) => (
  <div className="flex flex-wrap items-start gap-3 rounded-sm border border-hairline bg-card px-4 py-3 text-sm">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
    <div className="min-w-0 flex-1">
      <p className="font-medium">{title}</p>
      {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
    </div>
    {action}
  </div>
);

export const TakeoffQuoteWarnings: React.FC<{ projectId: string; onChanged?: () => void }> = ({ projectId, onChanged }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [summary, setSummary] = useState<ProjectTakeoffSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setSummary(await takeoffService.projectSummary(projectId)); setError(null); }
    catch (e) { setSummary(null); setError((e as Error).message); }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  const refresh = async (itemId: string) => {
    setBusy(itemId);
    try {
      await takeoffService.refreshQuoteLine(itemId);
      await load();
      onChanged?.();
      toast({ title: 'Quantity updated', description: 'Check the line total on the quote.' });
    } catch (e) {
      toast({ title: 'Could not update the quantity', description: (e as Error).message, variant: 'destructive' });
    } finally { setBusy(null); }
  };

  const qty = (n: number | null, unit: string | null) =>
    n == null ? 'unknown' : `${formatNumber(n, { maxDecimals: unit === 'pcs' ? 0 : 2 })} ${unit ? unitSuffix(unit) : ''}`.trim();

  if (error) {
    return (
      <Banner
        title="Could not check whether the drawings behind these quotes have changed"
        detail={error}
        action={<Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>}
      />
    );
  }
  const lines = summary?.remeasure ?? [];
  const unread = summary?.not_analysed ?? [];
  if (lines.length === 0 && unread.length === 0) return null;

  return (
    <div className="space-y-2">
      {unread.length > 0 && (
        <Banner
          title="A quote still uses an older drawing revision"
          detail={unread.map((d) => `${d.label}: Rev ${d.rev_label} has not been read, the quote uses Rev ${d.quoted_rev_label}`).join(' · ')}
          action={(
            <Button size="sm" variant="outline" onClick={() => navigate(projectSectionPath(projectId, 'takeoff', { revision: unread[0].revision_id }))}>
              Read it in Takeoff
            </Button>
          )}
        />
      )}
      {lines.map((l) => {
        const differs = l.quoted_quantity !== l.drawing_quantity;
        return (
          <Banner
            key={l.quote_item_id}
            title={`${l.description}${l.quote_number ? ` on ${l.quote_number}` : ''}`}
            detail={differs
              ? `The quote says ${qty(l.quoted_quantity, l.unit)}; the drawings now say ${qty(l.drawing_quantity, l.unit)}.`
              : 'A newer drawing revision changed the area this line was measured from. Check it in Takeoff.'}
            action={differs && l.quote_status === 'draft' && l.drawing_quantity != null ? (
              <Button size="sm" variant="outline" disabled={busy === l.quote_item_id} onClick={() => void refresh(l.quote_item_id)}>
                {busy === l.quote_item_id && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Use {qty(l.drawing_quantity, l.unit)}
              </Button>
            ) : (
              <Button size="sm" variant="outline" onClick={() => navigate(projectSectionPath(projectId, 'takeoff'))}>Review in Takeoff</Button>
            )}
          />
        );
      })}
    </div>
  );
};
