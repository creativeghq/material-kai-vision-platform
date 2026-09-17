import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { blankComments } from '../helpers/stripComments';
import {
  similarProductsOutcome,
} from '../../src/components/features/recognition/similarProductsState';

const read = (p: string) => blankComments(
  readFileSync(join(process.cwd(), p), 'utf8').replace(/\r\n/g, '\n'),
);

describe('recognition returns the similar products it advertises', () => {
  it('the results surface actually renders them', () => {
    const results = read('src/components/features/recognition/RecognitionResults.tsx');
    expect(results).toMatch(/<SimilarProducts imageBase64=/);
  });

  it('the analysed image is carried so the catalogue can be searched with it', () => {
    const rec = read('src/components/features/recognition/MaterialRecognition.tsx');
    expect(rec).toMatch(/imageBase64: base64/);
  });
});

describe('a failed visual search is not an empty catalogue', () => {
  it('a failure outranks every other outcome', () => {
    expect(similarProductsOutcome({ kind: 'failed', reason: 'boom' }))
      .toEqual({ kind: 'failed', reason: 'boom' });
  });

  it('nothing matching is its own answer, distinct from a failure', () => {
    expect(similarProductsOutcome({ kind: 'answered', products: [] }))
      .toEqual({ kind: 'none_similar' });
  });

  it('a pending search never reads as no matches', () => {
    expect(similarProductsOutcome({ kind: 'searching' }).kind).toBe('searching');
    expect(similarProductsOutcome({ kind: 'idle' }).kind).toBe('idle');
  });

  it('hits come back as hits', () => {
    const p = [{ id: 'a', name: 'Tile', score: 0.8 }];
    expect(similarProductsOutcome({ kind: 'answered', products: p }))
      .toEqual({ kind: 'hits', products: p });
  });
});
