/**
 * Profile → Ambassador.
 *
 * WHAT THIS REPLACED. A "Preferred Brands" card that stored `[{name}]` on the profile and
 * rendered it as a grid of grey boxes. It could say that somebody likes Harmony. It could not
 * say what they promote Harmony FOR, since when, in what capacity, or whether Harmony agrees —
 * and "who do you use for sanitary?" is the only question a visitor actually arrives with.
 *
 * So an ambassadorship here is a relationship with two sides. The professional declares the
 * brand, the CATEGORIES they promote it in, the capacity, and their pitch; the brand's own
 * verified supplier account can confirm it, which is why the same tab shows a confirmation
 * queue to a brand looking at it. Categories come from `material_categories` through the
 * generated projection — never a list written down here.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle, BadgeCheck, Building2, Check, ChevronDown, ChevronUp, ChevronsUpDown, Clock,
  ExternalLink, Eye, Layers, Loader2, Pencil, Plus, Send, ShieldCheck, Star, Trash2, Users, X,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Badge } from '@/components/core/ui/badge';
import { Label } from '@/components/core/ui/label';
import { Switch } from '@/components/core/ui/switch';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/core/ui/avatar';
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
import { initials } from '@/lib/materialCategories';
import {
  HEADLINE_MAX, RELATIONSHIPS, categoriesCovered, emptyDraft, relationshipDef, sortForDisplay,
  validateDraft,
  type Ambassadorship, type AmbassadorshipDraft,
} from '@/lib/ambassadorships';
import {
  brandCategoryCoverage, createAmbassadorship, decideAmbassadorship, deleteAmbassadorship,
  listAmbassadorships, listBrandAmbassadorRequests, reorderAmbassadorship, requestVerification,
  updateAmbassadorship,
  type BrandAmbassadorRequest,
} from '@/services/ambassadorService';

interface BrandOption { name: string; source: string }

const VERIFICATION_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'error' | 'neutral'; icon: typeof Check }> = {
  verified: { label: 'Confirmed by brand', variant: 'success', icon: ShieldCheck },
  pending: { label: 'Awaiting brand', variant: 'warning', icon: Clock },
  declined: { label: 'Declined by brand', variant: 'error', icon: X },
  self_declared: { label: 'Self-declared', variant: 'neutral', icon: BadgeCheck },
};

/** Brand names from the product catalog, with "use what I typed" for everything else. */
function BrandPicker({
  options, value, onChange, disabled,
}: {
  options: BrandOption[];
  value: string;
  onChange: (name: string, source: 'catalog' | 'manual') => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const typed = query.trim();
  const exact = options.some((o) => o.name.toLowerCase() === typed.toLowerCase());

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id="ambassador-brand" variant="outline" role="combobox" aria-expanded={open}
          disabled={disabled} className="w-full justify-between font-normal text-sm"
        >
          <span className={value ? '' : 'text-muted-foreground'}>{value || 'Search or type a brand…'}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search brands…" value={query} onValueChange={setQuery} />
          <CommandList>
            {/* The catalog is empty on a fresh workspace, so "type your own" is the primary
                path here, not a fallback — the old picker offered no way through at all. */}
            <CommandEmpty className="py-3 px-3 text-sm text-muted-foreground">
              {typed ? 'Not in your catalog — you can still add it.' : 'Type a brand name.'}
            </CommandEmpty>
            {typed && !exact && (
              <CommandGroup>
                <CommandItem
                  value={`__use__${typed}`}
                  onSelect={() => { onChange(typed, 'manual'); setOpen(false); setQuery(''); }}
                >
                  <Plus className="mr-2 h-3.5 w-3.5" />Use “{typed}”
                </CommandItem>
              </CommandGroup>
            )}
            {options.length > 0 && (
              <CommandGroup heading="From your catalog">
                {options.map((o) => (
                  <CommandItem
                    key={`${o.source}:${o.name}`} value={o.name}
                    onSelect={() => { onChange(o.name, 'catalog'); setOpen(false); setQuery(''); }}
                  >
                    <Check className={`mr-2 h-3.5 w-3.5 ${value === o.name ? 'opacity-100' : 'opacity-0'}`} />
                    {o.name}
                  </CommandItem>
                ))}
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
  const [brandOptions, setBrandOptions] = useState<BrandOption[]>([]);
  const [moodboards, setMoodboards] = useState<{ id: string; title: string }[]>([]);
  const [coverage, setCoverage] = useState<Record<string, Record<string, number>>>({});

  const [displayName, setDisplayName] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [factoryVerified, setFactoryVerified] = useState(false);
  const [claimedBrand, setClaimedBrand] = useState<string | null>(null);

  const [editorFor, setEditorFor] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<AmbassadorshipDraft>(emptyDraft());
  const [problems, setProblems] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const [requests, setRequests] = useState<BrandAmbassadorRequest[]>([]);
  const [decisionNote, setDecisionNote] = useState<Record<string, string>>({});

  const ordered = useMemo(() => sortForDisplay(rows), [rows]);
  const covered = useMemo(() => categoriesCovered(rows), [rows]);
  const confirmedCount = rows.filter((r) => r.verification_status === 'verified').length;

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
      const [profile, list, boards, brands] = await Promise.all([
        supabase.from('user_profiles')
          .select('full_name, is_public, factory_verified, factory_claimed_name')
          .eq('user_id', user.id).maybeSingle(),
        listAmbassadorships(user.id),
        supabase.from('moodboards').select('id, title')
          .eq('user_id', user.id).order('updated_at', { ascending: false }),
        supabase.rpc('get_distinct_factory_names'),
      ]);

      setDisplayName(profile.data?.full_name || 'A professional');
      setIsPublic(profile.data?.is_public ?? false);
      setFactoryVerified(profile.data?.factory_verified ?? false);
      setClaimedBrand(profile.data?.factory_claimed_name ?? null);
      setRows(list);
      setMoodboards((boards.data ?? []) as { id: string; title: string }[]);
      setBrandOptions(((brands.data ?? []) as BrandOption[]));
      void loadCoverage(list);

      if (profile.data?.factory_verified) {
        setRequests(await listBrandAmbassadorRequests());
      }
    } catch (e) {
      toast({
        title: 'Could not load your ambassadorships',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [user, toast, loadCoverage]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  // ── Editing ────────────────────────────────────────────────────────────────
  const openNew = () => {
    setDraft(emptyDraft());
    setProblems([]);
    setEditorFor('new');
  };

  const openEdit = (row: Ambassadorship) => {
    setDraft({
      id: row.id,
      brand_name: row.brand_name,
      brand_source: row.brand_source,
      brand_country: row.brand_country,
      brand_url: row.brand_url,
      category_keys: [...row.category_keys],
      relationship: row.relationship,
      headline: row.headline,
      since_year: row.since_year,
      showcase_moodboard_id: row.showcase_moodboard_id,
      is_featured: row.is_featured,
    });
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
        // Existing "Brand Added to Profile" flow — the brand learns it was listed. The separate
        // confirmation request below is a deliberate second step, so this never double-sends.
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
      toast({ title: 'Could not remove', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const toggleFeatured = async (row: Ambassadorship) => {
    setBusyId(row.id);
    const next = { ...row, is_featured: !row.is_featured };
    setRows((prev) => prev.map((r) => (r.id === row.id ? next : r)));
    try {
      await updateAmbassadorship(row.id, {
        id: row.id,
        brand_name: row.brand_name,
        brand_source: row.brand_source,
        brand_country: row.brand_country,
        brand_url: row.brand_url,
        category_keys: row.category_keys,
        relationship: row.relationship,
        headline: row.headline,
        since_year: row.since_year,
        showcase_moodboard_id: row.showcase_moodboard_id,
        is_featured: next.is_featured,
      });
    } catch (e) {
      setRows((prev) => prev.map((r) => (r.id === row.id ? row : r)));
      toast({ title: 'Could not update', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
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
      toast({ title: 'Could not reorder', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
      void loadAll();
    } finally {
      setBusyId(null);
    }
  };

  const askBrand = async (row: Ambassadorship) => {
    setBusyId(row.id);
    try {
      const res = await requestVerification(row.id);
      if (res.status === 'no_brand_account') {
        toast({
          title: 'No verified account for this brand yet',
          description: `${row.brand_name} has not claimed a profile here, so nobody can confirm it. Your entry stays on your profile as a self-declared ambassadorship.`,
        });
        return;
      }
      setRows((prev) => prev.map((r) => (r.id === row.id
        ? { ...r, verification_status: res.status, brand_user_id: res.brand_user_id ?? null, verification_requested_at: new Date().toISOString() }
        : r)));

      if (res.status === 'pending' && res.brand_user_id) {
        const cats = row.category_keys.map(categoryDisplayName).join(', ') || 'no category yet';
        flowEventService.emit('ambassadorship_verification_requested', {
          user_id: res.brand_user_id, // recipient: the brand
          ambassador_user_id: user?.id ?? null,
          ambassadorship_id: row.id,
          brand_name: row.brand_name,
          category_keys: row.category_keys,
          relationship: row.relationship,
          type: 'ambassadorship',
          title: `${displayName} asks to be listed as an ambassador for ${row.brand_name}`,
          body: `They promote ${row.brand_name} in ${cats}. Confirm or decline it under Profile → Ambassador.`,
          action_url: '/profile?tab=ambassador',
        });
        toast({ title: 'Sent', description: `${row.brand_name} has been asked to confirm.` });
      }
    } catch (e) {
      toast({ title: 'Could not send the request', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally {
      setBusyId(null);
    }
  };

  const decide = async (req: BrandAmbassadorRequest, approve: boolean) => {
    setBusyId(req.id);
    try {
      const res = await decideAmbassadorship(req.id, approve, decisionNote[req.id] ?? null);
      setRequests((prev) => prev.map((r) => (r.id === req.id
        ? { ...r, verification_status: res.status, verified_at: approve ? new Date().toISOString() : null }
        : r)));
      flowEventService.emit('ambassadorship_decided', {
        user_id: res.ambassador_user_id, // recipient: the ambassador
        ambassadorship_id: req.id,
        brand_name: res.brand_name,
        status: res.status,
        type: 'ambassadorship',
        title: approve
          ? `${res.brand_name} confirmed you as an ambassador`
          : `${res.brand_name} declined your ambassador request`,
        body: approve
          ? `Your profile now shows a confirmed ambassadorship for ${res.brand_name}.`
          : (decisionNote[req.id]?.trim() || `${res.brand_name} did not confirm the ambassadorship.`),
        action_url: '/profile?tab=ambassador',
      });
      toast({ title: approve ? 'Confirmed' : 'Declined' });
    } catch (e) {
      toast({ title: 'Could not save the decision', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
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
      toast({ title: 'Your profile is public', description: 'Your ambassadorships are now visible on it.' });
    } catch (e) {
      toast({ title: 'Could not publish', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
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

  const editing = editorFor !== null;
  const draftCoverage = coverage[draft.brand_name.trim().toLowerCase()] ?? {};
  const suggested = UPLOAD_CATEGORIES.filter(
    (k) => (draftCoverage[k] ?? 0) > 0 && !draft.category_keys.includes(k),
  );

  return (
    <div className="space-y-6">
      {/* ── What the profile currently says ─────────────────────────────────── */}
      <HubStatGrid>
        <HubStatTile label="Brands" category="AMBASSADORSHIPS" value={rows.length} />
        <HubStatTile
          label="Categories" category="COVERED" value={covered.length}
          help="Distinct material categories you promote at least one brand in."
        />
        <HubStatTile
          label="Confirmed" category="BY THE BRAND" value={confirmedCount}
          help="Ambassadorships the brand's own verified account has confirmed."
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
                An ambassadorship promotes a brand on your public profile. Nobody can see it — and no
                brand can confirm one — while the profile is hidden.
              </p>
            </div>
            <Button size="sm" onClick={makePublic} disabled={publishing}>
              {publishing ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Eye className="h-3.5 w-3.5 mr-1.5" />}
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
                Each entry says which categories you promote the brand in. That is what a visitor
                filters your profile by.
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
              brandOptions={brandOptions} moodboards={moodboards} coverage={draftCoverage}
              suggested={suggested} onToggleCategory={toggleCategory} onSave={save} onCancel={closeEditor}
            />
          )}

          {ordered.length === 0 && editorFor !== 'new' && (
            <HubEmptyState
              icon={BadgeCheck}
              title="You do not represent any brands yet"
              description="Add a brand you work with, pick the categories you promote it in, and it appears on your public profile."
              action={<Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1.5" />Add brand</Button>}
            />
          )}

          {ordered.map((row, index) => {
            const badge = VERIFICATION_BADGE[row.verification_status] ?? VERIFICATION_BADGE.self_declared;
            const BadgeIcon = badge.icon;
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
                      <Badge variant={badge.variant} className="text-[11px] gap-1">
                        <BadgeIcon className="h-3 w-3" />{badge.label}
                      </Badge>
                      {row.is_featured && (
                        <Badge variant="info" className="text-[11px] gap-1"><Star className="h-3 w-3" />Featured</Badge>
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

                    {row.verification_status === 'declined' && (
                      <p className="text-xs text-destructive">
                        {row.brand_name} declined this claim, so it is hidden from your public profile.
                        {row.decision_note ? ` “${row.decision_note}”` : ''}
                      </p>
                    )}

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
                      {row.verification_status !== 'verified' && (
                        <Button
                          size="sm" variant="ghost" className="h-7 px-2"
                          disabled={busyId === row.id} onClick={() => askBrand(row)}
                        >
                          <Send className="h-3.5 w-3.5 mr-1.5" />
                          {row.verification_status === 'pending' ? 'Ask again' : 'Ask brand to confirm'}
                        </Button>
                      )}
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
                          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setConfirmDelete(null)}>
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
                      brandOptions={brandOptions} moodboards={moodboards} coverage={draftCoverage}
                      suggested={suggested} onToggleCategory={toggleCategory} onSave={save} onCancel={closeEditor}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── The other side: people promoting YOUR brand ─────────────────────── */}
      {factoryVerified && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              Ambassadors of {claimedBrand ?? 'your brand'}
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Confirming puts a “confirmed by brand” mark on their public profile. Declining hides
              the claim from it.
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {requests.length === 0 && (
              <HubEmptyState
                icon={Layers}
                title="Nobody has listed your brand yet"
                description="When a professional adds your brand to their profile and asks for confirmation, it lands here. Until then, the way to get ambassadors is to find the people already specifying your kind of product."
                action={(
                  <Button asChild size="sm" variant="outline">
                    <Link to="/discover?tab=profiles">
                      <Users className="h-3.5 w-3.5 mr-1.5" />Browse professionals
                    </Link>
                  </Button>
                )}
              />
            )}
            {requests.map((req) => (
              <div key={req.id} className="rounded-lg border border-hairline p-4 space-y-2">
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={req.ambassador_avatar_url ?? undefined} />
                    <AvatarFallback className="text-xs">{initials(req.ambassador_name ?? '?')}</AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {req.ambassador_is_public ? (
                        <Link to={`/u/${req.ambassador_user_id}`} className="hover:underline">
                          {req.ambassador_name || 'A professional'}
                        </Link>
                      ) : (req.ambassador_name || 'A professional')}
                    </p>
                    {req.ambassador_company && (
                      <p className="text-xs text-muted-foreground truncate">{req.ambassador_company}</p>
                    )}
                  </div>
                  <Badge
                    variant={req.verification_status === 'verified' ? 'success'
                      : req.verification_status === 'declined' ? 'error'
                        : req.verification_status === 'pending' ? 'warning' : 'neutral'}
                    className="text-[11px]"
                  >
                    {VERIFICATION_BADGE[req.verification_status]?.label ?? req.verification_status}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="neutral" className="text-[11px]">{relationshipDef(req.relationship).label}</Badge>
                  {req.category_keys.map((k) => (
                    <Badge key={k} variant="neutral" className="text-[11px]">{categoryDisplayName(k)}</Badge>
                  ))}
                </div>
                {req.headline && <p className="text-sm text-muted-foreground">{req.headline}</p>}

                {req.verification_status !== 'verified' && (
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <Input
                      value={decisionNote[req.id] ?? ''}
                      onChange={(e) => setDecisionNote((n) => ({ ...n, [req.id]: e.target.value }))}
                      placeholder="Note (optional) — sent with a decline"
                      className="flex-1 h-8 text-sm"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={busyId === req.id} onClick={() => decide(req, true)}>
                        <Check className="h-3.5 w-3.5 mr-1.5" />Confirm
                      </Button>
                      <Button
                        size="sm" variant="outline" disabled={busyId === req.id}
                        onClick={() => decide(req, false)}
                      >
                        <X className="h-3.5 w-3.5 mr-1.5" />Decline
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!editing && rows.some((r) => r.category_keys.length === 0) && (
        <p className="text-xs text-muted-foreground">
          Brands carried over from your old preferred-brands list have no categories yet. Add one to
          each so they appear in the right place on your profile.
        </p>
      )}
    </div>
  );
};

// ─── Editor ───────────────────────────────────────────────────────────────────
function AmbassadorshipEditor({
  draft, setDraft, problems, saving, brandOptions, moodboards, coverage, suggested,
  onToggleCategory, onSave, onCancel,
}: {
  draft: AmbassadorshipDraft;
  setDraft: React.Dispatch<React.SetStateAction<AmbassadorshipDraft>>;
  problems: string[];
  saving: boolean;
  brandOptions: BrandOption[];
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
            options={brandOptions}
            value={draft.brand_name}
            onChange={(name, source) => setDraft((d) => ({ ...d, brand_name: name, brand_source: source }))}
          />
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
                <button type="button" className="underline hover:text-foreground" onClick={() => onToggleCategory(k)}>
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
          <p className="text-xs text-muted-foreground">Your own work with the brand. Shown if the moodboard is public.</p>
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
