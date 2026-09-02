/**
 * Every chunk a tool emits reaches the screen as something (#395).
 *
 * CLAUDE.md states the rule — "Every new tool's `onChunk` type MUST be registered in
 * `AGENT_RESULT_TITLES` in `AgentHub.tsx`, or the output is silently dropped" — and two guards
 * already cover parts of it: `toolkitCoverage` checks the `run:` quick-starts, and
 * `seoCardCoverage` checks that a `seo_*_card` has a branch in `SEOGenericCard`.
 *
 * What neither covers is the whole set. AgentHub routes a chunk one of three ways:
 *
 *   1. `seo_*_card`   → `SEOGenericCard`, content derived FROM the type (never blank)
 *   2. `catalog_*`    → a hand-written if/else chain that builds a sentence
 *   3. everything else → `AGENT_RESULT_TITLES[chunk.type]`
 *
 * A type matching none of the three is dropped in silence, and route 2 has its own version of
 * the same failure: `let line = ''` followed by `else if` arms, so a catalog chunk with no arm
 * renders an assistant bubble with NO CONTENT. The work happened; the screen says nothing.
 *
 * Both directions are checked, because the reverse — a title for a chunk nothing emits — is the
 * dead-branch shape `seoCardCoverage` was written to catch after 14 SEO types reached the chat as
 * `JSON.stringify(data)` while sitting in a map that looked complete.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const TOOLS = join(ROOT, 'supabase', 'functions', '_shared', 'tools');

const hub = readFileSync(join(ROOT, 'src/components/features/ai/AgentHub.tsx'), 'utf8').replace(/\r\n/g, '\n');

/** Every `type: 'x'` a tool hands to `onChunk` / `safeEmit` / `emit`. */
function emittedChunkTypes(): Set<string> {
  const out = new Set<string>();
  for (const file of readdirSync(TOOLS).filter((f) => f.endsWith('.ts'))) {
    const src = readFileSync(join(TOOLS, file), 'utf8');
    const re = /(?:onChunk\??\.?\(|safeEmit\(\s*onChunk\s*,\s*|emit\(\s*onChunk\s*,\s*)\{\s*type:\s*['"]([a-z0-9_.]+)['"]/g;
    for (const m of src.matchAll(re)) out.add(m[1]);
  }
  return out;
}

/** The keys of AGENT_RESULT_TITLES. */
function resultTitles(): Set<string> {
  const start = hub.indexOf('AGENT_RESULT_TITLES');
  const end = hub.indexOf('};', start);
  expect(start, 'AGENT_RESULT_TITLES not found — this guard is checking nothing').toBeGreaterThan(-1);
  return new Set([...hub.slice(start, end).matchAll(/^\s*'?([a-z0-9_.]+)'?\s*:/gm)].map((m) => m[1]));
}

/** The `catalog_*` arms of the hand-written chain. */
function catalogArms(): Set<string> {
  const start = hub.indexOf("chunk.type.startsWith('catalog_')");
  expect(start, 'the catalog_ router is gone — re-point this guard').toBeGreaterThan(-1);
  const body = hub.slice(start, start + 4000);
  return new Set([...body.matchAll(/event === '([a-z0-9_]+)'/g)].map((m) => m[1]));
}

describe('#395 — a tool chunk is never dropped in silence', () => {
  it('the scan finds a realistic number of chunk types', () => {
    // If the regex breaks, every assertion below iterates nothing and passes.
    const emitted = emittedChunkTypes();
    expect(emitted.size).toBeGreaterThan(150);
    expect(emitted).toContain('expense_recorded');
    expect(resultTitles().size).toBeGreaterThan(100);
  });

  it('every emitted chunk type is routed somewhere', () => {
    const titles = resultTitles();
    const arms = catalogArms();
    const unrouted = [...emittedChunkTypes()].filter((t) => {
      if (titles.has(t)) return false;
      if (t.startsWith('seo_') && t.endsWith('_card')) return false;      // → SEOGenericCard
      if (t.startsWith('catalog_')) return !arms.has(t.replace(/^catalog_/, ''));
      // A few are consumed by a dedicated branch keyed on the literal, not the titles map.
      return !hub.includes(`'${t}'`) && !hub.includes(`"${t}"`);
    }).sort();

    expect(unrouted,
      'These chunk types are emitted by a tool and AgentHub does not render them. The work runs, '
      + 'the user sees nothing — add an AGENT_RESULT_TITLES entry, or a branch:\n'
      + unrouted.join('\n'),
    ).toEqual([]);
  });

  it('every catalog_ chunk has an arm, and a missing one cannot render blank', () => {
    const arms = catalogArms();
    const catalogTypes = [...emittedChunkTypes()].filter((t) => t.startsWith('catalog_'));
    expect(catalogTypes.length).toBeGreaterThanOrEqual(8);
    for (const t of catalogTypes) {
      expect(arms, `${t} has no arm in the catalog_ chain`).toContain(t.replace(/^catalog_/, ''));
    }
    // The floor under that check: `line` starts empty and every arm is an `else if`.
    expect(hub, 'a catalog chunk with no arm renders an empty assistant bubble')
      .toContain('if (!line) line = `Catalog updated — ${event.replace(/_/g, \' \')}.`;');
  });

  it('no title exists for a chunk nothing emits', () => {
    // The dead-branch direction. `seoCardCoverage` exists because 14 SEO types sat in a map that
    // looked complete while reaching the chat as JSON.
    const anywhere = new Set<string>();
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        // `supabase/functions` carries a vendored `node_modules` per function — 20k+ files, and
        // none of them emit an agent chunk. Walking them turned this one case into 20 seconds.
        if (e.name === 'node_modules' || e.name === '.deno') continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.ts')) {
          for (const m of readFileSync(p, 'utf8').matchAll(/type:\s*['"]([a-z0-9_.]+)['"]/g)) anywhere.add(m[1]);
        }
      }
    };
    walk(join(ROOT, 'supabase', 'functions'));

    const dead = [...resultTitles()].filter((t) => !anywhere.has(t)).sort();
    expect(dead,
      'These have a result title and nothing emits them. Either the emitter was renamed and the '
      + 'title is now dead, or the tool was deleted:\n' + dead.join('\n'),
    ).toEqual([]);
  });
});

/**
 * The canvas has TWO registries and they have to agree.
 *
 * `getCanvasArtifact` decides which messages get a canvas TAB; `renderCanvasArtifact` decides
 * what is DRAWN for the active one, falling back to `renderDataCardBody`. The canvas only ever
 * renders a message that got a tab, so the two can disagree in both directions and neither
 * throws:
 *
 *   • a renderer with no tab is DEAD CODE. `KitchenCostResultCard` had a branch in
 *     `renderCanvasArtifact` from the day the canvas shipped and no entry in `getCanvasArtifact`,
 *     so the kitchen calculator was the one of three that could never open full-width. Reading
 *     `renderCanvasArtifact` alone, it looked handled.
 *
 *   • a tab with no renderer opens a BLANK PANE. `inputRequestData` got an artifact kind, a tab
 *     and a chat-stream chip in #370 — and `ClarifyCard` had exactly one call site, inside the
 *     stream's `canvasShown ? chip : card` ternary. So with the canvas open (the default) every
 *     agent follow-up question showed a chip saying "Needs your input", opened an empty canvas,
 *     and could not be answered. The fallback returns null for a field it does not know, which
 *     renders as nothing rather than as an error.
 *
 * Both directions, because each looks like coverage from the other side.
 */
describe('the canvas tab registry and the canvas renderer agree', () => {
  // A field that HEADS its own branch — `if (message.x)`. A field mentioned INSIDE another
  // branch is a companion, not an artifact: `searchSpec` rides along with the products it
  // explains, and demanding a tab for it would be a finding nobody can act on.
  const FIELD = /if \((?:message|m)\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
  const INTERESTING = /Data$|^generation_job$|^searchSpec$/;

  /** The body of one `const <name> = ` in AgentHub, up to the next top-level const. */
  function fnBody(name: string): string {
    const at = hub.indexOf('const ' + name + ' = ');
    expect(at, 'AgentHub has no ' + name + ' — this guard is reading the wrong shape').toBeGreaterThan(-1);
    const rest = hub.slice(at + 10);
    const next = rest.search(new RegExp(String.fromCharCode(10) + '  const [a-zA-Z]'));
    return rest.slice(0, next === -1 ? rest.length : next);
  }

  function fieldsIn(name: string): Set<string> {
    const out = new Set<string>();
    for (const m of fnBody(name).matchAll(FIELD)) if (INTERESTING.test(m[1])) out.add(m[1]);
    return out;
  }

  const tabbed = fieldsIn('getCanvasArtifact');
  const drawn = fieldsIn('renderCanvasArtifact');
  const fallback = fieldsIn('renderDataCardBody');

  it('reads both registries', () => {
    expect(tabbed.size, 'parsed no fields from getCanvasArtifact').toBeGreaterThan(15);
    expect(drawn.size, 'parsed no fields from renderCanvasArtifact').toBeGreaterThan(10);
    expect(fallback.size, 'parsed no fields from renderDataCardBody').toBeGreaterThan(5);
  });

  it('every canvas renderer is reachable — it has a tab', () => {
    const dead = [...drawn].filter((f) => !tabbed.has(f)).sort();
    expect(
      dead,
      'These have a branch in renderCanvasArtifact and no entry in getCanvasArtifact, so the '
      + 'canvas can never reach them — the branch reads as coverage and has never run. Add the '
      + 'artifact, or delete the branch: ' + dead.join(', '),
    ).toEqual([]);
  });

  it('every canvas tab draws something — it is not a blank pane', () => {
    const blank = [...tabbed].filter((f) => !drawn.has(f) && !fallback.has(f)).sort();
    expect(
      blank,
      'These get a canvas tab and neither renderCanvasArtifact nor its renderDataCardBody '
      + 'fallback draws them, so clicking the tab opens an empty canvas: ' + blank.join(', '),
    ).toEqual([]);
  });
});
