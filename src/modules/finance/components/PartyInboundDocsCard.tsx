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

export const PartyInboundDocsCard: React.FC<{
  workspaceId: string;
  companyId: string;
  /** The company's VAT number — the only thing that ties a received document to them. */
  vatNumber: string | null | undefined;
  /** Deep link into the Expenses Inbox, for everything this card doesn't do. */
  inboxHref: string;
  readOnly?: boolean;
}> = ({ workspaceId, companyId, vatNumber, inboxHref, readOnly }) => {
  /** Null until the first load reports — the subtitle stays silent rather than guessing a zero. */
  const [counts, setCounts] = useState<SupplierInboundCounts | null>(null);

  // Nothing to say when this party has no VAT number — they can't be matched to any document.
  if (!vatNumber) return null;
  // A supplier who has filed nothing gets no panel about their filings.
  if (counts && counts.total === 0) return null;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 px-5 py-3 flex-row items-center justify-between gap-3 space-y-0">
        <div className="min-w-0">
          <CardTitle className="flex items-center gap-2"><InboxIcon className="h-4 w-4" /> Invoices</CardTitle>
          <p className="mt-0.5 text-xs text-muted-foreground">
            What this supplier filed with AADE against us.
            {counts == null
              ? ''
              : counts.notInBooks > 0
                ? ` ${counts.notInBooks} not in your books yet — until one is added to Expenses it doesn't reach Payables or the P&L.`
                : ' All of them are in Expenses.'}
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
