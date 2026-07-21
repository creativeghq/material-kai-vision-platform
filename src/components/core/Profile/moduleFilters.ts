/**
 * Filter definitions for the module storefront.
 *
 * The All / Active / Available pills stay as the primary triage — they are how an owner switches
 * between "what am I running" and "what can I add", and they carry counts. The modal adds the
 * dimensions the storefront never exposed: free text, Hub, plan tier, add-on vs plan-covered,
 * and whether the module also burns credits.
 */
import { Blocks, Coins, Layers } from 'lucide-react';
import { NONE_VALUE, type FilterGroupDef, type FilterOption } from '@/components/core/filters';
import { humanizeLabel } from '@/utils/humanize';
import type { ModuleCatalogRow } from '@/services/moduleActivationService';
import type { ModuleMeta } from '@/config/module-catalog-meta';

/** The shape the storefront hands the matcher — the catalog row plus its resolved presentation. */
export interface ModuleFilterRow {
  row: ModuleCatalogRow;
  meta: ModuleMeta;
}

function distinct<T>(rows: T[], pick: (r: T) => string | undefined, label: (v: string) => string): FilterOption[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = pick(r);
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, label: label(value), count }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export function buildModuleFilters(rows: ModuleFilterRow[]): FilterGroupDef[] {
  const hubLabel = new Map<string, string>();
  for (const t of rows) if (t.meta.hub) hubLabel.set(t.meta.hub.id, t.meta.hub.label);

  return [
    {
      key: 'general', label: 'General', icon: Blocks,
      fields: [
        {
          key: 'q', type: 'text', label: 'Search',
          placeholder: 'Search modules…',
          accessor: (t: ModuleFilterRow) => [t.row.name, t.row.slug, t.meta.description, t.row.summary],
        },
        {
          key: 'hub', type: 'multi', label: 'Hub',
          description: 'The same grouping the App Launcher uses.',
          options: [
            ...distinct(rows, (t) => t.meta.hub?.id, (v) => hubLabel.get(v) ?? humanizeLabel(v)),
            { value: NONE_VALUE, label: 'Platform & integrations' },
          ],
          accessor: (t: ModuleFilterRow) => t.meta.hub?.id ?? undefined,
        },
        {
          key: 'category', type: 'multi', label: 'Category',
          options: distinct(rows, (t) => t.row.category ?? undefined, humanizeLabel),
          accessor: (t: ModuleFilterRow) => t.row.category ?? undefined,
        },
      ],
    },
    {
      key: 'plan', label: 'Plan & pricing', icon: Layers,
      fields: [
        {
          key: 'price_tier', type: 'multi', label: 'Plan tier',
          options: distinct(rows, (t) => t.row.price_tier ?? undefined, humanizeLabel),
          accessor: (t: ModuleFilterRow) => t.row.price_tier ?? undefined,
        },
        {
          key: 'is_addon', type: 'bool', label: 'Billing',
          trueLabel: 'Paid add-on', falseLabel: 'Plan-covered',
          accessor: (t: ModuleFilterRow) => t.row.is_addon,
        },
        {
          key: 'purchasable', type: 'bool', label: 'Purchasable now',
          description: 'Add-ons with a Stripe product bound — anything else needs a plan upgrade.',
          trueLabel: 'Buyable now', falseLabel: 'Not buyable',
          accessor: (t: ModuleFilterRow) => !!t.row.is_addon && !!t.row.addon_stripe_product_id,
        },
      ],
    },
    {
      key: 'credits', label: 'Credits', icon: Coins,
      fields: [
        {
          key: 'consumes_credits', type: 'bool', label: 'Credit usage',
          description: 'A subscription fee is not the whole cost for metered modules.',
          trueLabel: 'Uses credits', falseLabel: 'No credit usage',
          accessor: (t: ModuleFilterRow) => t.row.consumes_credits,
        },
      ],
    },
  ];
}
