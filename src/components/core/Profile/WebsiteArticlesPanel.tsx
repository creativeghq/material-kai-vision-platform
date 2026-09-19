import React, { useEffect, useState } from 'react';
import { CalendarClock, Check, Loader2, Plus, Trash2 } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/core/ui/card';
import { Dialog, DialogContent, DialogTitle } from '@/components/core/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/core/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/core/ui/table';
import { HubEmptyState } from '@/components/core/hub';
import SEOArticleViewer from '@/components/features/ai/SEOArticleViewer';
import { useToast } from '@/hooks/use-toast';
import { timeAgo } from '@/utils/datetime';
import { formatNumber } from '@/utils/decimal';
import {
  userWebsitesService,
  type SeoArticleFreshnessRow,
  type SeoArticleRow,
  type UserWebsite,
} from '@/services/userWebsitesService';
import { Loading, STATUS_COLOR, useLaunchQuickStart } from './seo/dashboardPrimitives';

/** Websites → Content → Articles. */
export const WebsiteArticlesPanel: React.FC<{ website: UserWebsite }> = ({ website }) => {
  const { toast } = useToast();
  const launchQuickStart = useLaunchQuickStart();
  const [articles, setArticles] = useState<SeoArticleRow[]>([]);
  const [freshness, setFreshness] = useState<SeoArticleFreshnessRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [openArticleId, setOpenArticleId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SeoArticleRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [ar, fr] = await Promise.all([
          userWebsitesService.articles(website.id),
          userWebsitesService.freshness(website.id),
        ]);
        if (cancelled) return;
        setArticles(ar);
        setFreshness(fr);
      } catch (e: any) {
        if (!cancelled) toast({ title: 'Could not load articles', description: e?.message, variant: 'destructive' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [website.id]);

  // `is_due` already accounts for the article's own cadence and any snooze, so there is no second
  // opinion here about what "due" means.
  const dueForRefresh = freshness.filter((f) => f.is_due);
  const freshnessById = new Map(freshness.map((f) => [f.article_id, f]));

  const markReviewed = async (articleId: string) => {
    setReviewing(articleId);
    try {
      await userWebsitesService.markArticleReviewed(articleId);
      setFreshness(await userWebsitesService.freshness(website.id));
      toast({ title: 'Marked reviewed', description: 'The refresh clock starts again from today.' });
    } catch (e: any) {
      toast({ title: 'Could not mark reviewed', description: e.message, variant: 'destructive' });
    } finally {
      setReviewing(null);
    }
  };

  const removeArticle = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await userWebsitesService.deleteArticle(deleting.id);
      // Drop it from BOTH lists: the freshness table is a second view of the same rows, and
      // leaving it there would show a deleted article as still due for review.
      setArticles((prev) => prev.filter((a) => a.id !== deleting.id));
      setFreshness((prev) => prev.filter((f) => f.article_id !== deleting.id));
      toast({ title: 'Article deleted' });
      setDeleting(null);
    } catch (err: any) {
      toast({ title: 'Could not delete the article', description: err?.message, variant: 'destructive' });
    } finally { setDeleteBusy(false); }
  };

  return (
    <div className="space-y-4">
      {/*
        Content decay (issue #349 C1). An article does not break when it goes stale —
        it keeps ranking, keeps reading well, and simply stops being the page an
        answer engine reaches for. Nothing in the platform revisited one, so this
        queue is the only place the fact is visible.

        `refresh_due_at` and `age_days` are DERIVED in SQL by
        seo_article_refresh_due_at(); this component formats them and never recomputes.
      */}
      {dueForRefresh.length > 0 && (
        <Card className="dashboard-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4" />
              Due for a refresh
              <Badge variant="warning">{dueForRefresh.length}</Badge>
            </CardTitle>
            <CardDescription>
              Content updated inside the last three months is cited noticeably more often by
              answer engines. Refresh the figures and examples, then mark it reviewed.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Keyword</TableHead>
                  <TableHead className="text-right">Age</TableHead>
                  <TableHead>Last reviewed</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dueForRefresh.map((f) => (
                  <TableRow key={f.article_id}>
                    <TableCell className="font-medium max-w-[280px] truncate">
                      <button
                        type="button"
                        onClick={() => setOpenArticleId(f.article_id)}
                        className="text-left hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {f.title || f.target_keyword || 'Untitled article'}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[180px] truncate">
                      {f.target_keyword || '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{f.age_days}d</TableCell>
                    <TableCell className="text-muted-foreground">
                      {/* Never reviewed is a different fact from reviewed a long time ago. */}
                      {f.last_reviewed_at ? timeAgo(f.last_reviewed_at) : 'never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reviewing === f.article_id}
                        onClick={() => void markReviewed(f.article_id)}
                      >
                        {reviewing === f.article_id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Check className="w-3.5 h-3.5" />}
                        <span className="ml-1">Mark reviewed</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <Card className="dashboard-card">
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
          <CardTitle>SEO Articles</CardTitle>
          <CardDescription>Articles generated for this website. Click one to open the full viewer.</CardDescription>
          </div>
          <Button size="sm" variant="outline" className="shrink-0"
            onClick={() => launchQuickStart('seo-article', 'Generate full article')}>
            <Plus className="w-3.5 h-3.5 mr-1" />New article
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <Loading />
          ) : articles.length === 0 ? (
            <HubEmptyState
              variant="empty"
              title="No articles yet"
              description="The article pipeline researches a keyword, plans the piece and writes it. Start one and it files itself here."
              action={
                <Button size="sm" onClick={() => launchQuickStart('seo-article', 'Generate full article')}>
                  <Plus className="w-3.5 h-3.5 mr-1" />New article
                </Button>
              }
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Keyword</TableHead>
                  <TableHead className="text-right">SEO</TableHead>
                  <TableHead className="text-right">Words</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Content age</TableHead>
                  <TableHead className="text-right"><span className="sr-only">Actions</span></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {articles.map((a) => (
                  <TableRow
                    key={a.id}
                    className="cursor-pointer"
                    // Row onClick is a MOUSE CONVENIENCE only — the keyboard/AT path is the button on the
                    // primary cell. A <tr> cannot be made focusable correctly: tabIndex + role="button" on a
                    // row is invalid ARIA and yields a focus stop with no name.
                    onClick={() => setOpenArticleId(a.id)}
                  >
                    <TableCell className="font-medium max-w-[280px] truncate">
                      <button type="button" onClick={(e) => { e.stopPropagation(); setOpenArticleId(a.id); }} className="text-left hover:underline rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">{a.title || a.target_keyword}</button>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[180px] truncate">{a.target_keyword}</TableCell>
                    <TableCell className="text-right">{a.seo_score ?? '—'}</TableCell>
                    <TableCell className="text-right">{formatNumber(a.word_count)}</TableCell>
                    <TableCell className={STATUS_COLOR[a.status] || 'text-muted-foreground'}>{a.status}</TableCell>
                    <TableCell className="text-muted-foreground">{timeAgo(a.created_at)}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {freshnessById.get(a.id)
                        ? (
                          <span className={freshnessById.get(a.id)!.is_due ? 'text-destructive' : undefined}>
                            {freshnessById.get(a.id)!.age_days}d
                          </span>
                        )
                        // An unpublished draft has no content age — that is not the same
                        // as being fresh, and it is not the same as being stale either.
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        title="Delete article"
                        // The row itself opens the viewer; without this the delete would open
                        // it too, behind the dialog.
                        onClick={(e) => { e.stopPropagation(); setDeleting(a); }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span className="sr-only">Delete</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Article viewer */}
      <Dialog open={!!openArticleId} onOpenChange={(o) => { if (!o) setOpenArticleId(null); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {/* sr-only because the design has no room for a visible heading. Radix logs a runtime
              warning without one and, more importantly, a screen reader announces the dialog with
              no name at all. (audit #302 finding 5) */}
          <DialogTitle className="sr-only">SEO article</DialogTitle>
          {openArticleId && <SEOArticleViewer articleId={openArticleId} />}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={(v) => { if (!v && !deleteBusy) setDeleting(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this article?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  <span className="font-medium">{deleting?.title || deleting?.target_keyword || 'Untitled article'}</span>
                  {' '}will be removed permanently, along with its research and score.
                </p>
                <p>
                  If it has been published to the site, deleting it here does not take it down
                  there — remove it on the site as well.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void removeArticle(); }} disabled={deleteBusy}>
              {deleteBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default WebsiteArticlesPanel;
