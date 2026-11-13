import React from 'react';
import { ClipboardCheck } from 'lucide-react';

import { FreightQuoteRequestsPanel } from '../Approvals/FreightQuoteRequestsPanel';
import { SupplierClaimsPanel } from '../Approvals/SupplierClaimsPanel';
import { FactoryAccessRequestsTab } from '../FactoryAccessRequestsTab';
import { FactoryRegistrationsTab } from '../FactoryRegistrationsTab';
import { MarketplaceApprovalsTab } from '../MarketplaceApprovalsTab';
import { ResellerApplicationsTab } from '../ResellerApplicationsTab';
import { useAdminAttention } from './adminAttention';
import { HqTabbedPage } from './HqTabbedPage';

const ApprovalsPage: React.FC = () => {
  const { data } = useAdminAttention();
  const a = data?.approvals;
  return (
    <HqTabbedPage
      icon={ClipboardCheck}
      title="Approvals"
      subtitle="Every request waiting on an operator decision. Counts are what is still pending."
      tabs={[
        { id: 'registrations', label: 'Brand Registrations', count: a?.registrations, render: () => <FactoryRegistrationsTab /> },
        { id: 'access', label: 'Access Requests', count: a?.access, render: () => <FactoryAccessRequestsTab /> },
        { id: 'resellers', label: 'Resellers', count: a?.resellers, render: () => <ResellerApplicationsTab /> },
        { id: 'marketplace', label: 'Marketplace', count: a?.marketplace, render: () => <MarketplaceApprovalsTab /> },
        { id: 'supplier-claims', label: 'Supplier Claims', count: a?.supplier_claims, render: () => <SupplierClaimsPanel /> },
        { id: 'freight-quotes', label: 'Freight Quotes', count: a?.freight_quotes, render: () => <FreightQuoteRequestsPanel /> },
      ]}
    />
  );
};

export default ApprovalsPage;
