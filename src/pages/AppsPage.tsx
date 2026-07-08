// #251 — the workspace App hub. Lists the active workspace's modules as cards; the owner
// also gets a shortcut to Profile → Modules to activate more. Reached from the top-bar
// App Launcher (grid icon), NOT from a top-nav item.
import React from 'react';
import { LayoutGrid, Plus, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/core/ui/card';
import { useAppNavItems } from '@/hooks/useAppNavItems';
import { useWorkspace } from '@/contexts/WorkspaceContext';

const AppsPage: React.FC = () => {
  const { entries, loading } = useAppNavItems();
  const { workspaceRole, isPlatformOperator } = useWorkspace();
  const isOwner = workspaceRole === 'owner' || isPlatformOperator;

  return (
    <div>
      <PageHeader icon={LayoutGrid} title="Apps" subtitle="Modules active in this workspace" />
      <div className="px-3 sm:px-6 py-4 sm:py-8 space-y-6">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {entries.map((e) => (
              <Link key={e.id} to={e.path}>
                <Card className="h-full transition-colors hover:border-primary/50">
                  <CardContent className="p-4 flex items-start gap-3">
                    <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0">
                      <e.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium">{e.label}</div>
                      <p className="text-sm text-muted-foreground line-clamp-2">{e.description}</p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}

            {isOwner && (
              <Link to="/profile?tab=modules">
                <Card className="h-full border-dashed transition-colors hover:border-primary/50">
                  <CardContent className="p-4 flex items-center gap-3 text-muted-foreground">
                    <div className="rounded-lg bg-muted p-2 shrink-0">
                      <Plus className="h-5 w-5" />
                    </div>
                    <div className="flex items-center gap-1 font-medium">
                      Add a module <ArrowRight className="h-4 w-4" />
                    </div>
                  </CardContent>
                </Card>
              </Link>
            )}

            {entries.length === 0 && !isOwner && (
              <p className="text-sm text-muted-foreground">No modules are active in this workspace yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AppsPage;
