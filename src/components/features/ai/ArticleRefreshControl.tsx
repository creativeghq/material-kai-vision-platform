import React, { useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/core/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { parseEdgeError } from '@/utils/edgeError';

interface RefreshMeta { title: string | null; description: string | null; status: string }

/** Compare the article with what ranks now, and apply a proposed title / meta description. */
export const ArticleRefreshControl: React.FC<{
  articleId: string;
  extra: Record<string, unknown> | undefined;
  currentTitle: string | null;
  currentMeta: string | null;
  onChanged: () => Promise<void> | void;
}> = ({ articleId, extra, currentTitle, currentMeta, onChanged }) => {
  const { toast } = useToast();
  const [busy, setBusy] = useState<'refresh' | 'meta' | null>(null);
  const meta = (extra?.refresh_meta ?? null) as RefreshMeta | null;
  const differs = !!meta && ((!!meta.title && meta.title !== currentTitle) || (!!meta.description && meta.description !== currentMeta));
  const pendingMeta = meta && meta.status === 'pending' && differs ? meta : null;

  const refresh = async () => {
    setBusy('refresh');
    try {
      const { data, error } = await supabase.functions.invoke('seo-api', { body: { action: 'refresh', article_id: articleId } });
      if (error || !data?.success) {
        const message = error ? (await parseEdgeError(error, 'The refresh failed.')).message : data?.error;
        toast({ title: 'Could not refresh the article', description: message || 'Nothing was changed.', variant: 'destructive' });
        return;
      }
      const r = data.data ?? {};
      toast({
        title: r.proposed ? `${r.proposed} change${r.proposed === 1 ? '' : 's'} drafted` : 'Nothing to refresh',
        description: r.message ?? `${r.credits_used ?? 0} credits. Review them in Article Suggestions.`,
      });
      await onChanged();
    } finally { setBusy(null); }
  };

  const applyMeta = async () => {
    if (!pendingMeta) return;
    setBusy('meta');
    const update = {
      ...(pendingMeta.title ? { title: pendingMeta.title } : {}),
      ...(pendingMeta.description ? { meta_description: pendingMeta.description } : {}),
    };
    const { error } = await supabase.from('seo_articles').update(update).eq('id', articleId);
    setBusy(null);
    if (error) { toast({ title: 'Not applied', description: error.message, variant: 'destructive' }); return; }
    toast({ title: 'Title and meta updated', description: 'Publish again to send them to your site.' });
    await onChanged();
  };

  return (
    <div className="mb-3 space-y-2">
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => void refresh()} disabled={!!busy}>
        {busy === 'refresh' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
        {busy === 'refresh' ? 'Comparing with search' : 'Compare with what ranks now'}
      </Button>
      {pendingMeta && (
        <div className="rounded-sm border border-hairline bg-card p-3 text-sm">
          <p className="text-xs font-semibold">Proposed title and meta</p>
          {pendingMeta.title && <p className="mt-1"><span className="text-muted-foreground">Title:</span> {pendingMeta.title}</p>}
          {pendingMeta.description && <p className="mt-1"><span className="text-muted-foreground">Meta:</span> {pendingMeta.description}</p>}
          <Button size="sm" className="mt-2" onClick={() => void applyMeta()} disabled={!!busy}>
            {busy === 'meta' && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />} Apply
          </Button>
        </div>
      )}
    </div>
  );
};
