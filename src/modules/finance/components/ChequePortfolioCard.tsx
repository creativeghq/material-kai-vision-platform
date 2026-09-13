/**
 * The cheque portfolio and where each security has been (#423).
 *
 * A cheque is an asset that changes hands, and the chain is the record. Pledged securities are
 * counted apart from spendable ones for the reason Soft1's flag exists: an already-committed
 * cheque must not be spent twice.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, FileSignature, ArrowRightLeft } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  chequeLedgerService, HOLDER_LABEL, ACTION_LABEL,
  chequeIsSpendable, allowedActions, chequeIsUndated, bounceUnwinds,
  type ChequeRow, type ChequePortfolio, type ChequeEndorsement, type ChequeAction,
} from '@/modules/finance/services/chequeLedgerService';

export const ChequePortfolioCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [portfolio, setPortfolio] = useState<ChequePortfolio | null>(null);
  const [cheques, setCheques] = useState<ChequeRow[]>([]);
  const [chain, setChain] = useState<Record<string, ChequeEndorsement[]>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [p, { data }] = await Promise.all([
        chequeLedgerService.portfolio(workspaceId),
        supabase
          .from('cheques')
          .select('id, cheque_number, amount, due_date, maturity_date, status, current_holder, is_pledged, is_transferable, pledged_reason')
          .eq('workspace_id', workspaceId)
          .eq('direction', 'in')
          .order('maturity_date', { nullsFirst: false }),
      ]);
      const rows = (data ?? []) as ChequeRow[];
      setPortfolio(p); setCheques(rows); setFailed(false);
      const entries = await Promise.all(rows.map(async (c) => [
        c.id, await chequeLedgerService.chain(c.id).catch(() => [] as ChequeEndorsement[]),
      ] as const));
      setChain(Object.fromEntries(entries));
    } catch {
      setPortfolio(null); setCheques([]); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const move = async (c: ChequeRow, action: ChequeAction) => {
    setBusy(true);
    try {
      const res = await chequeLedgerService.move({ chequeId: c.id, action });
      toast({ title: ACTION_LABEL[action], description: res.reason });
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Could not move the cheque',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSignature className="h-4 w-4 text-primary" /> Αξιόγραφα
        </CardTitle>
        <CardDescription>
          A cheque changes hands: received, endorsed to a supplier, discounted at a bank, or
          bounced. Every hand is a link, and a pledged security is out of reach on purpose.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the portfolio…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The cheque portfolio could not be read just now. That is not a statement that nothing is
            in hand.
          </p>
        )}

        {!loading && !failed && portfolio && (
          <div className="rounded-md border border-hairline bg-surface-sunken p-2 text-xs text-muted-foreground">
            <p className="font-medium tabular-nums">
              Spendable {portfolio.spendable ?? 0} · pledged {portfolio.pledged ?? 0} · endorsed on{' '}
              {portfolio.endorsed_on ?? 0} · discounted {portfolio.discounted ?? 0}
            </p>
            <p className="mt-1">{portfolio.reason}</p>
          </div>
        )}

        {!loading && !failed && cheques.length === 0 && (
          <HubEmptyState
            title="No customer cheques in hand"
            description="A post-dated cheque is an asset that changes hands — taking one and endorsing it on is the commonest Greek B2B move."
          />
        )}

        {cheques.map((c) => (
          <div key={c.id} className="space-y-1 rounded-md border border-hairline p-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium tabular-nums">{c.cheque_number ?? '—'}</span>
              <span className="tabular-nums">{c.amount}</span>
              <Badge variant={chequeIsSpendable(c) ? 'success' : 'neutral'}>
                {HOLDER_LABEL[c.current_holder]}
              </Badge>
              {c.is_pledged && (
                <Badge variant="warning">
                  pledged{c.pledged_reason ? ` — ${c.pledged_reason}` : ''}
                </Badge>
              )}
              {chequeIsUndated(c) && (
                <span className="text-amber-800 dark:text-amber-300">
                  no maturity date, so it can never show as due
                </span>
              )}
              {!chequeIsUndated(c) && c.maturity_date && (
                <span className="text-muted-foreground tabular-nums">
                  matures {c.maturity_date}
                </span>
              )}
            </div>

            {(chain[c.id] ?? []).length > 0 && (
              <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                <ArrowRightLeft className="h-3 w-3" />
                {(chain[c.id] ?? []).map((e) => `${e.sequence}. ${ACTION_LABEL[e.action]}`).join(' → ')}
              </p>
            )}

            {c.status === 'pending' && (
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value=""
                  onValueChange={(v) => move(c, v as ChequeAction)}
                  disabled={busy || allowedActions(c).length === 0}
                >
                  <SelectTrigger className="h-8 w-56 text-xs" aria-label={`Move cheque ${c.cheque_number ?? ''}`}>
                    <SelectValue placeholder="Move it on" />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedActions(c).map((a) => (
                      <SelectItem key={a} value={a}>{ACTION_LABEL[a]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm" variant="ghost" disabled={busy}
                  onClick={() => chequeLedgerService
                    .setPledged(c.id, !c.is_pledged, 'committed')
                    .then(load)
                    .catch(() => toast({ title: 'Could not change the pledge', variant: 'destructive' }))}
                >
                  {c.is_pledged ? 'Release' : 'Pledge'}
                </Button>
                {c.current_holder !== 'us' && (
                  <span className="text-[11px] text-muted-foreground">
                    If it bounces: {bounceUnwinds(c).join('; ')}.
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};
