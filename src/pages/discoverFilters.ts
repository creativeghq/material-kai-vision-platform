/**
 * Filter definitions for the client-side Discover tabs (profiles / products).
 *
 * Every option list is derived from the loaded rows rather than a hand-rolled
 * `Array.from(new Set(...))`, so each facet carries a live count and a category that nobody
 * actually publishes under never shows up as a dead choice.
 */
import { Building2, MapPin, Package, Store, Sliders, Users } from 'lucide-react';
import { optionsFromRows, type FilterGroupDef } from '@/components/core/filters';
import { PROFESSIONAL_TYPE_LABELS, catLabel } from '@/lib/materialCategories';
import { isInternalFieldKey, type FieldRegistrySnapshot } from '@/services/fieldRegistryService';

export interface ProfileFilterRow {
  full_name?: string;
  company?: string;
  bio?: string;
  location?: string;
  services: string[];
  professional_type?: string | null;
}

export interface ProductFilterRow {
  id: string;
  name: string;
  description?: string;
  detectedCat: string;
  factoryName: string;
  attributes?: Record<string, unknown> | null;
}

export interface ProductFacetField {
  key: string;
  label: string;
}

const humaniseKey = (k: string) =>
  k.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const facetValue = (r: ProductFilterRow, key: string) => (r.attributes ?? {})[key];

/**
 * Which canonicalized attributes to offer as filters. The registry supplies the label and
 * the public/internal verdict, and an unresolved verdict (null) WITHHOLDS the dimension.
 */
export function productFacetFields(
  rows: ProductFilterRow[],
  registry: FieldRegistrySnapshot | null,
): ProductFacetField[] {
  if (!registry) return [];

  const carriers = new Map<string, number>();
  for (const row of rows) {
    const attrs = row.attributes;
    if (!attrs || typeof attrs !== 'object') continue;
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === '') continue;
      if (Array.isArray(value) && value.length === 0) continue;
      if (isInternalFieldKey(registry, key) !== false) continue;
      carriers.set(key, (carriers.get(key) ?? 0) + 1);
    }
  }

  return [...carriers.entries()]
    .filter(([, n]) => n > 1)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 8)
    .map(([key]) => ({
      key,
      label: registry.byName.get(key.toLowerCase())?.label ?? humaniseKey(key),
    }));
}

const typeLabel = (t: string) => PROFESSIONAL_TYPE_LABELS[t] ?? t;

export function buildProfileFilters(rows: ProfileFilterRow[]): FilterGroupDef[] {
  return [
    {
      key: 'who', label: 'Who', icon: Users,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search by name, service, location…',
          accessor: (r) => [r.full_name, r.company, r.bio, r.location, ...(r.services ?? [])],
        },
        {
          key: 'professional_type', type: 'multi', label: 'Professional type',
          options: optionsFromRows(rows, (r) => r.professional_type ?? undefined, typeLabel),
          accessor: (r) => r.professional_type ?? undefined,
        },
      ],
    },
    {
      key: 'where', label: 'Location', icon: MapPin,
      fields: [
        {
          key: 'location', type: 'multi', label: 'Location',
          options: optionsFromRows(rows, (r) => r.location?.trim()),
          accessor: (r) => r.location?.trim(),
        },
      ],
    },
  ];
}

export function buildProductFilters(
  rows: ProductFilterRow[],
  surplus: Record<string, { price: number; currency: string }>,
  facets: ProductFacetField[] = [],
): FilterGroupDef[] {
  const groups: FilterGroupDef[] = [
    {
      key: 'material', label: 'Material', icon: Package,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search materials by name or brand…',
          accessor: (r) => [r.name, r.description, r.factoryName],
        },
        {
          key: 'category', type: 'multi', label: 'Category',
          options: optionsFromRows(rows, (r) => r.detectedCat, catLabel),
          accessor: (r) => r.detectedCat,
        },
      ],
    },
    {
      key: 'brand', label: 'Brand', icon: Building2,
      fields: [
        {
          key: 'brand', type: 'multi', label: 'Brand',
          options: optionsFromRows(rows, (r) => (r.factoryName === 'Unknown' ? undefined : r.factoryName)),
          accessor: (r) => r.factoryName,
        },
      ],
    },
  ];

  if (facets.length > 0) {
    groups.push({
      key: 'properties', label: 'Properties', icon: Sliders,
      fields: facets.map((f) => ({
        key: `facet_${f.key}`, type: 'multi' as const, label: f.label,
        options: optionsFromRows(rows, (r) => facetValue(r, f.key)),
        accessor: (r: ProductFilterRow) => facetValue(r, f.key),
      })),
    });
  }

  // Only offer the surplus dimension when something is actually listed, mirroring the
  // previous conditional "Surplus only" button.
  if (Object.keys(surplus).length > 0) {
    groups.push({
      key: 'availability', label: 'Availability', icon: Store,
      fields: [
        {
          key: 'surplus', type: 'bool', label: 'Marketplace surplus',
          description: 'Materials also listed as surplus / last stock.',
          trueLabel: 'Surplus only', falseLabel: 'No surplus listing',
          accessor: (r) => !!surplus[r.id],
        },
      ],
    });
  }

  return groups;
}
