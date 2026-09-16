export interface ProductDocumentHit {
  id: string;
  docTitle: string;
  heading: string | null;
  content: string;
  similarity: number | null;
}

export type DocSearchState =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'answered'; hits: ProductDocumentHit[] }
  | { kind: 'failed'; reason: string };

export type DocSearchOutcome =
  | { kind: 'no_documents' }
  | { kind: 'awaiting_review'; count: number }
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'failed'; reason: string }
  | { kind: 'no_match' }
  | { kind: 'hits'; hits: ProductDocumentHit[] };

/**
 * Four different nothings: nothing attached, attached but unpublished so retrieval cannot
 * reach them, nothing matched, and the search never ran. A failure is never `no_match`.
 */
export function documentSearchOutcome(
  state: DocSearchState,
  searchableDocCount: number,
  unreviewedDocCount = 0,
): DocSearchOutcome {
  if (state.kind === 'failed') return { kind: 'failed', reason: state.reason };
  if (searchableDocCount <= 0 && unreviewedDocCount > 0) {
    return { kind: 'awaiting_review', count: unreviewedDocCount };
  }
  if (searchableDocCount <= 0) return { kind: 'no_documents' };
  if (state.kind === 'idle') return { kind: 'idle' };
  if (state.kind === 'searching') return { kind: 'searching' };
  return state.hits.length === 0 ? { kind: 'no_match' } : { kind: 'hits', hits: state.hits };
}
