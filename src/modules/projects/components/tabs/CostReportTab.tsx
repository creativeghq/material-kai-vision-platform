/** Costs: is this job making money. Receivables and payables live in Invoicing and Purchases. */
import React, { useState } from 'react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { JobCostCard } from '../JobCostCard';
import { CostCodesCard } from '../CostCodesCard';
import { ProjectStockCard } from '../ProjectStockCard';

export const CostReportTab: React.FC<{
  projectId: string;
  onOpenSection: (tab: string) => void;
  showCvr: boolean;
}> = ({ projectId, onOpenSection, showCvr }) => {
  const { activeWorkspaceId } = useWorkspace();
  const [currency, setCurrency] = useState('EUR');

  return (
    <div className="space-y-4">
      <JobCostCard projectId={projectId} workspaceId={activeWorkspaceId} onCurrency={setCurrency} />
      <CostCodesCard projectId={projectId} currency={currency} showCvr={showCvr} />
      <ProjectStockCard projectId={projectId} onOpenSection={onOpenSection} />
    </div>
  );
};
