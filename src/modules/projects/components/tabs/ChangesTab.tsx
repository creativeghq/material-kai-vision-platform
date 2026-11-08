/** Changes: the one variation register — manual variations and plan change orders alike. */
import React from 'react';
import { GitPullRequestArrow } from 'lucide-react';

import { Card } from '@/components/core/ui/card';
import { HubEmptyState } from '@/components/core/hub';
import { ModuleTabGate } from '@/components/core/ModuleTabGate';
import { usePermissions } from '@/hooks/usePermissions';
import { VariationsCard } from '../VariationsCard';

interface ChangesTabProps {
  projectId: string;
  workspaceId: string | null;
  currency: string;
  canFinance: boolean;
}

export const ChangesTab: React.FC<ChangesTabProps> = ({ projectId, workspaceId, currency, canFinance }) => {
  const { isWorkspaceManager } = usePermissions();

  if (!canFinance || !workspaceId) {
    return (
      <Card className="dashboard-card p-0">
        <HubEmptyState
          icon={GitPullRequestArrow}
          title="Changes carry money"
          description="Variations change what the customer pays and what subcontractors are owed, so they are visible to people with finance access on this project."
        />
      </Card>
    );
  }

  return (
    <ModuleTabGate moduleSlug="sales-finance" moduleName="Sales & Finance" blurb="Record and approve variations to this project's agreed scope.">
      <VariationsCard projectId={projectId} workspaceId={workspaceId} currency={currency} canEdit={isWorkspaceManager} />
    </ModuleTabGate>
  );
};

export default ChangesTab;
