/** The guard that was missing, and whose absence put seven tenant surfaces behind the operator. */
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';

import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';

export const WorkspaceAdminGuard: React.FC<{ children: React.ReactNode; fallbackPath?: string }> = ({
  children,
  fallbackPath = '/',
}) => {
  const { isWorkspaceManager, loading } = usePermissions();
  const navigate = useNavigate();

  if (loading) return null;

  if (!isWorkspaceManager) {
    return (
      <div className="container mx-auto py-12">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
              <Shield className="w-6 h-6 text-muted-foreground" />
            </div>
            <CardTitle className="text-xl">Not your settings to change</CardTitle>
            <CardDescription>
              This page configures the whole workspace, so it is limited to its owner and admins.
              Ask one of them to make the change — or to make you an admin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={() => navigate(fallbackPath)}>
              <ArrowLeft className="w-4 h-4 mr-2" /> Go back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};

export default WorkspaceAdminGuard;
