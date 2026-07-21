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
import { useLauncherApps, groupAppsByHub, type LauncherApp } from '@/hooks/useLauncherApps';
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

  // Group everything (active + available-to-add) by Hub so the page reads as a small,
  // organized set of Hubs — active apps open, inactive apps offer Enable/Request (upsell).
  const hubGroups = groupAppsByHub([...active, ...available]);

  const appCard = (app: LauncherApp) =>
    app.active ? (
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
    ) : (
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
    );

  return (
    <div>
      <PageHeader
        icon={LayoutGrid}
        title="Apps"
        subtitle="Your Hubs — active apps plus add-ons you can enable"
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
        ) : hubGroups.length === 0 ? (
          <p className="text-sm text-muted-foreground">No apps available in this workspace yet.</p>
        ) : (
          hubGroups.map(({ hub, apps }) => (
            <section key={hub?.id ?? 'more'} className="space-y-3">
              {/* Headline: [icon] Hub ───────────── [count] — same rule-line as the App Launcher. */}
              <div className="flex items-center gap-2">
                {hub ? <hub.icon className="h-4 w-4 shrink-0 text-primary" /> : null}
                <h2 className="shrink-0 text-base font-semibold">{hub?.label ?? 'More'}</h2>
                <span className="h-px flex-1 bg-muted" />
                <span className="shrink-0 text-xs text-muted-foreground">{apps.length}</span>
              </div>
              {hub?.description && <p className="-mt-2 text-xs text-muted-foreground">{hub.description}</p>}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {apps.map(appCard)}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
};

export default AppsPage;
