import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Switch } from '@/components/core/ui/switch';
import { Checkbox } from '@/components/core/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/core/ui/select';
import { FormField, FormGrid, FormSection } from '@/components/core/ui/form-layout';
import { HubEmptyState, HubFilterSelect, HubResetFilters, HubToolbar, HUB_FILTER_ALL, useHubTable, type HubTableField } from '@/components/core/hub';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatDate, todayLocalISO } from '@/utils/datetime';
import {
  WRITING_SURFACES, WRITING_SURFACE_LABELS, WRITING_TELL_KINDS, WRITING_TELL_KIND_HINTS, WRITING_TELL_KIND_LABELS,
  type WritingSurface, type WritingTellKind,
} from '@/config/writingVocabulary';
import type { Database } from '@/integrations/supabase/types';

type ChannelRule = Database['public']['Tables']['channel_writing_rules']['Row'];
type Tell = Database['public']['Tables']['writing_tells']['Row'];

const NUMBER_FIELDS = ['max_chars', 'target_min_chars', 'target_max_chars', 'visible_chars', 'hashtag_limit', 'hashtag_recommended', 'ask_max'] as const;
type NumberField = typeof NUMBER_FIELDS[number];
const TEXT_FIELDS = ['label', 'hashtag_style', 'tone_notes', 'structure_notes', 'source_note'] as const;
type TextField = typeof TEXT_FIELDS[number];

const NUMBER_LABELS: Record<NumberField, string> = {
  max_chars: 'Hard Limit (Characters)',
  target_min_chars: 'Target Minimum',
  target_max_chars: 'Target Maximum',
  visible_chars: 'Visible Before Cut',
  hashtag_limit: 'Hashtag Limit',
  hashtag_recommended: 'Hashtags Recommended',
  ask_max: 'Asks Allowed',
};

interface RuleDraft {
  numbers: Record<NumberField, string>;
  texts: Record<TextField, string>;
  links_clickable: boolean;
  is_active: boolean;
  verified_on: string;
}

const toDraft = (r: ChannelRule): RuleDraft => ({
  numbers: Object.fromEntries(NUMBER_FIELDS.map((f) => [f, r[f] == null ? '' : String(r[f])])) as Record<NumberField, string>,
  texts: Object.fromEntries(TEXT_FIELDS.map((f) => [f, r[f] ?? ''])) as Record<TextField, string>,
  links_clickable: r.links_clickable,
  is_active: r.is_active,
  verified_on: r.verified_on ?? '',
});

/** Blank = not enforced (NULL), never 0. */
function parseLimit(field: NumberField, raw: string): { value: number | null } | { error: string } {
  const t = raw.trim();
  if (t === '') return { value: null };
  const n = Number(t);
  if (!Number.isInteger(n) || n < 0) return { error: `${NUMBER_LABELS[field]} must be a whole number of 0 or more, or blank.` };
  return { value: n };
}

const limitText = (v: number | null) => (v == null ? '—' : v.toLocaleString());

const TELL_FIELDS: HubTableField<Tell>[] = [
  { id: 'phrase', sortValue: (t) => t.phrase, searchText: (t) => `${t.phrase} ${t.note ?? ''}` },
  { id: 'kind', sortValue: (t) => t.kind, filterValue: (t) => t.kind, filterLabel: 'Kind', filterOptionLabel: (v) => WRITING_TELL_KIND_LABELS[v as WritingTellKind] ?? v },
  { id: 'language', sortValue: (t) => t.language_code, filterValue: (t) => t.language_code, filterLabel: 'Language', filterOptionLabel: (v) => v.toUpperCase() },
];

export const WritingRulesTab: React.FC = () => {
  const { toast } = useToast();
  const [rules, setRules] = useState<ChannelRule[]>([]);
  const [tells, setTells] = useState<Tell[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ChannelRule | null>(null);
  const [draft, setDraft] = useState<RuleDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [newTell, setNewTell] = useState<{ kind: WritingTellKind; phrase: string; language_code: string; surfaces: WritingSurface[]; note: string }>(
    { kind: 'ai_phrase', phrase: '', language_code: 'en', surfaces: [], note: '' },
  );

  const load = useCallback(async () => {
    setLoading(true);
    const [r, t] = await Promise.all([
      supabase.from('channel_writing_rules').select('*').order('surface').order('label'),
      supabase.from('writing_tells').select('*').order('kind').order('phrase'),
    ]);
    setLoadError(r.error?.message ?? t.error?.message ?? null);
    setRules(r.data ?? []);
    setTells(t.data ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const tellTable = useHubTable(tells, TELL_FIELDS);
  const languages = useMemo(() => [...new Set(['en', 'el', ...tells.map((t) => t.language_code)])], [tells]);

  const openEdit = (r: ChannelRule) => { setEditing(r); setDraft(toDraft(r)); };

  const saveRule = async () => {
    if (!editing || !draft) return;
    const patch: Partial<ChannelRule> = {};
    for (const f of NUMBER_FIELDS) {
      const parsed = parseLimit(f, draft.numbers[f]);
      if ('error' in parsed) { toast({ title: 'Check the limits', description: parsed.error, variant: 'destructive' }); return; }
      patch[f] = parsed.value;
    }
    if (!draft.texts.label.trim()) { toast({ title: 'A label is required', variant: 'destructive' }); return; }
    for (const f of TEXT_FIELDS) patch[f] = draft.texts[f].trim() || (f === 'label' ? editing.label : null);
    patch.links_clickable = draft.links_clickable;
    patch.is_active = draft.is_active;
    patch.verified_on = draft.verified_on || null;
    patch.updated_at = new Date().toISOString();
    setSaving(true);
    const { error } = await supabase.from('channel_writing_rules').update(patch).eq('channel', editing.channel);
    setSaving(false);
    if (error) { toast({ title: 'Could not save', description: error.message, variant: 'destructive' }); return; }
    toast({ title: `${patch.label ?? editing.label} saved`, description: 'Writers use the new rules from their next draft.' });
    setEditing(null);
    void load();
  };

  const addTell = async () => {
    const phrase = newTell.phrase.trim();
    if (!phrase) return;
    const { error } = await supabase.from('writing_tells').insert({
      kind: newTell.kind,
      phrase,
      language_code: newTell.language_code.trim().toLowerCase() || 'en',
      surfaces: newTell.surfaces.length ? newTell.surfaces : null,
      note: newTell.note.trim() || null,
    });
    if (error) {
      toast({ title: 'Could not add the phrase', description: error.code === '23505' ? 'That phrase is already listed for this kind and language.' : error.message, variant: 'destructive' });
      return;
    }
    setNewTell((s) => ({ ...s, phrase: '', note: '' }));
    void load();
  };

  const toggleTell = async (t: Tell) => {
    const { error } = await supabase.from('writing_tells').update({ is_active: !t.is_active, updated_at: new Date().toISOString() }).eq('id', t.id);
    if (error) toast({ title: 'Could not update', description: error.message, variant: 'destructive' });
    else void load();
  };

  const deleteTell = async (t: Tell) => {
    if (!window.confirm(`Delete "${t.phrase}"? Writers stop flagging it immediately.`)) return;
    const { error } = await supabase.from('writing_tells').delete().eq('id', t.id);
    if (error) toast({ title: 'Could not delete', description: error.message, variant: 'destructive' });
    else void load();
  };

  if (loading) {
    return <div className="flex justify-center py-12"><RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (loadError) {
    return (
      <Card><CardContent className="pt-4 text-sm text-muted-foreground">Could not read the writing rules: {loadError}</CardContent></Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Channel Writing Rules</CardTitle>
          <p className="text-sm text-muted-foreground">
            Every writer and the copy check read these at run time: social captions, email subjects and preview text.
            A blank limit is not enforced. Change one when a platform changes its rules; no deploy is needed.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {rules.length === 0 ? (
            <HubEmptyState title="No channel rules yet" description="Writers refuse a channel with no rules row, so nothing can be drafted until one exists." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Channel</TableHead>
                  <TableHead className="hidden sm:table-cell">Surface</TableHead>
                  <TableHead className="text-right">Limit</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Target</TableHead>
                  <TableHead className="hidden text-right md:table-cell">Visible</TableHead>
                  <TableHead className="text-right">Hashtags</TableHead>
                  <TableHead className="hidden text-right lg:table-cell">Asks</TableHead>
                  <TableHead className="hidden lg:table-cell">Verified</TableHead>
                  <TableHead><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rules.map((r) => (
                  <TableRow key={r.channel}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.label}</span>
                        {!r.is_active && <Badge variant="neutral">Off</Badge>}
                      </div>
                      <p className="font-mono text-xs text-muted-foreground">{r.channel}</p>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs">{WRITING_SURFACE_LABELS[r.surface as WritingSurface] ?? r.surface}</TableCell>
                    <TableCell className="text-right tabular-nums">{limitText(r.max_chars)}</TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">
                      {r.target_min_chars == null && r.target_max_chars == null ? '—' : `${r.target_min_chars ?? 0}–${r.target_max_chars ?? '∞'}`}
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums md:table-cell">{limitText(r.visible_chars)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {limitText(r.hashtag_limit)}<span className="text-muted-foreground"> / {limitText(r.hashtag_recommended)}</span>
                    </TableCell>
                    <TableCell className="hidden text-right tabular-nums lg:table-cell">{limitText(r.ask_max)}</TableCell>
                    <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{formatDate(r.verified_on, { fallback: 'Not verified' })}</TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Edit ${r.label}`} onClick={() => openEdit(r)}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Writing Phrases</CardTitle>
          <p className="text-sm text-muted-foreground">
            Phrases the copy check flags in every draft. It warns; it never rewrites. Each workspace adds its own words on top through the brand profile&apos;s avoid list.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <FormSection title="Add a Phrase" description={WRITING_TELL_KIND_HINTS[newTell.kind]}>
            <FormGrid cols={4}>
              <FormField label="Kind">
                <Select value={newTell.kind} onValueChange={(v) => setNewTell((s) => ({ ...s, kind: v as WritingTellKind }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WRITING_TELL_KINDS.map((k) => <SelectItem key={k} value={k}>{WRITING_TELL_KIND_LABELS[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Phrase">
                <Input value={newTell.phrase} onChange={(e) => setNewTell((s) => ({ ...s, phrase: e.target.value }))} placeholder={newTell.kind === 'filler_hashtag' ? '#explorepage' : 'look no further'} />
              </FormField>
              <FormField label="Language" htmlFor="writing-tell-language" hint="Two-letter code, e.g. en or el.">
                <>
                  <Input id="writing-tell-language" list="writing-tell-languages" value={newTell.language_code} onChange={(e) => setNewTell((s) => ({ ...s, language_code: e.target.value }))} maxLength={5} />
                  <datalist id="writing-tell-languages">{languages.map((l) => <option key={l} value={l} />)}</datalist>
                </>
              </FormField>
              <FormField label="Note" optional>
                <Input value={newTell.note} onChange={(e) => setNewTell((s) => ({ ...s, note: e.target.value }))} />
              </FormField>
            </FormGrid>
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-xs text-muted-foreground">Applies to:</span>
              {WRITING_SURFACES.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={newTell.surfaces.includes(s)}
                    onCheckedChange={(on) => setNewTell((st) => ({ ...st, surfaces: on ? [...st.surfaces, s] : st.surfaces.filter((x) => x !== s) }))}
                  />
                  {WRITING_SURFACE_LABELS[s]}
                </label>
              ))}
              <span className="text-xs text-muted-foreground">None ticked = every surface.</span>
              <Button size="sm" className="ml-auto" onClick={addTell} disabled={!newTell.phrase.trim()}>
                <Plus className="mr-1 h-4 w-4" /> Add phrase
              </Button>
            </div>
          </FormSection>

          <div className="overflow-hidden rounded-md border border-hairline">
            <HubToolbar
              search={tellTable.search}
              onSearchChange={tellTable.setSearch}
              searchPlaceholder="Search phrases"
              filters={
                <>
                  <HubFilterSelect label="Kind" value={tellTable.filters.kind ?? HUB_FILTER_ALL} options={tellTable.filterOptions.kind} onChange={(v) => tellTable.setFilter('kind', v)} />
                  <HubFilterSelect label="Language" value={tellTable.filters.language ?? HUB_FILTER_ALL} options={tellTable.filterOptions.language} onChange={(v) => tellTable.setFilter('language', v)} />
                  <HubResetFilters count={tellTable.activeFilterCount} onReset={tellTable.reset} />
                </>
              }
            />
            {tellTable.rows.length === 0 ? (
              tellTable.activeFilterCount > 0 || tellTable.search
                ? <HubEmptyState variant="filtered" title="No phrases match" action={<Button variant="outline" size="sm" onClick={tellTable.reset}>Clear filters</Button>} />
                : <HubEmptyState title="No phrases yet" description="Add the first one above." />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Phrase</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead className="hidden sm:table-cell">Language</TableHead>
                    <TableHead className="hidden md:table-cell">Applies To</TableHead>
                    <TableHead className="hidden lg:table-cell">Note</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tellTable.rows.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.phrase}</TableCell>
                      <TableCell className="text-xs">{WRITING_TELL_KIND_LABELS[t.kind as WritingTellKind] ?? t.kind}</TableCell>
                      <TableCell className="hidden text-xs uppercase sm:table-cell">{t.language_code}</TableCell>
                      <TableCell className="hidden text-xs md:table-cell">
                        {t.surfaces?.length ? t.surfaces.map((s) => WRITING_SURFACE_LABELS[s as WritingSurface] ?? s).join(', ') : 'All'}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">{t.note ?? '—'}</TableCell>
                      <TableCell><Switch checked={t.is_active} onCheckedChange={() => toggleTell(t)} aria-label={`Flag "${t.phrase}"`} /></TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Delete "${t.phrase}"`} onClick={() => deleteTell(t)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => { if (!open) setEditing(null); }}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {editing?.label} Rules</DialogTitle>
            <DialogDescription>Blank limits are not enforced. The copy check warns on targets and refuses to publish past a hard limit.</DialogDescription>
          </DialogHeader>
          {draft && (
            <div className="space-y-5">
              <FormSection title="Channel">
                <FormGrid cols={2}>
                  <FormField label="Label">
                    <Input value={draft.texts.label} onChange={(e) => setDraft({ ...draft, texts: { ...draft.texts, label: e.target.value } })} />
                  </FormField>
                  <FormField label="Active" hint="Off makes writers refuse this channel.">
                    <Switch checked={draft.is_active} onCheckedChange={(v) => setDraft({ ...draft, is_active: v })} />
                  </FormField>
                </FormGrid>
              </FormSection>
              <FormSection title="Length">
                <FormGrid cols={4}>
                  {(['max_chars', 'target_min_chars', 'target_max_chars', 'visible_chars'] as const).map((f) => (
                    <FormField key={f} label={NUMBER_LABELS[f]}>
                      <Input inputMode="numeric" value={draft.numbers[f]} onChange={(e) => setDraft({ ...draft, numbers: { ...draft.numbers, [f]: e.target.value } })} />
                    </FormField>
                  ))}
                </FormGrid>
              </FormSection>
              <FormSection title="Hashtags, Asks and Links">
                <FormGrid cols={4}>
                  {(['hashtag_limit', 'hashtag_recommended', 'ask_max'] as const).map((f) => (
                    <FormField key={f} label={NUMBER_LABELS[f]}>
                      <Input inputMode="numeric" value={draft.numbers[f]} onChange={(e) => setDraft({ ...draft, numbers: { ...draft.numbers, [f]: e.target.value } })} />
                    </FormField>
                  ))}
                  <FormField label="Links Clickable">
                    <Switch checked={draft.links_clickable} onCheckedChange={(v) => setDraft({ ...draft, links_clickable: v })} />
                  </FormField>
                </FormGrid>
                <FormField label="Hashtag Style" optional>
                  <Input value={draft.texts.hashtag_style} onChange={(e) => setDraft({ ...draft, texts: { ...draft.texts, hashtag_style: e.target.value } })} />
                </FormField>
              </FormSection>
              <FormSection title="Guidance for the Writer" description="Sent to the model with every draft for this channel.">
                <FormField label="Tone Notes" optional>
                  <Textarea rows={2} value={draft.texts.tone_notes} onChange={(e) => setDraft({ ...draft, texts: { ...draft.texts, tone_notes: e.target.value } })} />
                </FormField>
                <FormField label="How a Post Is Built" optional>
                  <Textarea rows={5} value={draft.texts.structure_notes} onChange={(e) => setDraft({ ...draft, texts: { ...draft.texts, structure_notes: e.target.value } })} />
                </FormField>
              </FormSection>
              <FormSection title="Source">
                <FormGrid cols={2}>
                  <FormField label="Where These Numbers Come From" optional>
                    <Input value={draft.texts.source_note} onChange={(e) => setDraft({ ...draft, texts: { ...draft.texts, source_note: e.target.value } })} />
                  </FormField>
                  <FormField label="Verified On" optional>
                    <div className="flex gap-2">
                      <Input type="date" value={draft.verified_on} onChange={(e) => setDraft({ ...draft, verified_on: e.target.value })} />
                      <Button type="button" variant="outline" size="sm" onClick={() => setDraft({ ...draft, verified_on: todayLocalISO() })}>Today</Button>
                    </div>
                  </FormField>
                </FormGrid>
              </FormSection>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={saveRule} disabled={saving}>{saving ? 'Saving…' : 'Save rules'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default WritingRulesTab;
