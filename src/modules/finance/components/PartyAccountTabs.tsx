/** The Account tab of a CRM party record (company or person), behind ONE tab strip. */
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
