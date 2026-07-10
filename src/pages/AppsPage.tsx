// #251 — the workspace App hub. Shows what's active in this workspace (click to open) and what's
// available to add (enable / request), with descriptions and status. Reached from the top-bar App
// Launcher, not a top-nav item.
import React from 'react';
import { LayoutGrid, ArrowRight, Plus, Loader2, Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/core/ui/card';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useLauncherApps, type LauncherApp } from '@/hooks/useLauncherApps';
import { useWorkspace } from '@/contexts/WorkspaceContext';

const AppsPage: React.FC = () => {
  const { active, available, canManage, enabling, enable, loading } = useLauncherApps();
  const { workspaceRole, isPlatformOperator } = useWorkspace();
  const { toast } = useToast();
  const isOwner = workspaceRole === 'owner' || isPlatformOperator;

  const onEnable = async (app: LauncherApp) => {
    const res = await enable(app);
    toast({ title: res.message, variant: res.ok ? 'default' : 'destructive' });
  };

  return (
    <div>
      <PageHeader
        icon={LayoutGrid}
        title="Apps"
        subtitle="Everything active in this workspace"
        actions={isOwner ? (
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/profile?tab=modules"><Settings className="h-4 w-4" /> Manage modules</Link>
          </Button>
        ) : undefined}
      />
      <div className="px-3 sm:px-6 py-4 sm:py-8 space-y-8">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <section className="space-y-3">
              <h2 className="text-sm font-medium text-muted-foreground">Active</h2>
              {active.length === 0 ? (
                <p className="text-sm text-muted-foreground">No apps active in this workspace yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {active.map((app) => (
                    <Link key={app.id} to={app.path} className="group">
                      <Card className="h-full transition-colors group-hover:border-primary/50">
                        <CardContent className="p-4 flex items-start gap-3">
                          <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0"><app.icon className="h-5 w-5" /></div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="font-medium truncate">{app.label}</div>
                              <Badge variant="secondary" className="gap-1 text-[10px] shrink-0">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Active
                              </Badge>
                            </div>
                            {app.description && <p className="text-sm text-muted-foreground line-clamp-2">{app.description}</p>}
                          </div>
                          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            {available.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-medium text-muted-foreground">Available to add</h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {available.map((app) => (
                    <Card key={app.id} className="h-full">
                      <CardContent className="p-4 flex flex-col gap-3 h-full">
                        <div className="flex items-start gap-3">
                          <div className="rounded-lg bg-muted p-2 text-muted-foreground shrink-0"><app.icon className="h-5 w-5" /></div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <div className="font-medium truncate">{app.label}</div>
                              {app.priceLabel && <Badge variant="outline" className="text-[10px] shrink-0">{app.priceLabel}</Badge>}
                            </div>
                            {app.description && <p className="text-sm text-muted-foreground line-clamp-2">{app.description}</p>}
                          </div>
                        </div>
                        <div className="mt-auto flex justify-end">
                          <Button size="sm" variant="outline" disabled={enabling === app.moduleSlug} onClick={() => onEnable(app)}>
                            {enabling === app.moduleSlug
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : (<><Plus className="h-4 w-4 mr-1" />{canManage ? 'Enable' : 'Request'}</>)}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default AppsPage;
