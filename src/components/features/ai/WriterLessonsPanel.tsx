import React, { useCallback, useEffect, useState } from 'react';
import { Check, GraduationCap, Loader2, X } from 'lucide-react';

import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { parseEdgeError } from '@/utils/edgeError';

interface Lesson {
  id: string;
  kind: 'glossary' | 'rule';
  category: string;
  from_text: string | null;
  to_text: string | null;
  rule_text: string | null;
  status: 'proposed' | 'approved' | 'dismissed';
}

/** What the editor changed before publishing, proposed as lessons every later article follows once approved. */
export function WriterLessonsPanel({ articleId, published = true }: { articleId: string; published?: boolean }) {
  const [lessons, setLessons] = useState<Lesson[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: readErr } = await supabase
      .from('seo_writer_lessons')
      .select('id, kind, category, from_text, to_text, rule_text, status')
      .eq('article_id', articleId)
      .order('created_at', { ascending: true });
    if (readErr) setError(readErr.message);
    setLessons((data ?? []) as Lesson[]);
  }, [articleId]);

  useEffect(() => { void load(); }, [load]);

  const read = useCallback(async () => {
    setBusy('read');
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('seo-api', { body: { action: 'lessons', article_id: articleId } });
      if (fnErr) setError((await parseEdgeError(fnErr, 'Could not read the published version.')).message);
      else if (!data?.success) setError(data?.error || 'Could not read the published version.');
      await load();
    } finally {
      setBusy(null);
    }
  }, [articleId, load]);

  const decide = useCallback(async (l: Lesson, status: 'approved' | 'dismissed') => {
    setBusy(l.id);
    setError(null);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const { error: upErr } = await supabase
        .from('seo_writer_lessons')
        .update({ status, decided_by: auth.user?.id ?? null, decided_at: new Date().toISOString() })
        .eq('id', l.id);
      if (upErr) setError(upErr.message);
      await load();
    } finally {
      setBusy(null);
    }
  }, [load]);

  const readButton = (
    <Button size="sm" variant="outline" onClick={read} disabled={!!busy || !published} className="gap-1.5">
      {busy === 'read' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GraduationCap className="h-3.5 w-3.5" />}
      Learn from the published version
    </Button>
  );
  const proposed = (lessons ?? []).filter((l) => l.status === 'proposed');
  const decided = (lessons ?? []).filter((l) => l.status !== 'proposed');

  return (
    <div className="mb-4 rounded-md border border-hairline bg-card">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-hairline px-3 py-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold">Lessons from the published version</p>
          <p className="text-[11px] text-muted-foreground">
            What the editor changed before publishing, as rules for every later article. Approve the ones that are general; reading uses credits.
          </p>
        </div>
        {proposed.length > 0 && readButton}
      </div>
      {error && (
        <p role="alert" className="border-b border-hairline bg-[hsl(var(--error-bg))] px-3 py-2 text-xs text-[hsl(var(--error))]">{error}</p>
      )}
      {lessons !== null && proposed.length === 0 ? (
        <HubEmptyState
          icon={GraduationCap}
          className="py-6"
          title={decided.length ? 'Every lesson is decided' : 'No lessons yet'}
          description={published
            ? 'Compare the published page with this draft and turn the editor\'s changes into rules.'
            : 'Lessons appear once this article is published on its website.'}
          action={readButton}
        />
      ) : (
        <div className="divide-y divide-hairline">
          {proposed.map((l) => (
            <div key={l.id} className="flex items-start gap-3 p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={l.kind === 'glossary' ? 'info' : 'neutral'}>{l.kind === 'glossary' ? 'Glossary' : 'Rule'}</Badge>
                  <span className="text-[11px] text-muted-foreground">{l.category.replace(/_/g, ' ')}</span>
                </div>
                <p className="mt-1 text-xs">
                  {l.kind === 'glossary' ? <>Write «{l.to_text}», never «{l.from_text}»</> : l.rule_text}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button size="icon-sm" variant="outline" aria-label="Approve" title="Approve" disabled={!!busy} onClick={() => decide(l, 'approved')}>
                  {busy === l.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label="Dismiss" title="Dismiss" disabled={!!busy} onClick={() => decide(l, 'dismissed')}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {decided.length > 0 && (
        <p className="border-t border-hairline px-3 py-2 text-[11px] text-muted-foreground">
          {decided.filter((l) => l.status === 'approved').length} approved, {decided.filter((l) => l.status === 'dismissed').length} dismissed
        </p>
      )}
    </div>
  );
}
