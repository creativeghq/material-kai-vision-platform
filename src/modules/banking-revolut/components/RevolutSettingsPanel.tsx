/**
 * Revolut Business configuration panel — mounted on /admin/modules/banking-revolut/settings.
 *
 * BYOK: every credential belongs to a workspace, so this just renders the same
 * `RevolutConfigCard` that lives in Profile → Keys, scoped to the ACTIVE workspace.
 */
import React from 'react';
import { Card, CardContent } from '@/components/core/ui/card';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { RevolutConfigCard } from './RevolutConfigCard';
import { CardsExpensesCard } from './CardsExpensesCard';

interface Props { embedded?: boolean }

export const RevolutSettingsPanel: React.FC<Props> = (_props) => {
  const { activeWorkspaceId } = useWorkspace();

  if (!activeWorkspaceId) {
    return (
      <Card className="dashboard-card">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Select a workspace to configure Revolut Business.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <RevolutConfigCard workspaceId={activeWorkspaceId} />
      <CardsExpensesCard workspaceId={activeWorkspaceId} />
    </div>
  );
};
