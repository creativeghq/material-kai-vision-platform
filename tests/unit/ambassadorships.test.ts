import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  BRAND_SOURCES, RELATIONSHIPS, RELATIONSHIP_KEYS, brandKey, categoriesCovered, emptyDraft,
  groupByCategory, relationshipDef, sortForDisplay, validateDraft,
  type Ambassadorship,
} from '../../src/lib/ambassadorships';
import { UPLOAD_CATEGORIES } from '../../src/lib/categoryFieldRegistry';

/**
 * Brand ambassadorships (Profile → Ambassador).
 *
 * Nobody approves an ambassadorship: being on the platform's supplier list is the whole
 * condition. What is left to get wrong is silent, which is why it is tested rather than trusted:
 *
 *  1. The relationship and brand-source vocabularies exist TWICE — as a TypeScript union and as
 *     a Postgres CHECK constraint. A value added on one side only is either an insert that
 *     always fails or a state the UI cannot name.
 *  2. The supplier LINK is what carries the brand's own view of who promotes it
 *     (`list_supplier_brand_ambassadors` joins on it). A form that stops sending
 *     `platform_supplier_id` breaks that view while every profile still renders perfectly.
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
    platform_supplier_id: null,
    brand_country: null,
    brand_url: null,
    category_keys: [],
    relationship: 'ambassador',
    headline: null,
    since_year: null,
    showcase_moodboard_id: null,
    is_featured: false,
    sort_order: 0,
    created_at: '2026-08-22T00:00:00Z',
    updated_at: '2026-08-22T00:00:00Z',
    ...over,
  };
}

describe('ambassadorship vocabulary', () => {
  // These literals ARE the CHECK constraints, transcribed. Changing one side without the other
  // is the failure this pins: `profile_ambassadorships_relationship_check` and
  // `profile_ambassadorships_brand_source_check`.
  it('mirrors the relationship CHECK constraint exactly', () => {
    expect([...RELATIONSHIP_KEYS]).toEqual([
      'ambassador', 'authorized_dealer', 'certified_installer', 'specifier',
    ]);
  });

  it('mirrors the brand-source CHECK constraint exactly', () => {
    expect([...BRAND_SOURCES]).toEqual(['supplier', 'catalog', 'manual']);
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

describe('the link to the supplier list', () => {
  /**
   * `platform_supplier_id` is how a supplier sees who promotes it: the analytics RPC joins on it
   * first and only falls back to comparing names. A form that stops sending it leaves every
   * profile looking right and the brand's own view silently empty — the shape this repo keeps
   * finding, so it is pinned here rather than assumed.
   */
  it('the editor sends the supplier id it picked, and the service writes it', () => {
    const tab = readFileSync(join(SRC, 'components/core/Profile/AmbassadorTab.tsx'), 'utf8');
    expect(tab, 'the picker must carry the supplier id into the draft')
      .toMatch(/platform_supplier_id:\s*b\.supplierId/);

    const service = readFileSync(join(SRC, 'services/ambassadorService.ts'), 'utf8');
    expect(service, 'the write payload must include the supplier link')
      .toMatch(/platform_supplier_id:\s*draft\.platform_supplier_id/);
    expect(service, 'reads must select it back').toMatch(/platform_supplier_id/);
  });

  it('a new draft starts unlinked rather than pretending to be on the list', () => {
    expect(emptyDraft().platform_supplier_id).toBeNull();
    expect(emptyDraft().brand_source).toBe('manual');
  });

  /**
   * Nothing waits on anybody. The words are the feature: if an approval concept comes back into
   * these surfaces, it should be a deliberate decision and not a drift.
   */
  it('no ambassador surface asks anyone to approve anything', () => {
    for (const rel of [
      'components/core/Profile/AmbassadorTab.tsx',
      'components/features/profile/AmbassadorShowcase.tsx',
      'components/features/profile/SupplierAmbassadorsPanel.tsx',
      'lib/ambassadorships.ts',
      'services/ambassadorService.ts',
    ]) {
      const src = readFileSync(join(SRC, rel), 'utf8')
        .split('\n')
        .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//'))
        .join('\n');
      expect(src, `${rel} reintroduces a verification state`)
        .not.toMatch(/verification_status|verified_at|decide_ambassadorship|request_ambassadorship/);
    }
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
