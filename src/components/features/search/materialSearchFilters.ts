/**
 * Filter definitions for the material search surface (/search).
 *
 * What comes back from the 7-vector fusion search is a retrieval CHUNK, not a catalog row —
 * it has no price, stock or durability column to match on. So the descriptive vocabularies
 * below (which are pre-existing product decisions, kept verbatim) are matched against the
 * returned title + content, and each option is derived from the current result set so it
 * carries a real count and never offers a term that would return nothing.
 *
 * Deliberately absent: price range and durability rating. A chunk carries neither, and a
 * control that cannot change the result set is worse than no control. `suppliers` — declared
 * but never rendered in the old panel — is wired here as the honest thing it can actually be:
 * the source document the match came from.
 */
import { Building2, FileText, Hash, Layers } from 'lucide-react';
import { optionsFromRows, type FilterField, type FilterGroupDef } from '@/components/core/filters';

export interface EntityRef {
  type: 'MATERIAL' | 'ORG' | 'LOCATION' | 'PERSON' | 'DATE';
  text: string;
  confidence: number;
}

export interface MaterialSearchRow {
  title?: string;
  content?: string;
  source?: string;
  extracted_entities?: EntityRef[];
}

const MATERIAL_TYPES = [
  'Ceramic', 'Porcelain', 'Marble', 'Granite', 'Wood', 'Metal',
  'Fabric', 'Leather', 'Glass', 'Concrete', 'Stone', 'Composite',
];

const COLORS = [
  'White', 'Black', 'Gray', 'Beige', 'Brown', 'Blue',
  'Green', 'Red', 'Yellow', 'Orange', 'Pink', 'Purple',
];

const TEXTURES = ['Smooth', 'Rough', 'Matte', 'Glossy', 'Textured', 'Patterned', 'Polished', 'Honed'];

const APPLICATIONS = [
  'Flooring', 'Wall Covering', 'Upholstery', 'Countertop', 'Backsplash',
  'Exterior', 'Interior', 'Commercial', 'Residential',
];

const AVAILABILITY_STATUS = ['In Stock', 'Pre-Order', 'Discontinued', 'Limited'];

const blob = (r: MaterialSearchRow) => `${r.title ?? ''} ${r.content ?? ''}`.toLowerCase();

/** Which of `terms` the row mentions — turns free text into an exact-set facet. */
const mentioned = (terms: string[]) => (r: MaterialSearchRow) => {
  const text = blob(r);
  return terms.filter((t) => text.includes(t.toLowerCase()));
};

function termField(key: string, label: string, terms: string[], rows: MaterialSearchRow[]): FilterField | null {
  const accessor = mentioned(terms);
  const options = optionsFromRows(rows, accessor);
  if (options.length === 0) return null;
  return { key, label, type: 'multi', options, accessor };
}

function entityField(key: string, label: string, type: EntityRef['type'], rows: MaterialSearchRow[]): FilterField | null {
  const accessor = (r: MaterialSearchRow) =>
    (r.extracted_entities ?? []).filter((e) => e.type === type).map((e) => e.text);
  const options = optionsFromRows(rows, accessor);
  if (options.length === 0) return null;
  return { key, label, type: 'multi', options, accessor };
}

const compact = (fields: (FilterField | null)[]) => fields.filter((f): f is FilterField => f !== null);

export function buildMaterialSearchFilters(rows: MaterialSearchRow[]): FilterGroupDef[] {
  const groups: FilterGroupDef[] = [];

  const properties = compact([
    termField('material_type', 'Material type', MATERIAL_TYPES, rows),
    termField('color', 'Color', COLORS, rows),
    termField('texture', 'Texture', TEXTURES, rows),
  ]);
  if (properties.length) groups.push({ key: 'properties', label: 'Material', icon: Layers, fields: properties });

  const use = compact([
    termField('application', 'Application', APPLICATIONS, rows),
    termField('availability', 'Availability', AVAILABILITY_STATUS, rows),
  ]);
  if (use.length) groups.push({ key: 'use', label: 'Use', icon: Building2, fields: use });

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
