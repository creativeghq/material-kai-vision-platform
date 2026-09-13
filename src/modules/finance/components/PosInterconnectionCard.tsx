/**
 * Whether the payment terminals must be interconnected, and whether they are (#448).
 *
 * Ε.2044/2024 is narrower than the headline: wholesale-only with no ΦΗΜ owes nothing, but an
 * entity with only ONE payment means taking mixed transactions must interconnect it. That is
 * almost certainly the common shape, and it is the case a "we are mostly wholesale" reading misses.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, CreditCard } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISO } from '@/utils/datetime';
import {
  posInterconnectionService, INTERCONNECTION_LABEL, TERMINAL_VERDICT_LABEL, ROUTE_LABEL,
  interconnectionNeedsAttention, interconnectionIsBreach, BRANCH_IS_IDENTITY,
  type InterconnectionPosition, type InterconnectionRoute,
} from '@/modules/finance/services/posInterconnectionService';

export const PosInterconnectionCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [position, setPosition] = useState<InterconnectionPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      setPosition(await posInterconnectionService.position(workspaceId));
      setFailed(false);
    } catch {
      setPosition(null); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const patch = async (id: string, p: Parameters<typeof posInterconnectionService.updateTerminal>[1]) => {
    setBusy(true);
    try {
      await posInterconnectionService.updateTerminal(id, p);
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Could not update the terminal',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CreditCard className="h-4 w-4 text-primary" /> POS interconnection
        </CardTitle>
        <CardDescription>
          A payment terminal taking retail transactions that require a ΦΗΜ must be interconnected —
          and one terminal doing mixed trade counts as exactly that.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-xs">
        {loading && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the terminals…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The terminals could not be read just now. That is not a statement that nothing is owed.
          </p>
        )}

        {!loading && !failed && position && (
          <>
            <div
              className={`space-y-1 rounded-md border p-2 ${
                interconnectionIsBreach(position)
                  ? 'border-destructive/40 bg-destructive/10 text-destructive'
                  : interconnectionNeedsAttention(position)
                    ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                    : 'border-hairline bg-surface-sunken text-muted-foreground'
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 font-medium">
                {interconnectionNeedsAttention(position)
                  ? <AlertTriangle className="h-3.5 w-3.5" />
                  : <CheckCircle2 className="h-3.5 w-3.5" />}
                <Badge variant={interconnectionIsBreach(position) ? 'error' : 'neutral'}>
                  {INTERCONNECTION_LABEL[position.status]}
                </Badge>
                <span className="tabular-nums">
                  {position.terminals} terminal(s) · {position.retail_terminals} taking retail ·{' '}
                  {position.not_interconnected} not interconnected
                </span>
              </div>
              <p>{position.reason}</p>
              <p>{position.legal_basis}</p>
              {interconnectionIsBreach(position) && <p>{position.penalty}</p>}
            </div>

            {position.rows.length === 0 && (
              <HubEmptyState
                title="No payment terminal listed"
                description="Until the terminals are on record with the trade each one takes, whether interconnection is owed cannot be answered — and an unanswered question is not a clean result."
              />
            )}

            {position.rows.length > 0 && (
              <div className="table-scroll">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Terminal</TableHead>
                      <TableHead>Provider / model</TableHead>
                      <TableHead>Route</TableHead>
                      <TableHead>Trade</TableHead>
                      <TableHead className="text-right">Window</TableHead>
                      <TableHead>Verdict</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {position.rows.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <span className="font-medium">{t.label ?? '—'}</span>
                          <span className="block text-[11px] text-muted-foreground">{t.terminal_id}</span>
                        </TableCell>
                        <TableCell>
                          {t.nsp_name ?? '—'}
                          <span className="block text-[11px] text-muted-foreground">{t.pos_model ?? '—'}</span>
                        </TableCell>
                        <TableCell>
                          <Select
                            value={t.route ?? 'none'}
                            disabled={busy}
                            onValueChange={(v) => patch(t.id, {
                              interconnection_route: v === 'none' ? null : (v as InterconnectionRoute),
                            })}
                          >
                            <SelectTrigger className="h-8 w-52 text-xs" aria-label={`Route for ${t.terminal_id}`}>
                              <SelectValue placeholder="Not stated" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Not stated</SelectItem>
                              <SelectItem value="a1098">{ROUTE_LABEL.a1098}</SelectItem>
                              <SelectItem value="a1155">{ROUTE_LABEL.a1155}</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="space-x-1">
                          <Button
                            size="sm" variant={t.handles_retail ? 'secondary' : 'outline'}
                            className="h-7 px-2 text-[11px]" disabled={busy}
                            onClick={() => patch(t.id, { handles_retail: !t.handles_retail })}
                          >
                            Retail
                          </Button>
                          <Button
                            size="sm" variant={t.handles_wholesale ? 'secondary' : 'outline'}
                            className="h-7 px-2 text-[11px]" disabled={busy}
                            onClick={() => patch(t.id, { handles_wholesale: !t.handles_wholesale })}
                          >
                            Wholesale
                          </Button>
                          {t.supports_iris && <Badge variant="info">IRIS</Badge>}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{t.matching_window_hours}h</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Badge variant={t.verdict === 'interconnected' ? 'success' : t.verdict === 'must_interconnect' ? 'error' : 'neutral'}>
                              {TERMINAL_VERDICT_LABEL[t.verdict]}
                            </Badge>
                            <Button
                              size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={busy}
                              onClick={() => patch(t.id, {
                                is_interconnected: !t.is_interconnected,
                                interconnected_on: t.is_interconnected ? null : todayLocalISO(),
                              })}
                            >
                              {t.is_interconnected ? 'Mark not interconnected' : 'Mark interconnected'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="rounded-md border border-hairline bg-surface-sunken p-2 text-[11px] text-muted-foreground">
              <Label className="text-[11px] font-medium">Establishment code</Label>
              <p className="mt-1">{BRANCH_IS_IDENTITY}</p>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
};
