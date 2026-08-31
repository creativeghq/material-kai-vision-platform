/**
 * One supplier's received (myDATA) documents — the table, the row actions and the three dialogs
 * they open.
 *
 * Extracted from `PartyInboundDocsCard` so the CRM record and Finance → Expenses by Supplier show
 * the SAME rows with the SAME behaviours. The alternative was a second copy of the action wiring
 * (dismiss, receive to warehouse, record payment, create order, the `ordered` set), which is
 * behaviour, not decoration — and the surfaces would have drifted the first time one of them
 * gained an action.
 *
 * Deliberately chrome-free: no Card, no heading. The host frames it, because one host is a card on
 * a company record and the other is a modal opened off a supplier row.
 *
 * A row OPENS — it does not navigate. Every dialog here (preview, receive, record payment, new
 * order) stacks on top of the host and leaves it mounted, so the errand runs without the operator
 * losing the list, the page they were on, or a form they had half filled in.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, CalendarDays } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { formatMoney } from '@/modules/finance/services/financeService';
import { inboundService, type InboundDocument, type IssuerMoney } from '@/modules/finance/services/inboundService';
import { inboundOutcomes } from '@/modules/finance/components/inboundStatus';
import { MydataTypeLabel } from '@/modules/finance/components/MydataTypeLabel';
import { useInboundDocActions } from '@/modules/finance/components/useInboundDocActions';
import { TablePagination, paginate, clampPage } from '@/components/core/ui/table-pagination';
import { formatDate } from '@/utils/datetime';
import { inboundDocumentNumber, invoicedTotal, isReverseCharged, needsLineDetail, selfAccountedVat } from '@/modules/finance/utils/inboundProvenance';

/** What the host needs to describe the list it is framing, without re-fetching it. */
export interface SupplierInboundCounts {
  /** Documents matching the CURRENT date window, as counted by the DB — not by the page. */
  total: number;
  /** How many of them are loaded here. Lower than `total` only when the cap bit. */
  loaded: number;
  /** Loaded documents that have not become an expense — so they reach neither Payables nor P&L. */
  notInBooks: number;
  /**
   * A date window is in force, so `total` is a count of the WINDOW and not of the supplier.
   * A host that hides itself on `total === 0` must read this, or narrowing to an empty month
   * makes the whole panel disappear as though the supplier had never sent anything.
   */
  windowed: boolean;
}

/** One figure with the sentence that makes it readable. Never a bare number. */
const Tile: React.FC<{ label: string; value: React.ReactNode; note?: React.ReactNode; tone?: string }> = ({
  label, value, note, tone,
}) => (
  <div className="min-w-0 flex-1 px-4 py-2">
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className={`text-sm font-semibold tabular-nums ${tone ?? ''}`}>{value}</div>
    {note ? <div className="text-[10px] text-muted-foreground">{note}</div> : null}
  </div>
);

/**
 * Spend, booked and paid for the window in force.
 *
 * Three rules this encodes, all of them the difference between a number and a lie:
 *
 *  - A FAILED read is not zero. `null` says the totals could not be read; it never prints 0.
 *  - PAID is only meaningful against what was BOOKED. A supplier can have 206 documents, EUR
 *    37,525.96 invoiced and nothing paid simply because nobody has turned any of it into an
 *    expense yet — which is a to-do, not a debt. The ratio sits under the figure so the two
 *    cannot be read apart.
 *  - Currencies are not added. A window spanning EUR and USD has no single total, so it says so
 *    instead of printing their sum.
 */
const MoneyStrip: React.FC<{ money: IssuerMoney | null | undefined; loading: boolean; windowed: boolean }> = ({
  money, loading, windowed,
}) => {
  // Every load, not just the first: keeping the previous figures on screen while a NEW window is
  // being fetched pairs last window's money with this window's label, which is a wrong number
  // rather than a stale one.
  if (loading) {
    return (
      <div className="flex items-center gap-2 border-b border-hairline bg-surface-sunken px-4 py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Totalling…
      </div>
    );
  }
  if (money === null) {
    return (
      <div className="border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-800 dark:text-amber-300">
        The totals could not be read. They are <strong>unknown</strong>, not zero — the documents below are still accurate.
      </div>
    );
  }
  if (!money) return null;
  const cur = money.currency ?? 'EUR';
  const scope = windowed ? 'in this window' : 'all time';
  if (money.mixed_currency) {
    return (
      <div className="border-b border-hairline bg-surface-sunken px-4 py-2 text-[11px] text-muted-foreground">
        {money.documents} documents {scope} across more than one currency — there is no single total to show.
        Narrow the window to one currency.
      </div>
    );
  }
  const nothingBooked = money.booked_documents === 0;
  return (
    <div className="flex flex-wrap divide-x divide-hairline border-b border-hairline bg-surface-sunken">
      <Tile
        label="Invoiced"
        value={formatMoney(money.invoiced, cur)}
        note={<>{money.documents} document{money.documents === 1 ? '' : 's'} {scope}
          {money.self_accounted_vat > 0
            ? ` · ${formatMoney(money.self_accounted_vat, cur)} VAT self-accounted, not payable`
            : ''}</>}
      />
      <Tile
        label="In the books"
        value={nothingBooked ? '—' : formatMoney(money.booked_total, cur)}
        note={nothingBooked
          ? 'None of these are expenses yet'
          : `${money.booked_documents} of ${money.documents} document${money.documents === 1 ? '' : 's'} booked`}
        tone={nothingBooked ? 'text-muted-foreground' : undefined}
      />
      <Tile
        label="Paid"
        value={nothingBooked ? '—' : formatMoney(money.paid, cur)}
        // Paid measures settlement of the BOOKED total. Printing EUR 0 against an unbooked pile
        // says "we owe them and have not paid"; the truth is that nobody has recorded the cost.
        note={nothingBooked
          ? 'Nothing booked, so nothing to settle'
          : <>
              {money.outstanding > 0 ? `${formatMoney(money.outstanding, cur)} still owed` : 'Settled in full'}
              {money.credited > 0 ? ` · ${formatMoney(money.credited, cur)} credited` : ''}
            </>}
        tone={nothingBooked ? 'text-muted-foreground' : undefined}
      />
    </div>
  );
};

export const SupplierInboundDocs: React.FC<{
  workspaceId: string;
  /** The supplier's ΑΦΜ — the only thing that ties a received document to them. */
  vatNumber: string | null | undefined;
  /** Their CRM company, when they have one. Absent → the row menu offers adding them. */
  companyId?: string | null;
  readOnly?: boolean;
  /** The supplier's first/last issue date, when the host already knows them — used to bound the
   *  date pickers and to say what "everything" would be. Purely a hint; absent is fine. */
  spanFrom?: string | null;
  spanTo?: string | null;
  /** Reported after every load, so a host can title the list without counting it a second time. */
  onCounts?: (counts: SupplierInboundCounts) => void;
}> = ({ workspaceId, vatNumber, companyId, readOnly, spanFrom, spanTo, onCounts }) => {
  const fieldId = React.useId();
  const [rows, setRows] = useState<InboundDocument[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  /**
   * Spend / booked / paid for the SAME window as the list. Derived by `inbound_issuer_money`,
   * never by adding the loaded page up — the list is paged, so a page total would be a total of
   * twenty documents wearing the label of a supplier's whole history. `undefined` = not read yet;
   * `null` = the read FAILED, which must not render as zeros.
   */
  const [money, setMoney] = useState<IssuerMoney | null | undefined>(undefined);
  /**
   * The issue-date window. Empty by default and bounded by the supplier's own span, because a
   * prefilled window is a filter nobody set: it would silently drop any document carrying NO
   * issue date, and the header's all-time counts would stop agreeing with the table for a reason
   * the operator never chose. Applied SERVER-side, so narrowing reaches documents the row cap
   * would otherwise have cut off.
   */
  const [range, setRange] = useState<{ from: string; to: string }>({ from: '', to: '' });
  /**
   * A date input reports every keystroke, so typing "2025" arrives as `0002-…` first. Sending
   * that is a query for the third century that returns nothing — i.e. a blank table flashing at
   * the operator mid-type, which reads as "this supplier has none". Only a plausible year counts
   * as a bound; anything else is treated as still being typed.
   */
  const bound = (v: string) => (/^\d{4}-\d{2}-\d{2}$/.test(v) && Number(v.slice(0, 4)) >= 1900 ? v : null);
  const from = bound(range.from);
  const to = bound(range.to);
  const windowed = !!(from || to);

  const load = useCallback(async () => {
    if (!workspaceId || !vatNumber) { setRows([]); setTotal(0); setLoading(false); return; }
    setLoading(true);
    try {
      const [list, sums] = await Promise.all([
        inboundService.listForIssuerVat(workspaceId, vatNumber, { from, to }),
        // A failed total is UNKNOWN, not zero — the tiles say so rather than reporting 0 spend.
        inboundService.issuerMoney(workspaceId, vatNumber, { from, to }).catch(() => null),
      ]);
      setRows(list.rows);
      setTotal(list.total);
      setMoney(sums);
    }
    catch { setRows([]); setTotal(0); setMoney(null); }
    finally { setLoading(false); }
  }, [workspaceId, vatNumber, from, to]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setPage((p) => clampPage(p, rows.length)); }, [rows.length]);
  useEffect(() => {
    if (loading) return;
    onCounts?.({
      total,
      loaded: rows.length,
      notInBooks: rows.filter((d) => !d.created_supplier_bill_id && d.status !== 'dismissed').length,
      windowed,
    });
  }, [loading, rows, total, windowed, onCounts]);

  /**
   * Every action a received document has, wired ONCE. The menu gates entries on the handler
   * existing, so spelling the props out per table is how one of them loses an entry silently —
   * which is exactly what happened to "Add line detail" here.
   */
  const actions = useInboundDocActions({
    workspaceId,
    rows,
    onChanged: () => { void load(); },
    // We are already scoped to one issuer, so their CRM company is known for every row.
    crmCompanyIdFor: () => companyId ?? undefined,
  });

  const clearRange = () => setRange({ from: '', to: '' });

  return (
    <>
      {/* The window sits ABOVE the loading state, not inside it: re-fetching on every edit would
          otherwise unmount the input being typed into and take the caret with it. */}
      <div className="flex flex-wrap items-end gap-3 border-b border-hairline bg-surface-sunken px-4 py-2">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
          <span className="text-[11px] font-semibold text-muted-foreground">Issued</span>
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-from`} className="text-[10px] uppercase tracking-wide text-muted-foreground">From</Label>
          <Input
            id={`${fieldId}-from`}
            type="date"
            value={range.from}
            min={spanFrom ?? undefined}
            max={range.to || spanTo || undefined}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="h-8 w-[9.5rem] text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${fieldId}-to`} className="text-[10px] uppercase tracking-wide text-muted-foreground">To</Label>
          <Input
            id={`${fieldId}-to`}
            type="date"
            value={range.to}
            min={range.from || spanFrom || undefined}
            max={spanTo ?? undefined}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="h-8 w-[9.5rem] text-xs"
          />
        </div>
        {windowed ? (
          <Button size="sm" variant="ghost" className="h-8" onClick={clearRange}>Clear</Button>
        ) : (
          <span className="pb-1 text-[11px] text-muted-foreground">
            {spanFrom
              ? `All of it — ${formatDate(spanFrom)}${spanTo && spanTo !== spanFrom ? ` to ${formatDate(spanTo)}` : ''}.`
              : 'All of it.'}
          </span>
        )}
      </div>

      <MoneyStrip money={money} loading={loading} windowed={windowed} />

      {loading ? (
        <div className="p-6 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
      ) : (
      <>
      {/* A truncated list looks exactly like a short one. */}
      {total > rows.length && (
        <p className="border-b border-hairline bg-surface-sunken px-4 py-2 text-[11px] text-amber-800 dark:text-amber-300">
          Showing the {rows.length.toLocaleString()} most recent of {total.toLocaleString()} documents
          {windowed ? ' in this window' : ' from this supplier'}.
        </p>
      )}
      <div className="table-scroll">
      <table className="w-full text-sm">
        <thead className="border-b border-border/60 text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left">Date</th>
            <th className="px-4 py-2 text-left">Number</th>
            <th className="px-4 py-2 text-left">Type</th>
            <th className="px-4 py-2 text-right">Net</th>
            <th className="px-4 py-2 text-right">VAT</th>
            <th className="px-4 py-2 text-right">Payable</th>
            <th className="px-4 py-2 text-center">Detail</th>
            <th className="px-4 py-2 text-center">Handled</th>
            {!readOnly && <th className="px-4 py-2 text-right"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={readOnly ? 8 : 9} className="px-4 py-6 text-center text-xs text-muted-foreground">
                {/* Two different kinds of nothing, and they need opposite responses. */}
                {windowed ? (
                  <>
                    No documents issued in this window.{' '}
                    <button type="button" className="rounded text-primary hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={clearRange}>
                      Clear the dates
                    </button>
                  </>
                ) : 'Nothing has been filed against us under this ΑΦΜ.'}
              </td>
            </tr>
          )}
          {paginate(rows, page).map((d) => {
            const outcomes = inboundOutcomes(d, { ordered: actions.ordered.has(d.id) });
            return (
              <tr
                key={d.id}
                className={`cursor-pointer border-b border-border/30 hover:bg-muted/30 ${d.status === 'dismissed' ? 'opacity-60' : ''}`}
                // Row onClick is a MOUSE CONVENIENCE only — the keyboard/AT path is the button on
                // the Number cell. A <tr> cannot be made focusable correctly: tabIndex +
                // role="button" on a row is invalid ARIA and yields a focus stop with no name.
                onClick={() => actions.openPreview(d)}
              >
                <td className="px-4 py-2">{d.issue_date ? formatDate(d.issue_date) : '—'}</td>
                <td className="px-4 py-2">
                  {/* Our own ΑΦΜ is not the supplier's invoice number — see
                      `inboundDocumentNumber`. */}
                  <button
                    type="button"
                    className="rounded text-left text-xs font-medium hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={(e) => { e.stopPropagation(); actions.openPreview(d); }}
                    title="Open this document as AADE holds it"
                  >
                    {inboundDocumentNumber(d) ?? '—'}
                  </button>
                  {d.mark ? <div className="text-[10px] font-mono text-muted-foreground" title={`MARK ${d.mark}`}>{d.mark}</div> : null}
                </td>
                <td className="px-4 py-2"><MydataTypeLabel code={d.doc_type} /></td>
                <td className="px-4 py-2 text-right text-muted-foreground">{formatMoney(d.total_net ?? 0, d.currency)}</td>
                {/* Reverse charge: the supplier charged no VAT, so none is shown and the
                    total is what they actually invoiced. */}
                <td className="px-4 py-2 text-right text-muted-foreground">
                  {isReverseCharged(d.doc_type)
                    ? <span title={`Reverse charge — ${formatMoney(selfAccountedVat(d) ?? 0, d.currency)} self-assessed and reclaimed in the same return.`}>—</span>
                    : formatMoney(d.total_vat ?? 0, d.currency)}
                </td>
                <td className="px-4 py-2 text-right font-medium">{formatMoney(invoicedTotal(d), d.currency)}</td>
                {/* Value-only lines: the money is transmitted, the detail never was. Said out
                    loud, because it is the one thing standing between this document and every
                    downstream consumer that keys on a line description. */}
                <td className="px-4 py-2 text-center">
                  {needsLineDetail(d)
                    ? <span className="text-[10px] text-amber-800 dark:text-amber-300" title="Value-only lines — nothing here can be received to the warehouse or turned into a product until someone says what was on it.">Needs detail</span>
                    : <span className="text-[10px] text-muted-foreground/50">—</span>}
                </td>
                <td className="px-4 py-2 text-center">
                  {outcomes.length > 0
                    ? <span className="text-[10px]">
                        {outcomes.map((o, i) => (
                          <React.Fragment key={o.label}>
                            {i > 0 && <span className="text-muted-foreground/50"> · </span>}
                            <span className={o.tone}>{o.label}</span>
                          </React.Fragment>
                        ))}
                      </span>
                    : <span className="text-[10px] text-muted-foreground/50">Not in Books</span>}
                </td>
                {!readOnly && (
                  <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end">{actions.renderActions(d)}</div>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      <TablePagination page={page} total={rows.length} onPageChange={setPage} label="documents" />
      </>
      )}

      {/* Every dialog those actions open, mounted once. They stack ON TOP of whatever hosts
          this table and leave it mounted, so the errand does not cost the operator their place. */}
      {actions.dialogs}
    </>
  );
};
