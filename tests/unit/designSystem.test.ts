/** Guards the design system against the four ways it can be undone WITHOUT anything failing. */
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

/**
 * THE DISPLAY FACE IS LATIN-ONLY, SO IT NEVER RENDERS A NAME.
 *
 * Aleo's cmap has zero Greek letters and CSS font matching is PER CHARACTER, so a mixed-script
 * name under `font-display` -- "KEROS HELLAS ΕΤΑΙΡΙΑ ΠΕΡΙΟΡΙΣΜΕΝΗΣ ΕΥΘΥΝΗΣ", the shape every
 * ΑΑΔΕ/ΓΕΜΗ registry name takes -- renders half slab-serif and half Averta inside one line.
 * Nothing raises: both faces load, the string is intact, the class is valid. So the brand serif
 * stays on IDENTITY surfaces (titles and copy this app authors) and comes off database strings.
 */
describe('design system — the latin-only display face never renders a record name', () => {
  /**
   * `font-display` opt-ins whose interpolated content is NOT a database name. Shrink-only, each
   * with its reason. Keyed on the rendered content rather than a line number so the entry
   * survives the file moving, and cannot be reused for a different heading in the same file.
   */
  const DISPLAY_FACE_OK = new Map<string, string>([
    ['src/components/Admin/AdminStatCard.tsx::{value}', 'a formatted numeral — latin digits'],
    ['src/components/features/dashboard/StatBlock.tsx::{value}', 'a formatted numeral — latin digits'],
    ['src/components/business/catalogs/PublicCatalogPage.tsx::{title}', 'section heading copy this app authors, not a record'],
    ['src/components/core/AppLauncher.tsx::{activeHubGroup.hub?.label ?? \'More\'}', 'the static hub vocabulary, defined in code'],
    ['src/components/shared/PageHeader.tsx::{title}', 'conditional — a caller passing a record name sets recordTitle, which swaps in font-sans'],
    ['src/modules/hr/components/PayrollSection.tsx::Payroll {run.period}', 'a period key (2026-09), latin by construction'],
    ['src/pages/Careers/PublicJobPage.tsx::{applied}', 'an authored confirmation sentence'],
    ['src/pages/ChangelogPage.tsx::{month.label}', 'a formatted month, authored in code'],
    ['src/pages/ChangelogPage.tsx::{entry.title}', 'the operator\'s own changelog copy on a marketing page'],
    [
      'src/components/features/dashboard/HeroSection.tsx::{heroConfig.title} <br /> <span className="text-primary">{heroConfig.subtitle}',
      'the dashboard hero — authored copy in dashboardData.ts, not a record',
    ],
    [
      'src/pages/HomePage.tsx::<span className="bg-clip-text text-transparent" style={{ backgroundImage: \'var(--brand-gradient)\' }}',
      'the marketing hero — authored copy, and the brand serif is the point of the surface',
    ],
  ]);

  /** The opening tag through to the first child text, for an element opting into font-display. */
  function displayFaceHeadings(src: string): { content: string; line: number }[] {
    const out: { content: string; line: number }[] = [];
    const lines = src.split('\n');
    lines.forEach((ln, i) => {
      if (!ln.includes('font-display')) return;
      const body = lines.slice(i, i + 4).join('\n');
      const afterTag = body.slice(body.indexOf('font-display'));
      const close = afterTag.indexOf('>');
      if (close < 0) return;
      const end = afterTag.indexOf('</');
      const content = afterTag.slice(close + 1, end >= 0 ? end : undefined).trim().replace(/\s+/g, ' ');
      if (content.includes('{')) out.push({ content, line: i + 1 });
    });
    return out;
  }

  it('no font-display heading renders an interpolated value that is not on the allowlist', () => {
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      // blankComments, not stripComments: a doc comment EXPLAINING this rule mentions
      // `font-display` beside an example, and must not convict the file that documents it.
      const src = blankComments(readFileSync(f, 'utf8'));
      for (const { content, line } of displayFaceHeadings(src)) {
        const key = `${rel(f)}::${content}`;
        if (DISPLAY_FACE_OK.has(key)) continue;
        offenders.push(`${rel(f)}:${line}  ${content.slice(0, 90)}`);
      }
    }
    expect(
      offenders,
      'Aleo cannot draw Greek, and CSS font matching is per character — so a Greek or ' +
        'mixed-script value here renders half slab-serif and half sans inside one line. Render ' +
        'the value in the UI face (drop the class, or `font-sans` on an h1/h2, which inherits ' +
        'the display face from index.css). If the string genuinely cannot be a record name, ' +
        'add it to DISPLAY_FACE_OK with the reason.',
    ).toEqual([]);
  });

  it('the allowlist is shrink-only — every entry still matches a real heading', () => {
    const live = new Set<string>();
    for (const f of walk(SRC)) {
      const src = blankComments(readFileSync(f, 'utf8'));
      for (const { content } of displayFaceHeadings(src)) live.add(`${rel(f)}::${content}`);
    }
    const stale = [...DISPLAY_FACE_OK.keys()].filter((k) => !live.has(k));
    expect(stale, 'these exemptions no longer match anything — delete them so the list only shrinks')
      .toEqual([]);
  });

  it('DialogTitle renders in the UI face — a modal title is where record names live', () => {
    const dialog = blankComments(readFileSync(join(UI, 'dialog.tsx'), 'utf8'));
    const title = dialog.slice(dialog.indexOf('const DialogTitle'));
    expect(
      /font-display/.test(title.slice(0, title.indexOf('DialogTitle.displayName'))),
      'The primitive styles ~118 modal titles that interpolate a value — supplier names, party ' +
        'names, product names. It is a chrome heading (the h3–h6 rule), so it is sans.',
    ).toBe(false);
  });

  it('no DialogTitle instance opts back into the display face', () => {
    const offenders: string[] = [];
    for (const f of walk(SRC)) {
      const src = blankComments(readFileSync(f, 'utf8'));
      for (const m of src.matchAll(/<DialogTitle\b[^>]*className="[^"]*font-display/g)) {
        offenders.push(`${rel(f)}:${src.slice(0, m.index).split('\n').length}`);
      }
    }
    expect(offenders, 'a modal title can always end up holding a Greek record name').toEqual([]);
  });

  it('--font-display keeps Averta between Aleo and the system serifs', () => {
    const css = readFileSync(CSS, 'utf8');
    const decl = css.match(/--font-display:\s*([^;]+);/);
    expect(decl, '--font-display must be declared').toBeTruthy();
    const families = decl![1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
    expect(families[0], 'Aleo is the brand display face').toBe('Aleo');
    expect(
      families[1],
      'Averta MUST sit second. Aleo has zero Greek glyphs and 24/128 latin-ext, so without it ' +
        'every Greek heading falls through to Georgia — a system serif that is not installed on ' +
        'Linux, so the same record renders differently per OS.',
    ).toBe('Averta');
  });
});
