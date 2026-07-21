/**
 * Viva configuration panel — mounted on /admin/modules/payments-viva/settings.
 *
 * Viva is BYOK, so there is nothing platform-level to configure: every credential belongs
 * to a workspace. This panel therefore just renders the same `VivaConfigCard` that lives
 * in Profile → Keys, scoped to the ACTIVE workspace — one card, two entry points, no
 * second implementation to drift.
 */
import React from 'react';
import { Card, CardContent } from '@/components/core/ui/card';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { VivaConfigCard } from './VivaConfigCard';

interface Props { embedded?: boolean }

export const VivaSettingsPanel: React.FC<Props> = (_props) => {
  const { activeWorkspaceId } = useWorkspace();

  if (!activeWorkspaceId) {
    return (
      <Card className="dashboard-card">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          Select a workspace to configure Viva.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <VivaConfigCard workspaceId={activeWorkspaceId} />
    </div>
  );
};
