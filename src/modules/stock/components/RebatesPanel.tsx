/**
 * Supplier rebates: what is accruing, and what crossing the next band is worth (#425).
 *
 * An accrual is not money. It is stated as an accrual everywhere here, because folding it into cost
 * as though it were banked is the opposite error to ignoring it — and both produce a confident
 * wrong margin that nothing downstream can catch.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, Percent, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISO } from '@/utils/datetime';
import {
  rebateService, CLAIM_LABEL, crossingIsWorth, rebateNeedsAttention, rebateIsBanked,
  type RebateAgreement, type RebatePosition, type RebateClaim, type RebateBand,
} from '@/modules/stock/services/rebateService';

export const RebatesPanel: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [agreements, setAgreements] = useState<RebateAgreement[]>([]);
  const [positions, setPositions] = useState<Record<string, RebatePosition>>({});
  const [bands, setBands] = useState<Record<string, RebateBand[]>>({});
  const [claims, setClaims] = useState<RebateClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [as, cs] = await Promise.all([
        rebateService.listAgreements(workspaceId),
        rebateService.listClaims(workspaceId).catch(() => [] as RebateClaim[]),
      ]);
      setAgreements(as); setClaims(cs); setFailed(false);
      const entries = await Promise.all(as.map(async (a) => [
        a.id,
        await rebateService.position(a.id).catch(() => null),
      ] as const));
      const pos: Record<string, RebatePosition> = {};
      for (const [id, p] of entries) if (p) pos[id] = p;
      setPositions(pos);
      const bandEntries = await Promise.all(as.map(async (a) => [
        a.id, await rebateService.bandsFor(a.id).catch(() => [] as RebateBand[]),
      ] as const));
      setBands(Object.fromEntries(bandEntries));
    } catch {
      setAgreements([]); setPositions({}); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const raiseClaim = async (a: RebateAgreement) => {
    const p = positions[a.id];
    setBusy(true);
    try {
      await rebateService.saveClaim({
        workspace_id: workspaceId, agreement_id: a.id,
        period_start: a.period_start, period_end: a.period_end,
        status: 'claimed', expected_amount: p?.accrual ?? null, claimed_on: todayLocalISO(),
      });
      await load();
      toast({ title: 'Claim raised' });
    } catch (err: unknown) {
      toast({
        title: 'Could not raise the claim',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Percent className="h-4 w-4 text-primary" /> Supplier rebates
        </CardTitle>
        <CardDescription>
          True margin is not knowable until the claim settles. A band crossed in November re-rates
          every line since January, which is the whole point of a rebate.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Working out the accruals…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The rebate agreements could not be read just now. That is not a statement that there are
            none.
          </p>
        )}

        {!loading && !failed && agreements.length === 0 && (
          <HubEmptyState
            title="No rebate agreements"
            description="Until one exists, every purchased line reports its margin at list cost — which is wrong in a predictable direction."
          />
        )}

        {agreements.map((a) => {
          const p = positions[a.id];
          const next = (bands[a.id] ?? []).find((b) => b.threshold_from === p?.next_threshold);
          const worth = crossingIsWorth(p ?? null, next?.percent ?? null);
          const claim = claims.find((c) => c.agreement_id === a.id);
          return (
            <div key={a.id} className="space-y-1 rounded-md border border-hairline p-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{a.name}</span>
                <span className="text-muted-foreground">{a.supplier?.name ?? '—'}</span>
                <span className="text-muted-foreground tabular-nums">
                  {a.period_start} → {a.period_end}
                </span>
                {a.is_retrospective && <Badge variant="info">retrospective</Badge>}
                {claim && (
                  <Badge variant={rebateIsBanked(claim.status) ? 'success' : 'warning'}>
                    {CLAIM_LABEL[claim.status]}
                  </Badge>
                )}
              </div>
              {p && (
                <p className={rebateNeedsAttention(p) ? 'text-destructive' : 'text-muted-foreground'}>
                  {p.reason}
                </p>
              )}
              {worth != null && worth > 0 && (
                <p className="text-muted-foreground tabular-nums">
                  Crossing the next band is worth {worth} on the period to date, not just on what
                  follows it.
                </p>
              )}
              {p?.status === 'accruing' && !claim && (
                <Button size="sm" variant="outline" onClick={() => raiseClaim(a)} disabled={busy}>
                  <Check className="mr-1 h-3 w-3" /> Raise the claim
                </Button>
              )}
            </div>
          );
        })}

        {claims.length > 0 && (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Period</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead className="text-right">Expected</TableHead>
                  <TableHead className="text-right">Settled</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {claims.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="tabular-nums">{c.period_start} → {c.period_end}</TableCell>
                    <TableCell>{CLAIM_LABEL[c.status]}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.expected_amount ?? '—'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {/* A dash, not 0: unsettled and settled-at-nothing are different facts. */}
                      {c.settled_amount ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
