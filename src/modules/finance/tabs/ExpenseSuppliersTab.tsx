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
 *     the normalised VAT key in SQL (#353 CRM-4); 37 of 241 issuers resolve today. Adding the rest
 *     goes through the row menu inside a supplier's documents, which dedupes and researches — this
 *     surface never creates a company silently.
 *  3. HISTORY. Opening a row loads that supplier's whole run of documents inline — the same table,
 *     menu and dialogs as their CRM record ([[SupplierInboundDocs]]).
 *
 * Every number in the table is derived by `inbound_issuers_summary`, including the counts that
 * decide what is offered. Counting the loaded page instead would be a different number on every
 * surface that showed it.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Inbox, Check, Building2, ChevronRight, ChevronDown, ExternalLink, Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
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

interface CategoryOption { id: string; name: string; kind?: string | null; is_system?: boolean | null }

/** Free-text match over the two things an operator knows a supplier by. */
const matches = (r: ExpenseIssuerRow, q: string) => {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  const digits = needle.replace(/\D/g, '');
  return (
    (r.issuer_name ?? '').toLowerCase().includes(needle)
    || (r.crm_company_name ?? '').toLowerCase().includes(needle)
    || r.issuer_vat.toLowerCase().includes(needle)
    || (!!digits && r.issuer_vat.replace(/\D/g, '').includes(digits))
  );
};

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
  const [q, setQ] = useState('');
  const [onlyUnfiled, setOnlyUnfiled] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  // A system category is not a filing destination — the RPC refuses it, because filing into the
  // bucket the documents are already in would move them and teach nothing.
  const fileable = useMemo(
    () => categories.filter((c) => !c.is_system && (c.kind ?? 'expense') === 'expense'),
    [categories],
  );

  const load = useCallback(async () => {
    if (!workspaceId) return;
    setLoading(true);
    try {
      setRows(await inboundService.issuersSummary(workspaceId));
      setError(null);
    } catch (e) {
      // A source that FAILED must not render as a source that is empty.
      setRows([]);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(
    () => rows.filter((r) => matches(r, q) && (!onlyUnfiled || r.unfiled > 0)),
    [rows, q, onlyUnfiled],
  );
  useEffect(() => { setPage((p) => clampPage(p, filtered.length)); }, [filtered.length]);
  useEffect(() => { setPage(1); }, [q, onlyUnfiled]);

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
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Supplier or ΑΦΜ"
              aria-label="Search suppliers by name or ΑΦΜ"
              className="h-8 w-48 pl-7 text-xs"
            />
          </div>
          {totals.unfiled > 0 && (
            <Button
              size="sm"
              variant={onlyUnfiled ? 'secondary' : 'outline'}
              aria-pressed={onlyUnfiled}
              onClick={() => setOnlyUnfiled((v) => !v)}
            >
              To file only
            </Button>
          )}
        </div>
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
                          description={`${rows.length} supplier${rows.length === 1 ? '' : 's'} ${rows.length === 1 ? 'is' : 'are'} in the inbox — the current search excludes ${rows.length === 1 ? 'it' : 'them all'}.`}
                          action={<Button size="sm" variant="outline" onClick={() => { setQ(''); setOnlyUnfiled(false); }}>Clear filters</Button>}
                        />
                      )}
                    </td></tr>
                  )}
                  {paginate(filtered, page).map((r) => {
                    const selected = choice[r.issuer_vat] ?? r.learned_category_id ?? '';
                    const expanded = open === r.issuer_vat;
                    return (
                      <React.Fragment key={r.issuer_vat}>
                        <tr className="border-b border-hairline hover:bg-muted/30">
                          <td className="max-w-[24rem] px-5 py-2 text-sm">
                            {/* The name IS the disclosure control — a <tr> cannot be made
                                focusable correctly, so the keyboard path is this button. */}
                            <button
                              type="button"
                              className="flex w-full items-center gap-1.5 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-expanded={expanded}
                              onClick={() => setOpen(expanded ? null : r.issuer_vat)}
                              title={expanded ? 'Hide this supplier’s documents' : 'Show every document from this supplier'}
                            >
                              {expanded
                                ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                              <span className="truncate font-medium">{r.issuer_name || r.issuer_vat}</span>
                            </button>
                            <div className="mt-0.5 flex flex-wrap items-center gap-2 pl-5">
                              <span className="font-mono text-xs text-muted-foreground">{r.issuer_vat}</span>
                              {/* The supplier's CRM record when their ΑΦΜ resolves to one. Not a
                                  "create" affordance: a CRM party goes through the duplicate
                                  search first, which the row menu inside the documents does. */}
                              {r.crm_company_id ? (
                                <Link
                                  to={`/crm/companies/${r.crm_company_id}`}
                                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                                  title={r.crm_company_name ?? undefined}
                                >
                                  <Building2 className="h-3 w-3" />
                                  <span className="max-w-[12rem] truncate">{r.crm_company_name || 'In CRM'}</span>
                                  <ExternalLink className="h-3 w-3" />
                                </Link>
                              ) : (
                                <span className="text-xs text-muted-foreground/70" title="This ΑΦΜ matches no CRM company. Add them from the menu on one of their documents — it searches the registries and dedupes first.">
                                  Not in CRM
                                </span>
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
                              {r.in_books > 0 ? `${r.in_books} in books` : 'none in books'}
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
                            <td className="px-5 py-2">
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
                        {expanded && (
                          <tr className="border-b border-hairline bg-surface-sunken/40">
                            <td colSpan={columns} className="p-0">
                              <SupplierInboundDocs
                                workspaceId={workspaceId}
                                vatNumber={r.issuer_vat}
                                companyId={r.crm_company_id}
                                readOnly={isAccountant}
                              />
                            </td>
                          </tr>
                        )}
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
  );
};
