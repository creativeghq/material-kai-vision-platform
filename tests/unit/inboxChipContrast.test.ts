/**
 * The Inbox's coloured vocabulary — source tags, label chips, avatar tints — must be legible in
 * ALL FOUR themes, not the one it was written against.
 *
 * What happened: every one of those palettes was authored as a single set of raw Tailwind
 * classes, picked while looking at the dark theme — `bg-amber-500/15 text-amber-300`. The
 * platform has four themes (dark/light × green/blue). A `-300` shade is pale BY DESIGN: it is
 * chosen to sit on plum-black. On the light themes' cream and near-white card it renders at
 * roughly 1.6:1, so the tag that says "Email" was, for months, an orange smudge — reported by
 * the user as "it is not readable that tag at all".
 *
 * Nothing could catch it:
 *
 *   • `npm run typecheck` sees a valid `string`.
 *   • The design-system guard next door catches classes that produce NO CSS (an off-scale
 *     opacity step). These produce CSS perfectly well. They are simply the wrong colour.
 *   • Nothing renders these files in a light theme, and the person who adds a source is not
 *     usually the person browsing in light mode.
 *
 * A wrong colour is a valid class, so the only thing that can see this is a rule about the
 * SHAPE of the declaration: in these palettes a colour is a PAIR, and both halves are
 * mandatory. `src/utils/statusTone.ts` had already settled that pattern platform-wide
 * (`text-emerald-600 dark:text-emerald-400`); this pins the Inbox to it.
 *
 * Scope is deliberately these three palettes. They are the ones a new source, label colour or
 * avatar tint gets copy-pasted from, which is how one dark-only shade becomes eight.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

/** Text on a light surface needs a deep shade; anything paler fails contrast on cream. */
const LIGHT_SAFE_TEXT = new Set(['600', '700', '800', '900']);
/** Text on a dark surface needs a pale shade; anything deeper disappears on plum-black. */
const DARK_SAFE_TEXT = new Set(['200', '300', '400']);

/** Slice a file between a start marker and the first terminator at column 0 depth. */
function block(file: string, startMarker: string, terminator: string): string {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const i = src.indexOf(startMarker);
  expect(i, `${file} no longer contains "${startMarker}" — this guard is pointed at nothing`).toBeGreaterThan(-1);
  const j = src.indexOf(terminator, i);
  expect(j, `${file}: no "${terminator}" after "${startMarker}"`).toBeGreaterThan(i);
  return src.slice(i, j);
}

/** Every single-quoted string literal in a slice — the class strings and nothing else. */
function classStrings(slice: string): string[] {
  return [...slice.matchAll(/'([^'\n]*)'/g)]
    .map((m) => m[1])
    .filter((v) => /\b(?:bg|text|border)-[a-z]+-\d{2,3}\b/.test(v));
}

/** `text-amber-700` → {util:'text', color:'amber', shade:'700', dark:false} */
interface Util { util: string; color: string; shade: string; dark: boolean; raw: string }

function utilities(cls: string): Util[] {
  const out: Util[] = [];
  for (const token of cls.split(/\s+/).filter(Boolean)) {
    const m = /^(dark:)?(bg|text|border)-([a-z]+)-(\d{2,3})(?:\/\d{1,3})?$/.exec(token);
    if (!m) continue;
    out.push({ dark: !!m[1], util: m[2], color: m[3], shade: m[4], raw: token });
  }
  return out;
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
];

describe('inbox chips are legible in all four themes', () => {
  it('finds the palettes at all', () => {
    // A guard whose regex quietly matches nothing passes forever. Pin the floor.
    for (const { what, strings } of PALETTES) {
      expect(strings.length, `no class strings found for ${what} — the guard has lost its target`)
        .toBeGreaterThan(0);
    }
  });

  it('every colour is a light/dark PAIR — never one set of classes for four themes', () => {
    const offenders: string[] = [];
    for (const { what, strings } of PALETTES) {
      for (const cls of strings) {
        const utils = utilities(cls);
        // Keyed by utility+colour so `text-amber-700` and `dark:text-amber-300` pair up.
        const seen = new Map<string, { light: Util[]; dark: Util[] }>();
        for (const u of utils) {
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
        '(`text-amber-700 dark:text-amber-300`), the way src/utils/statusTone.ts does.\n' +
        offenders.join('\n'),
    ).toEqual([]);
  });

  it('the text shade in each half is one that can actually be read on that ground', () => {
    const offenders: string[] = [];
    for (const { what, strings } of PALETTES) {
      for (const cls of strings) {
        for (const u of utilities(cls)) {
          if (u.util !== 'text') continue;
          const ok = u.dark ? DARK_SAFE_TEXT.has(u.shade) : LIGHT_SAFE_TEXT.has(u.shade);
          if (!ok) {
            offenders.push(
              `${what}: "${u.raw}" — ${u.dark ? 'dark' : 'light'} mode needs a shade in ` +
                `{${[...(u.dark ? DARK_SAFE_TEXT : LIGHT_SAFE_TEXT)].join(', ')}}, got ${u.shade}`,
            );
          }
        }
      }
    }
    expect(
      offenders,
      'Pairing alone is not enough — both halves have to be the right END of the ramp. A `-300` ' +
        'is pale (for dark grounds); a `-700` is deep (for light grounds). Swapping them is the ' +
        'same unreadable tag with twice as many classes.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('every source key carries a tag, a plain word and a dot', () => {
    // The three forms are not interchangeable: the list row uses the WORD (a tag per row gives
    // every row the weight of a button), the header uses the TAG, the nav uses the DOT. A source
    // missing one renders as unstyled text in whichever surface reaches for it.
    const src = readFileSync(join(ROOT, 'src/pages/Inbox/inboxSource.ts'), 'utf8');
    const meta = block('src/pages/Inbox/inboxSource.ts', 'const SOURCE_META', '\n};');
    const keys = [...src.matchAll(/^\s{2}\| '([a-z_]+)'$|^export type InboxSourceKey =\s*$/gm)]
      .map((m) => m[1])
      .filter(Boolean);
    const firstKey = /export type InboxSourceKey =\s*\|?\s*'([a-z_]+)'/.exec(src)?.[1];
    if (firstKey) keys.unshift(firstKey);
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
