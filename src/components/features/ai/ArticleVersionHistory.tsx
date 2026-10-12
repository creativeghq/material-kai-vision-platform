import React, { useCallback, useState } from 'react';
import { History, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { Badge } from '@/components/core/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/core/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatDate, formatTime } from '@/utils/datetime';
import { formatNumber } from '@/utils/decimal';

interface VersionRow {
  id: string;
  reason: string;
  seo_score: number | null;
  word_count: number | null;
  created_at: string;
  markdown: string;
}

const REASON_LABEL: Record<string, string> = {
  edit: 'Edited', fix: 'Fix applied', refresh: 'Refreshed', update: 'Updated', restore: 'Restored', pipeline: 'Regenerated',
};

/** Every body an article had before a change, newest first, with restore. */
export const ArticleVersionHistory: React.FC<{ articleId: string; onRestored: () => Promise<void> | void }> = ({ articleId, onRestored }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [preview, setPreview] = useState<VersionRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('seo_article_versions' as never)
      .select('id, reason, seo_score, word_count, created_at, markdown')
      .eq('article_id', articleId).order('created_at', { ascending: false }).limit(30);
    if (error) toast({ title: 'Could not read the history', description: error.message, variant: 'destructive' });
    setVersions((data ?? []) as VersionRow[]);
  }, [articleId, toast]);

  const restore = async (v: VersionRow) => {
    setBusy(v.id);
    try {
      const { error } = await supabase.rpc('restore_seo_article_version' as never, { p_version_id: v.id } as never);
      if (error) throw new Error(error.message);
      toast({ title: 'Version restored', description: 'The text you replaced is kept in the history. Re-score to refresh the analysis.' });
      setOpen(false);
      setPreview(null);
      await onRestored();
    } catch (e) {
      toast({ title: 'Not restored', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
    } finally { setBusy(null); }
  };

  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setOpen(true); void load(); }}>
        <History className="h-3.5 w-3.5" /> History
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPreview(null); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Article History</DialogTitle>
            <DialogDescription>The text before each change, newest first. The last 30 are kept.</DialogDescription>
          </DialogHeader>
          {versions === null ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : versions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No earlier versions yet. One is saved every time the finished article changes.</p>
          ) : preview ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Back</Button>
                <span className="text-sm text-muted-foreground">{formatDate(preview.created_at)} {formatTime(preview.created_at)}</span>
                <Button size="sm" className="ml-auto gap-1.5" onClick={() => void restore(preview)} disabled={busy === preview.id}>
                  {busy === preview.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} Restore this version
                </Button>
              </div>
              <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap rounded-sm border border-hairline bg-surface-sunken p-3 text-xs">{preview.markdown}</pre>
            </div>
          ) : (
            <div className="divide-y divide-hairline">
              {versions.map((v) => (
                <div key={v.id} className="flex flex-wrap items-center gap-3 py-2">
                  <Badge variant="neutral">{REASON_LABEL[v.reason] ?? v.reason}</Badge>
                  <span className="text-sm tabular-nums">{formatDate(v.created_at)} {formatTime(v.created_at)}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {v.word_count != null ? `${formatNumber(v.word_count)} words` : '—'}
                    {v.seo_score != null ? ` · score ${v.seo_score}` : ''}
                  </span>
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setPreview(v)}>View</Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
};
