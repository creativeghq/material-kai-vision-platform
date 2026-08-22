import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  RELATIONSHIPS, RELATIONSHIP_KEYS, VERIFICATION_KEYS, brandKey, categoriesCovered, emptyDraft,
  groupByCategory, isPubliclyVisible, relationshipDef, sortForDisplay, validateDraft,
  type Ambassadorship,
} from '../../src/lib/ambassadorships';
import { UPLOAD_CATEGORIES } from '../../src/lib/categoryFieldRegistry';

/**
 * Brand ambassadorships (Profile → Ambassador).
 *
 * Three things here can break without anything failing at build time, which is why they are
 * tested rather than trusted:
 *
 *  1. The relationship and verification vocabularies exist TWICE — as a TypeScript union and as
 *     a Postgres CHECK constraint. A value added on one side only is either an insert that
 *     always fails or a state the UI cannot name.
 *  2. A DECLINED claim must never reach a public profile. RLS hides it from visitors, but the
 *     profile OWNER can read their own declined rows, so the public component has to filter as
 *     well — and dropping that filter looks like a harmless simplification.
 *  3. Category keys and labels must come from the registry projection. The #368 defect was
 *     exactly this: a hand-written category map that disagreed with the database.
 */

const SRC = join(process.cwd(), 'src');

function row(over: Partial<Ambassadorship> = {}): Ambassadorship {
  return {
    id: over.id ?? 'id-1',
    user_id: 'u1',
    brand_name: 'Harmony',
    brand_source: 'catalog',
    brand_country: null,
    brand_url: null,
    category_keys: [],
    relationship: 'ambassador',
    headline: null,
    since_year: null,
    showcase_moodboard_id: null,
    is_featured: false,
    sort_order: 0,
    verification_status: 'self_declared',
    brand_user_id: null,
    verification_requested_at: null,
    verified_at: null,
    decision_note: null,
    created_at: '2026-08-22T00:00:00Z',
    updated_at: '2026-08-22T00:00:00Z',
    ...over,
  };
}

describe('ambassadorship vocabulary', () => {
  // These literals ARE the CHECK constraints, transcribed. Changing one side without the other
  // is the failure this pins: `profile_ambassadorships_relationship_check` and
  // `profile_ambassadorships_verification_status_check`.
  it('mirrors the relationship CHECK constraint exactly', () => {
    expect([...RELATIONSHIP_KEYS]).toEqual([
      'ambassador', 'authorized_dealer', 'certified_installer', 'specifier',
    ]);
  });

  it('mirrors the verification-status CHECK constraint exactly', () => {
    expect([...VERIFICATION_KEYS]).toEqual([
      'self_declared', 'pending', 'verified', 'declined',
    ]);
  });

  it('describes every relationship the DB accepts', () => {
    expect(RELATIONSHIPS.map((r) => r.key).sort()).toEqual([...RELATIONSHIP_KEYS].sort());
    for (const r of RELATIONSHIPS) {
      expect(r.label.length, `${r.key} needs a label`).toBeGreaterThan(0);
      expect(r.description.length, `${r.key} needs a description`).toBeGreaterThan(0);
      expect(r.publicPrefix.length, `${r.key} needs public phrasing`).toBeGreaterThan(0);
    }
  });

  it('falls back to a real relationship for an unknown value', () => {
    expect(relationshipDef('not_a_relationship').key).toBe('ambassador');
  });
});

describe('validateDraft', () => {
  const base = () => ({ ...emptyDraft(), brand_name: 'Harmony', category_keys: [UPLOAD_CATEGORIES[0]] });

  it('accepts a complete draft', () => {
    expect(validateDraft(base())).toEqual([]);
  });

  it('requires a brand and at least one category', () => {
    expect(validateDraft({ ...base(), brand_name: '  ' }).join(' ')).toMatch(/brand name/i);
    expect(validateDraft({ ...base(), category_keys: [] }).join(' ')).toMatch(/categor/i);
  });

  it('rejects a category the registry does not know', () => {
    expect(validateDraft({ ...base(), category_keys: ['tiles_and_stuff'] }).join(' '))
      .toMatch(/tiles_and_stuff/);
  });

  // The brand link is rendered as an anchor on a page anyone can open. `javascript:` and a
  // plain http:// link are both refused by the column's CHECK, so catching them here is what
  // turns a failed insert into a message the person can act on.
  it('accepts only https brand links', () => {
    expect(validateDraft({ ...base(), brand_url: 'https://harmony.example' })).toEqual([]);
    expect(validateDraft({ ...base(), brand_url: 'http://harmony.example' }).length).toBe(1);
    expect(validateDraft({ ...base(), brand_url: 'javascript:alert(1)' }).length).toBe(1);
  });

  it('rejects a year that is not a year', () => {
    expect(validateDraft({ ...base(), since_year: 19 }).length).toBe(1);
    expect(validateDraft({ ...base(), since_year: 2019 })).toEqual([]);
  });

  it('catches a duplicate brand the way the unique index does — case and space insensitively', () => {
    const existing = [{ id: 'other', brand_name: 'Harmony' }];
    expect(validateDraft({ ...base(), brand_name: '  harmony ' }, existing).join(' ')).toMatch(/already/i);
    // Editing the SAME row is not a duplicate of itself.
    expect(validateDraft({ ...base(), id: 'other', brand_name: 'Harmony' }, existing)).toEqual([]);
  });

  it('normalises a brand key the way the unique index does', () => {
    expect(brandKey('  HARMONY ')).toBe('harmony');
  });
});

describe('public visibility', () => {
  it('hides a declined claim and nothing else', () => {
    expect(isPubliclyVisible(row({ verification_status: 'declined' }))).toBe(false);
    for (const status of VERIFICATION_KEYS.filter((s) => s !== 'declined')) {
      expect(isPubliclyVisible(row({ verification_status: status })), status).toBe(true);
    }
  });

  /**
   * The owner CAN read their own declined rows (RLS grants "your own rows"), so the public
   * component is the only thing standing between a rejected claim and the owner's public
   * profile. A test that only checked the helper would not notice the caller dropping it.
   */
  it('the public showcase filters declined claims out', () => {
    const src = readFileSync(join(SRC, 'components/features/profile/AmbassadorShowcase.tsx'), 'utf8');
    expect(src).toMatch(/\.filter\(isPubliclyVisible\)/);
  });
});

describe('grouping for the public profile', () => {
  const tiles = UPLOAD_CATEGORIES[0];
  const other = UPLOAD_CATEGORIES[1];

  it('lists a brand under every category it is promoted in', () => {
    const groups = groupByCategory([row({ id: 'a', category_keys: [tiles, other] })]);
    expect(groups.map((g) => g.categoryKey)).toEqual(
      UPLOAD_CATEGORIES.filter((k) => k === tiles || k === other),
    );
    expect(groups.every((g) => g.items.length === 1)).toBe(true);
  });

  it('keeps categories in registry order, not insertion order', () => {
    const groups = groupByCategory([
      row({ id: 'a', brand_name: 'B', category_keys: [other] }),
      row({ id: 'b', brand_name: 'A', category_keys: [tiles] }),
    ]);
    const expected = UPLOAD_CATEGORIES.filter((k) => k === tiles || k === other);
    expect(groups.map((g) => g.categoryKey)).toEqual(expected);
  });

  // Rows carried over from the old `preferred_factories` blob have no categories. Dropping them
  // would silently delete brands from a profile that still lists them.
  it('keeps uncategorised brands in a bucket of their own, last', () => {
    const groups = groupByCategory([
      row({ id: 'a', category_keys: [tiles] }),
      row({ id: 'b', brand_name: 'Legacy', category_keys: [] }),
    ]);
    expect(groups[groups.length - 1].categoryKey).toBe('');
    expect(groups[groups.length - 1].items[0].brand_name).toBe('Legacy');
  });

  it('puts featured brands first within a group', () => {
    const sorted = sortForDisplay([
      row({ id: 'a', brand_name: 'Zeta', sort_order: 1 }),
      row({ id: 'b', brand_name: 'Alpha', sort_order: 2, is_featured: true }),
    ]);
    expect(sorted.map((r) => r.brand_name)).toEqual(['Alpha', 'Zeta']);
  });

  it('counts covered categories once, in registry order', () => {
    const covered = categoriesCovered([
      row({ id: 'a', category_keys: [other, tiles] }),
      row({ id: 'b', category_keys: [tiles] }),
    ]);
    expect(covered).toEqual(UPLOAD_CATEGORIES.filter((k) => k === tiles || k === other));
  });
});

describe('the category registry stays the only source', () => {
  const FILES = [
    'lib/ambassadorships.ts',
    'components/core/Profile/AmbassadorTab.tsx',
    'components/features/profile/AmbassadorShowcase.tsx',
  ];

  it('no ambassador surface writes a category key or label of its own', () => {
    // Two known-good keys standing in for the whole vocabulary: if a file starts listing
    // categories, these are the ones it will list first (#368 PD-5).
    for (const rel of FILES) {
      const src = readFileSync(join(SRC, rel), 'utf8')
        .split('\n')
        .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
        .join('\n');
      expect(src, `${rel} hardcodes a category key`).not.toMatch(/['"]general_materials['"]|['"]paint_wall_decor['"]/);
    }
  });
});

describe('the old preferred_factories blob is gone', () => {
  /**
   * The column is dropped. PostgREST refuses an unknown column outright, so any leftover
   * `select('… preferred_factories …')` is a hard runtime error on a page nobody re-tests —
   * exactly the shape `npm run schema:writers` exists for, caught here without a database.
   */
  it('nothing in src/ reads or writes it any more', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) { walk(p); continue; }
        if (!/\.tsx?$/.test(e.name)) continue;
        // types.ts is the generated schema projection and cannot be regenerated locally; it is
        // a declaration, not a query, so a stale entry there breaks nothing.
        if (p.endsWith(join('integrations', 'supabase', 'types.ts'))) continue;
        if (readFileSync(p, 'utf8').includes('preferred_factories')) offenders.push(p);
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });
});
