export interface SimilarProduct {
  id: string;
  name: string;
  score: number | null;
}

export type SimilarState =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'answered'; products: SimilarProduct[] }
  | { kind: 'failed'; reason: string };

export type SimilarOutcome =
  | { kind: 'idle' }
  | { kind: 'searching' }
  | { kind: 'failed'; reason: string }
  | { kind: 'none_similar' }
  | { kind: 'hits'; products: SimilarProduct[] };

export function similarProductsOutcome(state: SimilarState): SimilarOutcome {
  if (state.kind === 'failed') return { kind: 'failed', reason: state.reason };
  if (state.kind === 'idle') return { kind: 'idle' };
  if (state.kind === 'searching') return { kind: 'searching' };
  return state.products.length === 0
    ? { kind: 'none_similar' }
    : { kind: 'hits', products: state.products };
}
