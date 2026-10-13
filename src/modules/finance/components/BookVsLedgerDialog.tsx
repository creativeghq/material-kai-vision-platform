import React, { useEffect, useState } from 'react';
import { Loader2, Scale } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { formatMoney } from '@/utils/decimal';
import { mydataBookService, type BookVsLedgerRow } from '@/modules/finance/services/mydataBookService';

const VERDICT: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'info' | 'neutral' }> = {
  matches: { label: 'Matches', variant: 'success' },
  differs: { label: 'Differs', variant: 'error' },
  outside_ledger: { label: 'Issued elsewhere', variant: 'info' },
  not_collected: { label: 'Not read yet', variant: 'neutral' },
  not_connected: { label: 'Not connected', variant: 'neutral' },
  collector_failed: { label: 'Read failed', variant: 'warning' },
};

const monthLabel = (iso: string) => new Date(`${iso.slice(0, 7)}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

/** Toolbar button that opens AADE's book against the platform's ledger, month by month. */
export const BookVsLedgerDialog: React.FC<{ workspaceId: string; from: string; to: string }> = ({ workspaceId, from, to }) => {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<BookVsLedgerRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Loaded with the page, not on open, so the button can say how many months differ.
  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setFailed(false);
    mydataBookService.getBookVsLedger(workspaceId, from, to)
      .then((r) => { if (!cancelled) setRows(r); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [workspaceId, from, to]);

  const differs = (rows ?? []).filter((r) => r.verdict === 'differs').length;

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Scale className="mr-1 h-3.5 w-3.5" />
        Compare with ledger
        {differs > 0 && <Badge variant="error" className="ml-2">{differs} differ</Badge>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>AADE&apos;s book against our ledger</DialogTitle>
            <DialogDescription>
              Each month as AADE books it, beside what the platform holds under a MARK. Income is our issued invoices
              less credit notes; expenses are the received myDATA documents. A month matches when the two net figures
              are within €1. {differs > 0 ? `${differs} month(s) differ.` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto rounded-sm border border-hairline">
            {failed ? (
              <p className="px-4 py-3 text-sm text-amber-800 dark:text-amber-300">The comparison could not be loaded. It is unknown, not matching.</p>
            ) : rows === null ? (
              <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Book</TableHead>
                    <TableHead className="text-right">AADE net</TableHead>
                    <TableHead className="text-right">Our net</TableHead>
                    <TableHead className="text-right">Difference</TableHead>
                    <TableHead>Verdict</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => {
                    const v = VERDICT[r.verdict] ?? { label: 'Unknown', variant: 'neutral' as const };
                    return (
                      <TableRow key={`${r.month}-${r.direction}`}>
                        <TableCell className="whitespace-nowrap">{monthLabel(r.month)}</TableCell>
                        <TableCell className="capitalize">{r.direction}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.aade_net === null ? '—' : formatMoney(r.aade_net, 'EUR')}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatMoney(r.ledger_net, 'EUR')}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.net_difference === null ? '—' : formatMoney(r.net_difference, 'EUR')}</TableCell>
                        <TableCell><Badge variant={v.variant}>{v.label}</Badge></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
