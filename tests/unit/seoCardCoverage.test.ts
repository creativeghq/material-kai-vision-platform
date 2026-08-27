/**
 * SEO toolkit card coverage guard.
 *
 * THE DEFECT THIS EXISTS TO CATCH, measured on 2026-08-27: the SEO tools emitted
 * 51 distinct `seo_*_card` chunk types and only 37 had a renderer. The other 14
 * arrived in the user's chat as `JSON.stringify(data)` — among them AI Overview,
 * Search Console striking-distance, keyword ideas, search volume and on-page
 * issues, i.e. most of what the toolkit is FOR.
 *
 * What made it invisible is worth stating, because it is the reason a human
 * reviewer kept missing it. All 14 were dutifully listed in `AGENT_RESULT_TITLES`
 * in AgentHub.tsx, which reads exactly like coverage. It is not. AgentHub routes
 * every chunk whose type starts with `seo_` and ends with `_card` to
 * `SEOGenericCard` BEFORE that titles map is ever consulted, so an entry there
 * has no effect whatsoever on whether the card renders. Two registries, one of
 * them decorative — and the decorative one was the complete-looking one.
 *
 * So this test deliberately ignores `AGENT_RESULT_TITLES` and checks the only
 * thing that actually decides what a user sees: does `SEOGenericCard` have a
 * branch for every type the edge tools emit.
 *
 * Source-based by necessity — these are Deno edge modules that this Vitest
 * process cannot import.
 */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');
const TOOLS_DIR = join(REPO, 'supabase', 'functions', '_shared', 'tools');
const CARD_FILE = join(REPO, 'src', 'components', 'features', 'ai', 'SEOGenericCard.tsx');
const AGENT_HUB = join(REPO, 'src', 'components', 'features', 'ai', 'AgentHub.tsx');

/**
 * Types with a dedicated component of their own, routed BEFORE the generic card.
 * Anything added here must have a real renderer somewhere — this list is an
 * "it renders elsewhere" note, never a "we decided not to render it" exemption.
 */
const RENDERED_ELSEWHERE = new Set<string>([
  // AgentHub routes this one to <SEOResearchCard> explicitly.
  'seo_research_card',
]);

function readToolSources(): string {
  return readdirSync(TOOLS_DIR)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => readFileSync(join(TOOLS_DIR, f), 'utf8'))
    .join('\n');
}

function emittedCardTypes(): string[] {
  const src = readToolSources();
  const found = new Set<string>();
  for (const m of src.matchAll(/type:\s*'(seo_[a-z0-9_]*_card)'/g)) found.add(m[1]);
  return [...found].sort();
}

function renderedCardTypes(): string[] {
  const src = readFileSync(CARD_FILE, 'utf8');
  const found = new Set<string>();
  // Both the single-type branches and the `a || b || c` grouped ones.
  for (const m of src.matchAll(/t === '(seo_[a-z0-9_]*)'/g)) found.add(m[1]);
  return [...found].sort();
}

describe('SEO toolkit card coverage', () => {
  it('finds the card types the edge tools emit', () => {
    // A zero here would make every assertion below vacuously pass — the classic
    // way a coverage guard reports a clean bill of health while scanning nothing.
    expect(emittedCardTypes().length).toBeGreaterThan(30);
  });

  it('renders every seo_*_card chunk the tools emit', () => {
    const emitted = emittedCardTypes();
    const rendered = new Set(renderedCardTypes());
    const missing = emitted.filter((t) => !rendered.has(t) && !RENDERED_ELSEWHERE.has(t));

    expect(
      missing,
      `These SEO card types are emitted by a tool but have no branch in SEOGenericCard.tsx, so the user ` +
        `gets a raw JSON dump in chat:\n  ${missing.join('\n  ')}\n\n` +
        `Adding the type to AGENT_RESULT_TITLES does NOT fix this — AgentHub routes every seo_*_card to ` +
        `SEOGenericCard before that map is read. Add a branch to SEOGenericCard.tsx.`,
    ).toEqual([]);
  });

  it('keeps the generic seo_*_card route in AgentHub, which is what makes the branch the only thing that matters', () => {
    const hub = readFileSync(AGENT_HUB, 'utf8');
    // If this route is ever removed or narrowed, the reasoning above stops holding
    // and this test's premise needs revisiting rather than silently passing.
    expect(hub).toMatch(/chunk\.type\.startsWith\('seo_'\)\s*&&\s*chunk\.type\.endsWith\('_card'\)/);
  });

  it('has no renderer branch for a card type nothing emits', () => {
    // Dead branches are how a file grows a renderer for a tool that was deleted.
    const emitted = new Set(emittedCardTypes());
    const orphans = renderedCardTypes().filter((t) => !emitted.has(t));
    expect(
      orphans,
      `SEOGenericCard renders these types but no tool emits them any more — delete the dead branches:\n  ${orphans.join('\n  ')}`,
    ).toEqual([]);
  });
});
