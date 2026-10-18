import { describe, expect, it } from 'vitest';
import { blankedSource, posix, sourceIndex } from '../helpers/sourceIndex';

const INDEX = sourceIndex({ roots: ['supabase/functions'] });
const DISPATCH = 'supabase/functions/_shared/tools/dataforseo-dispatch.ts';

describe('every DataForSEO call passes the spend gate (#475 phase 3, invariant 10)', () => {
  it('no edge function fetches MIVAA\'s seo-agent routes except the dispatcher', () => {
    const offenders: string[] = [];
    for (const [abs] of INDEX.blanked()) {
      const file = posix(abs);
      if (file === DISPATCH) continue;
      const src = blankedSource(abs);
      for (const m of src.matchAll(/fetch\(\s*`[^`]*seo-agent\//g)) {
        offenders.push(`${file}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(offenders, 'Use callDataForSEO / callSEOAgentRoute / gatedGatewayPost from _shared/tools/dataforseo-dispatch.ts').toEqual([]);
  });

  it('the three scheduled collectors go through gatedGatewayPost', () => {
    for (const fn of ['seo-domain-tracker', 'seo-rank-tracker', 'seo-site-audit']) {
      const src = blankedSource(`supabase/functions/${fn}/index.ts`);
      expect(src.includes('gatedGatewayPost('), fn).toBe(true);
    }
  });
});
