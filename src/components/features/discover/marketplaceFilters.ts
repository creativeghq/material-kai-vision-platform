/**
 * Filter definitions for the surplus Marketplace browse.
 *
 * Every dimension here is applied SERVER-side by `marketplaceService.browse()`, so the fields
 * carry neither `accessor` nor `column` — they are pure declarations that the tab reads off
 * the values bag when it builds the request. Keeping them in the shared vocabulary is what
 * gives the surface the standard modal, chips and active-count for free.
 */
import { Package, Tags, Truck } from 'lucide-react';
import type { FilterGroupDef, FilterValues, RangeValue } from '@/components/core/filters';
import { MATERIAL_CATS, catLabel } from '@/lib/materialCategories';
import type { BrowseFilters } from '@/services/marketplaceService';

export const CONDITION_LABEL: Record<string, string> = {
  new: 'New', open_box: 'Open box', remnant: 'Remnant', lot: 'Mixed lot',
};

export const DELIVERY_LABEL: Record<string, string> = {
  pickup: 'Pickup only', ship: 'Shipping', both: 'Pickup or shipping',
};

const labelOptions = (map: Record<string, string>) =>
  Object.entries(map).map(([value, label]) => ({ value, label }));

/** `priceCeiling` is the highest price seen so far, so the slider end never shrinks mid-session. */
export function buildMarketplaceFilters(priceCeiling: number): FilterGroupDef[] {
  return [
    {
      key: 'what', label: 'Material', icon: Package,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search surplus by name or seller…',
        },
        {
          key: 'material_category', type: 'select', label: 'Category',
          options: MATERIAL_CATS.map((c) => ({ value: c, label: catLabel(c) })),
        },
      ],
    },
    {
      key: 'condition', label: 'Condition', icon: Tags,
      fields: [
        { key: 'condition', type: 'multi', label: 'Condition', options: labelOptions(CONDITION_LABEL) },
        { key: 'price', type: 'range', label: 'Price', unit: '€', min: 0, max: priceCeiling, step: 1 },
      ],
    },
    {
      key: 'logistics', label: 'Delivery', icon: Truck,
      fields: [
        { key: 'delivery', type: 'multi', label: 'Delivery', options: labelOptions(DELIVERY_LABEL) },
        {
          key: 'city', type: 'text', label: 'City',
          description: 'Partial match on the listing city.',
          placeholder: 'e.g. Athens',
        },
      ],
    },
  ];
}

/** Translate the values bag into the service's browse arguments. */
export function toBrowseFilters(values: FilterValues): BrowseFilters {
  const price = (values.price as RangeValue | undefined) ?? {};
  const conditions = values.condition as string[] | undefined;
  const deliveries = values.delivery as string[] | undefined;
  return {
    q: (values.q as string)?.trim() || undefined,
    materialCategory: (values.material_category as string) || undefined,
    conditions: conditions?.length ? conditions : undefined,
    deliveries: deliveries?.length ? deliveries : undefined,
    minPrice: price.min ?? undefined,
    maxPrice: price.max ?? undefined,
    city: (values.city as string)?.trim() || undefined,
  };
}
