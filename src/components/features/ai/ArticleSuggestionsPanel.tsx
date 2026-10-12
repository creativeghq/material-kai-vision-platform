import React, { useCallback, useEffect, useState } from 'react';
import { Check, Lightbulb, Loader2, Plus, Sparkles, X } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/utils/datetime';
import { parseEdgeError } from '@/utils/edgeError';

export interface ArticleSuggestion {
  id: string;
  source: 'coverage' | 'answer_check' | 'analysis' | 'update' | 'refresh';
  title: string;
  kind: 'insert' | 'replace';
  find?: string;
  replace?: string;
  after?: string;
  markdown?: string;
  status: 'pending' | 'applied' | 'dismissed';
  created_at: string;
}

interface CoverageReport {
  missing?: { point: string; source: string }[];
  checked?: number;
  checked_at?: string;
  failed?: string;
}

interface AnswerCheck {
  engine: string;
  checked_at: string;
  status: string;
  our_domain_cited: boolean | null;
  missing: unknown[] | null;
}

const ENGINE_LABEL: Record<string, string> = { google_ai_mode: 'Google AI Mode', chatgpt: 'ChatGPT', perplexity: 'Perplexity' };

const SOURCE_TAG: Record<ArticleSuggestion['source'], { label: string; variant: 'info' | 'warning' | 'neutral' }> = {
  coverage: { label: 'Reader expectation', variant: 'info' },
  answer_check: { label: 'AI answer', variant: 'warning' },
  analysis: { label: 'Analysis', variant: 'neutral' },
  update: { label: 'Out of date', variant: 'warning' },
  refresh: { label: 'What ranks now', variant: 'info' },
};

/** The last line of the anchor: where the new block lands. */
const anchorTail = (s: string) => s.trim().split('\n').filter(Boolean).at(-1) ?? s;

async function invokeSeo(body: Record<string, unknown>): Promise<{ data?: any; error?: string }> {
  const { data, error } = await supabase.functions.invoke('seo-api', { body });
  if (error) return { error: (await parseEdgeError(error, 'The request failed.')).message };
  if (!data?.success) return { error: data?.error || 'The request failed.' };
  return { data: data.data };
}

function ReaderExpectations({ coverage, checks }: { coverage: CoverageReport | null; checks: AnswerCheck[] }) {
  const parts: React.ReactNode[] = [];
  if (coverage) {
    parts.push(coverage.failed
      ? <span key="c">Coverage check failed: {coverage.failed}</span>
      : <span key="c">Coverage: {coverage.checked ?? 0} expectations checked, {coverage.missing?.length ?? 0} not answered</span>);
  } else {
    parts.push(<span key="c">Coverage not checked yet</span>);
  }
  for (const check of checks) {
    parts.push(
      <span key={check.engine} className="inline-flex items-center gap-1.5">
        {ENGINE_LABEL[check.engine] ?? check.engine} {formatDate(check.checked_at)}
        {check.status === 'ok' ? (
          <>
            <Badge variant={check.our_domain_cited ? 'success' : 'warning'}>
              {check.our_domain_cited ? 'cited' : 'not cited'}
            </Badge>
            {(check.missing?.length ?? 0)} missing
          </>
        ) : <Badge variant="neutral">{check.status === 'no_answer' ? 'no AI answer' : 'check failed'}</Badge>}
      </span>,
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
      <span className="font-semibold text-foreground">Reader expectations</span>
      {parts}
    </p>
  );
}

function Preview({ s }: { s: ArticleSuggestion }) {
  if (s.kind === 'replace') {
    return (
      <div className="mt-2 space-y-1.5">
        <p className="whitespace-pre-wrap rounded-sm bg-surface-sunken px-2 py-1 text-[11px] text-muted-foreground line-through">
          {s.find}
        </p>
        <p className="whitespace-pre-wrap rounded-sm border-l-2 border-[hsl(var(--success))] bg-[hsl(var(--success-bg))] px-2 py-1 text-xs text-foreground">
          {s.replace || '(removed)'}
        </p>
      </div>
    );
  }
  return (
    <div className="mt-2 space-y-1.5">
      <p className="line-clamp-2 rounded-sm bg-surface-sunken px-2 py-1 text-[11px] text-muted-foreground">
        After: {anchorTail(s.after ?? '')}
      </p>
      <p className="whitespace-pre-wrap rounded-sm border-l-2 border-[hsl(var(--success))] bg-[hsl(var(--success-bg))] px-2 py-1 text-xs text-foreground">
        {s.markdown}
      </p>
    </div>
  );
}

/** Proposed edits to the article, each previewed before it is applied. */
export function ArticleSuggestionsPanel({ articleId, extra, onChanged }: {
  articleId: string;
  /** `stages_data.extra` of the article. */
  extra: Record<string, unknown> | null | undefined;
  /** Called after anything here changed the stored article, so the viewer re-reads it. */
  onChanged: () => Promise<void> | void;
}) {
  const { toast } = useToast();
  const [generating, setGenerating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checks, setChecks] = useState<AnswerCheck[]>([]);

  const all = Array.isArray(extra?.suggestions) ? (extra.suggestions as ArticleSuggestion[]) : [];
  const pending = all.filter((s) => s.status === 'pending');
  const coverage = (extra?.coverage ?? null) as CoverageReport | null;

  useEffect(() => {
    let live = true;
    (async () => {
      const { data, error: readErr } = await supabase
        .from('seo_article_answer_checks')
        .select('engine, checked_at, status, our_domain_cited, missing')
        .eq('article_id', articleId)
        .order('checked_at', { ascending: false })
        .limit(12);
      if (!live) return;
      if (readErr) console.warn('[ArticleSuggestions] answer checks unreadable:', readErr.message);
      const latest = new Map<string, AnswerCheck>();
      for (const row of (data ?? []) as AnswerCheck[]) if (!latest.has(row.engine)) latest.set(row.engine, row);
      setChecks([...latest.values()]);
    })();
    return () => { live = false; };
  }, [articleId]);

  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await invokeSeo({ action: 'suggestions', article_id: articleId });
      if (res.error) {
        setError(res.error);
        return;
      }
      const made = (res.data?.suggestions ?? []).filter((s: ArticleSuggestion) => s.status === 'pending').length;
      toast({
        title: made ? `${made} suggestion${made === 1 ? '' : 's'} ready` : 'No suggestions',
        description: res.data?.message
          ?? (res.data?.credits_used != null ? `${res.data.credits_used} credits used.` : undefined),
      });
      await onChanged();
    } finally {
      setGenerating(false);
    }
  }, [articleId, onChanged, toast]);

  const act = useCallback(async (s: ArticleSuggestion, action: 'suggestion_apply' | 'suggestion_dismiss') => {
    setBusyId(s.id);
    setError(null);
    try {
      const res = await invokeSeo({ action, article_id: articleId, suggestion_id: s.id });
      if (res.error) {
        setError(res.error);
        return;
      }
      if (action === 'suggestion_apply') {
        toast({
          title: 'Applied',
          description: res.data?.seo_score != null
            ? `Score is now ${res.data.seo_score}/100. You can revert this from Optimize.`
            : 'You can revert this from Optimize.',
        });
      }
      await onChanged();
    } finally {
      setBusyId(null);
    }
  }, [articleId, onChanged, toast]);

  const suggestButton = (
    <Button size="sm" variant="secondary" onClick={generate} disabled={generating} className="gap-1.5">
      {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      {generating ? 'Thinking' : 'Suggest improvements'}
    </Button>
  );

  return (
    <div className="rounded-md border border-hairline bg-card">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-hairline px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold">Article Suggestions</p>
          <p className="text-[11px] text-muted-foreground">
            Proposed edits for what readers expect and what the analysis found. Preview each, then add or dismiss it.
            Suggesting uses credits; adding and dismissing are free.
          </p>
        </div>
        {pending.length > 0 && suggestButton}
      </div>

      <div className="border-b border-hairline px-3 py-2">
        <ReaderExpectations coverage={coverage} checks={checks} />
      </div>

      {error && (
        <p role="alert" className="border-b border-hairline bg-[hsl(var(--error-bg))] px-3 py-2 text-xs text-[hsl(var(--error))]">
          {error}
        </p>
      )}

      {pending.length === 0 ? (
        <HubEmptyState
          icon={Lightbulb}
          className="py-6"
          title="No suggestions yet"
          description="Ask for concrete edits: each one is shown before anything in the article changes. Uses credits."
          action={suggestButton}
        />
      ) : (
        <div className="divide-y divide-hairline">
          {pending.map((s) => {
            const tag = SOURCE_TAG[s.source] ?? SOURCE_TAG.analysis;
            const busy = busyId === s.id;
            return (
              <div key={s.id} className="flex items-start gap-3 p-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium">{s.title}</p>
                    <Badge variant={tag.variant}>{tag.label}</Badge>
                    <span className="text-[11px] text-muted-foreground">{s.kind === 'insert' ? 'Adds text' : 'Rewrites text'}</span>
                  </div>
                  <Preview s={s} />
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <Button
                    size="icon-sm"
                    variant="outline"
                    aria-label={`Apply: ${s.title}`}
                    title="Apply"
                    disabled={!!busyId}
                    onClick={() => act(s, 'suggestion_apply')}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`Dismiss: ${s.title}`}
                    title="Dismiss"
                    disabled={!!busyId}
                    onClick={() => act(s, 'suggestion_dismiss')}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {all.some((s) => s.status === 'applied') && (
        <p className="flex items-center gap-1.5 border-t border-hairline px-3 py-2 text-[11px] text-muted-foreground">
          <Check className="h-3 w-3" />
          {all.filter((s) => s.status === 'applied').length} applied, {all.filter((s) => s.status === 'dismissed').length} dismissed
        </p>
      )}
    </div>
  );
}
