/**
 * A supplier's myDATA received documents, on their CRM record.
 *
 * These are documents the supplier filed with AADE naming us as the counterparty. They arrive in
 * Finance → Documents → Expenses (the Inbox) and, until one is turned into an expense, they are
 * NOT in the books — so they show here with their state spelled out rather than silently missing.
 *
 * Matched live by ΑΦΜ (see `inboundService.listForIssuerVat`), so this needs no link column and
 * no backfill. The rows themselves are [[SupplierInboundDocs]] — the same table, the same menu and
 * the same dialogs Finance → Expenses by Supplier expands to, because "a received document" should
 * behave identically wherever it is shown. This file is the card that frames them.
 */
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Inbox as InboxIcon, ExternalLink } from 'lucide-react';
import { SupplierInboundDocs, type SupplierInboundCounts } from '@/modules/finance/components/SupplierInboundDocs';

/**
 * The second sentence of the subtitle. Split out because it is FOUR statements, not one with
 * three conditionals wired through it: whether anything is unbooked, and whether the reader is
 * looking at the supplier's whole history or a date window they set. Written as nested ternaries
 * it was unreadable, which is how a sentence ends up claiming something about all of a
 * supplier's documents while showing one month of them.
 */
const subtitle = (c: SupplierInboundCounts): string => {
  if (c.notInBooks > 0) {
    return c.windowed
      ? `${c.notInBooks} in this window are not in your books yet.`
      : `${c.notInBooks} not in your books yet — until one is added to Expenses it doesn't reach Payables or the P&L.`;
  }
  return c.windowed ? 'Everything in this window is in Expenses.' : 'All of them are in Expenses.';
};

export const PartyInboundDocsCard: React.FC<{
  workspaceId: string;
  companyId: string;
  /** The company's VAT number — the only thing that ties a received document to them. */
  vatNumber: string | null | undefined;
  /** Deep link into the Expenses Inbox, for everything this card doesn't do. */
  inboxHref: string;
  readOnly?: boolean;
  /**
   * Whether "nothing to show" means "render nothing".
   *
   * TRUE (the default) is the STACKED reading: the card sits among other cards, so removing
   * itself costs the reader nothing. FALSE is the TAB reading — the section is the whole pane,
   * and a pane that renders nothing is a tab you can click into and land on blank page. There
   * the absence has to be SAID, not performed (CLAUDE.md anti-regression rule 3: a metric is a
   * value or a stated reason there is no value, never a hidden row).
   */
  hideWhenEmpty?: boolean;
}> = ({ workspaceId, companyId, vatNumber, inboxHref, readOnly, hideWhenEmpty = true }) => {
  /** Null until the first load reports — the subtitle stays silent rather than guessing a zero. */
  const [counts, setCounts] = useState<SupplierInboundCounts | null>(null);

  // Nothing to say when this party has no VAT number — they can't be matched to any document.
  if (!vatNumber) {
    if (hideWhenEmpty) return null;
    return (
      <Card>
        <CardHeader className="border-b border-border/60 px-5 py-3">
          <CardTitle className="flex items-center gap-2"><InboxIcon className="h-4 w-4" /> Invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          This company has no VAT number, and a received document is matched to a supplier by ΑΦΜ
          alone — so nothing here can be tied to them yet. Add it under Details → Tax &amp; VAT.
        </CardContent>
      </Card>
    );
  }
  // A supplier who has filed nothing gets no panel about their filings. NOT while a date window
  // is in force, though: narrowing to a quiet month would otherwise delete the panel — and with
  // it the only control that could widen the window again.
  if (hideWhenEmpty && counts && counts.total === 0 && !counts.windowed) return null;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2"><InboxIcon className="h-4 w-4" /> Invoices</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What this supplier filed with AADE against us.
            {counts == null ? '' : ` ${subtitle(counts)}`}
          </p>
        </div>
        {/* Carry the supplier through, so the Inbox opens on THEIR documents rather than
            everyone's and the operator has to re-find them. */}
        <Link to={`${inboxHref}${inboxHref.includes('?') ? '&' : '?'}issuer_vat=${encodeURIComponent(vatNumber)}`}>
          <Button size="sm" variant="ghost"><ExternalLink className="h-3.5 w-3.5 mr-2" /> Open inbox</Button>
        </Link>
      </CardHeader>
      <CardContent className="p-0">
        <SupplierInboundDocs
          workspaceId={workspaceId}
          vatNumber={vatNumber}
          // We ARE on the issuer's record, so the CRM action is already done.
          companyId={companyId}
          readOnly={readOnly}
          onCounts={setCounts}
        />
      </CardContent>
    </Card>
  );
};
