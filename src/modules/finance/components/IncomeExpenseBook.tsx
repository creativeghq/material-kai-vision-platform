/** Βιβλίο Εσόδων-Εξόδων, per document, as AADE holds it and the accountant classified it. */
import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, BookOpen, FileSpreadsheet, Loader2, Printer } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { HubEmptyState, HubTabNav } from '@/components/core/hub';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import { formatMoney } from '@/utils/decimal';
import {
  incomeExpenseBookService,
  type AadeCheck,
  type BookDirection,
  type BookFigures,
  type BookSide,
  type IncomeExpenseBook as Book,
} from '@/modules/finance/services/incomeExpenseBookService';
import {
  BOOK_TITLE,
  bookAmount,
  bookDate,
  bookMonthName,
  buildBookPrintHtml,
  buildBookSpreadsheetXml,
  downloadBlob,
  openPrintable,
} from '@/modules/finance/utils/incomeExpenseBookExport';

interface Props {
  workspaceId: string;
  from: string;
  to: string;
  /** Bumped by the parent after a refresh from AADE, so the book re-reads. */
  reloadToken: number;
  onRefresh: () => void;
  refreshing: boolean;
}

const AadeCheckBadge: React.FC<{ check: AadeCheck }> = ({ check }) => {
  if (check.status === 'matches') return <Badge variant="success">Matches AADE</Badge>;
  if (check.status === 'differs' && 'difference' in check) {
    return (
      <Badge variant="warning" title={`AADE net ${formatMoney(check.aade_net)} · documents ${formatMoney(check.book_net)}`}>
        Differs from AADE by {formatMoney(check.difference)}
      </Badge>
    );
  }
  if (check.status === 'not_fetched') return <Badge variant="neutral">AADE total not fetched</Badge>;
  return <Badge variant="neutral">AADE total unavailable</Badge>;
};

const Figures: React.FC<{ side: BookSide; f: BookFigures; withheld: boolean }> = ({ side, f, withheld }) => (
  <>
    <TableCell className="text-right tabular-nums">{bookAmount(f.total)}</TableCell>
    <TableCell className="text-right tabular-nums">{bookAmount(f.net)}</TableCell>
    {side.columns.map((c) => (
      <TableCell
        key={c.key}
        className={`text-right tabular-nums ${c.key === 'unclassified' ? 'text-amber-800 dark:text-amber-300' : ''}`}
      >
        {bookAmount(f.cols?.[c.key], true)}
      </TableCell>
    ))}
    <TableCell className="text-right tabular-nums">{bookAmount(f.vat)}</TableCell>
    {withheld && <TableCell className="text-right tabular-nums">{bookAmount(f.withheld)}</TableCell>}
  </>
);

export const IncomeExpenseBook: React.FC<Props> = ({ workspaceId, from, to, reloadToken, onRefresh, refreshing }) => {
  const { toast } = useToast();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dir, setDir] = useState<BookDirection>('expense');

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    setError(null);
    try {
      setBook(await incomeExpenseBookService.load(workspaceId, from, to));
    } catch (err) {
      setBook(null);
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, from, to]);

  useEffect(() => { void load(); }, [load, reloadToken]);

  const fileStem = `vivlio-esodon-exodon-${from}-to-${to}`;
  const print = () => { if (book) openPrintable(buildBookPrintHtml(book, ['income', 'expense'])); };
  const excel = () => {
    if (!book) return;
    downloadBlob(buildBookSpreadsheetXml(book, ['income', 'expense']), 'application/vnd.ms-excel', `${fileStem}.xls`);
    toast({ title: 'Excel file downloaded' });
  };

  const side = book?.[dir];
  const withheld = dir === 'income';
  const notFetched = !!book && book.sources.issued_documents.count === 0 && book.sources.classifications.count === 0;
  const fetchedAt = book?.sources.classifications.fetched_at ?? book?.sources.issued_documents.fetched_at ?? null;

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Income–expense book</CardTitle>
          <CardDescription>
            Βιβλίο Εσόδων-Εξόδων · {formatDate(from)} — {formatDate(to)} · every document AADE holds, split by
            the category your accountant filed in myDATA
            {fetchedAt ? <> · Read from AADE on <span className="text-foreground">{formatDate(fetchedAt)}</span></> : ' · Never read from AADE'}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={!book || loading} onClick={print}>
            <Printer className="mr-1 h-3.5 w-3.5" /> Print / PDF
          </Button>
          <Button size="sm" variant="outline" disabled={!book || loading} onClick={excel}>
            <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel
          </Button>
        </div>
      </CardHeader>

      {book && !notFetched && (
        <HubTabNav
          aria-label="Book side"
          className="px-4"
          activeId={dir}
          onSelect={(id) => setDir(id as BookDirection)}
          items={(['expense', 'income'] as const).map((d) => ({ id: d, label: BOOK_TITLE[d].en, count: book[d].totals.docs }))}
        />
      )}

      {side && side.totals.unclassified_docs > 0 && (
        <CardContent className="border-b border-hairline py-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          {side.totals.unclassified_docs} {side.totals.unclassified_docs === 1 ? 'document is' : 'documents are'} not yet
          classified by your accountant in myDATA. Their amounts sit in “Not classified in myDATA” until that is filed.
        </CardContent>
      )}

      <CardContent className="p-0">
        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Reading the book…
          </div>
        ) : error ? (
          <HubEmptyState
            icon={AlertTriangle}
            title="Could not read the book"
            description={error}
            action={<Button size="sm" variant="outline" onClick={() => void load()}>Try again</Button>}
          />
        ) : notFetched ? (
          <HubEmptyState
            icon={BookOpen}
            title="Not read from AADE yet"
            description="The book is built from your documents and your accountant's classifications as AADE holds them. Read them for this period."
            action={<Button size="sm" onClick={onRefresh} disabled={refreshing}>Refresh from AADE</Button>}
          />
        ) : side && side.totals.docs === 0 ? (
          <HubEmptyState
            icon={BookOpen}
            title={`No ${BOOK_TITLE[dir].en.toLowerCase()} documents in this period`}
            description="AADE holds nothing for this side of the book in the selected range."
            variant="filtered"
          />
        ) : side ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Document</TableHead>
                <TableHead>Counterparty</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Net</TableHead>
                {side.columns.map((c) => (
                  <TableHead key={c.key} className="text-right" title={c.label_el}>{c.label}</TableHead>
                ))}
                <TableHead className="text-right">VAT</TableHead>
                {withheld && <TableHead className="text-right">Withheld</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {side.months.map((m, i) => (
                <React.Fragment key={m.month}>
                  {i > 0 && m.rows.length > 0 && (
                    <TableRow className="text-muted-foreground">
                      <TableCell colSpan={3} className="italic">Brought forward</TableCell>
                      <Figures side={side} f={side.months[i - 1].carried} withheld={withheld} />
                    </TableRow>
                  )}
                  {m.rows.map((r) => (
                    <TableRow key={r.mark}>
                      <TableCell className="whitespace-nowrap tabular-nums">{bookDate(r.issue_date)}</TableCell>
                      <TableCell className="whitespace-nowrap" title={`MARK ${r.mark} · type ${r.doc_type}`}>
                        {r.number ?? '—'}
                      </TableCell>
                      <TableCell className="min-w-[220px]">
                        {r.party}
                        {r.party_vat && <span className="ml-1 text-xs text-muted-foreground">{r.party_vat}</span>}
                      </TableCell>
                      <Figures side={side} f={r} withheld={withheld} />
                    </TableRow>
                  ))}
                  <TableRow className="bg-surface-sunken font-semibold">
                    <TableCell colSpan={3}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{bookMonthName(m.month, 'en')} · {m.totals.docs} docs</span>
                        <AadeCheckBadge check={m.aade_check} />
                      </div>
                    </TableCell>
                    <Figures side={side} f={m.totals} withheld={withheld} />
                  </TableRow>
                </React.Fragment>
              ))}
              <TableRow className="bg-surface-sunken font-semibold">
                <TableCell colSpan={3}>Period total · {side.totals.docs} docs</TableCell>
                <Figures side={side} f={side.totals} withheld={withheld} />
              </TableRow>
            </TableBody>
          </Table>
        ) : null}
      </CardContent>

      {side && dir === 'expense' && (
        <CardContent className="border-t border-hairline pt-3 text-xs text-muted-foreground">
          Payroll and rent appear once your accountant files them with AADE (myDATA 17.1 and 16.1) — payroll is
          usually filed once, at year end. Where an expense was filed including its non-deductible VAT, that VAT is
          counted in the expense, as your accountant books it. The monthly check compares the documents with AADE&apos;s
          own book, which leaves payroll entries out.
        </CardContent>
      )}
    </Card>
  );
};
