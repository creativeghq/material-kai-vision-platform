import React, { useMemo, useState } from 'react';
import { ExternalLink, FileQuestion, Plus } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { safeHref } from '@/utils/safeUrl';
import { timeAgo } from '@/utils/datetime';
import { QuestionPagePicker } from './QuestionPagePicker';
import { urlPath, type QuestionAssignment } from './aiCitations';

/** Questions grouped by the page that should answer them. */
export const QuestionPagesPanel: React.FC<{
  websiteId: string;
  assignments: QuestionAssignment[] | null;
  onChanged: () => void;
  onFindQuestions: () => void;
}> = ({ websiteId, assignments, onChanged, onFindQuestions }) => {
  const [draft, setDraft] = useState('');
  const [picking, setPicking] = useState<string | null>(null);

  const byPage = useMemo(() => {
    const m = new Map<string, { url: string; title: string | null; fetched_at: string | null; rows: QuestionAssignment[] }>();
    for (const a of assignments ?? []) {
      const g = m.get(a.page_id) ?? { url: a.url, title: a.title, fetched_at: a.fetched_at, rows: [] };
      g.rows.push(a);
      m.set(a.page_id, g);
    }
    return [...m.entries()].sort((x, y) =>
      y[1].rows.filter((r) => r.status === 'open').length - x[1].rows.filter((r) => r.status === 'open').length);
  }, [assignments]);

  const open = (assignments ?? []).filter((a) => a.status === 'open').length;
  const done = (assignments ?? []).filter((a) => a.status === 'applied').length;
  const canAdd = draft.trim().length >= 4;

  return (
    <Card className="dashboard-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileQuestion className="h-4 w-4 text-primary" />
          Questions each page should answer
        </CardTitle>
        <CardDescription>
          A page that answers a buyer&rsquo;s question in its own words, under that question as a heading, is the page
          Google&rsquo;s People Also Ask and the assistants quote. Add a question from step 3 or write your own, pick the
          page, then put the answer on the site. The next crawl sees it and marks it done.
          {assignments && assignments.length > 0 && <> {open} waiting · {done} on the page.</>}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => { e.preventDefault(); if (canAdd) setPicking(draft.trim()); }}
        >
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a question a customer asks, e.g. Ποια πλακάκια είναι κατάλληλα για ντους;"
            aria-label="New question"
            maxLength={300}
          />
          <Button type="submit" variant="outline" disabled={!canAdd} className="shrink-0">
            <Plus className="mr-1 h-3.5 w-3.5" />Choose a page
          </Button>
        </form>

        {assignments === null ? (
          <p className="text-sm text-muted-foreground">The questions could not be loaded, so this list is unknown.</p>
        ) : byPage.length === 0 ? (
          <HubEmptyState
            variant="empty"
            title="No question is assigned to a page yet"
            description="Find the questions people ask, then send each one to the page that should answer it."
            action={<Button size="sm" onClick={onFindQuestions}>Find questions</Button>}
          />
        ) : (
          <ul className="divide-y divide-hairline rounded-sm border border-hairline">
            {byPage.map(([pageId, g]) => (
              <li key={pageId} className="space-y-2 px-3 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <a href={safeHref(g.url)} target="_blank" rel="noopener noreferrer" className="inline-flex min-w-0 items-center gap-1 text-xs font-medium text-primary hover:underline">
                    <span className="truncate">{g.title || urlPath(g.url)}</span><ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                  <span className="truncate text-[11px] text-muted-foreground">{urlPath(g.url)}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    {g.fetched_at ? `crawled ${timeAgo(g.fetched_at)}` : 'not crawled yet'}
                  </span>
                </div>
                <ul className="space-y-1">
                  {g.rows.map((r) => (
                    <li key={r.id} className="flex items-start gap-2 text-xs">
                      <Badge variant={r.status === 'applied' ? 'success' : 'info'} className="shrink-0">
                        {r.status === 'applied' ? 'On the page' : 'Waiting'}
                      </Badge>
                      <span className="min-w-0 flex-1 leading-snug text-foreground">{r.question}</span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {r.question_source ?? 'added'}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <QuestionPagePicker
        websiteId={websiteId}
        question={picking}
        source="manual"
        onClose={() => setPicking(null)}
        onAssigned={() => { setDraft(''); onChanged(); }}
      />
    </Card>
  );
};
