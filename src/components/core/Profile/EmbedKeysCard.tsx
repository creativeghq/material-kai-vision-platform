/** Profile → Keys → Website Embed: the widgets on a workspace's own websites, and their keys. */
import React, { useCallback, useEffect, useState } from 'react';
import { Code2, Copy, Loader2, Plus, Trash2, Globe, AlertTriangle, Sparkles, KeyRound } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Switch } from '@/components/core/ui/switch';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/core/ui/alert-dialog';
import {
  embedKeysService, isWildcardOriginList, DEFAULT_GENERATION_DAILY_CAP,
  type EmbedKey, type EmbedAnalyticsSummary,
} from '@/services/embedKeysService';
import { supabaseConfig } from '@/config/apis/supabaseConfig';
import { HubEmptyState } from '@/components/core/hub';
import { EmbedWidgetDialog } from '@/components/core/Profile/embed/EmbedWidgetDialog';
import { EMBED_WIDGETS, widgetsForKey } from '@/components/core/Profile/embed/embedWidgets';

/** Event types the widgets emit; the endpoint's allowlist must accept each one too. */
const EMBED_EVENT_LABELS: Array<[string, string]> = [
  ['embed_view', 'Views'],
  ['embed_model_load', '3D loads'],
  ['embed_configure', 'Options changed'],
  ['embed_plan_room', 'Room planner opened'],
  ['embed_ar_launch', 'AR launches'],
  ['embed_add_to_cart', 'Add to cart'],
  ['embed_visualize_surface', 'Surfaces rendered'],
  ['embed_visualizer_share', 'Renders shared'],
  ['embed_visualizer_quote', 'Quotes from a render'],
];

const DEFAULT_RATE = 60;

/** What a key is limited to, in the row summary. */
function scopeLabel(key: EmbedKey): string {
  if (key.key_kind === 'tools') return 'Calculators only';
  const n = key.scope_values?.length ?? 0;
  if (key.scope_type === 'categories') return `${n} ${n === 1 ? 'category' : 'categories'}`;
  if (key.scope_type === 'products') return `${n} ${n === 1 ? 'product' : 'products'}`;
  if (key.scope_type === 'blueprints') return `${n} ${n === 1 ? 'blueprint' : 'blueprints'}`;
  return 'Everything published';
}

function servesLabel(key: EmbedKey): string {
  const ids = widgetsForKey(key);
  return EMBED_WIDGETS.filter((w) => ids.includes(w.id)).map((w) => w.title).join(', ');
}

/** For anyone wiring their own storefront instead of using a widget. */
function apiSnippet(apiKey: string): string {
  const base = supabaseConfig.projectUrl.replace(/\/$/, '');
  return `fetch("${base}/functions/v1/products-3d-api?action=list&only_3d=true&key=${apiKey}")
  .then((r) => r.json())
  .then(({ products }) => console.log(products));`;
}

export const EmbedKeysCard: React.FC = () => {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const [keys, setKeys] = useState<EmbedKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<{ open: boolean; key: EmbedKey | null }>({ open: false, key: null });
  const [pendingDelete, setPendingDelete] = useState<EmbedKey | null>(null);
  const [analytics, setAnalytics] = useState<EmbedAnalyticsSummary | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      setKeys(await embedKeysService.list(activeWorkspaceId));
      embedKeysService.analytics(activeWorkspaceId, 30)
        .then(setAnalytics)
        .catch(() => setAnalytics(null));
    } catch (err) {
      toast({
        title: 'Could not load embed keys',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [activeWorkspaceId, toast]);

  useEffect(() => { void load(); }, [load]);

  const handleToggle = async (key: EmbedKey, isActive: boolean) => {
    try {
      await embedKeysService.update(key.id, { is_active: isActive });
      setKeys((prev) => prev.map((k) => (k.id === key.id ? { ...k, is_active: isActive } : k)));
    } catch (err) {
      toast({
        title: 'Could not update the key',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleGenerationToggle = async (key: EmbedKey, allow: boolean) => {
    try {
      await embedKeysService.update(key.id, { allow_generation: allow });
      setKeys((prev) => prev.map((k) => (k.id === key.id ? { ...k, allow_generation: allow } : k)));
    } catch (err) {
      toast({
        title: 'Could not update the key',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    try {
      await embedKeysService.remove(pendingDelete.id);
      toast({ title: 'Embed key deleted', description: 'Any site still using it will stop loading products.' });
      setPendingDelete(null);
      await load();
    } catch (err) {
      toast({
        title: 'Could not delete the key',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied` });
    } catch {
      toast({ title: 'Could not copy', variant: 'destructive' });
    }
  };

  if (!activeWorkspaceId) return null;

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-base">
              <Code2 className="h-4 w-4 text-primary" />
              Website widgets
            </CardTitle>
            <CardDescription>
              Put a product finder, a single product, the tile visualizer, a configurator or the
              calculators on your own website. Each widget has a public key that only works on the
              websites you list, and only published products are ever shown.
            </CardDescription>
          </div>
          <Button size="sm" className="shrink-0" onClick={() => setDialog({ open: true, key: null })}>
            <Plus />Add widget
          </Button>
        </CardHeader>

        <CardContent className="space-y-3">
          {analytics && analytics.total > 0 && (
            <div className="rounded-md border border-border/60 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="text-sm font-medium">Last {analytics.days} days</span>
                <span className="text-xs text-muted-foreground">{analytics.total} events</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {EMBED_EVENT_LABELS.map(([key, label]) => (
                  <div key={key}>
                    <p className="text-lg font-semibold tabular-nums">{analytics.by_event[key] ?? 0}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                ))}
              </div>
              {analytics.generation?.count > 0 && (
                <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-border/60 pt-3">
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Sparkles className="h-3.5 w-3.5" />AI impressions
                  </span>
                  <span className="text-sm tabular-nums">
                    {analytics.generation.count}
                    <span className="text-muted-foreground"> generated</span>
                  </span>
                  <span className="text-sm tabular-nums">
                    {analytics.generation.credits}
                    <span className="text-muted-foreground"> credits</span>
                  </span>
                </div>
              )}

              {analytics.top_pages.length > 0 && (
                <div className="mt-3 border-t border-border/60 pt-3">
                  <p className="text-xs text-muted-foreground">Where it is running</p>
                  <ul className="mt-1 space-y-0.5">
                    {analytics.top_pages.map((p) => (
                      <li key={p.page} className="flex justify-between gap-3 text-xs">
                        <span className="truncate text-muted-foreground">{p.page}</span>
                        <span className="shrink-0 tabular-nums">{p.events}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />Loading keys…
            </div>
          ) : keys.length === 0 ? (
            <HubEmptyState
              icon={KeyRound}
              title="No widgets yet"
              description="Pick a widget, choose what it shows, preview it here, and copy the code into your website."
              action={<Button size="sm" onClick={() => setDialog({ open: true, key: null })}><Plus />Add widget</Button>}
            />
          ) : (
            keys.map((key) => {
              const wildcard = isWildcardOriginList(key.allowed_origins);
              const spent = analytics?.generation?.by_key.find((k) => k.embed_key_id === key.id);
              return (
                <div key={key.id} className="rounded-md border border-border/60 p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{key.key_name}</span>
                        <span className={`text-xs ${key.is_active ? 'text-success' : 'text-muted-foreground'}`}>
                          {key.is_active ? 'Active' : 'Disabled'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {servesLabel(key)} · {scopeLabel(key)}
                        {' · '}{key.rate_limit_per_minute ?? DEFAULT_RATE} requests/min
                        {key.usage_count ? ` · ${key.usage_count} requests` : ' · never used'}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={!!key.is_active}
                        onCheckedChange={(v) => handleToggle(key, v)}
                        aria-label={`${key.is_active ? 'Disable' : 'Enable'} ${key.key_name}`}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setPendingDelete(key)}
                        aria-label={`Delete ${key.key_name}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
                      {key.api_key}
                    </code>
                    <Button size="sm" variant="outline" className="shrink-0"
                      onClick={() => copy(key.api_key, 'Key')}>
                      <Copy className="h-3.5 w-3.5 mr-1" />Copy
                    </Button>
                    <Button size="sm" variant="outline" className="shrink-0"
                      onClick={() => setDialog({ open: true, key })}>
                      Get code
                    </Button>
                    <Button size="sm" variant="ghost" className="shrink-0"
                      onClick={() => copy(apiSnippet(key.api_key), 'API snippet')}>
                      API
                    </Button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-muted/40 px-3 py-2">
                    <div className="flex items-start gap-2 min-w-0">
                      <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 text-xs">
                        <p>AI impressions for specs you don't stock</p>
                        <p className="text-muted-foreground">
                          {key.allow_generation
                            ? `Up to ${key.generation_daily_cap ?? DEFAULT_GENERATION_DAILY_CAP} a day, charged to this workspace`
                            : 'Off — the builder shows no picture when nothing matches'}
                          {spent ? ` · ${spent.credits} credits in the last ${analytics?.days ?? 30} days` : ''}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={!!key.allow_generation}
                      onCheckedChange={(v) => handleGenerationToggle(key, v)}
                      aria-label={`${key.allow_generation ? 'Disable' : 'Enable'} AI impressions for ${key.key_name}`}
                    />
                  </div>

                  <div className="flex items-start gap-2 text-xs">
                    {wildcard ? (
                      <>
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                        <span className="text-warning">
                          Any website may use this key. Restrict it to your own domains unless you
                          intend to let partners embed your catalog.
                        </span>
                      </>
                    ) : (
                      <>
                        <Globe className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {(key.allowed_origins ?? []).join(', ') || 'No website allowed — this key cannot be used.'}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}

          {keys.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Paste the snippet anywhere in your site's HTML. On <strong>Shopify</strong>, use{' '}
              <span className="text-foreground">Theme → Customise → Add section → Custom Liquid</span>{' '}
              — and add your <code className="font-mono">.myshopify.com</code> address to the key's
              websites as well as your live domain, or it will look broken in the theme editor.{' '}
              <a
                href="/documentation/api-embed.html#shopify"
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-2"
              >
                Full instructions
              </a>
              .
            </p>
          )}
        </CardContent>
      </Card>

      {activeWorkspaceId && (
        <EmbedWidgetDialog
          open={dialog.open}
          onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
          workspaceId={activeWorkspaceId}
          existingKey={dialog.key}
          onSaved={() => void load()}
        />
      )}

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.key_name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Any website still using this key will stop showing your products immediately. If you
              only want to pause it, switch it off instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction className="rounded-full" onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
