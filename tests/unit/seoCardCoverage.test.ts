/** SEO toolkit card coverage guard. */

import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(__dirname, '..', '..');
const TOOLS_DIR = join(REPO, 'supabase', 'functions', '_shared', 'tools');
const CARD_FILE = join(REPO, 'src', 'components', 'features', 'ai', 'SEOGenericCard.tsx');
const AGENT_HUB = join(REPO, 'src', 'components', 'features', 'ai', 'AgentHub.tsx');

/**
 * Types with a component of their own. An "it renders elsewhere" note, never a
 * "we decided not to render it" exemption.
 */
const RENDERED_ELSEWHERE = new Set<string>(['seo_research_card']);

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
    expect(hub).toMatch(/type\.startsWith\('seo_'\)\s*&&\s*type\.endsWith\('_card'\)/);
    expect(hub).toMatch(/} else if \(isSeoToolkitCard\(chunk\.type\)\) \{/);
  });

  it('lets no seo_*_card be claimed by AGENT_RESULT_TITLES, which is read FIRST', () => {
    const hub = readFileSync(AGENT_HUB, 'utf8');
    const map = hub.slice(
      hub.indexOf('const AGENT_RESULT_TITLES'),
      hub.indexOf('};', hub.indexOf('const AGENT_RESULT_TITLES')),
    );
    expect(map.length).toBeGreaterThan(500);
    // A key here shadows SEOGenericCard's branch: the card arrives as a key/value dump.
    const claimed = [...map.matchAll(/^\s*(seo_[a-z0-9_]*_card):/gm)].map((m) => m[1]);
    expect(
      claimed,
      `These SEO card types are listed in AGENT_RESULT_TITLES, which AgentHub reads BEFORE the ` +
        `seo_*_card route. Each one renders as a raw JSON dump instead of its SEOGenericCard branch. ` +
        `Delete them — the canvas tab title comes from SEO_CARD_TITLES in SEOGenericCard.tsx:\n  ${claimed.join('\n  ')}`,
    ).toEqual([]);
    // Belt-and-braces, so a re-added key cannot shadow silently.
    expect(hub).toMatch(/AGENT_RESULT_TITLES\[chunk\.type\] && !isSeoToolkitCard\(chunk\.type\)/);
  });

  it('gives every emitted card type a canvas tab title', () => {
    const src = readFileSync(CARD_FILE, 'utf8');
    const titled = new Set([...src.matchAll(/^\s*(seo_[a-z0-9_]*_card): '/gm)].map((m) => m[1]));
    const missing = emittedCardTypes().filter((t) => !titled.has(t) && !RENDERED_ELSEWHERE.has(t));
    expect(
      missing,
      `Add these to SEO_CARD_TITLES in SEOGenericCard.tsx, or their canvas tab reads as a ` +
        `mechanical de-underscoring of the chunk type:\n  ${missing.join('\n  ')}`,
    ).toEqual([]);
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
