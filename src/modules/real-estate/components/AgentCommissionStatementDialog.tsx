// "What am I owed for this period." The splits were computed all along and there was no way to
// produce the document that settles the conversation with the agent (#418).
//
// Every figure is READ from `agent-commission-statement`, which derives earned/paid/outstanding
// off `get_sale_commission_splits`. Nothing is totalled here: a second running total is how a
// statement and the card it sits next to start disagreeing (anti-regression rule 1).
import React, { useCallback, useState } from 'react';
import { formatMoney } from '@/utils/decimal';
import { Loader2, Printer, ReceiptText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Badge } from '@/components/core/ui/badge';
import { HubEmptyState } from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { formatDate, todayLocalISO, toLocalISODate } from '@/utils/datetime';
import { humanEdgeRefusal } from '@/utils/edgeError';
import { realEstateService, type AgentCommissionStatement } from '../services/realEstateService';

const money = (n: number | null | undefined, ccy: string) => formatMoney(n ?? 0, ccy || 'EUR', { decimals: 2 });

/** January 1st of the operator's current year, in the operator's calendar (CLAUDE.md §1b). */
function yearStartLocalISO(): string {
  const now = new Date();
  return toLocalISODate(new Date(now.getFullYear(), 0, 1));
}

export const AgentCommissionStatementDialog: React.FC<{
  ws: string | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  /** Brokers may run the whole desk; an agent may only ever run their own, and the edge enforces it. */
  canRunWholeDesk?: boolean;
}> = ({ ws, open, onOpenChange, canRunWholeDesk = false }) => {
  const { toast } = useToast();
  const [from, setFrom] = useState(yearStartLocalISO);
  const [to, setTo] = useState(todayLocalISO);
  const [allAgents, setAllAgents] = useState(false);
  const [loading, setLoading] = useState(false);
  const [statement, setStatement] = useState<AgentCommissionStatement | null>(null);

  const run = useCallback(async () => {
    if (!ws) return;
    setLoading(true);
    try {
      setStatement(await realEstateService.agentCommissionStatement(ws, {
        from, to, all_agents: allAgents || undefined,
      }));
    } catch (e) {
      toast({ title: 'Could not produce the statement', description: humanEdgeRefusal(e), variant: 'destructive' });
    } finally { setLoading(false); }
  }, [ws, from, to, allAgents, toast]);

  const print = () => window.print();

  const ccy = statement?.totals.currency ?? 'EUR';
  const lines = statement?.lines ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="h-4 w-4" /> Commission statement
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3">
          <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          {canRunWholeDesk && (
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" checked={allAgents} onChange={(e) => setAllAgents(e.target.checked)} />
              Whole desk
            </label>
          )}
          <Button disabled={loading || !ws} onClick={run}>
            {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null} Run
          </Button>
          {statement && lines.length > 0 && (
            <Button variant="outline" onClick={print}><Printer className="mr-1 h-4 w-4" /> Print</Button>
          )}
        </div>

        {statement && (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-4 rounded-lg bg-surface-sunken px-3 py-2 text-sm">
              <span>Earned <strong className="tabular-nums">{money(statement.totals.earned, ccy)}</strong></span>
              <span>Paid <strong className="tabular-nums">{money(statement.totals.paid, ccy)}</strong></span>
              <span>
                Outstanding{' '}
                <strong className={`tabular-nums ${statement.totals.outstanding > 0 ? 'text-amber-800 dark:text-amber-300' : ''}`}>
                  {money(statement.totals.outstanding, ccy)}
                </strong>
              </span>
            </div>

            {lines.length === 0 ? (
              // "No sales completed in this window" is a real answer, not a broken report — so it
              // offers a wider window rather than a create action (CLAUDE.md, empty states).
              <HubEmptyState
                variant="filtered"
                title="No commission in this period"
                description={`No sale completed between ${formatDate(statement.from)} and ${formatDate(statement.to)} carries a split for this agent.`}
                action={(
                  <Button size="sm" variant="outline"
                    onClick={() => { setFrom(yearStartLocalISO()); setTo(todayLocalISO()); }}>
                    Widen to this year
                  </Button>
                )}
              />
            ) : (
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-surface-sunken">
                      {['Property', 'Completed', 'Share', 'Amount', 'Status'].map((h, i) => (
                        <th key={h} className={`px-2 py-1.5 text-[11px] font-semibold text-muted-foreground ${i >= 3 ? 'text-right' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l) => (
                      <tr key={l.split_id} className="border-t border-hairline">
                        <td className="px-2 py-1.5">{l.property_title ?? l.reference_code ?? '—'}</td>
                        <td className="px-2 py-1.5">{l.completed_at ? formatDate(l.completed_at) : '—'}</td>
                        <td className="px-2 py-1.5">{l.party_type.replace(/_/g, ' ')}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{money(l.amount, l.currency)}</td>
                        <td className="px-2 py-1.5 text-right">
                          {l.paid_at
                            ? <Badge variant="success">paid {formatDate(l.paid_at)}</Badge>
                            : <Badge variant="warning">unpaid</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
