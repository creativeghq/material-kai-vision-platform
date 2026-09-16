import { useCallback, useState } from 'react';
import { Loader2, Search, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/core/ui/badge';
import { Button } from '@/components/core/ui/button';
import { Card, CardContent } from '@/components/core/ui/card';
import { Input } from '@/components/core/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { edgeError } from '@/utils/edgeError';
import {
  type DocSearchState,
  type ProductDocumentHit,
  documentSearchOutcome,
} from './productDocumentSearchState';

interface Props {
  productId: string;
  workspaceId: string | null;
  attachedDocCount: number;
}

export function ProductDocumentSearch({ productId, workspaceId, attachedDocCount }: Props) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<DocSearchState>({ kind: 'idle' });

  const run = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    if (!workspaceId) {
      setState({ kind: 'failed', reason: 'No active workspace.' });
      return;
    }
    setState({ kind: 'searching' });

    try {
      const { data, error } = await supabase.functions.invoke('mivaa-gateway', {
        body: {
          action: 'search_knowledge_base',
          payload: {
            query: q,
            workspace_id: workspaceId,
            product_id: productId,
            search_types: ['kb_docs'],
            top_k: 8,
            similarity_threshold: 0.3,
          },
        },
      });
      if (error) throw await edgeError(error);

      const payload = (data?.data ?? data) as { chunks?: unknown[] } | null;
      const hits: ProductDocumentHit[] = (payload?.chunks ?? []).map((raw) => {
        const c = raw as Record<string, unknown>;
        return {
          id: String(c.chunk_id ?? c.id ?? crypto.randomUUID()),
          docTitle: String(c.document_title ?? c.title ?? 'Untitled document'),
          heading: c.heading ? String(c.heading) : null,
          content: String(c.content ?? ''),
          similarity: typeof c.similarity === 'number' ? c.similarity : null,
        };
      });
      setState({ kind: 'answered', hits });
    } catch (err) {
      setState({
        kind: 'failed',
        reason: err instanceof Error ? err.message : 'The document search could not be reached.',
      });
    }
  }, [query, workspaceId, productId]);

  const outcome = documentSearchOutcome(state, attachedDocCount);
  const busy = outcome.kind === 'searching';

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void run(); } }}
          placeholder="Ask this product's documents — reaction to fire, slip rating, cleaning…"
          aria-label="Search this product's attached documents"
          disabled={attachedDocCount === 0}
        />
        <Button onClick={() => void run()} disabled={attachedDocCount === 0 || busy || !query.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          <span className="ml-2">Search</span>
        </Button>
      </div>

      {outcome.kind === 'no_documents' && (
        <p className="text-sm text-muted-foreground">
          No documents are attached to this product yet, so there is nothing to search.
        </p>
      )}

      {outcome.kind === 'failed' && (
        <Card>
          <CardContent className="flex items-start gap-2 pt-6 text-sm">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>
              <span className="font-semibold">The search failed</span> — this is not an answer
              about the documents. {outcome.reason}
            </span>
          </CardContent>
        </Card>
      )}

      {outcome.kind === 'no_match' && (
        <p className="text-sm text-muted-foreground">
          The documents attached to this product were searched and no passage matches that.
        </p>
      )}

      {outcome.kind === 'hits' && outcome.hits.map((hit) => (
        <Card key={hit.id}>
          <CardContent className="space-y-2 pt-6">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">
                {hit.docTitle}{hit.heading ? ` — ${hit.heading}` : ''}
              </span>
              {hit.similarity !== null && (
                <Badge variant="neutral" className="tabular-nums">
                  {Math.round(hit.similarity * 100)}%
                </Badge>
              )}
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {hit.content.slice(0, 1200)}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
