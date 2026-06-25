import React from 'react';
import { LayoutDashboard } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { MyDocumentsTab } from '@/components/core/Profile/MyDocumentsTab';

/**
 * Client Portal — a standalone, branded destination for a customer to see their own
 * account: spend/outstanding summary, orders (with line-item drill-in), invoices,
 * receipts and payment receipts. Reuses the same self-contained portal body that the
 * Profile → "My Account" tab mounts (the body fetches its own data, ownership-scoped
 * via the finance-customer-documents edge function). Linkable from invoice/statement
 * emails so customers land straight on their account.
 */
const ClientPortalPage: React.FC = () => (
  <div>
    <PageHeader
      icon={LayoutDashboard}
      title="Client Portal"
      subtitle="Your orders, invoices, receipts and account balance"
    />
    <div className="px-3 sm:px-6 py-4 sm:py-8">
      <MyDocumentsTab />
    </div>
  </div>
);

export default ClientPortalPage;
