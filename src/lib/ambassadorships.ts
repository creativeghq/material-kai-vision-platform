/**
 * Brand ambassadorships — vocabulary and pure derivations.
 *
 * A professional does not merely "prefer" a brand: they represent it, and they represent it
 * FOR SOMETHING — tiles, or lighting, or kitchens. The category is the part a reader of the
 * public profile is actually asking about ("who do you use for sanitary?"), so it is modelled
 * as a first-class part of the relationship rather than a tag on the person.
 *
 * Everything category-shaped in here comes from the generated projection of
 * `material_categories`. No key, label, or ordering is written down a second time — that copy
 * is the #368 failure, and `tests/unit/categoryVocabRegistry.test.ts` fails the build over it.
 */
import { UPLOAD_CATEGORIES, categoryDisplayName } from '@/lib/categoryFieldRegistry';

/**
 * MIRRORS the `profile_ambassadorships_relationship_check` CHECK constraint. Both halves must
 * change together: a value only this side knows fails the insert, and a value only the DB knows
 * is unreachable from the form. Guarded by tests/unit/ambassadorships.test.ts.
 */
export const RELATIONSHIP_KEYS = [
  'ambassador',
  'authorized_dealer',
  'certified_installer',
  'specifier',
] as const;
export type AmbassadorRelationship = typeof RELATIONSHIP_KEYS[number];

/** MIRRORS `profile_ambassadorships_brand_source_check` — WHICH list the name came from. */
export const BRAND_SOURCES = ['supplier', 'catalog', 'manual'] as const;
export type BrandSource = typeof BRAND_SOURCES[number];

export interface RelationshipDef {
  key: AmbassadorRelationship;
  /** What the person picks in the form. */
  label: string;
  /** What the form explains it means. */
  description: string;
  /** How the public profile phrases it, e.g. "Ambassador for Harmony". */
  publicPrefix: string;
}

export const RELATIONSHIPS: readonly RelationshipDef[] = [
  {
    key: 'ambassador',
    label: 'Ambassador',
    description: 'You represent and actively promote the brand in your work.',
    publicPrefix: 'Ambassador for',
  },
  {
    key: 'authorized_dealer',
    label: 'Authorized dealer',
    description: 'You are authorised to sell the brand.',
    publicPrefix: 'Authorized dealer of',
  },
  {
    key: 'certified_installer',
    label: 'Certified installer',
    description: 'The brand has trained or certified you to install its products.',
    publicPrefix: 'Certified installer for',
  },
  {
    key: 'specifier',
    label: 'Specifier',
    description: 'You specify the brand on projects without selling or installing it.',
    publicPrefix: 'Specifies',
  },
];

const RELATIONSHIP_BY_KEY = new Map(RELATIONSHIPS.map((r) => [r.key, r]));

export function relationshipDef(key: string): RelationshipDef {
  return RELATIONSHIP_BY_KEY.get(key as AmbassadorRelationship) ?? RELATIONSHIPS[0];
}

export interface Ambassadorship {
  id: string;
  user_id: string;
  brand_name: string;
  brand_source: BrandSource;
  /** The `platform_suppliers` row this brand IS, when it was picked off the list. */
  platform_supplier_id: string | null;
  brand_country: string | null;
  brand_url: string | null;
  category_keys: string[];
  relationship: AmbassadorRelationship;
  headline: string | null;
  since_year: number | null;
  showcase_moodboard_id: string | null;
  is_featured: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** The editable half — what a form may send. Everything else is set by the server. */
export interface AmbassadorshipDraft {
  id?: string;
  brand_name: string;
  brand_source: BrandSource;
  platform_supplier_id: string | null;
  brand_country: string | null;
  brand_url: string | null;
  category_keys: string[];
  relationship: AmbassadorRelationship;
  headline: string | null;
  since_year: number | null;
  showcase_moodboard_id: string | null;
  is_featured: boolean;
}

export const HEADLINE_MAX = 280;

export function emptyDraft(): AmbassadorshipDraft {
  return {
    brand_name: '',
    brand_source: 'manual',
    platform_supplier_id: null,
    brand_country: null,
    brand_url: null,
    category_keys: [],
    relationship: 'ambassador',
    headline: null,
    since_year: null,
    showcase_moodboard_id: null,
    is_featured: false,
  };
}

/** Mirrors the unique index `(user_id, lower(btrim(brand_name)))`. */
export function brandKey(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Problems that would either be refused by the database or shown to the public as nonsense.
 * Returned as messages rather than a boolean so the form can say which field is wrong.
 */
export function validateDraft(
  draft: AmbassadorshipDraft,
  existing: Pick<Ambassadorship, 'id' | 'brand_name'>[] = [],
): string[] {
  const problems: string[] = [];
  const name = draft.brand_name.trim();

  if (!name) problems.push('Pick or type a brand name.');
  if (name.length > 120) problems.push('Brand name is too long (120 characters max).');

  if (name && existing.some((e) => e.id !== draft.id && brandKey(e.brand_name) === brandKey(name))) {
    problems.push(`${name} is already on your profile — edit that entry instead.`);
  }

  if (draft.category_keys.length === 0) {
    problems.push('Choose at least one category — that is what a visitor is looking you up by.');
  }
  const known: readonly string[] = UPLOAD_CATEGORIES;
  const unknown = draft.category_keys.filter((k) => !known.includes(k));
  if (unknown.length) problems.push(`Not a material category: ${unknown.join(', ')}.`);

  if ((draft.headline?.length ?? 0) > HEADLINE_MAX) {
    problems.push(`Keep the headline under ${HEADLINE_MAX} characters.`);
  }

  // https only: this is rendered as a link on a page anyone can open.
  if (draft.brand_url && !/^https:\/\/\S+$/.test(draft.brand_url.trim())) {
    problems.push('The brand link must be a full https:// address.');
  }

  const year = draft.since_year;
  if (year != null && (!Number.isInteger(year) || year < 1900 || year > 2100)) {
    problems.push('Enter the starting year as a four-digit year.');
  }

  return problems;
}

/** Featured first, then the person's own order, then alphabetical. */
export function sortForDisplay<T extends Pick<Ambassadorship, 'is_featured' | 'sort_order' | 'brand_name'>>(
  list: T[],
): T[] {
  return [...list].sort((a, b) => (
    Number(b.is_featured) - Number(a.is_featured)
    || a.sort_order - b.sort_order
    || a.brand_name.localeCompare(b.brand_name)
  ));
}

export interface CategoryGroup<T> {
  categoryKey: string;
  label: string;
  items: T[];
}

/**
 * The public profile's shape: "for tiles, these brands; for lighting, these".
 *
 * A brand promoted in two categories appears under both — that is the claim, not a duplicate.
 * Category order follows the registry projection so every surface renders the same order without
 * one of them writing a list down.
 */
export function groupByCategory<T extends Pick<Ambassadorship, 'category_keys' | 'is_featured' | 'sort_order' | 'brand_name'>>(
  list: T[],
): CategoryGroup<T>[] {
  const sorted = sortForDisplay(list);
  const groups: CategoryGroup<T>[] = [];

  for (const key of UPLOAD_CATEGORIES) {
    const items = sorted.filter((a) => a.category_keys.includes(key));
    if (items.length) groups.push({ categoryKey: key, label: categoryDisplayName(key), items });
  }

  // A brand carried over from the old preferred-brands list has no categories yet. Dropping it
  // silently would make it vanish from a profile it is still on, so it gets its own bucket.
  const uncategorised = sorted.filter((a) => a.category_keys.length === 0);
  if (uncategorised.length) {
    groups.push({ categoryKey: '', label: 'Other brands', items: uncategorised });
  }

  return groups;
}

/** Every category the person promotes anything in, in registry order. */
export function categoriesCovered(list: Pick<Ambassadorship, 'category_keys'>[]): string[] {
  const seen = new Set(list.flatMap((a) => a.category_keys));
  return UPLOAD_CATEGORIES.filter((k) => seen.has(k));
}
