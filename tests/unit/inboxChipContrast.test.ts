/**
 * The Inbox's coloured vocabulary — source tags, label chips, avatar tints — must be legible in
 * ALL FOUR themes, not the one it was written against.
 *
 * What happened: every one of those palettes was authored as a single set of raw Tailwind
 * classes, picked while looking at the dark theme — `bg-amber-500/15 text-amber-300`. The
 * platform has four themes (dark/light × green/blue). A `-300` shade is pale BY DESIGN: it is
 * chosen to sit on plum-black. Composited over the light themes' cream and white cards, the tag
 * that says "Email" measured **1.23:1** — the user reported it as "not readable at all", and
 * 1.23:1 is the arithmetic of that sentence.
 *
 * Nothing could catch it:
 *
 *   • `npm run typecheck` sees a valid `string`.
 *   • The design-system guard next door catches classes that produce NO CSS (an off-scale
 *     opacity step). These produce CSS perfectly well. They are simply the wrong colour.
 *   • Nothing renders these files in a light theme, and the person who adds a source is not
 *     usually the person browsing in light mode.
 *
 * So this measures the thing that actually matters rather than a proxy for it: it reads the
 * real card colour out of each of the four theme blocks in `src/index.css`, composites the
 * chip's own tint over it at the alpha the class declares, and computes the WCAG contrast
 * ratio against the text colour — with both the palette and the theme tokens taken from source,
 * so there is no second copy of either to drift.
 *
 * A shade-band rule was the first version of this test and it was not enough: it passed
 * `text-amber-700`, which measures 4.43:1 on cream — plausible-looking, and under AA. Only the
 * measurement found that.
 *
 * Scope is the palettes registered in PALETTES below. Three are the Inbox ones a new source,
 * label colour or avatar tint gets copy-pasted from, which is how one dark-only shade becomes
 * eight. The fourth is the agent's reasoning trace, added when the same defect surfaced there
 * on 2026-08-25. Point this at a new palette rather than eyeballing one.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import colors from 'tailwindcss/colors';

const ROOT = process.cwd();
const CSS = readFileSync(join(ROOT, 'src/index.css'), 'utf8');

/**
 * WCAG AA for normal text. Every one of these chips is 10–11px, so the 3:1 large-text
 * allowance does not apply to any of them.
 */
const AA = 4.5;

// ── colour maths ────────────────────────────────────────────────────────────
type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}

/** `266 22% 8%` — the shape every token in index.css is stored in. */
function hslTripletToRgb(triplet: string): RGB {
  const [hs, ss, ls] = triplet.trim().split(/\s+/);
  const h = parseFloat(hs) / 360, s = parseFloat(ss) / 100, l = parseFloat(ls) / 100;
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

const composite = (fg: RGB, bg: RGB, a: number): RGB =>
  [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)) as RGB;

function luminance([r, g, b]: RGB): number {
  const f = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a: RGB, b: RGB): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ── the four themes, read from the stylesheet that defines them ─────────────
function themeBlock(selector: string): string {
  const i = CSS.indexOf(selector);
  expect(i, `src/index.css no longer contains "${selector}"`).toBeGreaterThan(-1);
  const open = CSS.indexOf('{', i);
  let depth = 0;
  for (let k = open; k < CSS.length; k++) {
    if (CSS[k] === '{') depth++;
    else if (CSS[k] === '}' && --depth === 0) return CSS.slice(open, k);
  }
  return '';
}

/** The accent blocks only override what differs, so they are layered onto their base mode. */
function cardColour(...selectors: string[]): RGB {
  let triplet: string | null = null;
  for (const sel of selectors) {
    const m = /--card:\s*([^;]+);/.exec(themeBlock(sel));
    if (m) triplet = m[1];
  }
  expect(triplet, `no --card resolved for ${selectors.join(' → ')}`).toBeTruthy();
  return hslTripletToRgb(triplet!);
}

interface Theme { name: string; dark: boolean; card: RGB }
const THEMES: Theme[] = [
  { name: 'dark · green (default)', dark: true, card: cardColour(':root {') },
  { name: 'light · green', dark: false, card: cardColour('html.light {') },
  { name: 'dark · blue', dark: true, card: cardColour(':root {', "html.dark[data-accent='blue'] {") },
  { name: 'light · blue', dark: false, card: cardColour('html.light {', "html.light[data-accent='blue'] {") },
];

// ── the palettes under guard ────────────────────────────────────────────────
function block(file: string, startMarker: string, terminator: string): string {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const i = src.indexOf(startMarker);
  expect(i, `${file} no longer contains "${startMarker}" — this guard is pointed at nothing`).toBeGreaterThan(-1);
  const j = src.indexOf(terminator, i);
  expect(j, `${file}: no "${terminator}" after "${startMarker}"`).toBeGreaterThan(i);
  return src.slice(i, j);
}

function classStrings(slice: string): string[] {
  return [...slice.matchAll(/'([^'\n]*)'/g)]
    .map((m) => m[1])
    .filter((v) => /\b(?:bg|text|border)-[a-z]+-\d{2,3}\b/.test(v));
}

/**
 * Every class string in a whole FILE, not just a named palette const. Most of a module's colour
 * is not in a `const TONES = {...}` map — it is inline on the element, in a `className="..."` or
 * inside a template literal's ternary, and those are exactly the ones written while looking at
 * one theme. Single quotes, double quotes and template chunks all count; a chunk with no palette
 * shade in it is dropped by the same filter `classStrings` uses.
 */
function fileClassStrings(...files: string[]): string[] {
  const out: string[] = [];
  for (const file of files) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    expect(src.length, `${file} is empty — this guard is pointed at nothing`).toBeGreaterThan(0);
    for (const m of src.matchAll(/'([^'\n]*)'|"([^"\n]*)"|`([^`]*)`/g)) {
      const raw = m[1] ?? m[2] ?? m[3] ?? '';
      // A template literal's ${...} holes split the run; the fragments either side are separate
      // class strings, and joining them would invent a pairing that never renders together.
      for (const chunk of raw.split(/\$\{[^}]*\}/)) {
        if (/\b(?:bg|text|border)-[a-z]+-\d{2,3}\b/.test(chunk)) out.push(chunk);
      }
    }
  }
  return out;
}

interface Util { util: string; color: string; shade: string; alpha: number | null; dark: boolean; raw: string }

function utilities(cls: string): Util[] {
  const out: Util[] = [];
  for (const token of cls.split(/\s+/).filter(Boolean)) {
    const m = /^(dark:)?(bg|text|border)-([a-z]+)-(\d{2,3})(?:\/(\d{1,3}))?$/.exec(token);
    if (!m) continue;
    // `text-primary-…`-shaped tokens are theme TOKENS, not ramp colours. Whole-file scanning
    // meets them; they carry their own light/dark values in index.css and are not ours.
    if (!(colors as unknown as Record<string, unknown>)[m[3]]) continue;
    out.push({
      dark: !!m[1], util: m[2], color: m[3], shade: m[4],
      alpha: m[5] ? Number(m[5]) / 100 : null, raw: token,
    });
  }
  return out;
}

function paletteHex(color: string, shade: string): string | null {
  const ramp = (colors as unknown as Record<string, Record<string, string>>)[color];
  const hex = ramp?.[shade];
  return typeof hex === 'string' && hex.startsWith('#') ? hex : null;
}

const PALETTES: Array<{ what: string; strings: string[] }> = [
  {
    what: 'source tags (src/pages/Inbox/inboxSource.ts → SOURCE_META)',
    strings: classStrings(block('src/pages/Inbox/inboxSource.ts', 'const SOURCE_META', '\n};')),
  },
  {
    what: 'label chips (src/services/inboxApi.ts → LABEL_COLORS)',
    strings: classStrings(block('src/services/inboxApi.ts', 'export const LABEL_COLORS', '\n];')),
  },
  {
    what: 'avatar tints (src/pages/Inbox/InboxPage.tsx → avatarTint)',
    strings: classStrings(block('src/pages/Inbox/InboxPage.tsx', 'function avatarTint', '\n}')),
  },
  {
    // Not an Inbox chip, but the same defect wearing the same hat: one set of `-600`/`-400`
    // classes per step kind, picked against plum-black. On cream the italic thinking line
    // measured 2.63:1 and the user reported it as an orange smudge. The trace sits on
    // `bg-primary/5` over the PAGE rather than on a card — a slightly darker ground than the
    // one measured below, so card is the lenient reading and clearing it is the floor.
    what: 'agent reasoning trace (src/components/features/ai/AgentHub.tsx → REASONING_STEP_TONE)',
    strings: classStrings(
      block('src/components/features/ai/AgentHub.tsx', 'const REASONING_STEP_TONE', '\n};'),
    ),
  },
  {
    // The platform-wide tone helper, and the last place this defect could hide: every module
    // imports it, so nobody owns it. `emerald-600` measured 3.57:1 on cream, `amber-600` 3.02:1,
    // `red-500` 3.57:1 — one file, every table in the app.
    what: 'status tone helper (src/utils/statusTone.ts)',
    strings: fileClassStrings('src/utils/statusTone.ts'),
  },
  {
    // Projects was authored dark-only end to end — 44 sites across 16 files, from the status
    // badge on a list card to the overdue-deadline countdown to the timeline event icons.
    // Scanned whole-file rather than per-const, because almost none of it lives in a const.
    what: 'the Projects module (src/modules/projects)',
    strings: fileClassStrings(
      'src/modules/projects/pages/ProjectsListPage.tsx',
      'src/modules/projects/pages/ProjectDetailPage.tsx',
      'src/modules/projects/pages/InviteLandingPage.tsx',
      'src/modules/projects/components/JobCostCard.tsx',
      'src/modules/projects/components/ProjectExpensesCard.tsx',
      'src/modules/projects/components/tabs/ClientViewTab.tsx',
      'src/modules/projects/components/tabs/DocumentsTab.tsx',
      'src/modules/projects/components/tabs/FinanceTab.tsx',
      'src/modules/projects/components/tabs/OverviewTab.tsx',
      'src/modules/projects/components/tabs/ProductsTab.tsx',
      'src/modules/projects/components/tabs/RequestsTab.tsx',
      'src/modules/projects/components/tabs/RoomsTab.tsx',
      'src/modules/projects/components/tabs/ScheduleTab.tsx',
      'src/modules/projects/components/tabs/SiteTab.tsx',
      'src/modules/projects/components/tabs/TasksTab.tsx',
      'src/modules/projects/components/tabs/TimelineTab.tsx',
    ),
  },
  {
    // Real Estate had the same shape one step down the ramp — `-500` rather than `-300`, which
    // looks less obviously wrong in source and measures 2.04:1 for amber on cream. 31 sites: the
    // dashboard KPI row, the offer badges, the sale commission figure, the AML verdict.
    what: 'the Real Estate module (src/modules/real-estate)',
    strings: fileClassStrings(
      'src/modules/real-estate/components/CalendarConnectCard.tsx',
      'src/modules/real-estate/components/CmaReportDialog.tsx',
      'src/modules/real-estate/components/CommissionSplitsCard.tsx',
      'src/modules/real-estate/components/ImportListingsDialog.tsx',
      'src/modules/real-estate/components/KycPanel.tsx',
      'src/modules/real-estate/components/LeadRoutingCard.tsx',
      'src/modules/real-estate/components/ListingPerformancePanel.tsx',
      'src/modules/real-estate/components/PropertyBuyerPanel.tsx',
      'src/modules/real-estate/components/PropertyCardGrid.tsx',
      'src/modules/real-estate/components/PropertyCommercialCard.tsx',
      'src/modules/real-estate/components/PropertyDiscoveryTab.tsx',
      'src/modules/real-estate/components/PropertyFormDialog.tsx',
      'src/modules/real-estate/components/ShortLetTab.tsx',
      'src/modules/real-estate/components/ValuationWidget.tsx',
      'src/modules/real-estate/index.ts',
      'src/modules/real-estate/pages/PropertyWorkbench.tsx',
      'src/modules/real-estate/pages/RealEstatePage.tsx',
      'src/modules/real-estate/realEstateVocabulary.ts',
      'src/modules/real-estate/services/realEstateService.ts',
    ),
  },
];

describe('inbox chips are legible in all four themes', () => {
  it('finds the palettes, the themes and the Tailwind ramp at all', () => {
    // A guard whose regex quietly matches nothing passes forever. Pin every floor.
    for (const { what, strings } of PALETTES) {
      expect(strings.length, `no class strings found for ${what} — the guard has lost its target`)
        .toBeGreaterThan(0);
    }
    expect(THEMES).toHaveLength(4);
    // The two light cards are near-white and the two dark ones near-black; if that inverts,
    // the block parser has grabbed the wrong rule and every ratio below is measured on sand.
    for (const t of THEMES) {
      const l = luminance(t.card);
      expect(t.dark ? l < 0.1 : l > 0.7, `${t.name}: --card resolved to an implausible ${l.toFixed(3)}`).toBe(true);
    }
    expect(paletteHex('amber', '800'), 'tailwindcss/colors is not exposing the ramp').toBe('#92400e');
  });

  it('every colour is a light/dark PAIR — never one set of classes for four themes', () => {
    const offenders: string[] = [];
    for (const { what, strings } of PALETTES) {
      for (const cls of strings) {
        const seen = new Map<string, { light: Util[]; dark: Util[] }>();
        for (const u of utilities(cls)) {
          // Pairing is a TEXT rule. What a theme changes is the GROUND a colour is read
          // against, and a fill is not read against the ground — it either IS the ground
          // (`bg-emerald-700`, opaque) or it is a wash of the chip's own hue that composites the
          // same way over anything (`bg-amber-500/15`). Requiring `dark:bg-amber-500/15` beside
          // `bg-amber-500/15` would be duplication asserting nothing, and where a chip really
          // does drop its tint in one theme the ratio test below still measures its text against
          // the bare card, so nothing escapes by being skipped here.
          if (u.util !== 'text') continue;
          const k = `${u.util}-${u.color}`;
          const e = seen.get(k) ?? { light: [], dark: [] };
          (u.dark ? e.dark : e.light).push(u);
          seen.set(k, e);
        }
        for (const [k, { light, dark }] of seen) {
          if (light.length === 0) {
            offenders.push(`${what}: "${cls}" — ${k} is dark-only (${dark.map((d) => d.raw).join(' ')}); the light themes get no ${k} at all`);
          } else if (dark.length === 0) {
            offenders.push(`${what}: "${cls}" — ${k} has no dark: counterpart (${light.map((d) => d.raw).join(' ')}); it is the light shade in every theme`);
          }
        }
      }
    }
    expect(
      offenders,
      'A single set of raw palette classes cannot serve dark/light × green/blue. Write the pair ' +
        '(`text-amber-800 dark:text-amber-300`), the way src/utils/statusTone.ts does.\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });

  it(`every chip clears ${AA}:1 against the real card colour of all four themes`, () => {
    const offenders: string[] = [];
    for (const { what, strings } of PALETTES) {
      for (const cls of strings) {
        const utils = utilities(cls);
        for (const theme of THEMES) {
          const half = utils.filter((u) => u.dark === theme.dark);
          const text = half.find((u) => u.util === 'text');
          if (!text) continue; // the pairing test above already reports a missing half
          const fgHex = paletteHex(text.color, text.shade);
          if (!fgHex) { offenders.push(`${what}: "${text.raw}" is not in the Tailwind ramp`); continue; }

          // The chip's own tint, where it has one. A plain coloured word (SourceWord in the
          // list row, avatar initials) has none and sits directly on the card — which is the
          // stricter of the two, since the tint pulls the ground toward the text.
          const tint = half.find((u) => u.util === 'bg');
          const tintHex = tint ? paletteHex(tint.color, tint.shade) : null;
          const grounds: Array<[string, RGB]> = [['card', theme.card]];
          if (tintHex && tint?.alpha != null) {
            grounds.push([`${tint.raw} over card`, composite(hexToRgb(tintHex), theme.card, tint.alpha)]);
          }

          for (const [where, ground] of grounds) {
            const r = contrast(hexToRgb(fgHex), ground);
            if (r < AA) {
              offenders.push(
                `${what}: ${theme.name} — ${text.raw} (${fgHex}) on ${where} measures ` +
                  `${r.toFixed(2)}:1, under ${AA}:1`,
              );
            }
          }
        }
      }
    }
    expect(
      offenders,
      'These chips are 10–11px, so WCAG AA is 4.5:1 with no large-text allowance. Reach one step ' +
        'further along the ramp on the failing side — amber and green need -800 on cream where ' +
        'most colours clear at -700.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('every source key carries a tag, a plain word and a dot', () => {
    // The three forms are not interchangeable: the list row uses the WORD (a tag per row gives
    // every row the weight of a button), the header uses the TAG, the nav uses the DOT. A source
    // missing one renders as unstyled text in whichever surface reaches for it.
    const src = readFileSync(join(ROOT, 'src/pages/Inbox/inboxSource.ts'), 'utf8');
    const meta = block('src/pages/Inbox/inboxSource.ts', 'const SOURCE_META', '\n};');
    const union = /export type InboxSourceKey =([\s\S]*?);/.exec(src)?.[1] ?? '';
    const keys = [...union.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(keys.length, 'no source keys parsed — the guard has lost its target').toBeGreaterThan(1);

    const missing: string[] = [];
    for (const key of keys) {
      const at = meta.indexOf(`${key}: {`);
      if (at === -1) { missing.push(`${key}: absent from SOURCE_META`); continue; }
      const entry = meta.slice(at, meta.indexOf('\n  },', at));
      for (const form of ['tag:', 'text:', 'dot:']) {
        if (!entry.includes(form)) missing.push(`${key}: no ${form.replace(':', '')}`);
      }
    }
    expect(missing, `sources with an incomplete tone:\n${missing.join('\n')}`).toEqual([]);
  });
});
