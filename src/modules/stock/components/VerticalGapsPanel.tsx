/**
 * Forward contracts, holds, processing and supplier standing (#442).
 *
 * Four facts a general ERP holds as integers and a merchant needs as records: the quantity still
 * owed under a container commitment, who a hold is for and when it lapses, what a cut cost and what
 * came back, and whether a supplier has actually been measured.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, AlertTriangle, CheckCircle2, Boxes, Timer, Scissors, Gauge, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { todayLocalISO, localISODateOffset } from '@/utils/datetime';
import {
  verticalGapService, BLANKET_LABEL, HOLD_VERDICT_LABEL, PROCESSING_LABEL, STANDING_LABEL,
  blanketNeedsAttention, holdNeedsAttention, holdIsLapsed, jobYieldsOffcut, supplierIsUnscored,
  weightsAreComplete, releaseIsOverCommitment,
  EXPIRY_IS_MANDATORY, NOTHING_AUTO_RELEASES, OUTWORKER_IS_A_PLACE, PRICE_ONLY_DISCIPLINE,
  type BlanketOrderRow, type BlanketPosition, type HoldPosition, type Scorecard,
  type ProcessingJob,
} from '@/modules/stock/services/verticalGapService';

export const VerticalGapsPanel: React.FC<{ workspaceId: string }> = ({ workspaceId }) => {
  const { toast } = useToast();
  const [blankets, setBlankets] = useState<BlanketOrderRow[]>([]);
  const [openBlanket, setOpenBlanket] = useState<BlanketPosition | null>(null);
  const [holds, setHolds] = useState<HoldPosition | null>(null);
  const [jobs, setJobs] = useState<ProcessingJob[]>([]);
  const [score, setScore] = useState<Scorecard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [contract, setContract] = useState({ reference: '', allowance: '5', endsOn: '' });
  const [priceFile, setPriceFile] = useState({ supplierId: '', text: '' });
  const [line, setLine] = useState({ description: '', quantity: '', unit: 'm2', price: '' });

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [b, h, j, s] = await Promise.all([
        verticalGapService.blanketOrders(workspaceId),
        verticalGapService.holds(workspaceId),
        verticalGapService.processingJobs(workspaceId),
        verticalGapService.scorecard(workspaceId),
      ]);
      setBlankets(b); setHolds(h); setJobs(j); setScore(s); setFailed(false);
      if (b.length > 0) {
        setOpenBlanket(await verticalGapService.blanketPosition(b[0].id).catch(() => null));
      } else {
        setOpenBlanket(null);
      }
    } catch {
      setBlankets([]); setHolds(null); setJobs([]); setScore(null); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const guard = async (fn: () => Promise<unknown>, title: string) => {
    setBusy(true);
    try { await fn(); await load(); } catch (err: unknown) {
      toast({
        title, description: err instanceof Error ? err.message : String(err), variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Boxes className="h-4 w-4 text-primary" /> Commitments, holds and processing
        </CardTitle>
        <CardDescription>
          A container bought now and drawn down for months; stock held for somebody with a date on
          it; material sent out to be cut and the offcut that comes back.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 text-xs">
        {loading && (
          <p className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the commitments…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This could not be read just now. That is not a statement that nothing is committed or
            held.
          </p>
        )}

        {!loading && !failed && (
          <>
            {blankets.length === 0 && (
              <HubEmptyState
                title="No forward contract"
                description="Commit to a container at a price and release against it over months. Without one, every release is an unrelated purchase order and nothing knows the commitment exists."
              />
            )}

            {openBlanket && (
              <div
                className={`space-y-1 rounded-md border p-2 ${
                  blanketNeedsAttention(openBlanket)
                    ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                    : 'border-hairline bg-surface-sunken text-muted-foreground'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  {blanketNeedsAttention(openBlanket)
                    ? <AlertTriangle className="h-3.5 w-3.5" />
                    : <CheckCircle2 className="h-3.5 w-3.5" />}
                  <Badge variant={openBlanket.status === 'over_released' ? 'error' : 'neutral'}>
                    {BLANKET_LABEL[openBlanket.status]}
                  </Badge>
                  <span>{openBlanket.reference ?? '—'}</span>
                  <span className="tabular-nums">
                    committed {openBlanket.committed_value} · remaining {openBlanket.remaining_value}
                    {' '}· allowance {openBlanket.allowance_percent}%
                  </span>
                </div>
                <p>{openBlanket.reason}</p>
                {openBlanket.rows.map((l) => (
                  <p key={l.line_id} className="tabular-nums">
                    {l.description}: {l.released} of {l.committed} {l.unit ?? ''} released,{' '}
                    {l.remaining} left
                    {releaseIsOverCommitment(l) ? ` — past the ${l.ceiling} ceiling` : ''}
                  </p>
                ))}

                <div className="flex flex-wrap items-end gap-2 pt-1">
                  <div>
                    <Label htmlFor="bl-desc" className="text-[11px]">Committed item</Label>
                    <Input id="bl-desc" className="mt-1 h-8 w-48 text-xs" value={line.description}
                      onChange={(e) => setLine((l) => ({ ...l, description: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="bl-qty" className="text-[11px]">Quantity</Label>
                    <Input id="bl-qty" type="number" min="0" className="mt-1 h-8 w-24 text-xs"
                      value={line.quantity}
                      onChange={(e) => setLine((l) => ({ ...l, quantity: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="bl-unit" className="text-[11px]">Unit</Label>
                    <Input id="bl-unit" className="mt-1 h-8 w-20 text-xs" value={line.unit}
                      onChange={(e) => setLine((l) => ({ ...l, unit: e.target.value }))} />
                  </div>
                  <div>
                    <Label htmlFor="bl-price" className="text-[11px]">Agreed price</Label>
                    <Input id="bl-price" type="number" min="0" className="mt-1 h-8 w-24 text-xs"
                      value={line.price}
                      onChange={(e) => setLine((l) => ({ ...l, price: e.target.value }))} />
                  </div>
                  <Button
                    size="sm" variant="outline" disabled={busy || !line.description.trim() || !line.quantity}
                    onClick={() => guard(async () => {
                      await verticalGapService.addBlanketLine({
                        blanketOrderId: openBlanket.blanket_order_id,
                        description: line.description.trim(),
                        quantity: Number(line.quantity),
                        unit: line.unit || null,
                        unitPrice: line.price === '' ? null : Number(line.price),
                      });
                      setLine({ description: '', quantity: '', unit: 'm2', price: '' });
                    }, 'Could not add the commitment line')}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Commit a quantity
                  </Button>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-end gap-2 rounded-md border border-hairline p-2">
              <div>
                <Label htmlFor="bo-ref" className="text-[11px]">Contract reference</Label>
                <Input id="bo-ref" className="mt-1 h-8 w-40 text-xs" value={contract.reference}
                  onChange={(e) => setContract((c) => ({ ...c, reference: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="bo-allow" className="text-[11px]">Allowance %</Label>
                <Input id="bo-allow" type="number" min="0" max="100" className="mt-1 h-8 w-24 text-xs"
                  value={contract.allowance}
                  onChange={(e) => setContract((c) => ({ ...c, allowance: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="bo-ends" className="text-[11px]">Runs until</Label>
                <Input id="bo-ends" type="date" className="mt-1 h-8 w-40 text-xs" value={contract.endsOn}
                  onChange={(e) => setContract((c) => ({ ...c, endsOn: e.target.value }))} />
              </div>
              <Button
                size="sm" disabled={busy}
                onClick={() => guard(async () => {
                  await verticalGapService.createBlanketOrder({
                    workspaceId,
                    reference: contract.reference || null,
                    allowancePercent: Number(contract.allowance) || 0,
                    endsOn: contract.endsOn || null,
                  });
                  setContract({ reference: '', allowance: '5', endsOn: '' });
                }, 'Could not create the contract')}
              >
                <Plus className="mr-1 h-3 w-3" /> Forward contract
              </Button>
            </div>

            {holds && (
              <div
                className={`space-y-1 rounded-md border p-2 ${
                  holds.status === 'lapsed'
                    ? 'border-destructive/40 bg-destructive/10 text-destructive'
                    : holdNeedsAttention(holds)
                      ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                      : 'border-hairline bg-surface-sunken text-muted-foreground'
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 font-medium">
                  <Timer className="h-3.5 w-3.5" />
                  <span className="tabular-nums">
                    {holds.active} held · {holds.expiring} expiring · {holds.lapsed} past their date
                  </span>
                </div>
                <p>{holds.reason}</p>
                <p>{EXPIRY_IS_MANDATORY}</p>
                <p>{NOTHING_AUTO_RELEASES}</p>
                {holds.rows.length > 0 && (
                  <div className="table-scroll">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Held for</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead>Pool</TableHead>
                          <TableHead className="text-right">Days left</TableHead>
                          <TableHead>State</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {holds.rows.map((r) => (
                          <TableRow key={r.hold_id}>
                            <TableCell>{r.held_for}</TableCell>
                            <TableCell className="text-right tabular-nums">{r.quantity} {r.unit ?? ''}</TableCell>
                            <TableCell>
                              {[r.lot, r.tone, r.calibre].filter(Boolean).join(' / ') || '—'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{r.days_left}</TableCell>
                            <TableCell className="space-x-1">
                              <Badge variant={holdIsLapsed(r) ? 'error' : r.verdict === 'expiring' ? 'warning' : 'neutral'}>
                                {HOLD_VERDICT_LABEL[r.verdict]}
                              </Badge>
                              <Button
                                size="sm" variant="ghost" className="h-7 px-2 text-[11px]" disabled={busy}
                                onClick={() => guard(
                                  () => verticalGapService.releaseHold(r.hold_id),
                                  'Could not release the hold',
                                )}
                              >
                                Release
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                <Button
                  size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={busy}
                  onClick={() => guard(
                    () => verticalGapService.placeHold({
                      workspaceId, quantity: 1, expiresOn: localISODateOffset(14),
                      heldForName: 'New hold',
                    }),
                    'Could not place the hold',
                  )}
                >
                  <Plus className="mr-1 h-3 w-3" /> Hold for 14 days
                </Button>
              </div>
            )}

            <div className="space-y-1 rounded-md border border-hairline p-2">
              <p className="flex items-center gap-2 font-medium">
                <Scissors className="h-3.5 w-3.5" /> Cutting and processing
              </p>
              <p className="text-muted-foreground">{OUTWORKER_IS_A_PLACE}</p>
              {jobs.length === 0 && (
                <p className="text-muted-foreground">
                  Nothing is out being cut. A processing step carries its own cost, and the offcut
                  comes back as stock rather than disappearing.
                </p>
              )}
              {jobs.map((j) => (
                <p key={j.id} className="tabular-nums text-muted-foreground">
                  {PROCESSING_LABEL[j.status]} · in {j.input_quantity ?? '—'} · out{' '}
                  {j.output_quantity ?? '—'} · offcut {j.offcut_quantity ?? 0}
                  {jobYieldsOffcut(j) ? ' (back in stock)' : ' (none recorded)'} · cost{' '}
                  {j.processing_cost ?? '—'}
                </p>
              ))}
              <Button
                size="sm" variant="outline" className="h-7 px-2 text-[11px]" disabled={busy}
                onClick={() => guard(
                  () => verticalGapService.saveProcessingJob({ workspaceId, status: 'planned' }),
                  'Could not open the job',
                )}
              >
                <Plus className="mr-1 h-3 w-3" /> Processing job
              </Button>
            </div>

            {score && (
              <div className="space-y-1 rounded-md border border-hairline p-2">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  <Gauge className="h-3.5 w-3.5" /> Supplier standing
                  {!weightsAreComplete(score) && (
                    <Badge variant="warning">weights total {score.weights_total}</Badge>
                  )}
                </p>
                <p className="text-muted-foreground">{score.reason}</p>
                {score.rows.map((r) => (
                  <p key={r.supplier_company_id} className="flex flex-wrap items-center gap-2">
                    <Badge variant={r.standing === 'poor' ? 'error' : r.standing === 'good' ? 'success' : 'neutral'}>
                      {STANDING_LABEL[r.standing]}
                    </Badge>
                    <span className="font-medium">{r.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      on time {r.on_time_percent ?? '—'}% · quality {r.quality_percent ?? '—'}%
                    </span>
                    {supplierIsUnscored(r) && r.unmeasured_reason && (
                      <span className="text-muted-foreground">{r.unmeasured_reason}</span>
                    )}
                  </p>
                ))}
                <div className="flex flex-wrap items-end gap-2 pt-1">
                  {(['on_time', 'quality', 'price_stability'] as const).map((c) => (
                    <div key={c}>
                      <Label htmlFor={`w-${c}`} className="text-[11px]">{c.replace('_', ' ')}</Label>
                      <Input
                        id={`w-${c}`} type="number" min="0" max="100"
                        className="mt-1 h-8 w-24 text-xs" defaultValue={0} disabled={busy}
                        onBlur={(e) => guard(
                          () => verticalGapService.setCriterionWeight(workspaceId, c, Number(e.target.value) || 0),
                          'Could not save the weight',
                        )}
                      />
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-muted-foreground">{PRICE_ONLY_DISCIPLINE}</p>

                <div className="space-y-1 pt-1">
                  <Label htmlFor="price-file" className="text-[11px]">
                    Price update — one JSON row per line, prices only
                  </Label>
                  <Textarea
                    id="price-file" rows={3} className="text-[11px] font-mono"
                    placeholder={'{"supplier_sku":"ABC-1","cost":11.20}'}
                    value={priceFile.text}
                    onChange={(e) => setPriceFile((p) => ({ ...p, text: e.target.value }))}
                  />
                  <div className="flex flex-wrap items-end gap-2">
                    <Input
                      className="h-8 w-72 text-xs" placeholder="supplier company id"
                      value={priceFile.supplierId}
                      onChange={(e) => setPriceFile((p) => ({ ...p, supplierId: e.target.value }))}
                    />
                    <Button
                      size="sm" variant="outline" disabled={busy || !priceFile.supplierId || !priceFile.text.trim()}
                      onClick={() => guard(async () => {
                        const rows = priceFile.text.split('\n').map((l) => l.trim()).filter(Boolean)
                          .map((l) => JSON.parse(l) as Record<string, unknown>);
                        const res = await verticalGapService.applyPriceUpdate(
                          workspaceId, priceFile.supplierId, rows,
                        );
                        toast({
                          title: `${res.updated} price(s) updated`,
                          description: `${res.unmatched} matched no article code, `
                            + `${res.rejected.length} carried more than a price. ${res.reason}`,
                          variant: res.rejected.length > 0 ? 'destructive' : undefined,
                        });
                        setPriceFile((p) => ({ ...p, text: '' }));
                      }, 'Could not apply the price update')}
                    >
                      Apply prices only
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">As at {todayLocalISO()}.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
};
