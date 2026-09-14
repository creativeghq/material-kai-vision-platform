/**
 * Απογραφή — the year-end stocktake as a legal record (#452).
 *
 * Ν.4308/2014 άρθρο 4 §4 fixes the content: description, unit, quantity per item AND separately per
 * storage space, plus the unit and total valuation. §5 makes third-party stock quantity-only,
 * because valuing consigned goods puts somebody else's inventory on our balance sheet. Άρθρο 6 §2
 * lets the count date differ from the reference date, which is what makes cycle counting legal.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, ScrollText, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISO } from '@/utils/datetime';
import {
  greekComplianceService, MEASUREMENT_LABEL, rollForwardIncomplete,
  type ApografiRecord, type ApografiLine, type RollForward,
} from '@/modules/finance/services/greekComplianceService';

export const ApografiPanel: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [records, setRecords] = useState<ApografiRecord[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [lines, setLines] = useState<ApografiLine[]>([]);
  const [roll, setRoll] = useState<RollForward | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    countedOn: todayLocalISO(),
    referenceDate: `${new Date().getFullYear()}-12-31`,
  });

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      setRecords(await greekComplianceService.apografiRecords(workspaceId));
      setFailed(false);
    } catch {
      setRecords([]); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const open = async (id: string) => {
    setOpenId(id);
    try {
      const [ls, r] = await Promise.all([
        greekComplianceService.apografiLines(id),
        greekComplianceService.rollForward(id),
      ]);
      setLines(ls); setRoll(r);
    } catch { setLines([]); setRoll(null); }
  };

  const create = async () => {
    setBusy(true);
    try {
      await greekComplianceService.openApografi({
        workspaceId,
        countedOn: draft.countedOn,
        referenceDate: draft.referenceDate,
        fiscalYear: Number(draft.referenceDate.slice(0, 4)),
      });
      await load();
      toast({ title: 'Stocktake opened' });
    } catch (err: unknown) {
      toast({
        title: 'Could not open the stocktake',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ScrollText className="h-4 w-4 text-primary" /> Απογραφή
        </CardTitle>
        <CardDescription>
          A legal record and a myDATA submission. The count date and the reference date are separate
          on purpose — that is what άρθρο 6 §2 allows, and what makes counting in stages legal.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading stocktakes…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The stocktakes could not be read just now. That is not a statement that none exist.
          </p>
        )}

        {!loading && !failed && records.length === 0 && (
          <HubEmptyState
            title="No stocktake on record"
            description="The απογραφή is a legal record with defined content and a myDATA submission — closing stock reaches AADE as category2_14 / E3_104."
          />
        )}

        {records.length > 0 && (
          <ul className="space-y-1 text-xs">
            {records.map((r) => (
              <li key={r.id}>
                <Button
                  size="sm" variant={openId === r.id ? 'secondary' : 'ghost'}
                  onClick={() => open(r.id)}
                >
                  {r.fiscal_year} {r.kind} — counted {r.counted_on}, as at {r.reference_date}
                </Button>
                <Badge variant={r.status === 'transmitted' ? 'success' : 'neutral'} className="ml-2">
                  {r.status}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-end gap-2 rounded-md border border-hairline p-2">
          <div>
            <Label htmlFor="apo-counted" className="text-[11px]">Counted on</Label>
            <Input
              id="apo-counted" type="date" className="mt-1 h-8 w-40 text-xs" value={draft.countedOn}
              onChange={(e) => setDraft((d) => ({ ...d, countedOn: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="apo-ref" className="text-[11px]">Reference date</Label>
            <Input
              id="apo-ref" type="date" className="mt-1 h-8 w-40 text-xs" value={draft.referenceDate}
              onChange={(e) => setDraft((d) => ({ ...d, referenceDate: e.target.value }))}
            />
          </div>
          <Button size="sm" onClick={create} disabled={busy}>
            <Plus className="mr-1 h-3 w-3" /> Open stocktake
          </Button>
        </div>

        {roll && (
          <p
            className={`rounded-md border p-2 text-xs ${
              rollForwardIncomplete(roll)
                ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                : 'border-hairline bg-surface-sunken text-muted-foreground'
            }`}
          >
            {roll.reason}
          </p>
        )}

        {lines.length > 0 && (
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                  <TableHead>How</TableHead>
                  <TableHead className="text-right">Unit value</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      {l.description}
                      {l.is_third_party && <Badge variant="info" className="ml-2">third party</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.quantity} {l.unit}
                      {l.secondary_quantity != null && (
                        <span className="block text-[11px] text-muted-foreground">
                          {l.secondary_quantity} {l.secondary_unit}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{MEASUREMENT_LABEL[l.measurement_method]}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {/* §5: consigned goods take no unit valuation at all, and a dash here says */}
                      {/* that rather than implying nobody typed it. */}
                      {l.is_third_party ? 'not ours to value' : (l.unit_value ?? '—')}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {l.is_third_party ? '—' : (l.total_value ?? '—')}
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
