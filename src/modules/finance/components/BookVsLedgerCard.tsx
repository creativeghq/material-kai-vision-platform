import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
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

export const BookVsLedgerCard: React.FC<{ workspaceId: string; from: string; to: string }> = ({ workspaceId, from, to }) => {
  const [rows, setRows] = useState<BookVsLedgerRow[] | null>(null);
  const [failed, setFailed] = useState(false);

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
    <Card>
      <CardHeader>
        <CardTitle>AADE's book against our ledger</CardTitle>
        <CardDescription>
          Each month as AADE books it, beside what the platform holds under a MARK: income is issued invoices less
          credit notes, expenses are the received myDATA documents. {differs > 0 ? `${differs} month(s) differ.` : ''}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
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
      </CardContent>
    </Card>
  );
};
