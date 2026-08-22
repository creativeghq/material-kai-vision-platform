/**
 * Profile → Ambassador.
 *
 * WHAT THIS REPLACED. A "Preferred Brands" card that stored `[{name}]` on the profile and
 * rendered it as a grid of grey boxes. It could say that somebody likes Harmony. It could not
 * say what they promote Harmony FOR, since when, or in what capacity — and "who do you use for
 * sanitary?" is the question a visitor actually arrives with.
 *
 * NOBODY APPROVES ANY OF THIS. Being on the platform's supplier list is the whole condition:
 * pick a brand, say which categories you promote it in, and it is live on your profile. The only
 * thing the brand gets in return is visibility — a supplier workspace that has claimed its
 * identity sees who promotes it, in its own Supplier Portal.
 *
 * Categories come from `material_categories` through the generated projection; brands come from
 * `search_platform_brands`. Neither list is written down here.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, BadgeCheck, Check, ChevronDown, ChevronUp, ChevronsUpDown, ExternalLink, Eye,
  Loader2, Pencil, Plus, Star, Store, Trash2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/core/ui/select';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/core/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/core/ui/popover';
import { HubEmptyState, HubStatGrid, HubStatTile } from '@/components/core/hub';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { flowEventService } from '@/services/flows/flowEventService';
import { UPLOAD_CATEGORIES, categoryDisplayName } from '@/lib/categoryFieldRegistry';
import {
  HEADLINE_MAX, RELATIONSHIPS, categoriesCovered, emptyDraft, relationshipDef, sortForDisplay,
  validateDraft,
  type Ambassadorship, type AmbassadorshipDraft,
} from '@/lib/ambassadorships';
import {
  brandCategoryCoverage, createAmbassadorship, deleteAmbassadorship, listAmbassadorships,
  reorderAmbassadorship, searchPlatformBrands, updateAmbassadorship,
  type PlatformBrand,
} from '@/services/ambassadorService';

/**
 * The platform's factory/supplier list, searched as you type. A name that is not on it can still
 * be used — nothing here gatekeeps — but a listed one carries its id, which is what lets that
 * supplier see the profile promoting them.
 */
function BrandPicker({
  value, onChange,
}: {
  value: string;
  onChange: (brand: {
    name: string;
    supplierId: string | null;
    source: 'supplier' | 'catalog' | 'manual';
    country: string | null;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PlatformBrand[]>([]);
  const [searching, setSearching] = useState(false);
  const typed = query.trim();

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      searchPlatformBrands(typed)
        .then((r) => { if (!cancelled) setResults(r); })
        .catch(() => { if (!cancelled) setResults([]); })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [typed, open]);

  const exact = results.some((o) => o.name.toLowerCase() === typed.toLowerCase());
  const onList = results.filter((r) => r.source === 'supplier');
  const inCatalog = results.filter((r) => r.source === 'catalog');

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id="ambassador-brand" variant="outline" role="combobox" aria-expanded={open}
          className="w-full justify-between font-normal text-sm"
        >
          <span className={value ? '' : 'text-muted-foreground'}>
            {value || 'Search the supplier list…'}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        {/* Filtering happens in SQL (ILIKE over the list), so Command must not filter again — its
            own matcher would hide rows the server deliberately returned. */}
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search factories and suppliers…" value={query} onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty className="py-3 px-3 text-sm text-muted-foreground">
              {searching ? 'Searching…' : typed ? 'Not on the list — you can still add it.' : 'Type a brand name.'}
            </CommandEmpty>
            {onList.length > 0 && (
              <CommandGroup heading="On our supplier list">
                {onList.map((o) => (
                  <CommandItem
                    key={o.supplier_id ?? o.name} value={o.name}
                    onSelect={() => {
                      onChange({
                        name: o.name, supplierId: o.supplier_id, source: 'supplier', country: o.country_code,
                      });
                      setOpen(false);
                    }}
                  >
                    <Store className="mr-2 h-3.5 w-3.5 opacity-70" />
                    <span className="flex-1 truncate">{o.name}</span>
                    {o.country_code && <span className="text-xs text-muted-foreground">{o.country_code}</span>}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {inCatalog.length > 0 && (
              <CommandGroup heading="From the product catalog">
                {inCatalog.map((o) => (
                  <CommandItem
                    key={`catalog:${o.name}`} value={o.name}
                    onSelect={() => {
                      onChange({ name: o.name, supplierId: null, source: 'catalog', country: null });
                      setOpen(false);
                    }}
                  >
                    <Check className={`mr-2 h-3.5 w-3.5 ${value === o.name ? 'opacity-100' : 'opacity-0'}`} />
                    {o.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {typed && !exact && (
              <CommandGroup>
                <CommandItem
                  value={`__use__${typed}`}
                  onSelect={() => {
                    onChange({ name: typed, supplierId: null, source: 'manual', country: null });
                    setOpen(false);
                  }}
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />Use “{typed}”
                </CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export const AmbassadorTab: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Ambassadorship[]>([]);
  const [moodboards, setMoodboards] = useState<{ id: string; title: string }[]>([]);
  const [coverage, setCoverage] = useState<Record<string, Record<string, number>>>({});

  const [isPublic, setIsPublic] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const [editorFor, setEditorFor] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<AmbassadorshipDraft>(emptyDraft());
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const ordered = useMemo(() => sortForDisplay(rows), [rows]);
  const covered = useMemo(() => categoriesCovered(rows), [rows]);
  const onListCount = rows.filter((r) => r.platform_supplier_id).length;

  const loadCoverage = useCallback(async (list: Ambassadorship[]) => {
    const names = Array.from(new Set(list.map((r) => r.brand_name)));
    if (!names.length) { setCoverage({}); return; }
    try {
      const found = await brandCategoryCoverage(names);
      const next: Record<string, Record<string, number>> = {};
      for (const c of found) {
        next[c.brand_key] = next[c.brand_key] ?? {};
        next[c.brand_key][c.category_key] = c.product_count;
      }
      setCoverage(next);
    } catch {
      // Advisory only — a catalog we cannot read must never block declaring a brand.
      setCoverage({});
    }
  }, []);

  const loadAll = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [profile, list, boards] = await Promise.all([
        supabase.from('user_profiles').select('is_public').eq('user_id', user.id).maybeSingle(),
        listAmbassadorships(user.id),
        supabase.from('moodboards').select('id, title')
          .eq('user_id', user.id).order('updated_at', { ascending: false }),
      ]);

      setIsPublic(profile.data?.is_public ?? false);
      setRows(list);
      setMoodboards((boards.data ?? []) as { id: string; title: string }[]);
      void loadCoverage(list);
    } catch (e) {
      toast({
        title: 'Could not load your brands',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast, loadCoverage]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ── Editing ────────────────────────────────────────────────────────────────
  const draftFrom = (row: Ambassadorship, over: Partial<AmbassadorshipDraft> = {}): AmbassadorshipDraft => ({
    id: row.id,
    brand_name: row.brand_name,
    brand_source: row.brand_source,
    platform_supplier_id: row.platform_supplier_id,
    brand_country: row.brand_country,
    brand_url: row.brand_url,
    category_keys: [...row.category_keys],
    relationship: row.relationship,
    headline: row.headline,
    since_year: row.since_year,
    showcase_moodboard_id: row.showcase_moodboard_id,
    is_featured: row.is_featured,
    ...over,
  });

  const openNew = () => {
    setDraft(emptyDraft());
    setProblems([]);
    setEditorFor('new');
  };

  const openEdit = (row: Ambassadorship) => {
    setDraft(draftFrom(row));
    setProblems([]);
    setEditorFor(row.id);
  };

  const closeEditor = () => { setEditorFor(null); setProblems([]); };

  const toggleCategory = (key: string) => {
    setDraft((d) => ({
      ...d,
      category_keys: d.category_keys.includes(key)
        ? d.category_keys.filter((k) => k !== key)
        : [...d.category_keys, key],
    }));
  };

  const save = async () => {
    if (!user) return;
    const found = validateDraft(draft, rows);
    setProblems(found);
    if (found.length) return;

    setSaving(true);
    try {
      const saved = draft.id
        ? await updateAmbassadorship(draft.id, draft)
        : await createAmbassadorship(user.id, draft);

      const isNew = !draft.id;
      setRows((prev) => (isNew ? [...prev, saved] : prev.map((r) => (r.id === saved.id ? saved : r))));
      closeEditor();
      void loadCoverage(isNew ? [...rows, saved] : rows);

      if (isNew) {
        // The pre-existing "Brand Added to Profile" flow. Informational: there is nothing for the
        // brand to answer, and the entry is live either way.
        const { data: brandProfile } = await supabase
          .from('user_profiles').select('user_id')
          .eq('factory_claimed_name', saved.brand_name).eq('factory_verified', true).maybeSingle();
        flowEventService.emit('preferred_factory_added', {
          user_id: user.id,
          factory_user_id: brandProfile?.user_id ?? null,
          factory_name: saved.brand_name,
          added_at: new Date().toISOString(),
          type: 'preferred_factory',
          title: 'A professional added your brand to their profile',
          body: '',
          action_url: `/discover?tab=products&factory=${encodeURIComponent(saved.brand_name)}`,
        });
      }
      toast({ title: isNew ? `${saved.brand_name} added` : 'Saved' });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setProblems([msg.includes('duplicate key') ? 'That brand is already on your profile.' : msg]);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row: Ambassadorship) => {
    setBusyId(row.id);
    try {
      await deleteAmbassadorship(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setConfirmDelete(null);
      toast({ title: `${row.brand_name} removed` });
    } catch (e) {
      toast({
        title: 'Could not remove',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  const toggleFeatured = async (row: Ambassadorship) => {
    setBusyId(row.id);
    const next = { ...row, is_featured: !row.is_featured };
    setRows((prev) => prev.map((r) => (r.id === row.id ? next : r)));
    try {
      await updateAmbassadorship(row.id, draftFrom(row, { is_featured: next.is_featured }));
    } catch (e) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
      toast({
        title: 'Could not update',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  /** Swap a row with its neighbour and persist the whole order — n is small and always will be. */
  const move = async (row: Ambassadorship, delta: -1 | 1) => {
    const list = [...ordered];
    const i = list.findIndex((r) => r.id === row.id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    const renumbered = list.map((r, idx) => ({ ...r, sort_order: idx }));
    setRows(renumbered);
    setBusyId(row.id);
    try {
      await Promise.all(renumbered.map((r) => reorderAmbassadorship(r.id, r.sort_order)));
    } catch (e) {
      toast({
        title: 'Could not reorder',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
      void loadAll();
    } finally {
      setBusyId(null);
    }
  };

  const makePublic = async () => {
    if (!user) return;
    setPublishing(true);
    try {
      const { error } = await supabase.from('user_profiles')
        .update({ is_public: true }).eq('user_id', user.id);
      if (error) throw error;
      setIsPublic(true);
      toast({ title: 'Your profile is public', description: 'Your brands are now visible on it.' });
    } catch (e) {
      toast({
        title: 'Could not publish',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setPublishing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading your brands…
      </div>
    );
  }

  const draftCoverage = coverage[draft.brand_name.trim().toLowerCase()] ?? {};
  const suggested = UPLOAD_CATEGORIES.filter(
    (k) => (draftCoverage[k] ?? 0) > 0 && !draft.category_keys.includes(k),
  );

  return (
    <div className="space-y-6">
      {/* ── What the profile currently says ─────────────────────────────────── */}
      <HubStatGrid>
        <HubStatTile label="Brands" category="YOU REPRESENT" value={rows.length} />
        <HubStatTile
          label="Categories" category="COVERED" value={covered.length}
          help="Distinct material categories you promote at least one brand in."
        />
        <HubStatTile
          label="On our list" category="SUPPLIERS" value={onListCount}
          help="Brands matched to a company on the platform's supplier list. If that company has an account here, it can see that you promote it."
        />
        <HubStatTile
          label="Featured" category="LEAD BRANDS" value={rows.filter((r) => r.is_featured).length}
          help="Shown first, above the per-category lists, on your public profile."
        />
      </HubStatGrid>

      {!isPublic && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex flex-col sm:flex-row sm:items-center gap-3 py-4">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Your profile is private, so none of this is visible.</p>
              <p className="text-xs text-muted-foreground">
                An ambassadorship promotes a brand on your public profile. Nobody sees it while the
                profile is hidden — including the brands themselves.
              </p>
            </div>
            <Button size="sm" onClick={makePublic} disabled={publishing}>
              {publishing
                ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                : <Eye className="h-3.5 w-3.5 mr-1.5" />}
              Make profile public
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── The ambassadorships ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-primary" />Brands you represent
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Pick a factory or supplier from our list and say which categories you promote it in.
                It goes live on your profile straight away — nobody has to approve it.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {isPublic && user && (
                <Button asChild size="sm" variant="outline">
                  <Link to={`/u/${user.id}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-3.5 w-3.5 mr-1.5" />View profile
                  </Link>
                </Button>
              )}
              <Button size="sm" onClick={openNew} disabled={editorFor === 'new'}>
                <Plus className="h-3.5 w-3.5 mr-1.5" />Add brand
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {editorFor === 'new' && (
            <AmbassadorshipEditor
              draft={draft} setDraft={setDraft} problems={problems} saving={saving}
              moodboards={moodboards} coverage={draftCoverage} suggested={suggested}
              onToggleCategory={toggleCategory} onSave={save} onCancel={closeEditor}
            />
          )}

          {ordered.length === 0 && editorFor !== 'new' && (
            <HubEmptyState
              icon={BadgeCheck}
              title="You do not represent any brands yet"
              description="Add a brand you work with, pick the categories you promote it in, and it appears on your public profile straight away."
              action={<Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1.5" />Add brand</Button>}
            />
          )}

          {ordered.map((row, index) => {
            const rel = relationshipDef(row.relationship);
            const rowCoverage = coverage[row.brand_name.trim().toLowerCase()];
            const unbacked = rowCoverage
              ? row.category_keys.filter((k) => !(rowCoverage[k] > 0))
              : [];

            return (
              <div key={row.id} className="rounded-lg border border-hairline bg-card">
                <div className="flex items-start gap-3 p-4">
                  <div className="flex flex-col gap-1 pt-0.5">
                    <button
                      type="button" aria-label={`Move ${row.brand_name} up`}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={index === 0 || busyId === row.id} onClick={() => move(row, -1)}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button" aria-label={`Move ${row.brand_name} down`}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                      disabled={index === ordered.length - 1 || busyId === row.id} onClick={() => move(row, 1)}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{row.brand_name}</span>
                      <Badge variant="neutral" className="text-[11px]">{rel.label}</Badge>
                      {row.platform_supplier_id && (
                        <Badge variant="info" className="text-[11px] gap-1">
                          <Store className="h-3 w-3" />On our supplier list
                        </Badge>
                      )}
                      {row.is_featured && (
                        <Badge variant="success" className="text-[11px] gap-1">
                          <Star className="h-3 w-3" />Featured
                        </Badge>
                      )}
                      {row.since_year && (
                        <span className="text-xs text-muted-foreground">since {row.since_year}</span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {row.category_keys.length === 0 ? (
                        <Button
                          size="sm" variant="outline"
                          className="h-7 px-2 text-xs text-amber-600 dark:text-amber-500 border-amber-500/40"
                          onClick={() => openEdit(row)}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1.5" />
                          Add a category — without one nobody finds this brand on your profile
                        </Button>
                      ) : row.category_keys.map((k) => (
                        <Badge key={k} variant="neutral" className="text-[11px]">
                          {categoryDisplayName(k)}
                          {rowCoverage?.[k] ? (
                            <span className="ml-1 opacity-60 tabular-nums">{rowCoverage[k]}</span>
                          ) : null}
                        </Badge>
                      ))}
                    </div>

                    {row.headline && <p className="text-sm text-muted-foreground">{row.headline}</p>}

                    {unbacked.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        No {row.brand_name} products in your catalog for {unbacked.map(categoryDisplayName).join(', ')}.
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => openEdit(row)}>
                        <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
                      </Button>
                      <Button
                        size="sm" variant="ghost" className="h-7 px-2"
                        disabled={busyId === row.id} onClick={() => toggleFeatured(row)}
                      >
                        <Star className={`h-3.5 w-3.5 mr-1.5 ${row.is_featured ? 'fill-current' : ''}`} />
                        {row.is_featured ? 'Unfeature' : 'Feature'}
                      </Button>
                      {row.brand_url && (
                        <a
                          href={row.brand_url} target="_blank" rel="noopener noreferrer nofollow"
                          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" />Brand site
                        </a>
                      )}
                      {confirmDelete === row.id ? (
                        <span className="inline-flex items-center gap-2">
                          <Button
                            size="sm" variant="destructive" className="h-7 px-2"
                            disabled={busyId === row.id} onClick={() => remove(row)}
                          >
                            Confirm remove
                          </Button>
                          <Button
                            size="sm" variant="ghost" className="h-7 px-2"
                            onClick={() => setConfirmDelete(null)}
                          >
                            Cancel
                          </Button>
                        </span>
                      ) : (
                        <Button
                          size="sm" variant="ghost"
                          className="h-7 px-2 text-muted-foreground hover:text-destructive"
                          onClick={() => setConfirmDelete(row.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1.5" />Remove
                        </Button>
                      )}
                    </div>
                  </div>
                </div>

                {editorFor === row.id && (
                  <div className="border-t border-hairline p-4">
                    <AmbassadorshipEditor
                      draft={draft} setDraft={setDraft} problems={problems} saving={saving}
                      moodboards={moodboards} coverage={draftCoverage} suggested={suggested}
                      onToggleCategory={toggleCategory} onSave={save} onCancel={closeEditor}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {rows.length > 0 && (
        <p className="text-xs text-muted-foreground">
          A brand matched to our supplier list can see that you promote it, if that company has an
          account here — who you are, which categories, and what you wrote. Nothing else is shared,
          and there is nothing for them to approve.
        </p>
      )}
    </div>
  );
};

// ─── Editor ───────────────────────────────────────────────────────────────────
function AmbassadorshipEditor({
  draft, setDraft, problems, saving, moodboards, coverage, suggested,
  onToggleCategory, onSave, onCancel,
}: {
  draft: AmbassadorshipDraft;
  setDraft: React.Dispatch<React.SetStateAction<AmbassadorshipDraft>>;
  problems: string[];
  saving: boolean;
  moodboards: { id: string; title: string }[];
  coverage: Record<string, number>;
  suggested: string[];
  onToggleCategory: (key: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const rel = relationshipDef(draft.relationship);

  return (
    <div className="rounded-lg border border-hairline bg-surface-sunken p-4 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="ambassador-brand">Brand</Label>
          <BrandPicker
            value={draft.brand_name}
            onChange={(b) => setDraft((d) => ({
              ...d,
              brand_name: b.name,
              brand_source: b.source,
              platform_supplier_id: b.supplierId,
              brand_country: b.country ?? d.brand_country,
            }))}
          />
          <p className="text-xs text-muted-foreground">
            {draft.platform_supplier_id
              ? 'On our supplier list — if this company has an account here, it will see you among its ambassadors.'
              : 'Not matched to our supplier list. That is fine; it just will not reach the brand.'}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ambassador-relationship">Your relationship</Label>
          <Select
            value={draft.relationship}
            onValueChange={(v) => setDraft((d) => ({ ...d, relationship: v as AmbassadorshipDraft['relationship'] }))}
          >
            <SelectTrigger id="ambassador-relationship"><SelectValue /></SelectTrigger>
            <SelectContent>
              {RELATIONSHIPS.map((r) => (
                <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{rel.description}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Categories you promote it in</Label>
        <p className="text-xs text-muted-foreground">
          A visitor browses your profile by category. A brand with none is listed under “Other brands”.
        </p>
        <div className="flex flex-wrap gap-2">
          {UPLOAD_CATEGORIES.map((key) => {
            const on = draft.category_keys.includes(key);
            const count = coverage[key] ?? 0;
            return (
              <button
                key={key} type="button" onClick={() => onToggleCategory(key)}
                aria-pressed={on}
                className={`inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-xs transition-colors ${
                  on
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-hairline text-muted-foreground hover:text-foreground'
                }`}
              >
                {on && <Check className="h-3 w-3" />}
                {categoryDisplayName(key)}
                {count > 0 && <span className="opacity-60 tabular-nums">{count}</span>}
              </button>
            );
          })}
        </div>
        {suggested.length > 0 && (
          <p className="text-xs text-muted-foreground">
            In your catalog this brand also has products in{' '}
            {suggested.map((k, i) => (
              <React.Fragment key={k}>
                {i > 0 && ', '}
                <button
                  type="button" className="underline hover:text-foreground"
                  onClick={() => onToggleCategory(k)}
                >
                  {categoryDisplayName(k)}
                </button>
              </React.Fragment>
            ))}.
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ambassador-headline">What you say about them</Label>
        <Textarea
          id="ambassador-headline" rows={2} maxLength={HEADLINE_MAX}
          value={draft.headline ?? ''}
          onChange={(e) => setDraft((d) => ({ ...d, headline: e.target.value }))}
          placeholder="e.g. I have specified their large-format porcelain on every hospitality project since 2019."
        />
        <p className="text-xs text-muted-foreground tabular-nums">
          {(draft.headline ?? '').length}/{HEADLINE_MAX}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="ambassador-since">Working with them since</Label>
          <Input
            id="ambassador-since" type="number" inputMode="numeric" placeholder="2019"
            value={draft.since_year ?? ''}
            onChange={(e) => setDraft((d) => ({
              ...d, since_year: e.target.value ? Number(e.target.value) : null,
            }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ambassador-url">Brand link</Label>
          <Input
            id="ambassador-url" type="url" placeholder="https://…"
            value={draft.brand_url ?? ''}
            onChange={(e) => setDraft((d) => ({ ...d, brand_url: e.target.value }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ambassador-moodboard">Showcase moodboard</Label>
          <Select
            value={draft.showcase_moodboard_id ?? 'none'}
            onValueChange={(v) => setDraft((d) => ({ ...d, showcase_moodboard_id: v === 'none' ? null : v }))}
          >
            <SelectTrigger id="ambassador-moodboard"><SelectValue placeholder="None" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">None</SelectItem>
              {moodboards.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Your own work with the brand. Shown if the moodboard is public.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="ambassador-featured" checked={draft.is_featured}
          onCheckedChange={(v) => setDraft((d) => ({ ...d, is_featured: v }))}
        />
        <Label htmlFor="ambassador-featured" className="cursor-pointer">
          Feature this brand
          <span className="block text-xs font-normal text-muted-foreground">
            Featured brands lead the ambassador section of your public profile.
          </span>
        </Label>
      </div>

      {problems.length > 0 && (
        <ul className="text-sm text-destructive space-y-1">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button size="sm" onClick={onSave} disabled={saving}>
          {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
          {draft.id ? 'Save changes' : 'Add brand'}
        </Button>
      </div>
    </div>
  );
}
