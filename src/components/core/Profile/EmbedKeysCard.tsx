/**
 * Profile → Keys → Embed: create and manage the publishable keys a workspace pastes into its own
 * website (#321 M1, #258).
 *
 * The origin list is the primary control here, so it is a required field rather than an advanced
 * option: the column shipped with a `['*']` default and no code that read it, which meant a key
 * would have worked from any site on the internet. Creating a key now forces the choice, and the
 * wildcard is spelled out as a warning rather than offered as a checkbox with a neutral label.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Code2, Copy, Loader2, Plus, Trash2, Globe, AlertTriangle, Sparkles, KeyRound } from 'lucide-react';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Label } from '@/components/core/ui/label';
import { Textarea } from '@/components/core/ui/textarea';
import { Switch } from '@/components/core/ui/switch';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/core/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/core/ui/alert-dialog';
import { Checkbox } from '@/components/core/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/core/ui/radio-group';
import {
  embedKeysService, normalizeOriginList, isWildcardOriginList,
  listScopeCategories, searchScopeProducts,
  MAX_RATE_LIMIT_PER_MINUTE, DEFAULT_GENERATION_DAILY_CAP, MAX_GENERATION_DAILY_CAP,
  type EmbedKey, type EmbedScopeType, type EmbedScopeOption,
  type EmbedAnalyticsSummary,
} from '@/services/embedKeysService';

/**
 * What the widget emits, in the order a visit produces them.
 *
 * THE THIRD OF THREE PLACES an event type has to appear: the widget emits it, the endpoint's
 * allowlist accepts it, and this list displays it. Miss the second and the beacon is refused with a
 * 400 it swallows; miss this one and the rows are written and shown to nobody. Both read as zero,
 * from opposite ends. `embed_configure` was missing from the last two until #341.
 */
const EMBED_EVENT_LABELS: Array<[string, string]> = [
  ['embed_view', 'Views'],
  ['embed_model_load', '3D loads'],
  ['embed_configure', 'Options changed'],
  ['embed_plan_room', 'Room planner opened'],
  ['embed_ar_launch', 'AR launches'],
  ['embed_add_to_cart', 'Add to cart'],
];
import { supabaseConfig } from '@/config/apis/supabaseConfig';
import { HubEmptyState } from '@/components/core/hub';

const DEFAULT_RATE = 60;

/** What a key is limited to, in the row summary. Counts, not ids — ids mean nothing at a glance. */
function scopeLabel(key: EmbedKey): string {
  const n = key.scope_values?.length ?? 0;
  if (key.scope_type === 'categories') return `${n} ${n === 1 ? 'category' : 'categories'}`;
  if (key.scope_type === 'products') return `${n} ${n === 1 ? 'product' : 'products'}`;
  return 'Everything published';
}

/**
 * The snippet a tenant copies into their own site. ONE tag (#341 entry point 2).
 *
 * `<materialkai-builder>` is the entry and naming a product is a MODE of it, not a second
 * component — the builder already mounts `<materialkai-product>` internally, both on a match and
 * on the deep-link path. The platform used to hand out two snippets, which made a merchant choose
 * between them before they understood either, and the one that captures demand for things the
 * catalogue cannot satisfy was the one nothing offered.
 *
 * `<materialkai-product>` is still exported and still works for anyone already using it.
 */
function usageSnippet(apiKey: string): string {
  const base = window.location.origin;
  return `<script src="${base}/embed/materialkai-product.js" defer></script>

<!-- Asks the visitor what they are after, prices it if you stock it,
     and captures the request if you don't. -->
<materialkai-builder api-key="${apiKey}"></materialkai-builder>

<!-- Or pin it to one product, for a page that is already about that product: -->
<materialkai-builder api-key="${apiKey}" product-id="PRODUCT_ID"></materialkai-builder>`;
}

/** For anyone wiring their own storefront instead of using the tag. */
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
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<EmbedKey | null>(null);
  const [analytics, setAnalytics] = useState<EmbedAnalyticsSummary | null>(null);

  const [form, setForm] = useState({
    name: '', origins: '', rate: DEFAULT_RATE, allowAny: false,
    scopeType: 'all' as EmbedScopeType, scopeValues: [] as string[],
    allowGeneration: false, dailyCap: DEFAULT_GENERATION_DAILY_CAP,
  });

  // Scope pickers. Categories are a short fixed list (a global taxonomy, ~a dozen entries), so they
  // load once as checkboxes; products are unbounded per workspace, so they type-ahead.
  const [categories, setCategories] = useState<EmbedScopeOption[]>([]);
  const [productTerm, setProductTerm] = useState('');
  const [productHits, setProductHits] = useState<EmbedScopeOption[]>([]);
  // Labels for already-chosen products, so a selection stays readable after the search box clears.
  const [chosenProducts, setChosenProducts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!creating || form.scopeType !== 'categories' || categories.length) return;
    listScopeCategories().then(setCategories).catch(() => setCategories([]));
  }, [creating, form.scopeType, categories.length]);

  useEffect(() => {
    if (!creating || form.scopeType !== 'products' || !activeWorkspaceId) return;
    let cancelled = false;
    const t = setTimeout(() => {
      searchScopeProducts(activeWorkspaceId, productTerm)
        .then((hits) => { if (!cancelled) setProductHits(hits); })
        .catch(() => { if (!cancelled) setProductHits([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [creating, form.scopeType, productTerm, activeWorkspaceId]);

  const toggleScopeValue = (option: EmbedScopeOption) => {
    setForm((f) => ({
      ...f,
      scopeValues: f.scopeValues.includes(option.id)
        ? f.scopeValues.filter((v) => v !== option.id)
        : [...f.scopeValues, option.id],
    }));
    setChosenProducts((prev) => ({ ...prev, [option.id]: option.label }));
  };

  const load = useCallback(async () => {
    if (!activeWorkspaceId) return;
    setLoading(true);
    try {
      setKeys(await embedKeysService.list(activeWorkspaceId));
      // Telemetry is best-effort: a key list that renders without its usage numbers is still
      // useful, and a failure here must not hide the keys themselves.
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

  const resetForm = () => {
    setForm({
      name: '', origins: '', rate: DEFAULT_RATE, allowAny: false, scopeType: 'all', scopeValues: [],
      allowGeneration: false, dailyCap: DEFAULT_GENERATION_DAILY_CAP,
    });
    setProductTerm('');
    setProductHits([]);
    setChosenProducts({});
  };

  const handleCreate = async () => {
    if (!activeWorkspaceId) return;
    const origins = form.allowAny ? ['*'] : normalizeOriginList(form.origins);
    if (!form.name.trim()) {
      toast({ title: 'Name the key', description: 'So you can tell it apart later.', variant: 'destructive' });
      return;
    }
    if (origins.length === 0) {
      toast({
        title: 'Add at least one website',
        description: 'A key with no allowed origin cannot be used from any browser.',
        variant: 'destructive',
      });
      return;
    }
    // The CHECK rejects a scoped key with an empty list, and a key that serves nothing is a
    // support ticket rather than a configuration — catch it here with a sentence instead of a
    // constraint error.
    if (form.scopeType !== 'all' && form.scopeValues.length === 0) {
      toast({
        title: form.scopeType === 'categories' ? 'Pick at least one category' : 'Pick at least one product',
        description: 'A limited key with nothing selected would return an empty catalog.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      await embedKeysService.create(activeWorkspaceId, {
        key_name: form.name,
        allowed_origins: origins,
        rate_limit_per_minute: form.rate,
        scope_type: form.scopeType,
        scope_values: form.scopeValues,
        allow_generation: form.allowGeneration,
        generation_daily_cap: form.dailyCap,
      });
      toast({ title: 'Embed key created' });
      setCreating(false);
      resetForm();
      await load();
    } catch (err) {
      toast({
        title: 'Could not create the key',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

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

  /**
   * Turn AI impressions on or off for one key.
   *
   * Separate from `handleToggle` deliberately: that switch decides whether the key WORKS, this one
   * decides whether it may SPEND. Collapsing them into one row of switches would make the
   * expensive one look like the cheap one.
   */
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
              Embed keys
            </CardTitle>
            <CardDescription>
              Show your products and 3D models on your own website. These keys are meant to be public —
              they go straight into your page source — so what protects them is the list of websites
              allowed to use them, not secrecy. Only products you have published to your online store
              are ever served.
            </CardDescription>
          </div>
          <Button size="sm" className="shrink-0" onClick={() => setCreating(true)}>
            <Plus />New key
          </Button>
        </CardHeader>

        <CardContent className="space-y-3">
          {/* Usage, next to the keys that produce it — "is my embed actually live?" is the first
              question after pasting the snippet, and until now nothing in the platform answered it
              even though the events were being recorded. */}
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
              {/* What it COST, next to what it did. `visualize` is the only action on the embed
                  that spends credits, and it is triggered by strangers — so a merchant who cannot
                  see this number is running an open tab they never get shown. */}
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
              title="No embed keys yet"
              description="An embed key lets your own website show this catalog — the planner, the product grid, the lead form — scoped to exactly the origins you allow."
              action={<Button size="sm" onClick={() => setCreating(true)}><Plus /> New key</Button>}
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
                        {scopeLabel(key)}
                        {' · '}{key.rate_limit_per_minute ?? DEFAULT_RATE} requests/min
                        {/* Counts every call the key made, including ones the quota refused —
                            "served" would overstate it. */}
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
                      onClick={() => copy(usageSnippet(key.api_key), 'Embed snippet')}>
                      Embed code
                    </Button>
                    <Button size="sm" variant="ghost" className="shrink-0"
                      onClick={() => copy(apiSnippet(key.api_key), 'API snippet')}>
                      API
                    </Button>
                  </div>

                  {/* The spend switch, kept apart from the on/off switch above: that one decides
                      whether the key works, this one decides whether it may cost money. */}
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
        </CardContent>
      </Card>

      <Dialog open={creating} onOpenChange={(o) => { setCreating(o); if (!o) resetForm(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New embed key</DialogTitle>
            <DialogDescription>
              One key per site is easiest to manage — you can disable a single site later without
              touching the others.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="embed-key-name">Name</Label>
              <Input
                id="embed-key-name"
                placeholder="Main website"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="embed-key-origins">Websites allowed to use this key</Label>
              <Textarea
                id="embed-key-origins"
                rows={3}
                placeholder={'https://www.acme.com\nhttps://*.acme.com'}
                value={form.origins}
                disabled={form.allowAny}
                onChange={(e) => setForm((f) => ({ ...f, origins: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                One per line. `https://*.acme.com` covers every subdomain. Remember to add your
                staging domain if you test there.
              </p>
            </div>

            <div className="flex items-start gap-3 rounded-md border border-border/60 p-3">
              <Switch
                id="embed-key-any"
                checked={form.allowAny}
                onCheckedChange={(v) => setForm((f) => ({ ...f, allowAny: v }))}
              />
              <div className="space-y-0.5">
                <Label htmlFor="embed-key-any" className="text-sm">Allow any website</Label>
                <p className="text-xs text-muted-foreground">
                  Only for a catalog you want partners to embed anywhere. Your published products
                  become readable from any site on the internet.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>What this key can show</Label>
              <RadioGroup
                className="space-y-1.5"
                value={form.scopeType}
                onValueChange={(v) => setForm((f) => ({ ...f, scopeType: v as EmbedScopeType, scopeValues: [] }))}
              >
                {([
                  ['all', 'Everything published', 'All products you have published to your online store.'],
                  ['categories', 'Only certain categories', 'Good for a partner who should see one range.'],
                  ['products', 'Only specific products', 'The tightest option — an exact list.'],
                ] as [EmbedScopeType, string, string][]).map(([value, label, hint]) => (
                  <label
                    key={value}
                    htmlFor={`embed-scope-${value}`}
                    className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 ${
                      form.scopeType === value ? 'border-primary' : 'border-border/60'
                    }`}
                  >
                    <RadioGroupItem value={value} id={`embed-scope-${value}`} className="mt-1" />
                    <span className="space-y-0.5">
                      <span className="block text-sm">{label}</span>
                      <span className="block text-xs text-muted-foreground">{hint}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>

              {form.scopeType === 'categories' && (
                <div className="max-h-44 space-y-1.5 overflow-y-auto rounded-md border border-border/60 p-3">
                  {categories.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Loading categories…</p>
                  ) : categories.map((c) => (
                    <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.scopeValues.includes(c.id)}
                        onCheckedChange={() => toggleScopeValue(c)}
                      />
                      <span>{c.label}</span>
                    </label>
                  ))}
                </div>
              )}

              {form.scopeType === 'products' && (
                <div className="space-y-2 rounded-md border border-border/60 p-3">
                  <Input
                    placeholder="Search your products…"
                    value={productTerm}
                    onChange={(e) => setProductTerm(e.target.value)}
                  />
                  <div className="max-h-36 space-y-1.5 overflow-y-auto">
                    {productHits.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        {productTerm ? 'No products match.' : 'No products in this workspace yet.'}
                      </p>
                    ) : productHits.map((p) => (
                      <label key={p.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox
                          checked={form.scopeValues.includes(p.id)}
                          onCheckedChange={() => toggleScopeValue(p)}
                        />
                        <span className="truncate">{p.label}</span>
                      </label>
                    ))}
                  </div>
                  {form.scopeValues.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Selected: {form.scopeValues.map((id) => chosenProducts[id] ?? id).join(', ')}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="embed-key-rate">Requests per minute</Label>
              <Input
                id="embed-key-rate"
                type="number"
                min={1}
                max={MAX_RATE_LIMIT_PER_MINUTE}
                value={form.rate}
                onChange={(e) => setForm((f) => ({ ...f, rate: Number(e.target.value) }))}
              />
            </div>

            {/* The only control here that spends money. Off by default and phrased as a cost, not
                as a feature — a merchant should be able to decline it without reading the docs. */}
            <div className="space-y-1.5 rounded-md border border-border/60 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <Label htmlFor="embed-key-generation" className="flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />AI impressions
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    When a visitor specifies something you don't stock, the spec builder can draw an
                    impression of it instead of showing nothing. Each one costs credits from this
                    workspace and is triggered by the visitor, not by you.
                  </p>
                </div>
                <Switch
                  id="embed-key-generation"
                  checked={form.allowGeneration}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, allowGeneration: v }))}
                />
              </div>
              {form.allowGeneration && (
                <div className="space-y-1.5 pt-1">
                  <Label htmlFor="embed-key-cap">Most per day</Label>
                  <Input
                    id="embed-key-cap"
                    type="number"
                    min={1}
                    max={MAX_GENERATION_DAILY_CAP}
                    value={form.dailyCap}
                    onChange={(e) => setForm((f) => ({ ...f, dailyCap: Number(e.target.value) }))}
                  />
                </div>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Create key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
