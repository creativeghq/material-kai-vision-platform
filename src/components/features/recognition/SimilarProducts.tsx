import { useEffect, useState } from 'react';
import { Loader2, Search, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Card, CardContent } from '@/components/core/ui/card';
import { useWorkspace } from '@/contexts/WorkspaceContext';
import { unifiedSearchService } from '@/services/unifiedSearchService';
import {
  type SimilarProduct, type SimilarState, similarProductsOutcome,
} from './similarProductsState';

export function SimilarProducts({ imageBase64 }: { imageBase64: string }) {
  const { activeWorkspaceId } = useWorkspace();
  const [state, setState] = useState<SimilarState>({ kind: 'idle' });

  useEffect(() => {
    if (!imageBase64 || !activeWorkspaceId) return;
    let cancelled = false;
    setState({ kind: 'searching' });

    unifiedSearchService
      .search({
        strategy: 'multi_vector',
        query: '',
        workspace_id: activeWorkspaceId,
        image_base64: imageBase64,
        top_k: 6,
        similarity_threshold: 0.2,
      })
      .then((res) => {
        if (cancelled) return;
        const products: SimilarProduct[] = (res?.results ?? []).map((r) => ({
          id: String(r.id),
          name: String(r.product_name ?? 'Untitled product'),
          score: typeof r.score === 'number' ? r.score : null,
        }));
        setState({ kind: 'answered', products });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          kind: 'failed',
          reason: err instanceof Error ? err.message : 'The visual search could not be reached.',
        });
      });

    return () => { cancelled = true; };
  }, [imageBase64, activeWorkspaceId]);

  const outcome = similarProductsOutcome(state);
  if (outcome.kind === 'idle') return null;

  return (
    <div className="space-y-2">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-primary">
        <Search className="h-4 w-4" />
        Similar products in the catalogue
      </h4>

      {outcome.kind === 'searching' && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Looking for visual matches…
        </p>
      )}

      {outcome.kind === 'failed' && (
        <Card>
          <CardContent className="flex items-start gap-2 pt-6 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>
              <span className="font-semibold">The visual search failed</span> — this is not a
              statement that nothing matches. {outcome.reason}
            </span>
          </CardContent>
        </Card>
      )}

      {outcome.kind === 'none_similar' && (
        <p className="text-sm text-muted-foreground">
          The catalogue was searched and nothing in it looks like this.
        </p>
      )}

      {outcome.kind === 'hits' && (
        <ul className="space-y-1">
          {outcome.products.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-2 border-b border-hairline py-1.5 text-sm"
            >
              <span>{p.name}</span>
              {p.score !== null && (
                <Badge variant="neutral" className="tabular-nums">
                  {Math.round(p.score * 100)}%
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
