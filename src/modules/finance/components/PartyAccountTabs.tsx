/**
 * The Account tab of a CRM party record (company or person), behind ONE tab strip.
 *
 * WHY TABS AND NOT A STACK
 * ------------------------
 * These sections were rendered one under the other: Orders, then Payments, then (for a supplier)
 * the myDATA Invoices they filed against us, then the customer-only repeat-buy and payment-rule
 * cards. Each one is a paginated table with its own header and its own toolbar, so an active
 * party's Account tab was four to six card headers and several hundred rows in a single scroll —
 * the reader has to travel past the whole of Orders to find out whether a payment came in.
 *
 * This is the same call `PartyWorkTab` already made for the Work tab next door, for the same
 * reason. It uses a rail because its sections are a dozen short derived lists; the sections here
 * are five wide money tables, and a 14rem rail is 14rem taken off the columns that carry the
 * figures. So: a horizontal underline strip, which is the platform tab treatment (index.css,
 * `[role="tab"]`) and costs the tables nothing.
 *
 * WHAT STAYS PINNED
 * -----------------
 * The account overview — the balance, the aging, what is on account — is NOT a tab. It is the
 * answer to "how do we stand with this party", and switching from Orders to Payments must not
 * take it off the screen.
 *
 * ONE COMPONENT, BOTH RECORDS
 * ---------------------------
 * The company and the contact page mounted the identical stack from two places, which is how two
 * pages showing the same account start to disagree about what it contains. They now mount this.
 */
import React from 'react';
import { Banknote, Inbox as InboxIcon, ShieldCheck, ShoppingBag, ShoppingCart, type LucideIcon } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/core/ui/tabs';
import {
  CustomerAccountOverview,
  CustomerTopItemsCard,
  PartyPaymentsCard,
} from '@/modules/finance/components/CustomerFinanceTabs';
import { CustomerFinanceRulesCard } from '@/modules/finance/components/CustomerFinanceRulesCard';
import { OrdersPanel } from '@/modules/finance/components/OrdersPanel';
import { PartyInboundDocsCard } from '@/modules/finance/components/PartyInboundDocsCard';

interface Props {
  workspaceId: string;
  /** Exactly one of these identifies the party; the other stays undefined. */
  companyId?: string;
  contactId?: string;
  partyName?: string;
  /** Which sides of the trade this party is on. Drives which actions and totals each section shows. */
  roles: { customer?: boolean; supplier?: boolean };
  /**
   * Whether the customer-only sections (repeat-buy suggestions, payment rules) apply. A pure
   * supplier has neither — pushing stock at someone who only sells to us is nonsense.
   */
  showCommercial?: boolean;
  /** Deep link to this party's ledger in Finance. */
  ledgerHref: string;
  /**
   * The company's VAT number. Present ⇒ the supplier's myDATA filings section is mounted; it is
   * matched by ΑΦΜ, so a party without one has nothing to match. Companies only — a received
   * document names a business.
   */
  vatNumber?: string | null;
  /** Deep link into the Expenses Inbox, carried by the Invoices section. */
  inboxHref?: string;
}

type Section = { id: string; label: string; icon: LucideIcon; node: React.ReactNode };

export const PartyAccountTabs: React.FC<Props> = ({
  workspaceId, companyId, contactId, partyName, roles,
  showCommercial = true, ledgerHref, vatNumber, inboxHref = '/finance?tab=doc_expenses',
}) => {
  const [tab, setTab] = React.useState('orders');

  const sections: Section[] = [
    {
      id: 'orders', label: 'Orders', icon: ShoppingCart,
      // Click an order to manage its receivables/payables, invoices, supplier bills, payments
      // and dispatch — the per-order surface is where the cash actually lives.
      node: (
        <OrdersPanel
          workspaceId={workspaceId}
          companyId={companyId}
          contactId={contactId}
          partyRoles={{ customer: !!roles.customer, supplier: !!roles.supplier }}
        />
      ),
    },
    {
      id: 'payments', label: 'Payments', icon: Banknote,
      // Itemised cash movements across ALL their orders, money in and out, so the party-level
      // question ("have they paid us?") is answerable without opening each order.
      node: (
        <PartyPaymentsCard
          companyId={companyId}
          contactId={contactId}
          customerName={partyName}
          roles={{ customer: !!roles.customer, supplier: !!roles.supplier }}
        />
      ),
    },
  ];

  // What this supplier filed against us on myDATA. Rows that are not in Expenses yet say so:
  // until one is added they are in neither Payables nor the P&L.
  if (companyId && roles.supplier) {
    sections.push({
      id: 'invoices', label: 'Invoices', icon: InboxIcon,
      node: (
        <PartyInboundDocsCard
          workspaceId={workspaceId}
          companyId={companyId}
          vatNumber={vatNumber}
          inboxHref={inboxHref}
          // As a tab pane this section IS the whole screen, so "nothing filed" has to be stated
          // rather than performed by disappearing — see the prop's own note.
          hideWhenEmpty={false}
        />
      ),
    });
  }

  if (showCommercial) {
    sections.push(
      {
        id: 'top-items', label: 'Top items', icon: ShoppingBag,
        node: <CustomerTopItemsCard companyId={companyId} contactId={contactId} />,
      },
      {
        id: 'rules', label: 'Payment rules', icon: ShieldCheck,
        node: <CustomerFinanceRulesCard companyId={companyId} contactId={contactId} />,
      },
    );
  }

  // A party that changes role loses a section; falling back to the first keeps the pane filled
  // rather than rendering a tab strip over nothing.
  const active = sections.some((s) => s.id === tab) ? tab : sections[0].id;

  return (
    <div className="space-y-4">
      {/* Pinned: the money summary the reader came for — orders count + value, owed, paid, net
          position and AR aging (or AP / "we owe" for a supplier). Never a tab. */}
      <CustomerAccountOverview
        companyId={companyId}
        contactId={contactId}
        customerName={partyName}
        isSupplier={!!roles.supplier}
        ledgerHref={ledgerHref}
      />

      <Tabs value={active} onValueChange={setTab} className="space-y-4">
        <TabsList>
          {sections.map(({ id, label, icon: Icon }) => (
            <TabsTrigger key={id} value={id}>
              <Icon className="h-4 w-4" aria-hidden="true" /> {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {sections.map(({ id, node }) => (
          <TabsContent key={id} value={id} className="mt-4">{node}</TabsContent>
        ))}
      </Tabs>
    </div>
  );
};
