/**
 * ΨΔΑ Phase Β readiness: where the events go, and what the lines must carry (#407).
 *
 * The four Β1 operations are recorded here already. Nothing files them yet, and that gap is
 * invisible from the lifecycle ledger — a leg looks the same whether or not AADE ever heard about
 * it. So the route is stated, with the reason it is still open.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, Truck, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISO } from '@/utils/datetime';
import {
  psdaPhaseBService, ROUTE_STATUS_LABEL, ROUTE_LABEL, CN_STATUS_LABEL,
  routeNeedsDecision, eventsAreStranded, cnNeedsWork,
  PHASE_B1_FROM, PHASE_B2_FROM, PENALTY_IS_PER_AUDIT, DATE_MOVES_LATE,
  COPYABLE_IS_HISTORIC, SUPPRESSION_BASIS,
  type PsdaRoutePosition, type CnCoverage, type PsdaRoute,
} from '@/modules/finance/services/psdaPhaseBService';

export const PsdaReadinessCard: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [route, setRoute] = useState<PsdaRoutePosition | null>(null);
  const [coverage, setCoverage] = useState<CnCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({ route: '', credential: '' });

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [r, c] = await Promise.all([
        psdaPhaseBService.route(workspaceId),
        psdaPhaseBService.cnCoverage(workspaceId),
      ]);
      setRoute(r); setCoverage(c); setFailed(false);
    } catch {
      setRoute(null); setCoverage(null); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!draft.route) return;
    setBusy(true);
    try {
      await psdaPhaseBService.setRoute(workspaceId, draft.route as PsdaRoute, {
        confirmedOn: draft.route === 'provider' ? todayLocalISO() : null,
        credentialRef: draft.route === 'direct_mydata' ? (draft.credential || null) : null,
      });
      await load();
      toast({ title: 'Route recorded' });
    } catch (err: unknown) {
      toast({
        title: 'Could not record the route',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Truck className="h-4 w-4 text-primary" /> ΨΔΑ Phase Β readiness
        </CardTitle>
        <CardDescription>
          Β1 (φόρτωση, μεταφόρτωση, παραλαβή, ποσοτικός και ποιοτικός έλεγχος) from {PHASE_B1_FROM};
          Β2 (a CN code on every movement line) from {PHASE_B2_FROM}. {PENALTY_IS_PER_AUDIT}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-xs">
        {loading && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading readiness…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Readiness could not be read just now. That is not a statement that the events are
            reaching AADE.
          </p>
        )}

        {!loading && !failed && route && (
          <div
            className={`space-y-1 rounded-md border p-2 ${
              routeNeedsDecision(route)
                ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                : 'border-hairline bg-surface-sunken text-muted-foreground'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 font-medium">
              {routeNeedsDecision(route)
                ? <AlertTriangle className="h-3.5 w-3.5" />
                : <CheckCircle2 className="h-3.5 w-3.5" />}
              <Badge variant={routeNeedsDecision(route) ? 'warning' : 'success'}>
                {ROUTE_STATUS_LABEL[route.status]}
              </Badge>
              {route.route && <span>{ROUTE_LABEL[route.route]}</span>}
              <span className="tabular-nums">
                {route.untransmitted_events} event(s) untransmitted ·{' '}
                {route.offline_events_pending} recorded offline
              </span>
            </div>
            <p>{route.reason}</p>
            <p>{route.note}</p>
            {eventsAreStranded(route) && (
              <p>
                Those legs are recorded and unfiled. Recording never refuses for want of a
                connection, which is what keeps the movement lawful — but it is not the filing.
              </p>
            )}

            <div className="flex flex-wrap items-end gap-2 pt-1">
              <div>
                <Label htmlFor="psda-route" className="text-[11px]">Route</Label>
                <Select value={draft.route} onValueChange={(v) => setDraft((d) => ({ ...d, route: v }))}>
                  <SelectTrigger id="psda-route" className="mt-1 h-8 w-64 text-xs">
                    <SelectValue placeholder="Not decided" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="provider">{ROUTE_LABEL.provider}</SelectItem>
                    <SelectItem value="direct_mydata">{ROUTE_LABEL.direct_mydata}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {draft.route === 'direct_mydata' && (
                <div>
                  <Label htmlFor="psda-cred" className="text-[11px]">Credential reference</Label>
                  <Input
                    id="psda-cred" className="mt-1 h-8 w-56 text-xs"
                    placeholder="which stored key, not the key"
                    value={draft.credential}
                    onChange={(e) => setDraft((d) => ({ ...d, credential: e.target.value }))}
                  />
                </div>
              )}
              <Button size="sm" onClick={save} disabled={busy || !draft.route}>
                <Save className="mr-1 h-3 w-3" /> Record the route
              </Button>
            </div>
          </div>
        )}

        {!loading && !failed && coverage && (
          <div
            className={`space-y-1 rounded-md border p-2 ${
              cnNeedsWork(coverage)
                ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                : 'border-hairline bg-surface-sunken text-muted-foreground'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 font-medium">
              <Badge variant={cnNeedsWork(coverage) ? 'warning' : 'neutral'}>
                {CN_STATUS_LABEL[coverage.status]}
              </Badge>
              <span className="tabular-nums">
                {coverage.with_cn_code} of {coverage.lines} lines coded ·{' '}
                {coverage.classifiable_from_product} copyable · {coverage.suppressed} suppressed ·{' '}
                {coverage.unclassified} unclassified
              </span>
            </div>
            <p>{coverage.reason}</p>
            <p>{coverage.legal_basis}</p>
            <p>{COPYABLE_IS_HISTORIC}</p>
            <p>Suppression is legitimate in exactly one place: {SUPPRESSION_BASIS}.</p>
          </div>
        )}

        {!loading && !failed && <p className="text-[11px] text-muted-foreground">{DATE_MOVES_LATE}</p>}
      </CardContent>
    </Card>
  );
};
