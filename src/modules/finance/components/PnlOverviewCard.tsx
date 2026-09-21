import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Landmark, Scale } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { formatMoney } from '@/utils/decimal';
import { FINANCE_TAB, financeTabUrl } from '@/modules/finance/routes';
import { aadeVerdict, booksVerdict, type PnlVerdict } from '@/modules/finance/pnlStatus';
import type { PnlOverview } from '@/modules/finance/services/financeService';

const TONE_BADGE: Record<PnlVerdict['tone'], 'success' | 'warning' | 'neutral'> = {
  ok: 'success', warn: 'warning', unknown: 'neutral',
};

/** `hasFigures` false renders the reason where the number would be. */
const Figure: React.FC<{
  label: string; value: number | null; currency: string; verdict: PnlVerdict;
  sub?: string; emphasis?: boolean; signed?: boolean;
}> = ({ label, value, currency, verdict, sub, emphasis, signed }) => {
  const negative = signed && value != null && value < 0;
  return (
    <div className="min-w-0">
      <div className="text-[11px] font-semibold text-muted-foreground">{label}</div>
      {verdict.hasFigures && value != null ? (
        <div
          className={[
            'mt-0.5 tabular-nums',
            emphasis ? 'text-xl font-semibold' : 'text-lg font-medium',
            negative ? 'text-red-700 dark:text-red-400' : '',
          ].join(' ')}
        >
          {formatMoney(value, currency)}
        </div>
      ) : (
        <div className="mt-0.5 text-sm text-muted-foreground">{verdict.label}</div>
      )}
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
};

interface Props {
  overview: PnlOverview | null;
  periodLabel: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

/**
 * The P&L for a period, with AADE's own answer beside it. The two halves are never merged: the
 * ΑΑΔΕ book CONFIRMS our figures or contradicts them, and folding it in would produce a total no
 * document backs. Where they disagree the difference is stated, not reconciled away.
 */
export const PnlOverviewCard: React.FC<Props> = ({ overview, periodLabel, loading, error, onRetry }) => {
  if (error) {
    return (
      <Card>
        <CardHeader className="border-b border-hairline px-5 py-3">
          <CardTitle className="flex items-center gap-2 text-sm"><Scale className="h-4 w-4 text-muted-foreground" /> Profit &amp; loss</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-3 p-5 text-sm">
          <span className="text-muted-foreground">
            The P&amp;L could not be read — these figures are missing, not zero. <span className="opacity-80">{error}</span>
          </span>
          {onRetry && (
            <button type="button" onClick={onRetry} className="shrink-0 text-sm font-medium text-primary hover:underline">
              Retry
            </button>
          )}
        </CardContent>
      </Card>
    );
  }

  const books = booksVerdict(overview?.books_status);
  const aade = aadeVerdict(overview?.aade_status);
  const ccy = overview?.currency && overview.currency !== 'MIXED' ? overview.currency : 'EUR';
  const gap = overview?.expense_gap_net ?? null;
  // `collector_failed` fires when ANY month failed, and the months that DID read still produce a
  // gap - so without hasFigures the tiles say "unknown" while the strip asserts the shortfall.
  const showGap = gap != null && gap > 0.5 && aade.hasFigures;
  const settle = booksVerdict(overview?.settlement_status);
  const settleCcy = overview?.settlement_currency && overview.settlement_currency !== 'MIXED'
    ? overview.settlement_currency
    : ccy;

  return (
    <Card>
      <CardHeader className="border-b border-hairline px-5 py-3 flex-row items-start justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Scale className="h-4 w-4 text-muted-foreground" /> Profit &amp; loss
          </CardTitle>
          <p className="pt-1 text-[11px] text-muted-foreground">
            {periodLabel} · income less expenses. Cost of goods on what you sold is the Gross margin card.
          </p>
        </div>
        <Badge variant={TONE_BADGE[aade.tone]} className="shrink-0" title={aade.detail}>
          ΑΑΔΕ: {aade.label}
        </Badge>
      </CardHeader>

      <CardContent className="p-0">
        {loading && !overview ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Reading the books…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 px-5 py-4 sm:grid-cols-4">
              <Figure label="Income" value={overview?.books_income ?? null} currency={ccy} verdict={books} emphasis />
              <Figure label="Expenses" value={overview?.books_expenses ?? null} currency={ccy} verdict={books} emphasis />
              <Figure
                label="Net"
                value={overview?.books_net ?? null}
                currency={ccy}
                verdict={books}
                emphasis
                signed
                sub={books.hasFigures ? 'from your documents' : undefined}
              />
              <Figure
                label="VAT payable"
                value={overview?.books_vat_payable ?? null}
                currency={ccy}
                verdict={books}
                signed
                sub={books.hasFigures && overview
                  ? `${formatMoney(overview.books_vat_income, ccy)} out − ${formatMoney(overview.books_vat_expense, ccy)} in`
                  : undefined}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 border-t border-hairline bg-surface-sunken px-5 py-4 sm:grid-cols-4">
              <Figure
                label="Income — ΑΑΔΕ"
                value={overview?.aade_income_net ?? null}
                currency="EUR"
                verdict={aade}
                sub={overview?.aade_income_docs != null ? `${overview.aade_income_docs.toLocaleString()} documents` : undefined}
              />
              <Figure
                label="Expenses — ΑΑΔΕ"
                value={overview?.aade_expense_net ?? null}
                currency="EUR"
                verdict={aade}
                sub={overview?.aade_expense_docs != null ? `${overview.aade_expense_docs.toLocaleString()} documents` : undefined}
              />
              <Figure
                label="Net — ΑΑΔΕ"
                value={overview?.aade_net ?? null}
                currency="EUR"
                verdict={aade}
                signed
                sub={overview && aade.hasFigures
                  ? `${overview.aade_months_with_figures} of ${overview.aade_months_total} month(s) read`
                  : undefined}
              />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-muted-foreground">What this is</div>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                  Every document filed against your ΑΦΜ. It confirms your books — it is never added to them.
                </p>
                <Link to={financeTabUrl(FINANCE_TAB.mydataBook)} className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                  Open the ΑΑΔΕ book <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </div>

            {showGap && overview && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-amber-500/40 bg-amber-500/10 px-5 py-3">
                <div className="flex min-w-0 items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-800 dark:text-amber-300" />
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    ΑΑΔΕ holds <strong>{formatMoney(gap, 'EUR')}</strong> more expense than your books do for this period.
                    {overview.unbooked_docs > 0 ? (
                      <> {overview.unbooked_docs.toLocaleString()} received document{overview.unbooked_docs === 1 ? '' : 's'} worth {formatMoney(overview.unbooked_total, 'EUR')} {overview.unbooked_docs === 1 ? 'has' : 'have'} not been booked as an expense yet.</>
                    ) : (
                      <> Nothing in the Expenses inbox accounts for it — worth checking what was filed against you.</>
                    )}
                  </p>
                </div>
                <Link
                  to={financeTabUrl(FINANCE_TAB.expenseSuppliers)}
                  className="shrink-0 text-xs font-medium text-amber-800 underline-offset-2 hover:underline dark:text-amber-300"
                >
                  Book them →
                </Link>
              </div>
            )}

            {/* Excluded ON PURPOSE is still excluded, so it is stated rather than simply absent
                — the whole reason the marker is a marker and not a delete. */}
            {overview && overview.excluded_docs > 0 && (
              <p className="border-t border-hairline px-5 py-2 text-[11px] text-muted-foreground">
                <strong>{overview.excluded_docs.toLocaleString()}</strong> cost{overview.excluded_docs === 1 ? '' : 's'} worth{' '}
                <strong>{formatMoney(overview.excluded_total, 'EUR')}</strong> {overview.excluded_docs === 1 ? 'is' : 'are'} marked
                settled outside the books and are NOT in the figures above.
              </p>
            )}

            {overview && (settle.hasFigures ? (
              <div className="grid grid-cols-2 gap-4 border-t border-hairline px-5 py-3 sm:grid-cols-4">
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground">Billed to us — {periodLabel.toLowerCase()}</div>
                  <div className="mt-0.5 text-sm font-medium tabular-nums">{formatMoney(overview.billed_total, settleCcy)}</div>
                  <div className="text-[11px] text-muted-foreground">{overview.bills_issued} supplier bill{overview.bills_issued === 1 ? '' : 's'}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground">Paid — {periodLabel.toLowerCase()}</div>
                  <div className="mt-0.5 text-sm font-medium tabular-nums">{formatMoney(overview.paid_total, settleCcy)}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-muted-foreground">Still owed on those</div>
                  <div className="mt-0.5 text-sm font-medium tabular-nums">{formatMoney(overview.still_owed, settleCcy)}</div>
                </div>
                <div>
                  {/* A different WINDOW from the three beside it, and it says so. */}
                  <div className="text-[11px] font-semibold text-muted-foreground">Owed right now — all time</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <Landmark className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-medium tabular-nums">{formatMoney(overview.ap_outstanding_now, settleCcy)}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {overview.ap_bills_open} open
                    {(overview.ap_overdue_now ?? 0) > 0 && <> · <span className="text-red-700 dark:text-red-400">{formatMoney(overview.ap_overdue_now, settleCcy)} overdue</span></>}
                  </div>
                </div>
              </div>
            ) : (
              <p className="border-t border-hairline px-5 py-2 text-[11px] text-muted-foreground">
                Billed, paid and still owed: {settle.detail}
              </p>
            ))}

            {!books.hasFigures && (
              <p className="border-t border-hairline px-5 py-2 text-[11px] text-muted-foreground">{books.detail}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};
