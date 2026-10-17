/** Brand profile — the positioning and voice every content producer reads at runtime, a website's own or the workspace default. */
import React, { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, Save, ShieldCheck, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { Textarea } from '@/components/core/ui/textarea';
import { FormField, FormGrid, FormSection } from '@/components/core/ui/form-layout';
import { userWebsitesService, type CompetitorRow } from '@/services/userWebsitesService';
import {
  BRAND_FIELD_LABELS, BRAND_SOURCE_LABELS, type BrandProposableField, type BrandProposalOp, type BrandProposalSource,
} from '@/config/brandProfileFields';

interface BrandProfile {
  positioning: string | null;
  icp: string | null;
  messaging_pillars: string[];
  active_hypotheses: string[];
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
  positioning: null, icp: null, messaging_pillars: [], active_hypotheses: [],
  tone_attributes: [], personality_traits: [], writing_style: null,
  terminology_preferences: [], avoid_list: [], example_content_urls: [],
  author_name: null, author_title: null, author_bio: null, author_url: null,
  publisher_name: null, reviewed_by: null, ai_disclosure: null,
  proprietary_data: [], owned_examples: [], methodology: null, credentials: null,
};

const pickProfile = (p: BrandProfile): BrandProfile & { updated_at: string } => ({
  ...(Object.fromEntries((Object.keys(EMPTY) as (keyof BrandProfile)[]).map((k) => [k, p[k]])) as unknown as BrandProfile),
  updated_at: new Date().toISOString(),
});
const toList = (s: string): string[] => s.split(',').map((x) => x.trim()).filter(Boolean);
const fromList = (a: string[] | null | undefined): string => (a ?? []).join(', ');
const orNull = (s: string): string | null => (s.trim() ? s.trim() : null);

type Row = BrandProfile & { id: string; website_id: string | null };
interface GlossaryLesson { id: string; from_text: string; to_text: string }
interface Proposal {
  id: string;
  website_id: string | null;
  field: BrandProposableField;
  op: BrandProposalOp;
  value: string;
  rationale: string;
  source: BrandProposalSource;
  evidence: { note?: string } | null;
  agent_id: string | null;
  created_at: string;
}

const OP_WORD: Record<BrandProposalOp, string> = { add: 'Add', remove: 'Remove', set: 'Replace with' };

export const WebsiteBrandProfilePanel: React.FC<{ websiteId: string; onOpenCompetitors?: () => void }> = ({ websiteId, onOpenCompetitors }) => {
  const { activeWorkspaceId } = useWorkspace();
  const { toast } = useToast();
  const [p, setP] = useState<BrandProfile>(EMPTY);
  const [rows, setRows] = useState<Row[]>([]);
  const [ownVoice, setOwnVoice] = useState(false);
  const [glossary, setGlossary] = useState<GlossaryLesson[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [competitors, setCompetitors] = useState<CompetitorRow[] | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    if (!activeWorkspaceId) { setLoading(false); return; }
    setLoading(true);
    const [{ data, error }, { data: lessons }, { data: pending }, comps] = await Promise.all([
      supabase.from('workspace_brand_profile').select('*').eq('workspace_id', activeWorkspaceId),
      supabase.from('seo_writer_lessons').select('id, from_text, to_text')
        .eq('workspace_id', activeWorkspaceId).eq('kind', 'glossary').eq('status', 'approved').order('created_at'),
      supabase.from('brand_profile_proposals' as never)
        .select('id, website_id, field, op, value, rationale, source, evidence, agent_id, created_at')
        .eq('workspace_id', activeWorkspaceId).eq('status', 'proposed').order('created_at'),
      userWebsitesService.listCompetitors(websiteId).catch(() => null),
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
    setProposals((pending ?? []) as unknown as Proposal[]);
    setCompetitors(comps ? comps.filter((c) => c.is_active) : null);
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
    toast({ title: 'Brand profile saved', description: 'Every agent writes from it on its next run.' });
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

  const decide = async (id: string, decision: 'approved' | 'dismissed') => {
    setDeciding(id);
    const { error } = await supabase.rpc('decide_brand_profile_proposal' as never, { p_proposal_id: id, p_decision: decision } as never);
    setDeciding(null);
    if (error) {
      toast({ title: 'Could not record the decision', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: decision === 'approved' ? 'Applied to the brand profile' : 'Dismissed' });
    void load();
  };

  const text = (label: string, key: keyof BrandProfile, hint?: string) => (
    <FormField label={label} htmlFor={key}>
      <Input
        id={key}
        value={(p[key] as string | null) ?? ''}
        onChange={(e) => setP({ ...p, [key]: orNull(e.target.value) })}
        placeholder={hint}
      />
    </FormField>
  );

  const list = (label: string, key: keyof BrandProfile, placeholder?: string, hint = 'Comma-separated.') => (
    <FormField label={label} htmlFor={key} hint={hint}>
      <Input
        id={key}
        value={fromList(p[key] as string[])}
        onChange={(e) => setP({ ...p, [key]: toList(e.target.value) })}
        placeholder={placeholder}
      />
    </FormField>
  );

  const area = (label: string, key: keyof BrandProfile, placeholder?: string, hint?: string) => (
    <FormField label={label} htmlFor={key} hint={hint}>
      <Textarea
        id={key} rows={2}
        value={(p[key] as string | null) ?? ''}
        onChange={(e) => setP({ ...p, [key]: orNull(e.target.value) })}
        placeholder={placeholder}
      />
    </FormField>
  );

  if (loading) {
    return (
      <Card><CardContent className="py-8 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading brand profile…
      </CardContent></Card>
    );
  }

  const profileTarget = ownVoice ? websiteId : null;
  const pending = proposals.filter((x) => x.website_id === profileTarget);

  return (
    <>
      {pending.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Proposed changes</CardTitle>
            <CardDescription>
              Agents propose; nothing changes until a workspace admin approves. An approved change reaches every agent on its next run.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-hairline">
              {pending.map((x) => (
                <li key={x.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="neutral">{BRAND_FIELD_LABELS[x.field] ?? x.field}</Badge>
                      <span className="text-muted-foreground">{OP_WORD[x.op]}</span>
                      <span className="font-medium break-words">«{x.value}»</span>
                    </div>
                    <p className="text-muted-foreground">{x.rationale}</p>
                    {x.evidence?.note && <p className="text-xs text-muted-foreground break-words">Evidence: {x.evidence.note}</p>}
                    <p className="text-xs text-muted-foreground">
                      From {BRAND_SOURCE_LABELS[x.source] ?? x.source}{x.agent_id ? ` · ${x.agent_id}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="secondary" disabled={deciding === x.id} onClick={() => void decide(x.id, 'approved')}>
                      <Check className="h-3.5 w-3.5" /><span className="ml-1">Approve</span>
                    </Button>
                    <Button size="sm" variant="ghost" disabled={deciding === x.id} onClick={() => void decide(x.id, 'dismissed')}>
                      <X className="h-3.5 w-3.5" /><span className="ml-1">Dismiss</span>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Brand profile</CardTitle>
            <CardDescription>
              {ownVoice
                ? 'This website has its own profile; the workspace default does not apply to its articles.'
                : 'This website uses the workspace default, which every agent, social post, campaign and inbox draft writes from.'}
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
          <FormSection title="Positioning" description="Who we are for and what we say. Agents use it to decide what to write, never as copy to repeat.">
            <FormGrid cols={1}>
              {area('Positioning', 'positioning', 'The specialist for large-format porcelain in Northern Greece.')}
              {area('Ideal customer', 'icp', 'Architects and contractors fitting out 5+ unit residential projects.')}
            </FormGrid>
            <FormGrid>
              {list('Messaging pillars', 'messaging_pillars', 'stock in Thessaloniki, technical support')}
              {list('Active hypotheses', 'active_hypotheses', 'architects respond to case studies', 'Comma-separated. What we are testing right now.')}
            </FormGrid>
            <FormField label="Competitors" hint="Read from this website's tracked competitors. Agents use them to differentiate.">
              <div className="flex flex-wrap items-center gap-2">
                {competitors?.length
                  ? competitors.map((c) => <Badge key={c.id} variant="neutral">{c.display_label || c.competitor_domain}</Badge>)
                  : <span className="text-xs text-muted-foreground">{competitors ? 'None tracked for this website.' : 'Could not read the tracked competitors.'}</span>}
                {onOpenCompetitors && (
                  <Button variant="outline" size="sm" onClick={onOpenCompetitors}>Manage competitors</Button>
                )}
              </div>
            </FormField>
          </FormSection>

          <FormSection title="Voice">
            <FormGrid>
              {list('Tone', 'tone_attributes', 'practical, direct, warm')}
              {list('Personality', 'personality_traits', 'expert, no-nonsense')}
              {list('Preferred terminology', 'terminology_preferences', 'porcelain tile, not "ceramic"')}
              {list('Words to avoid', 'avoid_list', 'cheap, revolutionary',
                'Comma-separated words or exact phrases. Every generated draft is checked for them; a draft that uses one is flagged, and the inbox assistant will not send it on its own.')}
            </FormGrid>
            <FormField label="Learned from your edits">
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
                <p className="text-xs text-muted-foreground">
                  None yet. Approve a word lesson on a published article and it appears here, for every website.
                </p>
              )}
            </FormField>
            {area('Writing style', 'writing_style', 'Short paragraphs, concrete numbers, no marketing adjectives.')}
          </FormSection>

          <FormSection title="Who is writing">
            <FormGrid>
              {text('Author name', 'author_name')}
              {text('Author title', 'author_title', 'Technical Director')}
              {text('Author page URL', 'author_url', 'https://…/about/name')}
              {text('Publisher', 'publisher_name')}
              {text('Reviewed by', 'reviewed_by', 'who checks it before publishing')}
              <FormField label="AI disclosure" htmlFor="ai_disclosure">
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
              </FormField>
            </FormGrid>
            {area('Author bio', 'author_bio')}
          </FormSection>

          <FormSection
            title="First-hand experience"
            description="What you know that a competitor cannot copy. This is the part the model must not invent — leave it blank rather than guess."
          >
            <FormGrid>
              {list('Proprietary data', 'proprietary_data', 'installation data from 400 projects')}
              {list('Owned examples', 'owned_examples', 'our Thessaloniki showroom fit-out')}
              {area('Methodology', 'methodology')}
              {area('Credentials', 'credentials')}
            </FormGrid>
          </FormSection>
        </CardContent>
      </Card>
    </>
  );
};
