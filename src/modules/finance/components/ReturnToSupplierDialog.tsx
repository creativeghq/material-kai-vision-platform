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
import { deliveryNoteUrl } from '@/modules/finance/routes';

const NO_STOCK = '__none';

interface RowState { include: boolean; qty: string; itemId: string }

const docUnitOf = (l: SupplierReturnLine) => unitFromMydataCode(Number(l.measurement_unit));

/**
 * The note states the INVOICE's quantity and issuing takes that same number out of stock, so a
 * stock item counted in another unit (boxes invoiced, m² stocked) can never be linked.
 */
const sameUnit = (l: SupplierReturnLine, unit: string | null | undefined) => {
  const doc = docUnitOf(l);
  return !doc || !unit || normalizeUnit(doc) === normalizeUnit(unit);
};

function capFor(line: SupplierReturnLine, itemId: string, warehouse: WarehousePick[]): number | null {
  const caps: number[] = [];
  if (line.returnable != null) caps.push(line.returnable);
  const fromStock = line.stock.find((s) => s.item_id === itemId);
  if (fromStock) caps.push(fromStock.received - fromStock.returned, fromStock.on_hand);
  const picked = !fromStock ? warehouse.find((w) => w.id === itemId) : undefined;
  if (picked) caps.push(Number(picked.qty_on_hand ?? 0));
  return caps.length ? Math.max(Math.min(...caps), 0) : null;
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
  const [warehouseFailed, setWarehouseFailed] = useState(false);
  const [rows, setRows] = useState<Record<number, RowState>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);

  useEffect(() => {
    let live = true;
    void (async () => {
      let ls: SupplierReturnLine[];
      try { ls = await inboundService.supplierReturnLines(doc.id); }
      catch { if (live) setFailed(true); return; }
      let wh: WarehousePick[] = [];
      if (ls.some((l) => l.stock.length === 0)) {
        try { wh = await deliveryNotesService.listWarehouse(workspaceId); }
        catch { if (live) setWarehouseFailed(true); }
      }
      if (!live) return;
      setLines(ls);
      setWarehouse(wh);
      const init: Record<number, RowState> = {};
      for (const l of ls) {
        const source = l.stock.find((s) => sameUnit(l, s.unit) && s.received - s.returned > 0);
        const itemId = source?.item_id ?? NO_STOCK;
        const cap = capFor(l, itemId, wh);
        const exhausted = l.returnable != null && l.returnable <= 0;
        init[l.line_number] = { include: ls.length === 1 && !exhausted, qty: cap != null ? String(cap) : '', itemId };
      }
      setRows(init);
    })();
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
      const cap = capFor(l, r.itemId, warehouse);
      if (qty <= 0) out.push(`Line ${l.line_number}: enter a quantity.`);
      else if (cap != null && qty > cap + 1e-6) out.push(`Line ${l.line_number}: at most ${cap} can go back.`);
    }
    return out;
  }, [lines, rows, warehouse]);
  const picked = (lines ?? []).filter((l) => rows[l.line_number]?.include);


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
          unit: docUnitOf(l) ?? stockUnit ?? null,
        };
      });
      const noteId = await inboundService.createSupplierReturnDraft(doc.id, payload, reason.trim());
      toast({
        title: 'Return note drafted',
        description: 'Check it, edit it if needed, then press Issue — that is when the stock comes out. The refund arrives as the supplier\'s credit note.',
      });
      onDone();
      navigate(deliveryNoteUrl(noteId));
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
            <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
              {lines.map((l) => {
                const r = rows[l.line_number] ?? { include: false, qty: '', itemId: NO_STOCK };
                const docUnit = docUnitOf(l);
                const linkable = l.stock.filter((s) => sameUnit(l, s.unit));
                const otherUnit = l.stock.find((s) => !sameUnit(l, s.unit));
                const exhausted = l.returnable != null && l.returnable <= 0;
                return (
                  <div
                    key={l.line_number}
                    className={`grid grid-cols-[28px_minmax(0,1fr)] gap-2 rounded-sm border border-hairline p-2.5 sm:grid-cols-[28px_minmax(0,1fr)_auto] ${exhausted ? 'opacity-50' : ''}`}
                  >
                    <Checkbox
                      className="mt-0.5 justify-self-center"
                      checked={r.include}
                      disabled={exhausted}
                      onCheckedChange={(v) => setRow(l.line_number, { include: v === true })}
                      aria-label={`Return line ${l.line_number}`}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium" title={l.description}>{l.description}</div>
                      <div className="text-[11px] text-muted-foreground tabular-nums">
                        #{l.line_number}{l.item_code ? ` · ${l.item_code}` : ''}
                        {' · '}invoiced {l.invoiced ?? '—'}{l.returned ? ` · already returned ${l.returned}` : ''}
                      </div>
                      {otherUnit && (
                        <div className="mt-1 text-[11px] text-amber-800 dark:text-amber-300">
                          Received into {otherUnit.name}, counted in {unitSuffix(otherUnit.unit)} — the invoice is in {unitSuffix(docUnit)}, so
                          this return cannot take it out of stock. Adjust that item in Warehouse after issuing.
                        </div>
                      )}
                      {l.stock.length === 0 && warehouseFailed && (
                        <div className="mt-1 text-[11px] text-destructive">Could not load the warehouse, so no stock item can be picked for this line.</div>
                      )}
                    </div>
                    <div className="col-start-2 flex flex-wrap items-center gap-1 sm:col-start-3">
                      <Select
                        value={r.itemId}
                        disabled={!r.include}
                        onValueChange={(v) => {
                          const cap = capFor(l, v, warehouse);
                          setRow(l.line_number, { itemId: v, qty: cap != null ? String(cap) : r.qty });
                        }}
                      >
                        <SelectTrigger className="h-8 w-[220px] text-xs" aria-label="Take out of stock"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NO_STOCK}>Not in stock — no movement</SelectItem>
                          {linkable.map((s) => (
                            <SelectItem key={s.item_id} value={s.item_id}>
                              {s.name} · received {s.received}{s.returned ? `, back ${s.returned}` : ''} · on hand {s.on_hand}
                            </SelectItem>
                          ))}
                          {l.stock.length === 0 && warehouse.filter((w) => sameUnit(l, w.unit)).map((w) => (
                            <SelectItem key={w.id} value={w.id}>{w.name}{w.sku ? ` (${w.sku})` : ''} · on hand {w.qty_on_hand ?? 0}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-8 w-24 text-right text-xs tabular-nums"
                        inputMode="decimal"
                        aria-label="Return quantity"
                        placeholder="qty"
                        value={r.qty}
                        disabled={!r.include}
                        onChange={(e) => setRow(l.line_number, { qty: e.target.value })}
                      />
                    </div>
                  </div>
                );
              })}
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
            <Button onClick={() => { onOpenChange(false); navigate(deliveryNoteUrl(openDraftId)); }}>Open the draft</Button>
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
