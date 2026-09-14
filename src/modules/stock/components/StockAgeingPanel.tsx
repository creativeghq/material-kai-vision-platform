/**
 * Stock ageing and the obsolescence provision (#438).
 *
 * A pallet that has not moved in two years is a perfectly valid row with a perfectly valid
 * quantity, so nothing raises. Tile ranges are discontinued by the FACTORY, not by us — which is
 * the earliest signal there is, and everything else only tells you once the stock has already sat.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, Hourglass, Save } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISO } from '@/utils/datetime';
import {
  ageingService, describeAge, provisionIsIncomplete, poolsNeedingAttention,
  type AgeingPosition, type ProvisionBand,
} from '@/modules/stock/services/ageingService';
import { formatValuation } from '@/modules/stock/stockValuationRules';

/** A starting policy an operator can edit, not a rule the platform decides. */
const SUGGESTED = [
  { days_from: 0, days_to: 180, percent: 0 },
  { days_from: 180, days_to: 365, percent: 25 },
  { days_from: 365, days_to: null as number | null, percent: 75 },
];

export const StockAgeingPanel: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [position, setPosition] = useState<AgeingPosition | null>(null);
  const [bands, setBands] = useState<ProvisionBand[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [from, setFrom] = useState(() => todayLocalISO());

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [p, b] = await Promise.all([
        ageingService.position(workspaceId),
        ageingService.bands(workspaceId).catch(() => [] as ProvisionBand[]),
      ]);
      setPosition(p); setBands(b); setFailed(false);
    } catch {
      setPosition(null); setBands([]); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const adoptPolicy = async () => {
    setBusy(true);
    try {
      await ageingService.setPolicy(workspaceId, from, SUGGESTED);
      await load();
      toast({ title: 'Provision policy in force' });
    } catch (err: unknown) {
      toast({
        title: 'Could not set the policy',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const worst = poolsNeedingAttention(position);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Hourglass className="h-4 w-4 text-primary" /> Ageing and obsolescence
        </CardTitle>
        <CardDescription>
          Aged per lot rather than per SKU — an old tone inside a live product is exactly the case.
          The bands are dated, because changing them changes what past reporting said.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Ageing the shelves…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The ageing could not be derived just now. That is not a statement that nothing needs
            writing down.
          </p>
        )}

        {!loading && !failed && position && (
          <div
            className={`rounded-md border p-2 text-xs ${
              provisionIsIncomplete(position)
                ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                : 'border-hairline bg-surface-sunken text-muted-foreground'
            }`}
          >
            <div className="flex flex-wrap items-center gap-2 font-medium">
              Provision: <span className="tabular-nums">{formatValuation(position.provision)}</span>
              <span className="tabular-nums">of {formatValuation(position.value)}</span>
            </div>
            <p className="mt-1">{position.reason}</p>
          </div>
        )}

        {position?.status === 'no_policy' && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-hairline p-2">
            <div>
              <Label htmlFor="prov-from" className="text-[11px]">In force from</Label>
              <Input
                id="prov-from" type="date" className="mt-1 h-8 w-40 text-xs" value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <Button size="sm" onClick={adoptPolicy} disabled={busy}>
              {busy ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-2 h-3.5 w-3.5" />}
              Adopt 0% / 25% / 75% at 6 and 12 months
            </Button>
            <p className="text-[11px] text-muted-foreground">
              A starting point to edit, not a rule the platform decides for you.
            </p>
          </div>
        )}

        {bands.length > 0 && (
          <p className="text-[11px] text-muted-foreground">
            {bands.map((b) => `${b.days_from}–${b.days_to ?? '∞'}d: ${b.percent}%`).join(' · ')}
          </p>
        )}

        {worst.length > 0 && (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead>Lot / tone</TableHead>
                  <TableHead>History</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-right">Provision</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {worst.map((r) => (
                  <TableRow key={r.pool_id}>
                    <TableCell>
                      {r.item ?? '—'}
                      {r.discontinued_on && (
                        <Badge variant="error" className="ml-2">discontinued {r.discontinued_on}</Badge>
                      )}
                      {r.is_remainder && <Badge variant="neutral" className="ml-2">remainder</Badge>}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {[r.lot, r.tone, r.calibre].filter(Boolean).join(' / ') || '—'}
                    </TableCell>
                    <TableCell>{describeAge(r)}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatValuation(r.value)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.provision_percent == null ? '—' : `${formatValuation(r.provision)} (${r.provision_percent}%)`}
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
