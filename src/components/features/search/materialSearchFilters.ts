/** Filter definitions for the material search surface (/search). */
import { FileText, Hash, Layers } from 'lucide-react';
import { optionsFromRows, type FilterField, type FilterGroupDef } from '@/components/core/filters';
import { isInternalFieldKey, type FieldRegistrySnapshot } from '@/services/fieldRegistryService';

export interface EntityRef {
  type: 'MATERIAL' | 'ORG' | 'LOCATION' | 'PERSON' | 'DATE';
  text: string;
  confidence: number;
}

export interface MaterialSearchRow {
  title?: string;
  content?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  extracted_entities?: EntityRef[];
}

/** A facet with more distinct values than this is a free-text field, not a filter. */
const MAX_FACET_OPTIONS = 30;

function facetValues(v: unknown): string[] {
  const one = (x: unknown): string | null => {
    if (x && typeof x === 'object' && !Array.isArray(x) && 'value' in (x as Record<string, unknown>)) {
      return one((x as Record<string, unknown>).value);
    }
    if (typeof x === 'string') return x.trim() || null;
    if (typeof x === 'number' || typeof x === 'boolean') return String(x);
    return null;
  };
  if (Array.isArray(v)) return v.map(one).filter((x): x is string => x !== null);
  const single = one(v);
  return single === null ? [] : [single];
}

/**
 * Attribute facets come from the field registry: a key is offered only when the registry knows
 * it and the sensitivity gate says it is public. With no registry loaded, no attribute facet is
 * offered (an unjudged key is withheld, never shown).
 */
function registryFacets(rows: MaterialSearchRow[], registry: FieldRegistrySnapshot | null): FilterGroupDef[] {
  if (!registry) return [];
  const keys = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r.metadata ?? {})) keys.add(k);
  const bySection = new Map<string, FilterField[]>();
  for (const key of [...keys].sort()) {
    const field = registry.byName.get(key);
    if (!field || isInternalFieldKey(registry, key) !== false) continue;
    const accessor = (r: MaterialSearchRow) => facetValues(r.metadata?.[key]);
    const options = optionsFromRows(rows, accessor);
    if (options.length < 2 || options.length > MAX_FACET_OPTIONS) continue;
    const list = bySection.get(field.section) ?? [];
    list.push({ key: `attr_${key}`, label: field.label, type: 'multi', options, accessor });
    bySection.set(field.section, list);
  }
  return [...bySection.entries()].map(([section, fields]) => ({
    key: `attr_${section}`,
    label: section.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
    icon: Layers,
    fields,
  }));
}

function entityField(key: string, label: string, type: EntityRef['type'], rows: MaterialSearchRow[]): FilterField | null {
  const accessor = (r: MaterialSearchRow) =>
    (r.extracted_entities ?? []).filter((e) => e.type === type).map((e) => e.text);
  const options = optionsFromRows(rows, accessor);
  if (options.length === 0) return null;
  return { key, label, type: 'multi', options, accessor };
}

const compact = (fields: (FilterField | null)[]) => fields.filter((f): f is FilterField => f !== null);

export function buildMaterialSearchFilters(
  rows: MaterialSearchRow[],
  registry: FieldRegistrySnapshot | null = null,
): FilterGroupDef[] {
  const groups: FilterGroupDef[] = [...registryFacets(rows, registry)];

  const sources = optionsFromRows(rows, (r) => r.source);
  if (sources.length) {
    groups.push({
      key: 'source', label: 'Source', icon: FileText,
      fields: [{
        key: 'source', type: 'multi', label: 'Source',
        description: 'Catalog or document the match came from.',
        options: sources,
        accessor: (r) => r.source,
      }],
    });
  }

  const entities = compact([
    entityField('entity_material', 'Materials', 'MATERIAL', rows),
    entityField('entity_org', 'Organizations', 'ORG', rows),
    entityField('entity_location', 'Locations', 'LOCATION', rows),
    entityField('entity_person', 'People', 'PERSON', rows),
  ]);
  if (entities.length) groups.push({ key: 'entities', label: 'Entities', icon: Hash, fields: entities });

  return groups;
}
