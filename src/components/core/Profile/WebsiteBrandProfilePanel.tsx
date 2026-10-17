/**
 * Brand profile — the stable half of every content brief: a website's own, or the workspace default.
 *
 * `ContentBrief` has always declared brandVoice, provenance and firsthandExperience, and the
 * analyzer scores against all three. Nothing ever filled them, so `provenance` and
 * `firsthand_experience` failed on every article and read as a writing problem rather than a
 * missing input. Those two checks are also the ones no competitor has, which made them the worst
 * two to leave broken.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, Save, ShieldCheck, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { Label } from '@/components/core/ui/label';

interface BrandProfile {
  tone_attributes: string[];
  personality_traits: string[];
  writing_style: string | null;
  terminology_preferences: string[];
  avoid_list: string[];
  example_content_urls: string[];
  author_name: string | null;
  author_title: string | null;
  author_bio: string | null;
  author_url: string | null;
  publisher_name: string | null;
  reviewed_by: string | null;
  ai_disclosure: string | null;
  proprietary_data: string[];
  owned_examples: string[];
  methodology: string | null;
  credentials: string | null;
}

const EMPTY: BrandProfile = {
  tone_attributes: [], personality_traits: [], writing_style: null,
  terminology_preferences: [], avoid_list: [], example_content_urls: [],
  author_name: null, author_title: null, author_bio: null, author_url: null,
  publisher_name: null, reviewed_by: null, ai_disclosure: null,
  proprietary_data: [], owned_examples: [], methodology: null, credentials: null,
};

/** Only the profile's own fields are written: never the row id, workspace or website. */
const pickProfile = (p: BrandProfile): BrandProfile & { updated_at: string } => ({
  ...(Object.fromEntries((Object.keys(EMPTY) as (keyof BrandProfile)[]).map((k) => [k, p[k]])) as unknown as BrandProfile),
  updated_at: new Date().toISOString(),
});
/** Comma-separated in, trimmed array out. Empty entries are dropped, not stored as ''. */
const toList = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean);
const fromList = (a: string[] | null | undefined): string => (a ?? []).join(', ');
/** '' means "not stated" — stored as NULL so it is distinguishable from a deliberate blank. */
const orNull = (s: string): string | null => (s.trim() ? s.trim() : null);

type Row = BrandProfile & { id: string; website_id: string | null };
interface GlossaryLesson { id: string; from_text: string; to_text: string }

export const WebsiteBrandProfilePanel: React.FC<{ websiteId: string }> = ({ websiteId }) => {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const [p, setP] = useState<BrandProfile>(EMPTY);
  const [rows, setRows] = useState<Row[]>([]);
  const [ownVoice, setOwnVoice] = useState(false);
  const [glossary, setGlossary] = useState<GlossaryLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    const [{ data, error }, { data: lessons }] = await Promise.all([
      supabase.from('workspace_brand_profile').select('*').eq('workspace_id', activeWorkspaceId),
      supabase.from('seo_writer_lessons').select('id, from_text, to_text')
        .eq('workspace_id', activeWorkspaceId).eq('kind', 'glossary').eq('status', 'approved').order('created_at'),
    ]);
    if (error) {
      // Leave the form unloaded: showing EMPTY would let Save write blanks over the real profile.
      toast({ title: 'Could not load the brand profile', description: error.message, variant: 'destructive' });
      setLoadFailed(true);
      setLoading(false);
      return;
    }
    setLoadFailed(false);
    const all = (data ?? []) as unknown as Row[];
    const own = all.find((r) => r.website_id === websiteId);
    const used = own ?? all.find((r) => r.website_id === null);
    setRows(all);
    setOwnVoice(!!own);
    setP(used ? { ...EMPTY, ...used } : EMPTY);
    setGlossary((lessons ?? []) as GlossaryLesson[]);
    setLoading(false);
  }, [activeWorkspaceId, websiteId, toast]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!activeWorkspaceId || loadFailed) return;
    setSaving(true);
    const target = rows.find((r) => r.website_id === (ownVoice ? websiteId : null));
    const payload = pickProfile(p);
    const { data: written, error } = target
      ? await supabase.from('workspace_brand_profile').update(payload).eq('id', target.id).select('id')
      : await supabase.from('workspace_brand_profile')
        .insert({ ...payload, workspace_id: activeWorkspaceId, website_id: ownVoice ? websiteId : null }).select('id');
    setSaving(false);
    if (error || !written?.length) {
      toast({
        title: 'Could not save',
        description: error?.message ?? 'Only a workspace admin can change the brand profile.',
        variant: 'destructive',
      });
      return;
    }
    toast({ title: 'Brand profile saved', description: 'New articles will use it from the next run.' });
    void load();
  };

  const revertToDefault = async () => {
    const own = rows.find((r) => r.website_id === websiteId);
    if (!own) { void load(); return; }
    const { error } = await supabase.from('workspace_brand_profile').delete().eq('id', own.id);
    if (error) {
      toast({ title: 'Could not switch back', description: error.message, variant: 'destructive' });
      return;
    }
    void load();
  };

  const dropLesson = async (id: string) => {
    const { error } = await supabase.from('seo_writer_lessons').update({ status: 'dismissed' }).eq('id', id);
    if (error) {
      toast({ title: 'Could not remove it', description: error.message, variant: 'destructive' });
      return;
    }
    setGlossary((g) => g.filter((l) => l.id !== id));
  };

  const text = (label: string, key: keyof BrandProfile, hint?: string) => (
    <div className="space-y-1">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        value={(p[key] as string | null) ?? ''}
        onChange={(e) => setP({ ...p, [key]: orNull(e.target.value) })}
        placeholder={hint}
      />
    </div>
  );

  const list = (label: string, key: keyof BrandProfile, hint?: string) => (
    <div className="space-y-1">
      <Label htmlFor={key}>{label}</Label>
      <Input
        id={key}
        value={fromList(p[key] as string[])}
        onChange={(e) => setP({ ...p, [key]: toList(e.target.value) })}
        placeholder={hint}
      />
      <p className="text-[11px] text-muted-foreground">Comma-separated.</p>
    </div>
  );

  if (loading) {
    return (
      <Card><CardContent className="py-8 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading brand profile…
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Brand profile</CardTitle>
          <CardDescription>
            {ownVoice
              ? 'This website has its own voice; the workspace default does not apply to its articles.'
              : 'This website uses the workspace default voice, shared by every website without its own.'}
            {' '}A brief that names its own author always wins.
          </CardDescription>
          <Button
            variant="link" size="sm" className="h-auto px-0"
            onClick={() => (ownVoice ? void revertToDefault() : setOwnVoice(true))}
          >
            {ownVoice ? 'Use the workspace default instead' : 'Give this website its own voice'}
          </Button>
        </div>
        <Button onClick={() => void save()} disabled={saving || loadFailed}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="ml-2">Save</span>
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Voice</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {list('Tone', 'tone_attributes', 'practical, direct, warm')}
            {list('Personality', 'personality_traits', 'expert, no-nonsense')}
            {list('Preferred terminology', 'terminology_preferences', 'porcelain tile, not "ceramic"')}
            {list('Words to avoid', 'avoid_list', 'cheap, revolutionary')}
          </div>
          <div className="space-y-1">
            <Label>Learned from your edits</Label>
            {glossary.length ? (
              <ul className="flex flex-wrap gap-2">
                {glossary.map((l) => (
                  <li key={l.id} className="flex items-center gap-1 rounded-sm border border-hairline px-2 py-0.5 text-xs">
                    «{l.to_text}», never «{l.from_text}»
                    <Button variant="ghost" size="sm" className="h-5 px-1" onClick={() => void dropLesson(l.id)} aria-label="Remove">
                      <X className="h-3 w-3" />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                None yet. Approve a word lesson on a published article and it appears here, for every website.
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="writing_style">Writing style</Label>
            <Textarea
              id="writing_style" rows={2}
              value={p.writing_style ?? ''}
              onChange={(e) => setP({ ...p, writing_style: orNull(e.target.value) })}
              placeholder="Short paragraphs, concrete numbers, no marketing adjectives."
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Who is writing</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {text('Author name', 'author_name')}
            {text('Author title', 'author_title', 'Technical Director')}
            {text('Author page URL', 'author_url', 'https://…/about/name')}
            {text('Publisher', 'publisher_name')}
            {text('Reviewed by', 'reviewed_by', 'who checks it before publishing')}
            <div className="space-y-1">
              <Label htmlFor="ai_disclosure">AI disclosure</Label>
              <select
                id="ai_disclosure"
                className="h-9 w-full rounded-sm border border-hairline bg-background px-3 text-sm"
                value={p.ai_disclosure ?? ''}
                onChange={(e) => setP({ ...p, ai_disclosure: e.target.value || null })}
              >
                {/* Blank is "not stated", which is NOT the same as claiming a human wrote it. */}
                <option value="">Not stated</option>
                <option value="human_written">Human written</option>
                <option value="ai_assisted">AI assisted</option>
                <option value="ai_generated">AI generated</option>
              </select>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="author_bio">Author bio</Label>
            <Textarea
              id="author_bio" rows={2}
              value={p.author_bio ?? ''}
              onChange={(e) => setP({ ...p, author_bio: orNull(e.target.value) })}
            />
          </div>
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">First-hand experience</h3>
          <p className="text-[11px] text-muted-foreground">
            What you know that a competitor cannot copy. This is the part the model must not invent —
            leave it blank rather than guess.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {list('Proprietary data', 'proprietary_data', 'installation data from 400 projects')}
            {list('Owned examples', 'owned_examples', 'our Thessaloniki showroom fit-out')}
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="methodology">Methodology</Label>
              <Textarea id="methodology" rows={2} value={p.methodology ?? ''}
                onChange={(e) => setP({ ...p, methodology: orNull(e.target.value) })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="credentials">Credentials</Label>
              <Textarea id="credentials" rows={2} value={p.credentials ?? ''}
                onChange={(e) => setP({ ...p, credentials: orNull(e.target.value) })} />
            </div>
          </div>
        </section>
      </CardContent>
    </Card>
  );
};
