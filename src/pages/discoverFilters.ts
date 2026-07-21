/**
 * Filter definitions for the three client-side Discover tabs (profiles / brands / products).
 *
 * Every option list is derived from the loaded rows rather than a hand-rolled
 * `Array.from(new Set(...))`, so each facet carries a live count and a category that nobody
 * actually publishes under never shows up as a dead choice.
 */
import { Building2, MapPin, Package, Store, Users } from 'lucide-react';
import { optionsFromRows, type FilterGroupDef } from '@/components/core/filters';
import { PROFESSIONAL_TYPE_LABELS, catLabel } from '@/lib/materialCategories';

export interface ProfileFilterRow {
  full_name?: string;
  company?: string;
  bio?: string;
  location?: string;
  services: string[];
  professional_type?: string | null;
}

export interface FactoryFilterRow {
  name: string;
  categories: string[];
}

export interface ProductFilterRow {
  id: string;
  name: string;
  description?: string;
  detectedCat: string;
  factoryName: string;
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

export function buildFactoryFilters(rows: FactoryFilterRow[]): FilterGroupDef[] {
  return [
    {
      key: 'brand', label: 'Brand', icon: Building2,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search brands…',
          accessor: (r) => r.name,
        },
        {
          // A brand carries several categories, so this is a "publishes in any of" match.
          key: 'category', type: 'multi', label: 'Material category',
          description: 'Brands publishing at least one material in the category.',
          options: optionsFromRows(rows, (r) => r.categories, catLabel),
          accessor: (r) => r.categories,
        },
      ],
    },
  ];
}

export function buildProductFilters(
  rows: ProductFilterRow[],
  surplus: Record<string, { price: number; currency: string }>,
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
