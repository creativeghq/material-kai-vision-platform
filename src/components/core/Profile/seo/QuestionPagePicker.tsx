import React, { useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2, Search } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { Input } from '@/components/core/ui/input';
import { HubEmptyState } from '@/components/core/hub/HubEmptyState';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { pageReviewService } from '@/services/seo/pageReviewService';
import { userWebsitesService } from '@/services/userWebsitesService';
import { safeHref } from '@/utils/safeUrl';
import { compact } from './seoMetrics';
import { urlPath, type QuestionPageSource, type QuestionPageSuggestion } from './aiCitations';

interface PickRow { page_id: string; url: string; title: string | null; hint: string | null }

/** Choose the page that should answer a question. Suggestions come from SQL; search covers every crawled page. */
export const QuestionPagePicker: React.FC<{
  websiteId: string;
  question: string | null;
  source: QuestionPageSource;
  onClose: () => void;
  onAssigned: () => void;
}> = ({ websiteId, question, source, onClose, onAssigned }) => {
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<QuestionPageSuggestion[] | null>(null);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<PickRow[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!question) return;
    let cancelled = false;
    setSuggestions(null); setSuggestError(null); setPicked(null); setSearch(''); setFound(null);
    userWebsitesService.suggestPagesForQuestion(websiteId, question, 6)
      .then((r) => { if (!cancelled) { setSuggestions(r); setPicked(r[0]?.page_id ?? null); } })
      .catch((e) => { if (!cancelled) setSuggestError(e?.message ?? 'Could not suggest a page'); });
    return () => { cancelled = true; };
  }, [websiteId, question]);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) { setFound(null); return; }
    let cancelled = false;
    const t = setTimeout(() => {
      pageReviewService.list(websiteId, { search: term, limit: 20 })
        .then((rows) => {
          if (cancelled) return;
          setFound(rows
            .filter((r) => (r.http_status ?? 200) < 400)
            .map((r) => ({ page_id: r.page_id, url: r.url, title: r.title, hint: null })));
        })
        .catch(() => { if (!cancelled) setFound([]); });
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [websiteId, search]);

  const rows: PickRow[] = found ?? (suggestions ?? []).map((s) => ({
    page_id: s.page_id, url: s.url, title: s.title,
    hint: [
      s.reason === 'gsc' ? `Google shows it for this search · ${compact(s.gsc_impressions ?? 0)} impressions` : `Title match ${Math.round(s.match * 100)}%`,
      s.open_questions > 0 ? `${s.open_questions} question${s.open_questions === 1 ? '' : 's'} already waiting` : null,
    ].filter(Boolean).join(' · '),
  }));
  // Only a page the user can see may be saved; a search hides the preselected suggestion.
  const target = rows.some((r) => r.page_id === picked) ? picked : null;
  const loadingRows = found === null && suggestions === null && !suggestError;

  const save = async () => {
    if (!question || !target) return;
    setSaving(true);
    try {
      const r = await userWebsitesService.assignQuestionToPage(target, question, source);
      toast({
        title: r.status === 'applied' ? 'That page already answers it' : r.created ? 'Question added to the page' : 'Already on that page’s list',
        description: r.status === 'applied'
          ? 'The question is in the page text already, so it is marked done.'
          : 'It is listed under 4. Put them on pages and on the page in Site health → Pages. The next crawl marks it done once the page carries it.',
      });
      onAssigned();
      onClose();
    } catch (e: any) {
      toast({ title: 'Could not add it', description: e?.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!question} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Which page should answer this?</DialogTitle>
          <DialogDescription>“{question}”</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" placeholder="Search your pages by title or address…" aria-label="Search pages" />
          </div>
          {loadingRows ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : found === null && suggestError ? (
            <p className="text-sm text-destructive">{suggestError} Search for the page above instead.</p>
          ) : rows.length === 0 ? (
            found !== null ? (
              <HubEmptyState
                variant="filtered"
                title="Nothing matches that search"
                description="Only crawled pages that load can be picked. Try a shorter word from the title or the address."
                action={<Button size="sm" variant="outline" onClick={() => setSearch('')}>Clear search</Button>}
              />
            ) : (
              <HubEmptyState
                variant="empty"
                title="Nothing on the site looks like a match"
                description="Search for the page above. If no page fits, the question deserves a page of its own: write it, recrawl, then come back."
                action={(
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/websites/${websiteId}?section=articles`}>Write an article for it</a>
                  </Button>
                )}
              />
            )
          ) : (
            <ul className="max-h-80 divide-y divide-hairline overflow-y-auto rounded-sm border border-hairline" aria-label="Pages">
              {rows.map((r, i) => (
                <li key={r.page_id} className={cn('flex items-start gap-2 px-3 py-2', target === r.page_id && 'bg-primary/[0.08]')}>
                  <button
                    type="button"
                    aria-pressed={target === r.page_id}
                    onClick={() => setPicked(r.page_id)}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                      {target === r.page_id && <Check className="h-4 w-4 text-primary" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-xs font-medium text-foreground">{r.title || urlPath(r.url)}</span>
                        {found === null && i === 0 && <Badge variant="info">Best match</Badge>}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">{urlPath(r.url)}</span>
                      {r.hint && <span className="block text-[11px] text-muted-foreground">{r.hint}</span>}
                    </span>
                  </button>
                  <a href={safeHref(r.url)} target="_blank" rel="noopener noreferrer" className="mt-0.5 shrink-0 text-muted-foreground hover:text-primary" aria-label={`Open ${urlPath(r.url)}`}>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => void save()} disabled={!target || saving}>
            {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}{target ? 'Add to this page' : 'Pick a page first'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
