import { supabase } from '@/integrations/supabase/client';

/**
 * The product field registry, read at runtime from `material_metadata_fields` (#368 PD-1/PD-5).
 *
 * WHY RUNTIME AND NOT A COMMITTED PROJECTION.
 * `categoryVocab.generated.ts` is a snapshot because a guard test has to check the category
 * vocabulary in CI, where there is no database. This is the opposite case: what it answers is
 * "which fields does a product in category X have, what is each one called here, and is it
 * safe to show" — 390-odd rows an admin edits from the Fields screen. A snapshot of that is a
 * copy that goes stale the moment somebody edits a label, which is precisely how the 981-line
 * `CATEGORY_DISPLAY_REGISTRY` came to be the SEVENTH copy of this table and to disagree with
 * it. The registry is authenticated-readable, so the client reads the source.
 *
 * WHAT REPLACED WHAT.
 * The hand-written display registry carried two things the DB could not express, so they moved
 * into the DB first (both are now columns): the curated labels — "Wattage (W)", not the
 * auto-titled "Wattage W" — and the fact that a label is per-category, because `body_material`
 * reads "Material" for kitchen and lighting and "Body Material" everywhere else. Same shape and
 * same reason as `description_by_category`.
 *
 * SENSITIVITY. The Details tab is a walker: it renders every key it finds in the product's
 * jsonb, which is where supplier XML and AI extraction write and where they are allowed to
 * invent fields nobody has classified. The registry answers for keys it knows; for keys it has
 * never seen, `internal_product_field_pattern()` is the floor. Both come from the DB — the
 * pattern is fetched, never transcribed, because a regex copied into TypeScript is a copy that
 * drifts silently and the server would keep redacting what the client had started showing.
 */

export type FieldSensitivity = 'public' | 'internal';

export interface RegistryField {
  name: string;
  label: string;
  section: string;
  /** null = global (applies to every category). */
  categories: string[] | null;
  sortOrder: number;
  sensitivity: FieldSensitivity;
  /** {category_key: label} — a per-category name for the same field. */
  labelByCategory: Record<string, string> | null;
  descriptionByCategory: Record<string, string> | null;
  description: string | null;
}

export interface FieldRegistrySnapshot {
  fields: RegistryField[];
  byName: Map<string, RegistryField>;
  /**
   * Denylist floor for keys the registry has never seen, from the DB. `null` means the
   * pattern could not be read — callers must treat that as "cannot judge", not as "nothing
   * is internal", or a failed fetch silently reopens what this exists to close.
   */
  internalPattern: RegExp | null;
}

/** A section of the Details tab, as the registry defines it for one category. */
export interface DisplaySection {
  key: string;
  label: string;
  fields: Array<{ key: string; label: string }>;
}

/**
 * Section display order and headings. Presentation, not registry data: the DB says which
 * section a field belongs to, this says what that section is called and where it sits.
 * A section key absent from here still renders — at the end, under a formatted key.
 */
const SECTION_META: Array<{ key: string; label: string }> = [
  { key: 'appearance', label: 'Appearance' },
  { key: 'material_properties', label: 'Material' },
  { key: 'dimensions', label: 'Dimensions' },
  { key: 'electrical_specs', label: 'Electrical' },
  { key: 'thermal_performance', label: 'Thermal Performance' },
  { key: 'water_performance', label: 'Water Performance' },
  { key: 'performance', label: 'Performance' },
  { key: 'features', label: 'Features' },
  { key: 'application', label: 'Application' },
  { key: 'installation', label: 'Installation' },
  { key: 'packaging', label: 'Packaging' },
  { key: 'care', label: 'Care' },
  { key: 'compliance', label: 'Certifications' },
  { key: 'commercial', label: 'Commercial Information' },
  { key: 'design', label: 'Design' },
  { key: 'other', label: 'Specifications' },
];

const SECTION_ORDER = new Map(SECTION_META.map((s, i) => [s.key, i]));
const SECTION_LABEL = new Map(SECTION_META.map((s) => [s.key, s.label]));

const titleCase = (key: string) =>
  key.split('_').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

let cached: Promise<FieldRegistrySnapshot> | null = null;

async function fetchSnapshot(): Promise<FieldRegistrySnapshot> {
  const [fieldsRes, patternRes] = await Promise.all([
    supabase
      .from('material_metadata_fields')
      .select('field_name, display_name, section, applies_to_categories, is_global, sort_order, '
            + 'sensitivity, label_by_category, description, description_by_category')
      .eq('status', 'active'),
    supabase.rpc('internal_product_field_pattern' as never),
  ]);

  if (fieldsRes.error) throw fieldsRes.error;

  const rows = (fieldsRes.data ?? []) as Array<Record<string, unknown>>;
  if (rows.length === 0) {
    // An empty registry is not "this product has no fields" — it is a read that failed to
    // return anything, and treating it as data would render an empty Details tab forever
    // while every health signal stayed green.
    throw new Error('material_metadata_fields returned no rows');
  }

  const fields: RegistryField[] = rows.map((r) => ({
    name: String(r.field_name),
    label: (r.display_name as string) || titleCase(String(r.field_name)),
    section: (r.section as string) || 'other',
    categories: r.is_global === true ? null : ((r.applies_to_categories as string[]) ?? []),
    sortOrder: typeof r.sort_order === 'number' ? r.sort_order : 0,
    sensitivity: r.sensitivity === 'internal' ? 'internal' : 'public',
    labelByCategory: (r.label_by_category as Record<string, string> | null) ?? null,
    descriptionByCategory: (r.description_by_category as Record<string, string> | null) ?? null,
    description: (r.description as string | null) ?? null,
  }));

  let internalPattern: RegExp | null = null;
  const rawPattern = patternRes.error ? null : (patternRes.data as unknown as string | null);
  if (typeof rawPattern === 'string' && rawPattern.length > 0) {
    try {
      internalPattern = new RegExp(rawPattern);
    } catch {
      internalPattern = null;
    }
  }

  return { fields, byName: new Map(fields.map((f) => [f.name, f])), internalPattern };
}

/** Loads the registry once per session. A failed load is not cached, so a retry can succeed. */
export function loadFieldRegistry(): Promise<FieldRegistrySnapshot> {
  if (!cached) {
    cached = fetchSnapshot().catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}

/** Test seam — drops the memoised snapshot. */
export function resetFieldRegistryCache(): void {
  cached = null;
}

export function fieldAppliesTo(field: RegistryField, categoryKey: string): boolean {
  // `is_global` is THE universal flag and an empty scope means the field applies to NOTHING.
  // Inferring universality from an empty array is what leaked sanitary's bowl_shape onto tiles
  // (#347 phase 3); the same rule holds here.
  if (field.categories === null) return true;
  return field.categories.includes(categoryKey);
}

/** The label this field carries in THIS category, which is not always its base label. */
export function labelForField(field: RegistryField, categoryKey: string): string {
  return field.labelByCategory?.[categoryKey] || field.label;
}

/** The description this field carries in THIS category — vitreous china in sanitary, rattan in lighting. */
export function describeField(field: RegistryField, categoryKey: string): string | null {
  return field.descriptionByCategory?.[categoryKey] || field.description || null;
}

/** Every section the registry defines for a category, in display order. */
export function sectionsForCategory(
  snapshot: FieldRegistrySnapshot,
  categoryKey: string,
): DisplaySection[] {
  const bySection = new Map<string, RegistryField[]>();
  for (const f of snapshot.fields) {
    if (!fieldAppliesTo(f, categoryKey)) continue;
    const list = bySection.get(f.section);
    if (list) list.push(f);
    else bySection.set(f.section, [f]);
  }

  const rank = (key: string) => SECTION_ORDER.get(key) ?? SECTION_META.length;
  return [...bySection.entries()]
    .sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]))
    .map(([key, fields]) => ({
      key,
      label: SECTION_LABEL.get(key) ?? titleCase(key),
      fields: fields
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map((f) => ({ key: f.name, label: labelForField(f, categoryKey) })),
    }));
}

/** Does this category use packaging / warranty / any other section at all? */
export function categoryHasSection(
  snapshot: FieldRegistrySnapshot,
  categoryKey: string,
  sectionKey: string,
): boolean {
  return snapshot.fields.some((f) => f.section === sectionKey && fieldAppliesTo(f, categoryKey));
}

export function categoryHasField(
  snapshot: FieldRegistrySnapshot,
  categoryKey: string,
  fieldName: string,
): boolean {
  const f = snapshot.byName.get(fieldName);
  return !!f && fieldAppliesTo(f, categoryKey);
}

/**
 * Mirrors `public.is_internal_product_field(text)`: the registry answers for a field it knows,
 * the pattern is the floor for one it does not.
 *
 * Returns `null` when it cannot judge — the registry loaded but the pattern did not, and the
 * key is unknown. Callers must withhold on `null`. Collapsing that to `false` is the shape
 * where a fetch failure quietly turns the filter off and nothing anywhere reports it.
 */
export function isInternalFieldKey(
  snapshot: FieldRegistrySnapshot,
  key: string,
): boolean | null {
  if (!key) return false;
  const lower = key.toLowerCase();
  const known = snapshot.byName.get(lower);
  if (known) return known.sensitivity === 'internal';
  if (!snapshot.internalPattern) return null;
  return snapshot.internalPattern.test(lower);
}
