import React, { useMemo, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { FormField, FormSection } from '@/components/core/ui/form-layout';
import { useToast } from '@/hooks/use-toast';
import { formatMoney } from '@/modules/finance/services/financeService';
import {
  partyBalancesService, type OpeningImportInput, type OpeningImportRow, type PartySide,
} from '@/modules/finance/services/partyBalancesService';
import { parseDecimal } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';

const STATUS_BADGE: Record<OpeningImportRow['status'], { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' }> = {
  ready: { label: 'Ready', variant: 'info' },
  saved: { label: 'Saved', variant: 'success' },
  no_company: { label: 'No company', variant: 'warning' },
  ambiguous: { label: 'Ambiguous', variant: 'warning' },
  invalid: { label: 'Invalid', variant: 'error' },
};

/** DD/MM/YYYY or YYYY-MM-DD → YYYY-MM-DD; anything else is passed through for the server to refuse. */
function isoDate(raw: string): string {
  const s = raw.trim();
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return s;
}

/** One CSV line into cells; a quoted cell may hold the delimiter, and "" inside quotes is a quote. */
function splitCsvLine(line: string, delim: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') quoted = false; else cur += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { cells.push(cur.trim()); cur = ''; } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}

const cleanAmount = (raw: string | undefined) => parseDecimal((raw ?? '').replace(/[€$£\s]|EUR|USD|GBP/gi, ''));

/**
 * Columns: vat, as_of, amount, [currency], [note]. Only a FIRST line with no digit in its amount
 * cell is a header; any other unreadable amount is sent on and comes back from the server as invalid.
 */
function parseRows(text: string): { rows: OpeningImportInput[]; skippedHeader: boolean } {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return { rows: [], skippedHeader: false };
  const first = lines[0];
  const count = (c: string) => first.split(c).length - 1;
  const delim = count('\t') > 0 ? '\t' : count(';') >= count(',') && count(';') > 0 ? ';' : ',';
  const rows: OpeningImportInput[] = [];
  let skippedHeader = false;
  lines.forEach((line, i) => {
    const cells = splitCsvLine(line, delim);
    if (i === 0 && !/\d/.test(cells[2] ?? '')) { skippedHeader = true; return; }
    const amount = cleanAmount(cells[2]);
    rows.push({
      vat: cells[0] ?? '',
      as_of: isoDate(cells[1] ?? ''),
      amount: amount ?? (cells[2] ?? ''),
      currency: cells[3] || undefined,
      note: cells[4] || undefined,
    });
  });
  return { rows, skippedHeader };
}

export const ImportOpeningBalancesDialog: React.FC<{
  workspaceId: string;
  side: PartySide;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported: () => void;
}> = ({ workspaceId, side, open, onOpenChange, onImported }) => {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<OpeningImportRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const { rows, skippedHeader } = useMemo(() => parseRows(text), [text]);
  const ready = preview?.filter((r) => r.status === 'ready').length ?? 0;

  const readFile = async (f: File | undefined) => {
    if (!f) return;
    setText(await f.text());
    setPreview(null);
  };

  const run = async (commit: boolean) => {
    if (rows.length === 0) { toast({ title: 'Nothing to import', description: 'Paste or upload at least one row.', variant: 'destructive' }); return; }
    setBusy(true);
    try {
      const res = await partyBalancesService.importOpeningBalances({ workspaceId, side, rows, commit });
      setPreview(res);
      if (commit) {
        const saved = res.filter((r) => r.status === 'saved').length;
        toast({ title: `${saved} opening ${saved === 1 ? 'balance' : 'balances'} saved` });
        onImported();
      }
    } catch (err) {
      toast({ title: 'Import failed', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const who = side === 'supplier' ? 'supplier' : 'customer';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import {who} opening balances</DialogTitle>
          <DialogDescription>
            One row per {who}, matched to a CRM company by VAT number. A positive amount means
            {side === 'supplier' ? ' we owe them' : ' they owe us'}; a negative one, the other way. Nothing is
            invoiced or filed, and an existing opening balance for the same {who} is replaced.
          </DialogDescription>
        </DialogHeader>

        <FormSection title="Rows" description="Columns: VAT, date (YYYY-MM-DD or DD/MM/YYYY), amount, currency (optional), note (optional). Comma, semicolon or tab separated.">
          <FormField label="CSV">
            <Textarea rows={6} value={text} className="font-mono text-xs"
              onChange={(e) => { setText(e.target.value); setPreview(null); }}
              placeholder={'094012345;30/09/2026;4210,00;EUR;Statement of 3/10\n801234567;30/09/2026;-150'} />
          </FormField>
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-primary hover:underline">
            <Upload className="h-3.5 w-3.5" /> Upload a .csv file
            <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => { void readFile(e.target.files?.[0]); }} />
          </label>
          <p className="text-xs text-muted-foreground">
            {rows.length} {rows.length === 1 ? 'row' : 'rows'} read{skippedHeader ? ', first line taken as the header' : ''}.
          </p>
        </FormSection>

        {preview && (
          <div className="table-scroll max-h-72 rounded-sm border border-hairline">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface-sunken text-xs text-muted-foreground">
                <tr className="border-b border-hairline">
                  <th className="px-3 py-1.5 text-left font-semibold">#</th>
                  <th className="px-3 py-1.5 text-left font-semibold">VAT</th>
                  <th className="px-3 py-1.5 text-left font-semibold">Company</th>
                  <th className="px-3 py-1.5 text-left font-semibold">As of</th>
                  <th className="px-3 py-1.5 text-right font-semibold">Amount</th>
                  <th className="px-3 py-1.5 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr key={r.row_no} className="border-b border-hairline">
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{r.row_no}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{r.vat ?? '—'}</td>
                    <td className="px-3 py-1.5">{r.company_name ?? '—'}</td>
                    <td className="px-3 py-1.5">{r.as_of ? formatDate(r.as_of) : '—'}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.amount == null ? '—' : formatMoney(r.amount, r.currency)}</td>
                    <td className="px-3 py-1.5">
                      <Badge variant={STATUS_BADGE[r.status].variant}>{STATUS_BADGE[r.status].label}</Badge>
                      {r.message && <span className="ml-2 text-xs text-muted-foreground">{r.message}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {!preview || preview.some((r) => r.status === 'saved') ? (
            <Button disabled={busy || rows.length === 0} onClick={() => { void run(false); }}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Check rows
            </Button>
          ) : (
            <Button disabled={busy || ready === 0} onClick={() => { void run(true); }}>
              {busy && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save {ready} ready {ready === 1 ? 'row' : 'rows'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
