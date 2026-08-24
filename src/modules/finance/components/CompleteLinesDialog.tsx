/**
 * Say what was actually on a document that arrived without lines.
 *
 * Two thirds of the received documents in this workspace (1,161 of 1,769) carry lines with a
 * value and no name — every `14.x` foreign purchase by construction, and most `2.x` Greek service
 * billing besides. AADE has the money; nobody transmitted the detail. So every consumer that keys
 * on `lines[].item_description` — warehouse receive, AI product extraction, catalog products, the
 * markup ladder — correctly skips them, and the purchase never reaches stock.
 *
 * The document has no lines. The TRANSACTION did, and the operator knows what they ordered.
 *
 * Design, and the reason it is safe:
 *   - `total_net` is the ANCHOR. Transmitted, carries a MARK, not editable, and the typed lines
 *     must foot to it. Without that rule the document would state two different amounts for one
 *     purchase, both of them valid numbers.
 *   - Paste, don't fill in. `parseSupplierLine` already reads "AMALFI GRIS 80X80 A' -3 -1" into an
 *     80×80 tile at €16.51/m², so the operator pastes what the supplier's PDF says and corrects
 *     the odd field, rather than filling a form per line.
 *   - Offered on `lines_source='none'` and nowhere else. A `1.1`'s lines came under the supplier's
 *     own MARK; rewriting those would make our records diverge from the tax record.
 */
import React, { useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Wand2 } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/modules/finance/services/financeService';
import { inboundService, type InboundDocument } from '@/modules/finance/services/inboundService';
import { parseSupplierLine } from '@/modules/finance/utils/parseSupplierLine';
import { footLines, isBlankLine, type DraftLine } from '@/modules/finance/utils/lineFooting';
import { isReverseCharged } from '@/modules/finance/utils/inboundProvenance';
import { UNITS, unitDef } from '@/lib/units';
import { parseDecimalOr, round2 } from '@/utils/decimal';

const blankLine = (): DraftLine => ({
  item_description: '', unit: null, item_code: null,
  quantity: null, net_value: null, vat_category: null, vat_amount: null,
});

/** A pasted block: one line per row, tab- or multi-space-separated columns if they are there. */
function linesFromPaste(text: string, issuerName: string | null): DraftLine[] {
  return text
    .split(/\r?\n/)
    .map((row) => row.trim())
    .filter(Boolean)
    .map((row) => {
      // Trailing numbers are conventionally quantity then value on every supplier PDF we have
      // seen. Split on tabs first (a real paste from a table), then on runs of 2+ spaces.
      const cols = row.includes('\t') ? row.split('\t') : row.split(/\s{2,}/);
      let description = row;
      let quantity: number | null = null;
      let net: number | null = null;
      if (cols.length >= 2) {
        const nums = cols.slice(1).map((c) => parseDecimalOr(c.trim(), NaN)).filter((n) => !Number.isNaN(n));
        description = cols[0].trim();
        if (nums.length >= 2) { quantity = nums[nums.length - 2]; net = nums[nums.length - 1]; }
        else if (nums.length === 1) { net = nums[0]; }
      }
      const parsed = parseSupplierLine({
        description, quantity, netValue: net, defaultManufacturer: issuerName,
      });
      return {
        item_description: description,
        // The parser's inference, shown as an editable field — never applied silently.
        unit: parsed.unit ?? null,
        item_code: parsed.supplier_product_code ?? null,
        quantity, net_value: net, vat_category: null, vat_amount: null,
      };
    });
}

export const CompleteLinesDialog: React.FC<{
  doc: InboundDocument;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}> = ({ doc, onOpenChange, onDone }) => {
  const { toast } = useToast();
  const [rows, setRows] = useState<DraftLine[]>([blankLine()]);
  const [paste, setPaste] = useState('');
  const [saving, setSaving] = useState(false);

  const verdict = useMemo(() => footLines(rows, doc.total_net), [rows, doc.total_net]);
  const reverseCharged = isReverseCharged(doc.doc_type);

  const setRow = (i: number, patch: Partial<DraftLine>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const applyPaste = () => {
    const parsed = linesFromPaste(paste, doc.issuer_name);
    if (parsed.length === 0) {
      toast({ title: 'Nothing to read', description: 'Paste one line per row.', variant: 'destructive' });
      return;
    }
    setRows(parsed);
    setPaste('');
  };

  /** Put the outstanding difference on one line, so footing is a deliberate act and not a fudge
   *  applied behind the operator. Only offered when there is exactly one thing it could mean. */
  const balanceOnto = (i: number) => {
    const current = rows[i].net_value ?? 0;
    setRow(i, { net_value: round2(current - verdict.difference) });
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = rows.filter((r) => !isBlankLine(r)).map((r) => ({
        item_description: r.item_description.trim(),
        item_code: r.item_code,
        quantity: r.quantity,
        // The canonical unit key becomes the AADE code the rest of the pipeline reads. A unit
        // with no myDATA code (box, pallet, set) sends null rather than inventing one.
        measurement_unit: unitDef(r.unit)?.mydataCode ?? null,
        net_value: r.net_value,
        vat_category: r.vat_category,
        vat_amount: r.vat_amount,
      }));
      const res = await inboundService.setLines(doc.id, payload);
      toast({
        title: 'Detail added',
        description: `${res.lines} line${res.lines === 1 ? '' : 's'} recorded — this document can now be received into the warehouse.`,
      });
      onDone();
    } catch (err: any) {
      // The server re-checks everything this dialog checks; when it disagrees, its wording is the
      // one that explains why, so it is shown rather than a generic failure.
      toast({ title: 'Could not save the lines', description: err?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Add line detail</DialogTitle>
          <DialogDescription>
            {doc.issuer_name ?? doc.issuer_vat ?? 'This document'} sent a total but no itemised lines.
            Say what was on it and the total must match {formatMoney(doc.total_net ?? 0, doc.currency)}
            {reverseCharged ? ' — the net, which on a reverse-charged purchase is also what you owe.' : '.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="paste" className="text-xs">Paste from the supplier's invoice</Label>
            <Textarea
              id="paste" rows={3} value={paste} onChange={(e) => setPaste(e.target.value)}
              placeholder={'AMALFI GRIS 80X80 A\'\t17.92\t295.86\nMARAZZI TREVERK 20X120\t9.6\t184.32'}
              className="font-mono text-xs"
            />
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                One line per row. Description, then quantity, then net — sizes, units and article codes are read out of the text.
              </p>
              <Button type="button" size="sm" variant="outline" onClick={applyPaste} disabled={!paste.trim()}>
                <Wand2 className="h-3.5 w-3.5 mr-1.5" /> Read lines
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-sm border border-hairline">
            <table className="w-full text-sm">
              <thead className="bg-surface-sunken text-[11px] font-semibold text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-left w-28">Code</th>
                  <th className="px-3 py-2 text-right w-24">Qty</th>
                  <th className="px-3 py-2 text-left w-32">Unit</th>
                  <th className="px-3 py-2 text-right w-28">Net</th>
                  <th className="px-3 py-2 w-8"><span className="sr-only">Remove</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-hairline">
                    <td className="px-3 py-1.5">
                      <Input
                        value={r.item_description}
                        onChange={(e) => setRow(i, { item_description: e.target.value })}
                        placeholder="What was on this line"
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        value={r.item_code ?? ''}
                        onChange={(e) => setRow(i, { item_code: e.target.value || null })}
                        className="h-8 text-xs" placeholder="—"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        value={r.quantity ?? ''} inputMode="decimal"
                        onChange={(e) => setRow(i, { quantity: e.target.value === '' ? null : parseDecimalOr(e.target.value, 0) })}
                        className="h-8 text-xs text-right tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Select value={r.unit ?? ''} onValueChange={(v) => setRow(i, { unit: v || null })}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="—" /></SelectTrigger>
                        <SelectContent>
                          {UNITS.map((u) => <SelectItem key={u.key} value={u.key}>{u.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-3 py-1.5">
                      <Input
                        value={r.net_value ?? ''} inputMode="decimal"
                        onChange={(e) => setRow(i, { net_value: e.target.value === '' ? null : parseDecimalOr(e.target.value, 0) })}
                        className="h-8 text-xs text-right tabular-nums"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <button
                        type="button" aria-label={`Remove line ${i + 1}`}
                        className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                        onClick={() => setRows((rs) => (rs.length === 1 ? [blankLine()] : rs.filter((_, j) => j !== i)))}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-surface-sunken">
                <tr>
                  <td colSpan={4} className="px-3 py-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => setRows((rs) => [...rs, blankLine()])}>
                      <Plus className="h-3.5 w-3.5 mr-1.5" /> Add line
                    </Button>
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums font-semibold">
                    {formatMoney(verdict.linesTotal, doc.currency)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* The anchor, stated rather than implied. An operator who cannot see the target cannot
              tell a document that foots from one that is 40 cents out. */}
          <div className="flex items-start justify-between gap-4 rounded-sm border border-hairline bg-surface-sunken px-3 py-2">
            <div className="text-xs">
              <div className="text-muted-foreground">
                Document total (from AADE, not editable):{' '}
                <span className="tabular-nums font-semibold text-foreground">{formatMoney(doc.total_net ?? 0, doc.currency)}</span>
              </div>
              {verdict.problem
                ? <div className="mt-0.5 text-amber-800 dark:text-amber-300">{verdict.problem}</div>
                : <div className="mt-0.5 text-emerald-700 dark:text-emerald-400">The lines match the document.</div>}
            </div>
            {!verdict.foots && Math.abs(verdict.difference) > 0 && rows.some((r) => !isBlankLine(r)) && (
              <Button
                type="button" size="sm" variant="outline"
                onClick={() => balanceOnto(rows.findIndex((r) => !isBlankLine(r)) >= 0 ? rows.length - 1 : 0)}
                title="Put the outstanding difference on the last line"
              >
                Balance the last line
              </Button>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={!verdict.foots || saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save detail
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
