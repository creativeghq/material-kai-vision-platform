/**
 * Does this consignment move us toward the CBAM threshold? (#429)
 *
 * Ceramics are not in Annex I, so a tile order usually contributes nothing — and saying that out
 * loud is the point, because the metal on the same order (fixings, frames, profiles) is what does
 * count. The threshold is 50 tonnes of net mass per calendar year and it is retroactive.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Scale, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISO } from '@/utils/datetime';
import {
  cbamService, cbamNeedsAttention, cbamIsWatched, formatTonnes,
  type CbamOrderPreview, type CbamYearPosition, type CbamScopeStatus,
} from '@/modules/finance/services/cbamService';

const SCOPE_TONE: Record<CbamScopeStatus, 'warning' | 'neutral' | 'error' | 'info'> = {
  in_scope: 'warning',
  out_of_scope: 'neutral',
  exempt_origin: 'info',
  unlisted: 'error',
  undeclared: 'error',
};

const SCOPE_LABEL: Record<CbamScopeStatus, string> = {
  in_scope: 'Annex I',
  out_of_scope: 'Out of scope',
  exempt_origin: 'Annex III origin',
  unlisted: 'Unclassified',
  undeclared: 'No CN code',
};

export const OrderCbamCard: React.FC<{
  orderId: string;
  workspaceId: string;
}> = ({ orderId, workspaceId }) => {
  const { toast } = useToast();
  const [preview, setPreview] = useState<CbamOrderPreview | null>(null);
  const [position, setPosition] = useState<CbamYearPosition | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [entryDate, setEntryDate] = useState(todayLocalISO());
  const [declarationRef, setDeclarationRef] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, y] = await Promise.all([
        cbamService.orderPreview(orderId),
        cbamService.yearPosition(workspaceId),
      ]);
      setPreview(p); setPosition(y); setFailed(false);
    } catch {
      // A failed read is not "nothing in scope". Saying so is the whole difference between this
      // panel and a silent zero.
      setPreview(null); setPosition(null); setFailed(true);
    } finally { setLoading(false); }
  }, [orderId, workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const record = async () => {
    setSaving(true);
    try {
      const res = await cbamService.recordFromOrder(orderId, entryDate, declarationRef || undefined);
      setPosition(res.position);
      toast({
        title: res.recorded > 0 ? `${res.recorded} entries recorded` : 'Nothing new to record',
        description: res.already_present > 0
          ? `${res.already_present} of these lines were already in the register.`
          : undefined,
      });
      await load();
    } catch (err: unknown) {
      toast({
        title: 'Could not record these entries',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking this order against Annex I…
      </div>
    );
  }

  if (failed || !preview || preview.status !== 'ok') {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          This order could not be checked against CBAM Annex I just now. That is not a statement
          that nothing on it is in scope.
        </span>
      </div>
    );
  }

  const relevant = (preview.lines ?? []).filter((l) => l.scope !== 'out_of_scope');
  const checkedOut = (preview.lines ?? []).length - relevant.length;

  return (
    <div className="space-y-3">
      <div className="flex items-start gap-2 rounded-md border border-hairline bg-surface-sunken p-2 text-xs">
        <Scale className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <div className="space-y-1">
          <p className="font-medium">Carbon border adjustment (CBAM)</p>
          <p className="text-muted-foreground">{preview.reason}</p>
        </div>
      </div>

      {position && (
        <div
          className={`rounded-md border p-2 text-xs ${
            cbamNeedsAttention(position)
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : cbamIsWatched(position)
                ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                : 'border-hairline bg-card text-muted-foreground'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2 font-medium">
            {cbamNeedsAttention(position) || cbamIsWatched(position)
              ? <AlertTriangle className="h-3.5 w-3.5" />
              : <CheckCircle2 className="h-3.5 w-3.5" />}
            <span>
              {position.year} position:{' '}
              <span className="tabular-nums">{formatTonnes(position.net_mass_kg)}</span>
              {position.threshold_kg != null && (
                <span className="tabular-nums"> of {formatTonnes(position.threshold_kg)}</span>
              )}
            </span>
          </div>
          <p className="mt-1">{position.reason}</p>
          {position.retroactive_from && (
            <p className="mt-1 font-medium">
              Liable from {position.retroactive_from}, not from the crossing date.
            </p>
          )}
        </div>
      )}

      {relevant.length > 0 && (
        <div className="table-scroll">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Line</TableHead>
                <TableHead>CN</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead className="text-right">Net mass</TableHead>
                <TableHead>Scope</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relevant.map((l) => (
                <TableRow key={l.order_item_id}>
                  <TableCell>
                    {l.description ?? '—'}
                    {l.already_recorded && (
                      <span className="ml-2 text-[11px] text-muted-foreground">already recorded</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">{l.cn || '—'}</TableCell>
                  <TableCell>{l.origin ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {l.net_mass_kg == null
                      ? <span className="text-destructive">not weighed</span>
                      : `${l.net_mass_kg} kg`}
                  </TableCell>
                  <TableCell>
                    <Badge variant={SCOPE_TONE[l.scope]}>{SCOPE_LABEL[l.scope]}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {checkedOut > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {checkedOut} further lines were checked against Annex I and are out of scope.
        </p>
      )}

      {(preview.exempt_origin_lines ?? 0) > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {preview.exempt_origin_lines} lines are in Annex I but originate in an Annex III
          country, so they count for nothing. Origin here is the non-preferential one — an
          A.TR is a movement certificate, not a statement of origin.
        </p>
      )}

      {(preview.in_scope_lines ?? 0) > 0 && (
        <div className="space-y-2 rounded-md border border-hairline p-2">
          <p className="text-xs text-muted-foreground">
            Record these against the customs entry. The date decides which year the mass counts
            toward, and a line already in the register is never counted twice.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="cbam-entry-date" className="text-[11px]">Entry date</Label>
              <Input
                id="cbam-entry-date" type="date" value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)} className="h-9 w-40"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cbam-mrn" className="text-[11px]">Declaration / MRN</Label>
              <Input
                id="cbam-mrn" value={declarationRef}
                onChange={(e) => setDeclarationRef(e.target.value)}
                placeholder="optional" className="h-9 w-56"
              />
            </div>
            <Button onClick={record} disabled={saving || !entryDate}>
              {saving && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />}
              Record in the CBAM register
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
