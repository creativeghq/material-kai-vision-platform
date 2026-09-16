import React, { useEffect, useState } from 'react';
import { LayoutDashboard, Loader2, ArrowRight, Home } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { MyDocumentsTab } from '@/components/core/Profile/MyDocumentsTab';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getErrorMessage } from '@/core/errors/utils';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { workspaceManagementService } from '@/services/workspaceManagementService';
import { ownerPropertiesService } from '@/services/ownerPropertiesService';
import { Link } from 'react-router-dom';

/**
 * Client Portal — a customer's own account: spend, orders, invoices, receipts, balance. The body
 * is the same one Profile → "My Account" mounts, ownership-scoped via finance-customer-documents.
 */
const ClientPortalPage: React.FC = () => {
  const { activeWorkspace, activeWorkspaceId, refresh } = useWorkspace();
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [propertyCount, setPropertyCount] = useState(0);

  useEffect(() => {
    ownerPropertiesService.list()
      .then((r) => setPropertyCount(r.properties.length))
      .catch(() => setPropertyCount(0));
  }, []);

  const upgrade = async () => {
    if (!activeWorkspaceId) return;
    setBusy(true);
    try {
      await workspaceManagementService.upgradeGuestWorkspace(activeWorkspaceId);
      await refresh();
      toast({ title: 'Your account is open', description: 'The catalog and your own workspace are now available.' });
    } catch (err) {
      toast({ title: 'Could not open the account', description: getErrorMessage(err), variant: 'destructive' });
    } finally { setBusy(false); }
  };

  return (
    <div>
      <PageHeader
        icon={LayoutDashboard}
        title="Client Portal"
        subtitle="Your orders, invoices, receipts and account balance"
      />
      <div className="px-3 sm:px-6 py-4 sm:py-8 space-y-4">
        {activeWorkspace?.kind === 'guest' && (
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium">Want more than your orders?</p>
                <p className="text-sm text-muted-foreground">
                  Open a full account to browse the catalog, save ideas to moodboards and run your
                  own projects. Nothing here changes.
                </p>
              </div>
              <Button onClick={upgrade} disabled={busy} className="shrink-0">
                {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ArrowRight className="h-4 w-4 mr-2" />}
                Open a full account
              </Button>
            </CardContent>
          </Card>
        )}
        {propertyCount > 0 && (
          <Card>
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <Home className="h-4 w-4 text-muted-foreground shrink-0" />
                <p className="text-sm">
                  {propertyCount === 1 ? 'You have a property with us.' : `You have ${propertyCount} properties with us.`}
                  {' '}See how it is doing.
                </p>
              </div>
              <Button variant="outline" asChild className="shrink-0">
                <Link to="/my-properties">My properties</Link>
              </Button>
            </CardContent>
          </Card>
        )}
        <MyDocumentsTab />
      </div>
    </div>
  );
};

export default ClientPortalPage;
