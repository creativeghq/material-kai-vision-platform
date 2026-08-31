/**
 * Finance → Expenses by Supplier. The myDATA expenses inbox seen from the SUPPLIER end.
 *
 * This used to be a panel bolted on top of the Expenses list, where it was the first thing on the
 * screen and pushed the actual documents — the ones an operator opens that tab to read — below the
 * fold. Two lists answering two different questions do not share a surface: Expenses is "what
 * arrived", this is "who sends it and what have we decided about them".
 *
 * Three things happen here, and each is the reason the grouping exists:
 *
 *  1. FILING. 1,866 documents arrived and every one sits in the generic myAADE bucket
 *     `finance-inbound-sync` stamps on arrival. One at a time that is 1,866 decisions; by issuer
 *     it is 241, and the largest 45 carry 71% of the pile. Filing a supplier is permanent —
 *     `remember_inbound_issuer_category` records it and every later arrival files itself.
 *  2. IDENTITY. A supplier who is already a CRM company is LINKED, so their documents, their
 *     registry identity and their orders are one record rather than an ΑΦΜ on a screen. Matched on
 *     the normalised VAT key in SQL (#353 CRM-4); 37 of 241 issuers resolve today, and the other
 *     204 carry the way to fix that in the same cell. It opens [[AddIssuerToCrmDialog]] — a
 *     duplicate probe on the normalised ΑΦΜ, then the ΑΑΔΕ → ΓΕΜΗ → web research chain — never a
 *     silent create, because the ΑΑΔΕ leg writes an audit entry into the issuer's own TAXISnet
 *     inbox and that is the operator's call to make.
 *  3. HISTORY. Opening a row shows that supplier's whole run of documents in a MODAL — the same
 *     table, menu and dialogs as their CRM record ([[SupplierInboundDocs]]). Modal and not an
 *     expanding row because both lists are long (241 suppliers, up to 206 documents each), so
 *     inline the expansion pushed the rest of the queue off screen. Opening a document stacks a
 *     third layer and leaves this one MOUNTED, which is the point: read it, book it, receive it,
 *     pay it, come back to the same page of the same list.
 *
 * Every number in the table is derived by `inbound_issuers_summary`, including the counts that
 * decide what is offered. Counting the loaded page instead would be a different number on every
 * surface that showed it.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Inbox, Check, Building2, ChevronRight, ExternalLink, UserPlus, Users, CalendarDays, Coins, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge, badgeVariants } from '@/components/core/ui/badge';
import { cn } from '@/lib/utils';
import {
  FilterBar, NONE_VALUE, optionsFromRows, useFilters, type FilterGroupDef,
} from '@/components/core/filters';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { formatMoney } from '@/utils/decimal';
import { formatDate } from '@/utils/datetime';
import { FINANCE_TAB, financeTabUrl } from '@/modules/finance/routes';
import { inboundService, type ExpenseIssuerRow } from '@/modules/finance/services/inboundService';
import { SupplierInboundDocs } from '@/modules/finance/components/SupplierInboundDocs';
import { AddIssuerToCrmDialog } from '@/modules/finance/components/AddIssuerToCrmDialog';

interface CategoryOption { id: string; name: string; kind?: string | null; is_system?: boolean | null }

/**
 * The dimensions this list actually has — the shared filter engine, the same one Parties and the
 * document lists use, rather than a private search box that could only do one of these.
 *
 * Every option list is derived from the loaded rows, so it carries live counts and cannot offer a
 * value that matches nothing. Ranges are widened to a round number so the slider ends are not
 * pinned to whichever supplier happens to be the biggest today.
 */
const bound = (rows: ExpenseIssuerRow[], pick: (r: ExpenseIssuerRow) => unknown) => {
  const max = rows.reduce((m, r) => Math.max(m, Number(pick(r)) || 0), 0);
  return { min: 0, max: Math.max(Math.ceil(max / 10) * 10, 10) };
};

function buildExpenseSupplierFilters(rows: ExpenseIssuerRow[]): FilterGroupDef[] {
  const docs = bound(rows, (r) => r.docs);
  const net = bound(rows, (r) => r.total_net);
  return [
    {
      key: 'general', label: 'General', icon: Users,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search', placeholder: 'Supplier or ΑΦΜ',
          // The ΑΦΜ is matched in both spellings a person types it in — with and without
          // separators — because "143 270 771" is the same supplier as "143270771".
          accessor: (r: ExpenseIssuerRow) => [
            r.issuer_name, r.crm_company_name, r.issuer_vat, r.issuer_vat.replace(/\D/g, ''),
          ],
        },
        {
          key: 'to_file', type: 'bool', label: 'Filing',
          description: 'Documents still sitting in the generic myAADE bucket.',
          trueLabel: 'Has documents to file', falseLabel: 'Nothing to file',
          accessor: (r: ExpenseIssuerRow) => r.unfiled > 0,
        },
        {
          key: 'in_crm', type: 'bool', label: 'CRM record',
          description: 'Whether this ΑΦΜ resolves to a company in the workspace.',
          trueLabel: 'In CRM', falseLabel: 'Not in CRM',
          accessor: (r: ExpenseIssuerRow) => !!r.crm_company_id,
        },
        {
          key: 'in_books', type: 'bool', label: 'In the books',
          description: 'Whether any of their documents became a supplier bill.',
          trueLabel: 'Some in books', falseLabel: 'None in books',
          accessor: (r: ExpenseIssuerRow) => r.in_books > 0,
        },
        {
          key: 'category', type: 'multi', label: 'Files as', searchable: true,
          options: [
            ...optionsFromRows(rows, (r: ExpenseIssuerRow) => r.learned_category_name ?? undefined),
            { value: NONE_VALUE, label: 'No filing rule yet' },
          ],
          accessor: (r: ExpenseIssuerRow) => r.learned_category_name ?? undefined,
        },
      ],
    },
    {
      key: 'activity', label: 'Activity', icon: CalendarDays,
      fields: [
        {
          key: 'last_issue_date', type: 'dateRange', label: 'Last document',
          description: 'When they last issued anything against us — how to find the ones who went quiet.',
          accessor: (r: ExpenseIssuerRow) => r.last_issue_date ?? undefined,
        },
        {
          key: 'first_issue_date', type: 'dateRange', label: 'First document',
          accessor: (r: ExpenseIssuerRow) => r.first_issue_date ?? undefined,
        },
      ],
    },
    {
      key: 'size', label: 'Size', icon: Coins,
      fields: [
        {
          key: 'docs', type: 'range', label: 'Documents',
          min: docs.min, max: docs.max, accessor: (r: ExpenseIssuerRow) => r.docs,
        },
        {
          key: 'total_net', type: 'range', label: 'Net total', unit: '€',
          min: net.min, max: net.max, accessor: (r: ExpenseIssuerRow) => Number(r.total_net ?? 0),
        },
      ],
    },
  ];
}

export const ExpenseSuppliersTab: React.FC<{
  workspaceId: string | null | undefined;
  /** The workspace's finance categories — the filing destinations. */
  categories: CategoryOption[];
  /** Refresh the host's own document lists after a bulk file moves rows between buckets. */
  onFiled?: () => void;
}> = ({ workspaceId, categories, onFiled }) => {
  const { toast } = useToast();
  const { isAccountant } = usePermissions();
  const [rows, setRows] = useState<ExpenseIssuerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  /**
   * The ΑΦΜ whose documents are open. A MODAL, not an expanding row: the list is 241 rows and a
   * supplier's history is up to 206 more, so inline it pushed everything below it off the screen
   * and the operator lost the row they were working. It also stays MOUNTED while a document opens
   * on top of it, which is what keeps the page, the scroll and any half-finished form alive
   * across the whole errand.
   *
   * The KEY is held, not the row: the modal header states counts, and booking a document inside
   * it changes them. Looking the row up on every render means the header cannot go on saying
   * "None in Books" about a document the operator just booked.
   */
  const [openVat, setOpenVat] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  /** The issuer being added to CRM. Never a silent write — the dialog dedupes and researches. */
  const [addToCrm, setAddToCrm] = useState<ExpenseIssuerRow | null>(null);

  // A system category is not a filing destination — the RPC refuses it, because filing into the
  // bucket the documents are already in would move them and teach nothing.
  const fileable = useMemo(
    () => categories.filter((c) => !c.is_system && (c.kind ?? 'expense') === 'expense'),
    [categories],
  );

  const load = useCallback(async (quiet = false) => {
    if (!workspaceId) return;
    // A QUIET refresh keeps the rows on screen. Used when the supplier modal closes: work done
    // inside it changes these counts, and swapping a settled table for a spinner to say so reads
    // as the page reloading under the operator.
    if (!quiet) setLoading(true);
    try {
      setRows(await inboundService.issuersSummary(workspaceId));
      setError(null);
    } catch (e) {
      // A source that FAILED must not render as a source that is empty. A quiet refresh keeps
      // what it had rather than blanking a list the operator is still reading.
      if (!quiet) setRows([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  /** The open supplier, re-read from the current rows so the modal header follows the data. */
  const openSupplier = useMemo(
    () => (openVat ? rows.find((r) => r.issuer_vat === openVat) ?? null : null),
    [rows, openVat],
  );

  const filterGroups = useMemo(() => buildExpenseSupplierFilters(rows), [rows]);
  const { values: filterValues, setValues: setFilterValues, filtered, previewCount, reset: resetFilters } =
    useFilters<ExpenseIssuerRow>(rows, filterGroups);
  useEffect(() => { setPage((p) => clampPage(p, filtered.length)); }, [filtered.length]);
  // Any filter change narrows the list — start the narrowed set at its first page.
  useEffect(() => { setPage(1); }, [filterValues]);

  // Totals describe the WHOLE inbox, not the filtered page — that is the point of a header.
  const totals = useMemo(() => rows.reduce(
    (a, r) => ({ docs: a.docs + r.docs, unfiled: a.unfiled + r.unfiled, suppliers: a.suppliers + 1 }),
    { docs: 0, unfiled: 0, suppliers: 0 },
  ), [rows]);

  const file = async (row: ExpenseIssuerRow) => {
    const categoryId = choice[row.issuer_vat] ?? row.learned_category_id ?? '';
    if (!categoryId || !workspaceId) return;
    setBusy(row.issuer_vat);
    try {
      const moved = await inboundService.fileIssuer(workspaceId, row.issuer_vat, categoryId);
      toast({
        title: `Filed ${moved} document${moved === 1 ? '' : 's'}`,
        description: `Future invoices from ${row.issuer_name || row.issuer_vat} will file here automatically.`,
      });
      await load();
      onFiled?.();
    } catch (e) {
      toast({
        title: 'Could not file these documents',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusy(null);
    }
  };

  if (!workspaceId) return null;

  const columns = isAccountant ? 5 : 6;

  return (
    <>
    <Card>
      <CardHeader className="border-b border-hairline px-5 py-3 flex-row items-start justify-between gap-3 flex-wrap space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Building2 className="h-4 w-4 text-muted-foreground" /> Expenses by supplier
          </CardTitle>
          <p className="pt-1 text-[11px] text-muted-foreground">
            {loading
              ? 'Reading the inbox…'
              : error
                ? 'The supplier list could not be read — the figures below are missing, not zero.'
                : totals.suppliers === 0
                  ? 'Nothing has been filed against you in myDATA yet.'
                  : <>
                      {totals.docs.toLocaleString()} document{totals.docs === 1 ? '' : 's'} from {totals.suppliers.toLocaleString()} supplier{totals.suppliers === 1 ? '' : 's'}
                      {totals.unfiled > 0 ? ` · ${totals.unfiled.toLocaleString()} still to file` : ' · all filed'}.
                      {' '}Filing a supplier is permanent — the next invoice from them files itself.
                    </>}
          </p>
        </div>
        <FilterBar
          groups={filterGroups}
          values={filterValues}
          onChange={setFilterValues}
          previewCount={previewCount}
          searchPlaceholder="Supplier or ΑΦΜ"
          title="Filter suppliers"
        />
      </CardHeader>
      <CardContent className="p-0">
        {/* A source that FAILED must not render as a source that is empty. */}
        {error && (
          <div className="flex items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-300">
            <span>Could not read the supplier list — <span className="opacity-80">{error}</span>.</span>
            <Button size="sm" variant="outline" onClick={() => void load()}>Retry</Button>
          </div>
        )}
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Reading the inbox…
          </div>
        ) : (
          <>
            <div className="table-scroll">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-sunken">
                    <th className="px-5 py-2 text-left text-[11px] font-semibold text-muted-foreground">Supplier</th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground">Docs</th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground">To file</th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold text-muted-foreground">Net</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-muted-foreground">Span</th>
                    {!isAccountant && <th className="px-5 py-2 text-left text-[11px] font-semibold text-muted-foreground">File as</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.length === 0 && (
                    <tr><td colSpan={columns} className="p-0">
                      {rows.length === 0 ? (
                        <HubEmptyState
                          icon={Inbox}
                          title="No supplier documents yet"
                          description="Nothing has been filed against you in myDATA. Documents appear here after the Expenses inbox syncs — which is also where the ΑΑΔΕ connection is set up."
                          action={<Link to={financeTabUrl(FINANCE_TAB.expenses)}><Button size="sm">Open the Expenses inbox</Button></Link>}
                        />
                      ) : (
                        <HubEmptyState
                          variant="filtered"
                          title="No supplier matches"
                          description={`${rows.length} supplier${rows.length === 1 ? '' : 's'} ${rows.length === 1 ? 'is' : 'are'} in the inbox — the current filters exclude ${rows.length === 1 ? 'it' : 'them all'}.`}
                          action={<Button size="sm" variant="outline" onClick={resetFilters}>Clear filters</Button>}
                        />
                      )}
                    </td></tr>
                  )}
                  {paginate(filtered, page).map((r) => {
                    const selected = choice[r.issuer_vat] ?? r.learned_category_id ?? '';
                    return (
                      <React.Fragment key={r.issuer_vat}>
                        <tr
                          className="cursor-pointer border-b border-hairline hover:bg-muted/30"
                          // Row onClick is a MOUSE CONVENIENCE only — the keyboard/AT path is the
                          // button on the name cell. A <tr> cannot be made focusable correctly.
                          onClick={() => setOpenVat(r.issuer_vat)}
                        >
                          <td className="max-w-[24rem] px-5 py-2 text-sm">
                            <button
                              type="button"
                              className="flex w-full items-center gap-1.5 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              onClick={(e) => { e.stopPropagation(); setOpenVat(r.issuer_vat); }}
                              title="Open every document from this supplier"
                            >
                              <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate font-medium">{r.issuer_name || r.issuer_vat}</span>
                            </button>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 pl-5">
                              <span className="font-mono text-xs text-muted-foreground">{r.issuer_vat}</span>
                              {/* Their CRM record when the ΑΦΜ resolves to one, and the way to
                                  make one when it does not. Both ends of the same fact, in the
                                  cell where the operator noticed it was missing. */}
                              {r.crm_company_id ? (
                                <Link
                                  to={`/crm/companies/${r.crm_company_id}`}
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                  title={r.crm_company_name ?? undefined}
                                  // Leaving for CRM is not "open this supplier's documents".
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Building2 className="h-3 w-3" />
                                  <span className="max-w-[12rem] truncate">{r.crm_company_name || 'In CRM'}</span>
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                              ) : isAccountant ? (
                                <Badge variant="warning" className="text-[10px]">Not in CRM</Badge>
                              ) : (
                                // The warning TAG is the platform's existing word for this state
                                // (PendingProductsCard says it the same way about the same fact);
                                // rendered on a button so the tag that reports the gap is also the
                                // way to close it. `badgeVariants` rather than a <Badge> inside a
                                // <button> — a div in a button is invalid, and the tag styling has
                                // one definition either way.
                                <button
                                  type="button"
                                  className={cn(badgeVariants({ variant: 'warning' }), 'text-[10px] transition-opacity hover:opacity-80')}
                                  onClick={(e) => { e.stopPropagation(); setAddToCrm(r); }}
                                  title="Add this supplier to the platform — checks for a duplicate ΑΦΜ first, then fills their identity from ΑΑΔΕ / ΓΕΜΗ and the web"
                                >
                                  <UserPlus className="h-3 w-3" />
                                  Not in CRM — Add
                                </button>
                              )}
                              {r.learned_category_name && (
                                <Badge variant="success">
                                  <Check className="mr-1 h-3 w-3" />
                                  {r.learned_category_name}
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-sm tabular-nums">
                            {r.docs}
                            <div className="text-[10px] text-muted-foreground">
                              {r.in_books > 0 ? `${r.in_books} in Books` : 'None in Books'}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-sm tabular-nums">
                            {r.unfiled > 0
                              ? <span className="text-amber-800 dark:text-amber-300">{r.unfiled}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-3 py-2 text-right text-sm tabular-nums">
                            {r.total_net === null ? '—' : formatMoney(Number(r.total_net), r.currency || 'EUR')}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                            {r.first_issue_date ? formatDate(r.first_issue_date) : '—'}
                            {r.last_issue_date && r.last_issue_date !== r.first_issue_date
                              ? ` → ${formatDate(r.last_issue_date)}` : ''}
                          </td>
                          {!isAccountant && (
                            <td className="px-5 py-2" onClick={(e) => e.stopPropagation()}>
                              {r.unfiled === 0 ? (
                                <span className="text-xs text-muted-foreground">
                                  {r.learned_category_name ? 'Files itself' : 'Nothing to file'}
                                </span>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Select
                                    value={selected}
                                    onValueChange={(v) => setChoice((c) => ({ ...c, [r.issuer_vat]: v }))}
                                  >
                                    <SelectTrigger className="h-8 w-44 text-xs">
                                      <SelectValue placeholder="Choose a category" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {fileable.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    disabled={!selected || busy === r.issuer_vat}
                                    onClick={() => void file(r)}
                                  >
                                    {busy === r.issuer_vat
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : `File ${r.unfiled}`}
                                  </Button>
                                </div>
                              )}
                            </td>
                          )}
                        </tr>
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <TablePagination page={page} total={filtered.length} onPageChange={setPage} label="suppliers" />
          </>
        )}
      </CardContent>
    </Card>

    {/* One supplier's whole run of documents. Keyed on the ΑΦΜ so switching suppliers starts a
        fresh list rather than showing the previous one's page number over new rows. Opening a
        DOCUMENT from inside stacks another dialog on top and leaves this one mounted, so the
        errand — read it, book it, receive it, pay it — is one trip, not four round trips through
        a list that reset each time. */}
    <Dialog
      open={!!openSupplier}
      onOpenChange={(v) => { if (!v) { setOpenVat(null); void load(true); } }}
    >
      {openSupplier && (
        <DialogContent key={openSupplier.issuer_vat} className="max-w-5xl p-0">
          <DialogHeader className="border-b border-hairline px-5 py-3">
            <DialogTitle className="font-display text-base">
              {openSupplier.issuer_name || openSupplier.issuer_vat}
            </DialogTitle>
            <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="font-mono">{openSupplier.issuer_vat}</span>
              <span aria-hidden>·</span>
              <span>
                {openSupplier.docs} document{openSupplier.docs === 1 ? '' : 's'}
                {openSupplier.unfiled > 0 ? `, ${openSupplier.unfiled} to file` : ''}
                {openSupplier.in_books > 0 ? `, ${openSupplier.in_books} in Books` : ', None in Books'}
              </span>
              {openSupplier.learned_category_name && (
                <>
                  <span aria-hidden>·</span>
                  <span>Files as {openSupplier.learned_category_name}</span>
                </>
              )}
              <span aria-hidden>·</span>
              {openSupplier.crm_company_id ? (
                <Link
                  to={`/crm/companies/${openSupplier.crm_company_id}`}
                  className="inline-flex items-center gap-1 text-primary hover:underline"
                >
                  <Building2 className="h-3 w-3" />
                  {openSupplier.crm_company_name || 'Open in CRM'}
                  <ExternalLink className="h-3 w-3" />
                </Link>
              ) : isAccountant ? (
                <Badge variant="warning" className="text-[10px]">Not in CRM</Badge>
              ) : (
                <button
                  type="button"
                  className={cn(badgeVariants({ variant: 'warning' }), 'text-[10px] transition-opacity hover:opacity-80')}
                  onClick={() => setAddToCrm(openSupplier)}
                  title="Add this supplier to the platform — checks for a duplicate ΑΦΜ first, then fills their identity from ΑΑΔΕ / ΓΕΜΗ and the web"
                >
                  <UserPlus className="h-3 w-3" />
                  Not in CRM — Add
                </button>
              )}
              {/* The account card — bills, orders, PAYMENTS, the running ledger and the emailed
                  statement. It is keyed on the CRM party, so it exists only once the ΑΦΜ resolves
                  to one: offering it before then would open a page about nobody. */}
              {openSupplier.crm_company_id && (
                <>
                  <span aria-hidden>·</span>
                  <Link
                    to={`${financeTabUrl(FINANCE_TAB.parties)}&party=company:${openSupplier.crm_company_id}`}
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                    title="Their account: bills, orders, payments, the running ledger and the account statement"
                  >
                    <Wallet className="h-3 w-3" />
                    Account &amp; payments
                    <ExternalLink className="h-3 w-3" />
                  </Link>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto">
            <SupplierInboundDocs
              workspaceId={workspaceId}
              vatNumber={openSupplier.issuer_vat}
              companyId={openSupplier.crm_company_id}
              readOnly={isAccountant}
              // Bounds the date pickers to the span the summary already derived, so the window
              // cannot be set to a period this supplier has never issued anything in.
              spanFrom={openSupplier.first_issue_date}
              spanTo={openSupplier.last_issue_date}
            />
          </div>
        </DialogContent>
      )}
    </Dialog>

    {/* Adding a supplier from here stays PUT: the operator is mid-way down a filing queue, so the
        tag turns into the CRM link in place rather than navigating them away. The refresh is
        QUIET for two reasons — it can be triggered from inside the supplier modal, where a
        spinner would blank a list being read, and a failed one must not empty `rows` under a
        modal whose open row is looked up from them. */}
    {addToCrm && (
      <AddIssuerToCrmDialog
        workspaceId={workspaceId}
        issuerVat={addToCrm.issuer_vat}
        issuerName={addToCrm.issuer_name}
        open
        onOpenChange={(v) => { if (!v) setAddToCrm(null); }}
        onCreated={() => { setAddToCrm(null); void load(true); }}
      />
    )}
    </>
  );
};
