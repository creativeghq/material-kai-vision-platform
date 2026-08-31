/**
 * Guards the design system against the four ways it can be undone WITHOUT anything failing.
 *
 * A visual regression is not a type error and not a test failure; it ships, and it is noticed
 * weeks later by somebody who assumes it was always like that. So this file does not try to
 * police taste. It pins only the things that (a) silently revert a deliberate decision, or
 * (b) compile to nothing at all — which is worse, because the class LOOKS right in the source.
 *
 * The four:
 *
 *   1. An off-scale opacity modifier (`bg-white/8`, `border-white/12`). Tailwind only generates
 *      opacity variants for steps in `theme.opacity` (0,5,10,…,100). Anything else produces NO
 *      CSS RULE. The platform had 74 of them: 31 `border-white/8` borders that have never once
 *      been drawn in dark mode, plus 25 `divide-white/8` row separators in the same state. They
 *      read as intentional in every code review and were invisible in the product.
 *
 *   2. A theme block that forgets a surface token. `hsl(var(--hairline))` with `--hairline`
 *      undefined is an INVALID color, so the declaration is dropped and the border vanishes —
 *      in that theme only. Nothing errors, and whoever added the theme is unlikely to be the
 *      person who notices.
 *
 *   3. Reintroducing the global font-weight override. `.font-bold { font-weight: 300 !important }`
 *      and friends flattened every weight utility in the app to one value, so hierarchy was
 *      impossible to express and every attempt to fix a specific component silently failed.
 *
 *   4. Rolling a primitive back to the marketing language — pill buttons, filled-pill tabs, a
 *      glass card. These are one-line edits with app-wide consequences.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { blankComments, stripComments } from '../helpers/stripComments';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const CSS = join(SRC, 'index.css');
const UI = join(SRC, 'components', 'core', 'ui');

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx') || p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const rel = (p: string) => relative(ROOT, p).split('\\').join('/');

/** Tailwind 3.4's default `theme.opacity` keys. Anything else needs `/[0.08]` syntax. */
const OPACITY_SCALE = new Set(
  [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100].map(String),
);

/**
 * Matches `<utility>-<color>/<n>`, requiring the segment immediately before the slash to START
 * WITH A LETTER. That is what keeps Tailwind's fraction utilities out of the results:
 * `slide-out-to-left-1/2` ends in `1`, so it is not a colour-with-opacity.
 */
const OPACITY_RE =
  /\b(?:bg|text|border|ring|fill|stroke|outline|divide|placeholder|decoration|accent|caret|from|via|to)-(?:[a-zA-Z][a-zA-Z0-9]*-)*[a-zA-Z][a-zA-Z0-9]*\/(\d{1,3})\b/g;

describe('design system — opacity modifiers that compile to nothing', () => {
  it('every colour/opacity utility in src/ uses a step Tailwind actually generates', () => {
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      // blankComments, not stripComments: the reported line number has to point at the real
      // line in the file, and a prose mention of `border-white/12` in a doc comment explaining
      // why it was removed must not convict the file that removed it.
      const src = blankComments(readFileSync(f, 'utf8'));
      for (const m of src.matchAll(OPACITY_RE)) {
        if (OPACITY_SCALE.has(m[1])) continue;
        const line = src.slice(0, m.index).split('\n').length;
        offenders.push(`${rel(f)}:${line}  ${m[0]}`);
      }
    }
    expect(
      offenders,
      'These utilities produce NO CSS. Tailwind only emits an opacity variant for a step in ' +
        'theme.opacity (0,5,10,...,100); anything else is dropped silently, so the border/fill ' +
        'you wrote has never rendered. Use a design token (border-hairline, bg-surface-hover, ' +
        'bg-surface-sunken) or arbitrary-value syntax (bg-primary/[0.08]).\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });
});

describe('design system — every theme defines every surface token', () => {
  const css = readFileSync(CSS, 'utf8');

  /** Extracts the declaration body of a top-level rule whose selector text matches. */
  function block(selectorIncludes: string): string {
    const idx = css.indexOf(selectorIncludes);
    expect(idx, `theme block "${selectorIncludes}" is missing from src/index.css`).toBeGreaterThan(
      -1,
    );
    const open = css.indexOf('{', idx);
    let depth = 0;
    for (let i = open; i < css.length; i++) {
      if (css[i] === '{') depth++;
      else if (css[i] === '}') {
        depth--;
        if (depth === 0) return css.slice(open, i);
      }
    }
    return '';
  }

  // The base blocks must define the whole surface vocabulary. The accent blocks only override
  // what differs from their mode, so they are checked separately and more narrowly.
  const BASE_BLOCKS = [':root {', 'html.light {'];
  const SURFACE_TOKENS = [
    '--hairline',
    '--surface-hover',
    '--surface-sunken',
    '--card',
    '--background',
    '--primary',
    '--glass-background',
    '--shadow-overlay',
  ];

  for (const sel of BASE_BLOCKS) {
    it(`${sel.trim()} defines the full surface vocabulary`, () => {
      const body = block(sel);
      const missing = SURFACE_TOKENS.filter((t) => !body.includes(`${t}:`));
      expect(
        missing,
        `${sel} is missing ${missing.join(', ')}. A token referenced as hsl(var(--x)) with --x ` +
          'undefined is an invalid colour: the declaration is dropped and the border/fill ' +
          'disappears in that theme only, with nothing raised anywhere.',
      ).toEqual([]);
    });
  }

  // An accent block that restyles the neutral surfaces (it overrides --card and --border) must
  // also carry --hairline, or every rule in the app keeps the OTHER accent's edge colour.
  for (const sel of ["html.light[data-accent='blue'] {", "html.dark[data-accent='blue'] {"]) {
    it(`${sel.trim()} retints the hairline along with the surfaces`, () => {
      const body = block(sel);
      expect(
        body.includes('--hairline:'),
        `${sel} overrides the neutral surfaces but not --hairline, so every border in the app ` +
          'keeps the base accent\'s edge colour on a differently-tinted surface.',
      ).toBe(true);
    });
  }
});

describe('design system — the global font-weight override stays deleted', () => {
  const css = readFileSync(CSS, 'utf8');

  it('no weight utility is redefined globally', () => {
    // `.font-bold { font-weight: … }` etc. — in any order, with or without !important.
    const re =
      /\.font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\s*\{[^}]*font-weight[^}]*\}/g;
    const hits = [...css.matchAll(re)].map((m) => m[0].replace(/\s+/g, ' ').slice(0, 90));
    expect(
      hits,
      'A global weight override is back. It flattens every weight utility across the whole app ' +
        '(a table header, a total and its caption all render identically) and it cannot be ' +
        'worked around per component, because it carried !important. Change the component ' +
        'instead.\n' + hits.join('\n'),
    ).toEqual([]);
  });
});

describe('design system — primitives keep their product-UI shape', () => {
  // Comments stripped: several of these files DOCUMENT the pattern they no longer use,
  // and a guard that convicts a file for explaining itself teaches people to stop explaining.
  const read = (f: string) => stripComments(readFileSync(join(UI, f), 'utf8'));

  it('buttons are rectangular and do not move on hover', () => {
    const src = read('button.tsx');
    expect(src, 'a pill button is the same silhouette as a status chip and an active tab').not.toMatch(
      /rounded-full/,
    );
    expect(
      src,
      'hover:-translate-y moves the target out from under the pointer and shoves the whole row',
    ).not.toMatch(/hover:-?translate-y/);
  });

  it('the active tab is an underline, not a filled pill', () => {
    const src = read('tabs.tsx');
    expect(
      src,
      'data-[state=active]:bg-primary paints the active tab as a solid accent block — which is ' +
        'exactly what a primary button looks like. The underline treatment lives in index.css ' +
        'on [role="tab"].',
    ).not.toMatch(/data-\[state=active\]:bg-primary/);
  });

  it('the card is an opaque panel, not glass', () => {
    const src = read('card.tsx');
    expect(src, 'backdrop blur on a panel: no fixed contrast ratio, and a compositor pass per panel')
      .not.toMatch(/backdropFilter|backdrop-blur/);
    expect(src, 'a resting panel is separated by a hairline, not by a shadow').not.toMatch(
      /shadow-(?:md|lg|xl|2xl)/,
    );
  });

  it('the checkbox distinguishes indeterminate from checked', () => {
    const src = read('checkbox.tsx');
    expect(
      src.includes("props.checked === 'indeterminate'"),
      'Radix renders Indicator for both checked and indeterminate. Without a separate glyph, ' +
        '"some rows selected" is drawn identically to "all rows selected" — which is the whole ' +
        'question immediately before a bulk delete.',
    ).toBe(true);
  });
});

describe('design system — the app canvas stays flat', () => {
  it('Layout renders no aurora or grain layer', () => {
    const layout = stripComments(
      readFileSync(join(SRC, 'components', 'core', 'Layout.tsx'), 'utf8'),
    );
    expect(
      /<div className="app-(?:aurora|grain)"/.test(layout),
      'A gradient/texture canvas behind every page means an opaque panel can never match the ' +
        'ground and every chart loses contrast against a moving background.',
    ).toBe(false);
  });
});

/**
 * The generic agent result card is the ONLY renderer for all 127 result types in
 * AGENT_RESULT_TITLES — contracts, appointments, CRM deals, campaigns, stock, flows, assets. So
 * its shape handling is not a detail, it IS the Agent Hub's presentation layer.
 *
 * A list payload (`{ flows: [...] }`, `{ deals: [...] }`) used to render as one grey chip per row
 * with `Name: x  Status: y` runs inside it — readable at one row, a wall at twenty, and impossible
 * to scan down a column. "List my flows" then added a SECOND message, "Done! I've pulled up the
 * automations…", restating what the card had shown. Right data, wrong shape, said twice.
 */
describe('agent result card follows the table language', () => {
  const card = readFileSync(join(process.cwd(), 'src/components/features/ai/AgentResultCard.tsx'), 'utf8');

  it('renders a list of records as a table, not a stack of chips', () => {
    expect(/function RecordTable/.test(card), 'a tabular array needs a table renderer').toBe(true);
    expect(/tabularColumns\(/.test(card), 'columns must be derived from the rows').toBe(true);
  });

  it('uses the platform table treatment, not a bare <table>', () => {
    const t = card.slice(card.indexOf('function RecordTable'));
    // docs/design-system.md: sunken header, hairline separators, NO zebra, 11px semibold headers
    // that are not uppercase, right-aligned tabular-nums for numbers.
    expect(/bg-surface-sunken/.test(t), 'header row must sit on the sunken surface').toBe(true);
    expect(/border-hairline/.test(t), 'rows are separated by a hairline').toBe(true);
    expect(/text-\[11px\] font-semibold/.test(t), 'headers are 11px semibold').toBe(true);
    expect(/uppercase/.test(t), 'headers are never uppercase').toBe(false);
    expect(/odd:|even:|zebra/.test(t), 'no zebra striping').toBe(false);
    expect(/tabular-nums/.test(t), 'numeric columns use tabular-nums').toBe(true);
    expect(/overflow-x-auto/.test(t), 'a wide table scrolls in its own container').toBe(true);
  });

  it('renders status as a tinted Badge rather than raw text', () => {
    // The tint map moved to `@/utils/recordDisplay` so the peek dialog opened FROM this table
    // renders the same word the same colour; what matters here is still that a status is a Badge.
    expect(/statusBadgeVariant/.test(card) && /<Badge variant=/.test(card),
      'status/stage/severity render as a squared tinted tag, per the table spec').toBe(true);
  });

  it('does not repeat the card in prose', () => {
    const hub = readFileSync(join(process.cwd(), 'src/components/features/ai/AgentHub.tsx'), 'utf8');
    expect(/renderedResultCardRef/.test(hub),
      'when a card answered, the quick-start placeholder copy must not arrive as a second message').toBe(true);
    expect(/renderedResultCardRef\.current = false/.test(hub),
      'the flag is per TURN — a card last turn must not silence this turn').toBe(true);
  });
});
