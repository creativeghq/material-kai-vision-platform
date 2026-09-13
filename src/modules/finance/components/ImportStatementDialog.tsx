/**
 * Import a statement from a bank with no API, against columns the operator maps once.
 *
 * Three steps because the middle one is the point: the file's own headers are read first, the
 * mapping is built against them, and the PREVIEW says what would import, what is already held and
 * every line that could not be read — before anything is written.
 */
import React, { useCallback, useState } from 'react';
import { AlertTriangle, FileUp, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import { Button } from '@/components/core/ui/button';
import { Label } from '@/components/core/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { useToast } from '@/hooks/use-toast';

interface Preview {
  parsed: number;
  already_held: number;
  to_import: number;
  problem_count: number;
  problems: Array<{ line: number; reason: string }>;
}

const NONE = '__none__';

/** A column picker whose options are the file's real headers — never typed by hand. */
const ColumnSelect: React.FC<{
  id: string; label: string; headers: string[];
  value: string; onChange: (v: string) => void; optional?: boolean;
}> = ({ id, label, headers, value, onChange, optional }) => (
  <div className="space-y-1">
    <Label htmlFor={id} className="text-xs">{label}{optional ? '' : ' *'}</Label>
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger id={id} className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
      <SelectContent>
        {optional && <SelectItem value={NONE}>—</SelectItem>}
        {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
      </SelectContent>
    </Select>
  </div>
);

export const ImportStatementDialog: React.FC<{
  bankAccountId: string;
  bankAccountName: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImported?: () => void;
}> = ({ bankAccountId, bankAccountName, open, onOpenChange, onImported }) => {
  const { toast } = useToast();
  const [csv, setCsv] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);

  const [dateCol, setDateCol] = useState('');
  const [amountCol, setAmountCol] = useState('');
  const [creditCol, setCreditCol] = useState('');
  const [debitCol, setDebitCol] = useState('');
  const [refCol, setRefCol] = useState('');
  const [partyCol, setPartyCol] = useState('');
  const [idCol, setIdCol] = useState('');
  const [dateFormat, setDateFormat] = useState('DD/MM/YYYY');
  const [decimalMark, setDecimalMark] = useState<'.' | ','>(',');

  const call = useCallback(async (action: string, extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.functions.invoke('bank-statement-import', {
      body: { action, bank_account_id: bankAccountId, csv, ...extra },
    });
    if (error || data?.ok === false) {
      throw new Error(data?.error || error?.message || 'The import failed.');
    }
    return data;
  }, [bankAccountId, csv]);

  const mapping = () => ({
    date_column: dateCol,
    amount_column: amountCol || null,
    credit_column: creditCol || null,
    debit_column: debitCol || null,
    reference_column: refCol || null,
    counterparty_column: partyCol || null,
    external_id_column: idCol || null,
    date_format: dateFormat,
    decimal_mark: decimalMark,
  });

  const onFile = async (file: File) => {
    const text = await file.text();
    setCsv(text);
    setPreview(null);
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('bank-statement-import', {
        body: { action: 'columns', bank_account_id: bankAccountId, csv: text },
      });
      if (error || data?.ok === false) throw new Error(data?.error || error?.message || 'Could not read that file.');
      setHeaders((data.headers ?? []) as string[]);
    } catch (e) {
      toast({ title: 'Could not read that file', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const amountMapped = !!amountCol || (!!creditCol && !!debitCol);
  const canPreview = !!csv && !!dateCol && amountMapped;

  const run = async (action: 'preview' | 'import') => {
    setBusy(true);
    try {
      const data = await call(action, { mapping: mapping() });
      if (action === 'preview') { setPreview(data as Preview); return; }
      toast({
        title: `Imported ${data.imported} transaction(s)`,
        // Say what did NOT import and why, or a partial import reads as a complete one.
        description: [
          data.already_held ? `${data.already_held} were already on file.` : '',
          data.problems ? `${data.problems} line(s) could not be read.` : '',
          data.next,
        ].filter(Boolean).join(' '),
      });
      onOpenChange(false);
      onImported?.();
    } catch (e) {
      toast({ title: 'Import failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import a statement — {bankAccountName}</DialogTitle>
          <DialogDescription>
            For an account with no API. Map the columns once; nothing is matched here, the
            reconciler does that afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="stmt-file" className="text-xs">Statement file (CSV)</Label>
            <input
              id="stmt-file" type="file" accept=".csv,text/csv,text/plain"
              className="mt-1 block w-full text-sm"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
            />
          </div>

          {headers.length > 0 && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <ColumnSelect id="c-date" label="Date" headers={headers} value={dateCol} onChange={setDateCol} />
                <div className="space-y-1">
                  <Label htmlFor="c-fmt" className="text-xs">Date format *</Label>
                  <Select value={dateFormat} onValueChange={setDateFormat}>
                    <SelectTrigger id="c-fmt" className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'].map((f) => (
                        <SelectItem key={f} value={f}>{f}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <ColumnSelect id="c-amt" label="Amount (signed)" headers={headers} value={amountCol} onChange={setAmountCol} optional />
                <div className="space-y-1">
                  <Label htmlFor="c-dec" className="text-xs">Decimal mark *</Label>
                  <Select value={decimalMark} onValueChange={(v) => setDecimalMark(v as '.' | ',')}>
                    <SelectTrigger id="c-dec" className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value=",">1.234,56</SelectItem>
                      <SelectItem value=".">1,234.56</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <ColumnSelect id="c-cr" label="Credit (money in)" headers={headers} value={creditCol} onChange={setCreditCol} optional />
                <ColumnSelect id="c-dr" label="Debit (money out)" headers={headers} value={debitCol} onChange={setDebitCol} optional />
                <ColumnSelect id="c-ref" label="Reference / description" headers={headers} value={refCol} onChange={setRefCol} optional />
                <ColumnSelect id="c-party" label="Counterparty" headers={headers} value={partyCol} onChange={setPartyCol} optional />
                <ColumnSelect id="c-id" label="Bank's transaction id" headers={headers} value={idCol} onChange={setIdCol} optional />
              </div>
              {!amountMapped && (
                <p className="text-xs text-muted-foreground">
                  Map either one signed amount column, or both a credit and a debit column — whichever
                  shape this bank exports.
                </p>
              )}
            </>
          )}

          {preview && (
            <div className="space-y-2 rounded-sm border border-hairline p-3 text-sm">
              <div className="tabular-nums">
                <strong>{preview.to_import}</strong> to import
                {preview.already_held > 0 && <> · {preview.already_held} already on file</>}
                {preview.parsed === 0 && <> · nothing parsed — check the column mapping</>}
              </div>
              {preview.problem_count > 0 && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {preview.problem_count} line(s) could not be read
                  </div>
                  <ul className="text-xs text-muted-foreground">
                    {preview.problems.slice(0, 5).map((p) => (
                      <li key={p.line}>Line {p.line}: {p.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button variant="secondary" onClick={() => void run('preview')} disabled={busy || !canPreview}>
            {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            Preview
          </Button>
          <Button onClick={() => void run('import')} disabled={busy || !preview || preview.to_import === 0}>
            <FileUp className="mr-1.5 h-4 w-4" />
            Import {preview ? preview.to_import : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportStatementDialog;
