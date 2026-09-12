/**
 * #401 G2 — "what should I work on" is ONE derivation with a stated reason per row.
 *
 * Scope note: the ranking itself lives in `get_website_opportunities` (a migration, not a file in
 * this repo), so these cases cover the half that IS here — that the list is read rather than
 * rebuilt client-side, and that rows we could not evaluate travel with the answer instead of being
 * filtered out. The SQL invariants need a probe or an integration test, not this file.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripComments } from '../helpers/stripComments';

const ROOT = join(__dirname, '..', '..');
const read = (p: string) => stripComments(readFileSync(join(ROOT, p), 'utf8'));

const TOOL = read('supabase/functions/_shared/tools/seo-agent-tools.ts');
const CHAT = read('supabase/functions/agent-chat/index.ts');
const CARD = read('src/components/features/ai/SEOGenericCard.tsx');

describe('the list is derived, not rebuilt', () => {
  it('reads the one SQL derivation', () => {
    expect(TOOL).toMatch(/rpc\('get_website_opportunities'/);
  });

  it('does not rank or score in TypeScript', () => {
    // A second ranking drifts from the first, and then a tile and the agent disagree about what
    // to work on — which is the exact failure the single derivation exists to prevent.
    const fn = TOOL.slice(TOOL.indexOf('createSEOOpportunitiesTool'));
    const body = fn.slice(0, fn.indexOf('export const', 10));
    expect(body, 'the tool sorts the rows itself').not.toMatch(/\.sort\(/);
    expect(body, 'the tool computes its own score').not.toMatch(/score\s*[=+*]/);
  });
});

describe('what could not be evaluated travels with the answer', () => {
  it('the tool separates unavailable rows instead of dropping them', () => {
    expect(TOOL).toMatch(/status !== 'ok'/);
    expect(TOOL).toMatch(/unavailable/);
    // The MODEL is told too, so it cannot present a partial list as complete.
    expect(TOOL).toMatch(/not_evaluated/);
  });

  it('the card renders them', () => {
    // A list showing only the rows it happens to have is how a collector that never ran looks
    // identical to a clean site.
    expect(CARD).toMatch(/t === 'seo_opportunities_card'/);
    expect(CARD).toMatch(/data\.unavailable/);
    expect(CARD).toMatch(/unavailable\.length > 0/);
  });
});

describe('the agent can reach it', () => {
  it('is listed by an agent, not merely pushed', () => {
    const listed = (CHAT.match(/'seo_opportunities'(\s*[,\]])/g) || []).length;
    expect(listed, 'no agent lists seo_opportunities').toBeGreaterThan(0);
    expect(CHAT).toMatch(/tools\.push\(createSEOOpportunitiesTool\(/);
  });

  it('the description warns that counts are observed, not site-wide', () => {
    // The inspection queue is ordered never-inspected-first, so its sample is not a random draw.
    // A model that reads "51 pages not crawled" as a site total would scale it and be wrong.
    const d = TOOL.slice(TOOL.indexOf("name: 'seo_opportunities'"));
    expect(d.slice(0, 1200)).toMatch(/never extrapolated|OBSERVED/i);
  });
});
