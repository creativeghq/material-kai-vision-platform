import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, Copy, ExternalLink, Layers, Loader2, Pencil, Play, Sparkles, Trash2 } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardContent } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { getActiveWorkspaceId } from '@/utils/activeWorkspace';
import { usePermissions } from '@/hooks/usePermissions';
import { useEntitlements } from '@/hooks/useEntitlements';
import { entityTemplatesService, type EntityTemplate } from '@/services/entityTemplatesService';
import { formatDate } from '@/utils/datetime';
import {
  EXTERNAL_TEMPLATE_SOURCES, LIVE_TEMPLATE_TYPES, TEMPLATE_ADAPTERS, getAdapter,
  type LiveTemplateEntityType,
} from '@/services/templates/registry';

/**
 * Template Library (issue #322) — the one place that answers "what can I start from?".
 *
 * Generalizes what /blueprints does for scope-of-works to every record type: your saved templates
 * and the platform's starter examples, filtered by type, plus link-outs to the template systems
 * that already have their own manager (blueprints, email, WhatsApp, catalog designs…). Reached
 * from the App Launcher's "More" group.
 */
export const TemplateLibraryPage: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const workspaceId = getActiveWorkspaceId(user?.id);
  const { can } = usePermissions();
  const { isModuleAvailable } = useEntitlements();
  const [searchParams, setSearchParams] = useSearchParams();

  /**
   * Types this persona can actually act on. The adapters declare a `capability` / `moduleSlug`;
   * without this they were declared and ignored, so a member with no finance access still saw
   * Invoice templates and a "Use" button that lands on a page they cannot open — the inert-UI
   * shape `navReachability.test.ts` exists to prevent elsewhere.
   */
  const usableTypes = useMemo(
    () => LIVE_TEMPLATE_TYPES.filter((t) => {
      const a = TEMPLATE_ADAPTERS[t];
      if (a.capability && !can(a.capability)) return false;
      if (a.moduleSlug && !isModuleAvailable(a.moduleSlug)) return false;
      return true;
    }),
    [can, isModuleAvailable],
  );

  const typeFilter = searchParams.get('type');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<EntityTemplate[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates(await entityTemplatesService.list({ workspaceId }));
    } catch (e) {
      toast({ title: 'Failed to load templates', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [toast, workspaceId]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(
    () => templates.filter((t) =>
      (!typeFilter || t.entity_type === typeFilter)
      && (usableTypes as readonly string[]).includes(t.entity_type)),
    [templates, typeFilter, usableTypes],
  );
  const own = visible.filter((t) => !t.is_platform_starter);
  const starters = visible.filter((t) => t.is_platform_starter);

  const setType = (t: string | null) => {
    const p = new URLSearchParams(searchParams);
    if (t) p.set('type', t); else p.delete('type');
    setSearchParams(p, { replace: true });
  };

  const use = async (tpl: EntityTemplate) => {
    if (!workspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    setBusyId(tpl.id);
    try {
      const result = await entityTemplatesService.apply(tpl.id, { workspaceId });
      if (result.message) toast({ title: result.message });
      navigate(result.route);
    } catch (e) {
      toast({ title: 'Could not use this template', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const copyToWorkspace = async (tpl: EntityTemplate) => {
    if (!workspaceId) { toast({ title: 'No active workspace', variant: 'destructive' }); return; }
    setBusyId(tpl.id);
    try {
      const copy = await entityTemplatesService.duplicate(tpl.id, workspaceId);
      toast({ title: 'Copied to your templates' });
      navigate(`/templates/${copy.id}`);
    } catch (e) {
      toast({ title: 'Copy failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (tpl: EntityTemplate) => {
    if (!confirm(`Delete template "${tpl.title}"?`)) return;
    try {
      await entityTemplatesService.remove(tpl.id);
      setTemplates((prev) => prev.filter((t) => t.id !== tpl.id));
    } catch (e) {
      toast({ title: 'Delete failed', description: String((e as Error)?.message ?? e), variant: 'destructive' });
    }
  };

  const Tile = ({ tpl }: { tpl: EntityTemplate }) => {
    const adapter = getAdapter(tpl.entity_type);
    if (!adapter) return null;
    const Icon = adapter.icon;
    let facts: string[] = [];
    try { facts = adapter.summary(tpl.payload as never); } catch { facts = []; }

    return (
      <Card className="dashboard-card">
        <CardContent className="p-4 flex flex-col gap-2 h-full">
          <div className="flex items-start gap-2">
            <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium flex items-center gap-2">
                <span className="truncate">{tpl.title}</span>
                {tpl.is_platform_starter && <Badge variant="outline" className="text-[10px] h-4">Starter</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">{adapter.label}</div>
              {tpl.description && <div className="text-xs text-muted-foreground line-clamp-2 mt-1">{tpl.description}</div>}
            </div>
          </div>

          {facts.length > 0 && (
            <div className="text-xs text-muted-foreground">{facts.join(' · ')}</div>
          )}
          {tpl.usage_count > 0 && (
            <div className="text-[11px] text-muted-foreground">
              Used {tpl.usage_count} time{tpl.usage_count === 1 ? '' : 's'}
              {tpl.last_used_at && ` · last ${formatDate(tpl.last_used_at)}`}
            </div>
          )}

          <div className="mt-auto pt-2 flex items-center gap-2">
            <Button size="sm" className="rounded-full" disabled={busyId === tpl.id} onClick={() => use(tpl)}>
              {busyId === tpl.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
              Use
            </Button>
            {tpl.is_platform_starter ? (
              <Button variant="outline" size="sm" className="rounded-full" disabled={busyId === tpl.id} onClick={() => copyToWorkspace(tpl)}>
                <Copy className="h-3.5 w-3.5 mr-1" /> Copy to edit
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" className="rounded-full" onClick={() => navigate(`/templates/${tpl.id}`)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto" onClick={() => remove(tpl)}>
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        icon={Layers}
        title="Templates"
        subtitle="Start from something you already built. Save any record as a template, or begin from a platform starter."
      />

      <main className="px-4 sm:px-6 py-6 space-y-6">
        <div className="flex flex-wrap gap-2">
          <Button
            variant={typeFilter ? 'outline' : 'default'}
            size="sm"
            className="rounded-full"
            onClick={() => setType(null)}
          >
            All
          </Button>
          {usableTypes.map((t: LiveTemplateEntityType) => {
            const adapter = TEMPLATE_ADAPTERS[t];
            const Icon = adapter.icon;
            const count = templates.filter((x) => x.entity_type === t).length;
            return (
              <Button
                key={t}
                variant={typeFilter === t ? 'default' : 'outline'}
                size="sm"
                className="rounded-full"
                onClick={() => setType(t)}
              >
                <Icon className="h-3.5 w-3.5 mr-1" /> {adapter.plural}
                {count > 0 && <span className="ml-1 text-xs opacity-70">{count}</span>}
              </Button>
            );
          })}
        </div>

        {loading ? (
          <div className="py-16 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <>
            <section className="space-y-2">
              <div className="text-sm font-medium">Your templates</div>
              {own.length === 0 ? (
                <Card className="dashboard-card"><CardContent className="p-8 text-center text-sm text-muted-foreground">
                  Nothing saved yet. Open any invoice, quote, project or moodboard and choose
                  <span className="font-medium"> Save as template</span> — or copy a starter below.
                </CardContent></Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {own.map((t) => <Tile key={t.id} tpl={t} />)}
                </div>
              )}
            </section>

            {starters.length > 0 && (
              <section className="space-y-2">
                <div className="text-sm font-medium flex items-center gap-1"><Sparkles className="h-3.5 w-3.5" /> Starter examples</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {starters.map((t) => <Tile key={t.id} tpl={t} />)}
                </div>
              </section>
            )}

            <section className="space-y-2">
              <div className="text-sm font-medium flex items-center gap-1"><ExternalLink className="h-3.5 w-3.5" /> Other template libraries</div>
              <div className="text-xs text-muted-foreground">
                These have their own editors — the links go straight there.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {EXTERNAL_TEMPLATE_SOURCES.filter((x) => !x.moduleSlug || isModuleAvailable(x.moduleSlug)).map((s) => {
                  const Icon = s.icon;
                  return (
                    <Card key={s.id} className="dashboard-card cursor-pointer" onClick={() => navigate(s.route)}>
                      <CardContent className="p-4 flex items-start gap-2">
                        <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium flex items-center gap-1">
                            <span className="truncate">{s.label}</span>
                            <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          </div>
                          <div className="text-xs text-muted-foreground line-clamp-2">{s.description}</div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
};

export default TemplateLibraryPage;
