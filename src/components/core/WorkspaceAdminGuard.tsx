/**
 * The guard that was missing, and whose absence put seven tenant surfaces behind the operator.
 *
 * There were exactly three real gates: `AdminGuard` (`isPlatformOperator` — owner/admin of the
 * ROOT workspace, i.e. us and nobody else), `CapabilityGuard` (a persona capability) and
 * `EntitlementGuard` (this workspace owns the module). Configuration pages for a workspace's OWN
 * modules — its messaging channels, its email domains, its catalogs, its social accounts, its
 * automations — fit none of them:
 *
 *   • `EntitlementGuard` alone is too wide: it asks "does this workspace own the module?", so
 *     every member gets in, and a warehouse user could rewire the company's WhatsApp sender.
 *   • `AdminGuard` is too narrow, and it is the one they were all using. It does not mean "an
 *     admin"; it means the platform operator. A customer workspace that BUYS the messaging module
 *     therefore cannot open the page that configures it — not the owner, not anyone. The module is
 *     sold and unusable. Nothing reports this, because the route resolves and the guard is doing
 *     exactly what it says.
 *
 * This is the middle rung: owner/admin OF THE ACTIVE WORKSPACE. Pair it with `EntitlementGuard`
 * (the module route builder does) so the question asked is the right one — "does this workspace
 * own the module, and are you the one who runs this workspace?"
 *
 * It is deliberately NOT a capability. Capabilities describe what a PERSONA does (sell, invoice,
 * run HR); this is about standing in one workspace, which is `workspace_members.role` — the same
 * fact `is_workspace_admin()` enforces server-side. Adding a capability per module would mean a
 * new capability every time a module ships.
 */
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
