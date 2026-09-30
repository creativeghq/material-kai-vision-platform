/**
 * Samples out with customers (#427).
 *
 * "A borrowed sample with a follow-up date is a warm lead. A borrowed sample nobody wrote down is
 * just missing inventory." So a loan with no due date is shown as its own failure, not sorted to
 * the bottom of the list: it can never be overdue, which is not the same as being on time.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, AlertTriangle, PackageOpen, Plus, Check } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/core/ui/table';
import {
  HubEmptyState, HubFilterSelect, HubResetFilters, HubSortButton, HubToolbar, HUB_FILTER_ALL, useHubTable,
  type HubTableField,
} from '@/components/core/hub';
import { useToast } from '@/hooks/use-toast';
import { localISODateOffset, todayLocalISO } from '@/utils/datetime';
import {
  sampleLoanService, LOAN_STATUS_LABEL, describeLoan, loanIsOverdue, loanIsUnchaseable,
  type SampleLoanRow, type LoanPosition, type SampleLoanItem, type LoanStatus,
} from '@/modules/crm/services/sampleLoanService';

const statusLabel = (v: string) => LOAN_STATUS_LABEL[v as LoanStatus] ?? v;

export const SampleLoansCard: React.FC<{
  workspaceId: string;
  companyId?: string | null;
}> = ({ workspaceId, companyId }) => {
  // The operator's day, passed into the pure rules so they stay import-free and there is still
  // exactly one local-day derivation in the app.
  const today = todayLocalISO();
  const { toast } = useToast();
  const [loans, setLoans] = useState<SampleLoanRow[]>([]);
  const [position, setPosition] = useState<LoanPosition | null>(null);
  // What each loan actually holds. "Who took them" without "what they took" is half a record, and
  // the half that cannot be reconciled against a shelf.
  const [items, setItems] = useState<Record<string, SampleLoanItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState({
    borrower: '',
    items: '',
    // Two weeks is a starting point, not a rule — but it is a DATE, which is the whole point.
    dueBackOn: localISODateOffset(14),
  });

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      const [ls, p] = await Promise.all([
        sampleLoanService.list(workspaceId, companyId),
        sampleLoanService.position(workspaceId).catch(() => null),
      ]);
      setLoans(ls); setPosition(p); setFailed(false);
      const entries = await Promise.all(ls.map(async (l) => [
        l.id, await sampleLoanService.itemsFor(l.id).catch(() => [] as SampleLoanItem[]),
      ] as const));
      setItems(Object.fromEntries(entries));
    } catch {
      setLoans([]); setPosition(null); setFailed(true);
    } finally { setLoading(false); }
  }, [workspaceId, companyId]);

  useEffect(() => { void load(); }, [load]);

  const fields = useMemo<HubTableField<SampleLoanRow>[]>(() => [
    {
      id: 'borrower',
      sortValue: (l) => l.borrower_name,
      searchText: (l) => `${l.borrower_name ?? ''} ${(items[l.id] ?? []).map((i) => i.description).join(' ')}`,
    },
    { id: 'loaned_on', sortValue: (l) => l.loaned_on },
    {
      id: 'status', sortValue: (l) => l.status, filterValue: (l) => l.status,
      filterLabel: 'State', filterOptionLabel: statusLabel,
    },
  ], [items]);
  const t = useHubTable(loans, fields);
  const sortHead = (id: string, label: string) => (
    <HubSortButton active={t.sort?.columnId === id ? t.sort.direction : undefined} onClick={() => t.toggleSort(id)}>
      {label}
    </HubSortButton>
  );
  const ariaSort = (id: string) =>
    t.sort?.columnId === id ? (t.sort.direction === 'asc' ? 'ascending' : 'descending') : undefined;

  const lend = async () => {
    const items = draft.items.split(',').map((s) => s.trim()).filter(Boolean);
    if (items.length === 0) return;
    setBusy(true);
    try {
      await sampleLoanService.lend({
        workspaceId,
        companyId: companyId ?? null,
        borrowerName: draft.borrower.trim() || null,
        dueBackOn: draft.dueBackOn || null,
        items: items.map((description) => ({ description })),
      });
      setDraft((d) => ({ ...d, borrower: '', items: '' }));
      await load();
      toast({ title: 'Samples booked out' });
    } catch (err: unknown) {
      toast({
        title: 'Could not book the samples out',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  const close = async (id: string, status: 'returned' | 'written_off') => {
    setBusy(true);
    try { await sampleLoanService.close(id, status); await load(); }
    catch (err: unknown) {
      toast({
        title: 'Could not close the loan',
        description: err instanceof Error ? err.message : String(err),
        variant: 'destructive',
      });
    } finally { setBusy(false); }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageOpen className="h-4 w-4 text-primary" /> Samples out
        </CardTitle>
        <CardDescription>
          Who took them, what they took, and when they are due back. Logged against the customer
          rather than a notebook, which is what makes it a lead instead of missing stock.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading loans…
          </p>
        )}

        {!loading && failed && (
          <p className="flex items-start gap-2 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            The sample loans could not be read just now. That is not a statement that nothing is
            out.
          </p>
        )}

        {!loading && !failed && position && (
          <p
            className={`rounded-md border p-2 text-xs ${
              position.status === 'overdue'
                ? 'border-amber-500/40 bg-amber-500/5 text-amber-800 dark:text-amber-300'
                : 'border-hairline bg-surface-sunken text-muted-foreground'
            }`}
          >
            {position.reason}
            {position.conversion_rate != null && (
              <span className="ml-1 tabular-nums">
                {Math.round(position.conversion_rate * 100)}% of finished loans became orders.
              </span>
            )}
          </p>
        )}

        {!loading && !failed && loans.length === 0 && (
          <HubEmptyState
            title="No samples out"
            description="A sample nobody wrote down is missing inventory, and the customer who took it is not a lead."
            action={(
              <Button size="sm" onClick={() => setDraft((d) => ({ ...d, items: '' }))}>
                <Plus className="mr-2 h-3.5 w-3.5" /> Book samples out
              </Button>
            )}
          />
        )}

        {loans.length > 0 && (
          <div className="overflow-hidden rounded-md border border-hairline">
            {loans.length > 8 && (
              <HubToolbar
                search={t.search}
                onSearchChange={t.setSearch}
                searchPlaceholder="Search borrowers or samples"
                filters={(
                  <>
                    <HubFilterSelect
                      label="State"
                      value={t.filters.status ?? HUB_FILTER_ALL}
                      options={t.filterOptions.status}
                      onChange={(v) => t.setFilter('status', v)}
                    />
                    <HubResetFilters count={t.activeFilterCount} onReset={t.reset} />
                  </>
                )}
              />
            )}
          <div className="table-scroll">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead aria-sort={ariaSort('borrower')}>{sortHead('borrower', 'Borrower')}</TableHead>
                  <TableHead aria-sort={ariaSort('loaned_on')} className="hidden sm:table-cell">
                    {sortHead('loaned_on', 'Out since')}
                  </TableHead>
                  <TableHead aria-sort={ariaSort('status')}>{sortHead('status', 'State')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {t.rows.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={4} className="p-0">
                      <HubEmptyState
                        variant="filtered"
                        title="No loans match"
                        action={<Button size="sm" variant="outline" onClick={t.reset}>Clear filters</Button>}
                      />
                    </TableCell>
                  </TableRow>
                )}
                {t.rows.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="max-w-[20rem] break-words">
                      {l.borrower_name ?? '—'}
                      <span className="block text-[11px] text-muted-foreground">
                        {(items[l.id] ?? []).map((i) => i.description).join(', ') || 'nothing listed'}
                      </span>
                    </TableCell>
                    <TableCell className="hidden tabular-nums sm:table-cell">{l.loaned_on}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          loanIsUnchaseable(l) || loanIsOverdue(l, today)
                            ? 'warning'
                            : l.status === 'converted' ? 'success' : 'neutral'
                        }
                      >
                        {LOAN_STATUS_LABEL[l.status]}
                      </Badge>
                      <span className="ml-2 text-[11px] text-muted-foreground">{describeLoan(l, today)}</span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {l.status === 'out' && (
                        <>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => close(l.id, 'returned')}>
                            <Check className="mr-1 h-3 w-3" /> Back
                          </Button>
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => close(l.id, 'written_off')}>
                            Gone
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          </div>
        )}

        <div className="flex flex-wrap items-end gap-2 rounded-md border border-hairline p-2">
          <div>
            <Label htmlFor="loan-borrower" className="text-[11px]">Who took them</Label>
            <Input
              id="loan-borrower" className="mt-1 h-8 w-44 text-xs" value={draft.borrower}
              onChange={(e) => setDraft((d) => ({ ...d, borrower: e.target.value }))}
            />
          </div>
          <div>
            <Label htmlFor="loan-items" className="text-[11px]">What they took</Label>
            <Input
              id="loan-items" className="mt-1 h-8 w-72 text-xs" value={draft.items}
              onChange={(e) => setDraft((d) => ({ ...d, items: e.target.value }))}
              placeholder="60x60 beige matt, 30x60 white gloss"
            />
          </div>
          <div>
            <Label htmlFor="loan-due" className="text-[11px]">Due back</Label>
            <Input
              id="loan-due" type="date" className="mt-1 h-8 w-40 text-xs" value={draft.dueBackOn}
              onChange={(e) => setDraft((d) => ({ ...d, dueBackOn: e.target.value }))}
            />
          </div>
          <Button size="sm" onClick={lend} disabled={busy || !draft.items.trim()}>
            <Plus className="mr-1 h-3 w-3" /> Book out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
