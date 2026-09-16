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
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'failed'; reason: string }
  | { kind: 'no_match' }
  | { kind: 'hits'; hits: ProductDocumentHit[] };

/**
 * Three different nothings — nothing attached, nothing matched, the search never ran.
 * A failure can never become `no_match`, whatever an empty hit list looks like.
 */
export function documentSearchOutcome(
  state: DocSearchState,
  attachedDocCount: number,
): DocSearchOutcome {
  if (state.kind === 'failed') return { kind: 'failed', reason: state.reason };
  if (attachedDocCount <= 0) return { kind: 'no_documents' };
  if (state.kind === 'idle') return { kind: 'idle' };
  if (state.kind === 'searching') return { kind: 'searching' };
  return state.hits.length === 0 ? { kind: 'no_match' } : { kind: 'hits', hits: state.hits };
}
