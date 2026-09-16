import { describe, expect, it } from 'vitest';

import {
  type ProductDocumentHit,
  documentSearchOutcome,
} from '../../src/components/features/products/productDocumentSearchState';

const hit = (id: string): ProductDocumentHit => ({
  id, docTitle: 'EN 13501 report', heading: 'Reaction to fire', content: 'Class A1.', similarity: 0.8,
});

describe('a failed search is never an answer about the documents', () => {
  it('a failure outranks everything, including an attached-document count', () => {
    const out = documentSearchOutcome({ kind: 'failed', reason: 'gateway 503' }, 4);
    expect(out).toEqual({ kind: 'failed', reason: 'gateway 503' });
  });

  it('a failure on a product with NO documents still reads as failed', () => {
    expect(documentSearchOutcome({ kind: 'failed', reason: 'boom' }, 0).kind).toBe('failed');
  });

  it('a failure never becomes no_match, which is what an empty list would look like', () => {
    const out = documentSearchOutcome({ kind: 'failed', reason: 'timeout' }, 2);
    expect(out.kind).not.toBe('no_match');
    expect(out.kind).not.toBe('hits');
  });
});

describe('nothing attached and nothing matched are different answers', () => {
  it('no attached documents is its own outcome, before any search runs', () => {
    expect(documentSearchOutcome({ kind: 'idle' }, 0)).toEqual({ kind: 'no_documents' });
  });

  it('documents attached but no passage matched says so', () => {
    expect(documentSearchOutcome({ kind: 'answered', hits: [] }, 3)).toEqual({ kind: 'no_match' });
  });

  it('an answered search with no documents attached cannot report no_match', () => {
    expect(documentSearchOutcome({ kind: 'answered', hits: [] }, 0)).toEqual({ kind: 'no_documents' });
  });
});

describe('the ordinary paths still work', () => {
  it('hits come back as hits', () => {
    const out = documentSearchOutcome({ kind: 'answered', hits: [hit('a'), hit('b')] }, 2);
    expect(out).toEqual({ kind: 'hits', hits: [hit('a'), hit('b')] });
  });

  it('idle and searching are distinct, so a pending search is never an empty result', () => {
    expect(documentSearchOutcome({ kind: 'idle' }, 2).kind).toBe('idle');
    expect(documentSearchOutcome({ kind: 'searching' }, 2).kind).toBe('searching');
  });
});
