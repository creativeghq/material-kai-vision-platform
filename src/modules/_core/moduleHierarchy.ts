// Module parent/child hierarchy — the ONE derivation of `manifest.parent`.
// A sub-module (payments-stripe → payments, real-estate-management → real-estate) is still its own
// catalog row with its own entitlement; `parent` only says where it BELONGS, so every surface
// renders it under its parent instead of as a loose sibling card. Both the operator catalog
// (/admin/modules) and the tenant storefront (Profile → Modules) group through this file — do not
// re-walk `manifest.parent` anywhere else.
// Resolution is by SLUG, never by registered module: a parent may exist only as a `modules` row with
// no `src/modules/<slug>/` folder (e.g. `price-monitoring`).
import { registeredModules } from './registry';

const PARENT_BY_SLUG: ReadonlyMap<string, string> = new Map(
  registeredModules
    .filter((m) => m.manifest.parent)
    .map((m) => [m.manifest.slug, m.manifest.parent as string] as const),
);

/** Slug of the module `slug` extends, or undefined when it is top-level. */
export function parentSlugOf(slug: string): string | undefined {
  return PARENT_BY_SLUG.get(slug);
}

export interface ParentGrouping<T> {
  /** Items that are top-level, plus any sub-module whose parent is absent from `items`. */
  topLevel: T[];
  /** parent slug → its sub-modules, in the order they were given. */
  childrenByParent: Map<string, T[]>;
}

/**
 * Split a list of module-ish items into parents and their sub-modules.
 *
 * A sub-module whose parent is NOT in `items` stays top-level — it has nowhere to nest, and
 * dropping it would silently hide a purchasable module.
 */
export function groupByParent<T>(items: readonly T[], slugOf: (item: T) => string): ParentGrouping<T> {
  const present = new Set(items.map(slugOf));
  const childrenByParent = new Map<string, T[]>();
  const topLevel: T[] = [];

  for (const item of items) {
    const parent = parentSlugOf(slugOf(item));
    if (parent && present.has(parent)) {
      childrenByParent.set(parent, [...(childrenByParent.get(parent) ?? []), item]);
    } else {
      topLevel.push(item);
    }
  }

  return { topLevel, childrenByParent };
}
