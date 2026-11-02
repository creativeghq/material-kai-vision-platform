/**
 * Send goods from a received document back to its supplier: a DRAFT Δελτίο Αποστολής with move
 * purpose 5 (Επιστροφή). Issuing it from Delivery Notes is what takes the stock out; the money
 * comes back on the supplier's own credit note, which arrives through myDATA.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Undo2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { FormField } from '@/components/core/ui/form-layout';
import { useToast } from '@/hooks/use-toast';
import { parseDecimalOr } from '@/utils/decimal';
import { normalizeUnit, unitFromMydataCode, unitSuffix } from '@/lib/units';
import { inboundService, type InboundDocument, type SupplierReturnLine } from '@/modules/finance/services/inboundService';
import { deliveryNotesService, type WarehousePick } from '@/modules/finance/services/deliveryNotesService';
import { FINANCE_TAB, financeTabUrl } from '@/modules/finance/routes';

const NO_STOCK = '__none';

interface RowState { include: boolean; qty: string; itemId: string }

/** Most that may go back on this line from the chosen stock item; null = uncapped. */
function capFor(line: SupplierReturnLine, itemId: string): number | null {
  const fromStock = line.stock.find((s) => s.item_id === itemId);
  const stockLeft = fromStock ? Math.max(fromStock.received - fromStock.returned, 0) : null;
  if (line.returnable == null) return stockLeft;
  return stockLeft == null ? line.returnable : Math.min(line.returnable, stockLeft);
}

export const ReturnToSupplierDialog: React.FC<{
  doc: InboundDocument;
  workspaceId: string;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}> = ({ doc, workspaceId, onOpenChange, onDone }) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [lines, setLines] = useState<SupplierReturnLine[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [warehouse, setWarehouse] = useState<WarehousePick[]>([]);
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    let live = true;
    Promise.all([
      inboundService.supplierReturnLines(doc.id),
      deliveryNotesService.listWarehouse(workspaceId).catch(() => [] as WarehousePick[]),
    ])
      .then(([ls, wh]) => {
        if (!live) return;
        setLines(ls);
        setWarehouse(wh);
        const init: Record<number, RowState> = {};
        for (const l of ls) {
          // The item it came in through is the item it goes out of; a line never received here
          // moves no stock unless the operator names one (it may have arrived on the order).
          const source = l.stock.find((s) => s.received - s.returned > 0) ?? l.stock[0];
          const itemId = source?.item_id ?? NO_STOCK;
          const cap = capFor(l, itemId);
          init[l.line_number] = { include: ls.length === 1, qty: cap != null ? String(cap) : '', itemId };
        }
        setRows(init);
      })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [doc.id, workspaceId]);

  const openDraftId = lines?.[0]?.open_draft_id ?? null;
  const setRow = (n: number, patch: Partial<RowState>) =>
    setRows((m) => ({ ...m, [n]: { ...m[n], ...patch } }));

  const problems = useMemo(() => {
    const out: string[] = [];
    for (const l of lines ?? []) {
      const r = rows[l.line_number];
      if (!r?.include) continue;
      const qty = parseDecimalOr(r.qty, 0);
      const cap = capFor(l, r.itemId);
      if (qty <= 0) out.push(`Line ${l.line_number}: enter a quantity.`);
      else if (cap != null && qty > cap + 1e-6) out.push(`Line ${l.line_number}: at most ${cap} can go back.`);
    }
    return out;
  }, [lines, rows]);
  const picked = (lines ?? []).filter((l) => rows[l.line_number]?.include);

  const goToDraft = () => navigate(financeTabUrl(FINANCE_TAB.deliveryNotes));

  const submit = async () => {
    if (submitting.current || !lines) return;
    submitting.current = true;
    setBusy(true);
    try {
      const payload = picked.map((l) => {
        const r = rows[l.line_number];
        const item = r.itemId === NO_STOCK ? null : r.itemId;
        const stockUnit = item ? (l.stock.find((s) => s.item_id === item)?.unit ?? warehouse.find((w) => w.id === item)?.unit) : null;
        return {
          line_number: l.line_number,
          quantity: parseDecimalOr(r.qty, 0),
          warehouse_item_id: item,
          unit: stockUnit ?? unitFromMydataCode(Number(l.measurement_unit)) ?? null,
        };
      });
      await inboundService.createSupplierReturnDraft(doc.id, payload, reason.trim());
      toast({
        title: 'Return note drafted',
        description: 'Check it under Delivery Notes and press Issue to send it — that is when the stock comes out. The refund arrives as the supplier\'s credit note.',
      });
      onDone();
      goToDraft();
    } catch (err) {
      toast({ title: 'Could not draft the return', description: err instanceof Error ? err.message : (err as { message?: string })?.message, variant: 'destructive' });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };

  const issuer = doc.issuer_name ?? doc.issuer_vat ?? doc.mark;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Return to supplier — {issuer}</DialogTitle>
          <DialogDescription>
            Builds a draft delivery note (purpose: Return) addressed to the supplier. Nothing leaves
            stock until you issue it.
          </DialogDescription>
        </DialogHeader>

        {failed ? (
          <p className="py-8 text-center text-sm text-destructive">
            Could not load this document&rsquo;s lines. This is a loading failure, not an empty document — close and reopen.
          </p>
        ) : lines == null ? (
          <div className="py-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : openDraftId ? (
          <p className="py-6 text-sm">
            A return draft for this document is already open. Finish or issue that one first — returning
            the same lines twice would take the stock out twice.
          </p>
        ) : lines.length === 0 ? (
          <p className="py-6 text-sm text-muted-foreground">
            This document has no itemised lines, so there is nothing to name on a return. Add the line detail first.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="table-scroll max-h-[50vh] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 border-b border-hairline bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                  <tr>
                    <th className="w-8 px-2 py-2"><span className="sr-only">Return</span></th>
                    <th className="px-2 py-2 text-left">Line</th>
                    <th className="px-2 py-2 text-right">Invoiced</th>
                    <th className="px-2 py-2 text-right">Returned</th>
                    <th className="px-2 py-2 text-left">Take out of stock</th>
                    <th className="px-2 py-2 text-right">Return qty</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const r = rows[l.line_number] ?? { include: false, qty: '', itemId: NO_STOCK };
                    const docUnit = unitFromMydataCode(Number(l.measurement_unit));
                    const source = l.stock.find((s) => s.item_id === r.itemId);
                    const stockUnit = source?.unit ?? warehouse.find((w) => w.id === r.itemId)?.unit ?? null;
                    const unitDiffers = r.itemId !== NO_STOCK && !!docUnit && !!stockUnit && normalizeUnit(docUnit) !== normalizeUnit(stockUnit);
                    const exhausted = l.returnable != null && l.returnable <= 0;
                    return (
                      <tr key={l.line_number} className={`border-b border-hairline align-top ${exhausted ? 'opacity-50' : ''}`}>
                        <td className="px-2 py-2">
                          <Checkbox
                            checked={r.include}
                            disabled={exhausted}
                            onCheckedChange={(v) => setRow(l.line_number, { include: v === true })}
                            aria-label={`Return line ${l.line_number}`}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="text-xs font-medium">{l.description}</div>
                          <div className="text-[11px] text-muted-foreground">
                            #{l.line_number}{l.item_code ? ` · ${l.item_code}` : ''}
                          </div>
                          {unitDiffers && (
                            <div className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">
                              Invoiced in {unitSuffix(docUnit)}, stock counted in {unitSuffix(stockUnit)} — enter the quantity in {unitSuffix(stockUnit)}.
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{l.invoiced ?? '—'}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{l.returned || '—'}</td>
                        <td className="px-2 py-2">
                          <Select
                            value={r.itemId}
                            disabled={!r.include}
                            onValueChange={(v) => {
                              const cap = capFor(l, v);
                              setRow(l.line_number, { itemId: v, qty: cap != null ? String(cap) : r.qty });
                            }}
                          >
                            <SelectTrigger className="h-8 w-[220px] text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NO_STOCK}>Not in stock — no movement</SelectItem>
                              {l.stock.map((s) => (
                                <SelectItem key={s.item_id} value={s.item_id}>
                                  {s.name} · received {s.received}{s.returned ? `, back ${s.returned}` : ''} · on hand {s.on_hand}
                                </SelectItem>
                              ))}
                              {/* Never received from THIS document — e.g. it came in on the purchase order. */}
                              {l.stock.length === 0 && warehouse.map((w) => (
                                <SelectItem key={w.id} value={w.id}>{w.name}{w.sku ? ` (${w.sku})` : ''} · on hand {w.qty_on_hand ?? 0}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-2 py-2 text-right">
                          <Input
                            className="ml-auto h-8 w-24 text-right text-xs tabular-nums"
                            inputMode="decimal"
                            value={r.qty}
                            disabled={!r.include}
                            onChange={(e) => setRow(l.line_number, { qty: e.target.value })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <FormField label="Reason (optional)">
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Damaged on delivery, wrong shade, surplus…"
              />
            </FormField>

            {problems.length > 0 && (
              <ul className="space-y-0.5 text-xs text-destructive">
                {problems.map((p) => <li key={p}>{p}</li>)}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          {openDraftId ? (
            <Button onClick={() => { onOpenChange(false); goToDraft(); }}>Open Delivery Notes</Button>
          ) : (
            <Button onClick={submit} disabled={busy || !lines || picked.length === 0 || problems.length > 0}>
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Undo2 className="mr-2 h-4 w-4" />}
              Draft return note
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
