# Category Field Registry (Frontend Display Config)

Frontend display configuration for the 10 material categories. Mirrors the Python `category_field_registry.py` on the MIVAA backend — the Python registry decides which fields the AI extracts; this TypeScript registry decides which fields the UI shows and how they're grouped.

**File**: [`src/lib/categoryFieldRegistry.ts`](../src/lib/categoryFieldRegistry.ts) (~1000 lines)

---

## The 10 categories

These match the `material_categories` DB table exactly:

`tiles` · `wood` · `decor` · `furniture` · `general_materials` · `paint_wall_decor` · `heating` · `sanitary` · `kitchen` · `lighting`

Adding an 11th category requires changes in three places: the DB enum, the Python registry, and this TypeScript registry. Drift between the three is a bug.

---

## Schema

```ts
type UploadCategory = 'tiles' | 'wood' | 'decor' | 'furniture' | ...;

interface DisplaySection {
  key:    string;                                 // React key + conditional logic id
  label:  string;                                 // Section heading
  fields: Array<{ key: string; label: string }>;  // Ordered field list
}

interface CategoryDisplayConfig {
  displayName:     string;                        // Human-readable category name
  themeColor:      string;                        // Hex color for badge / accent
  sections:        DisplaySection[];              // Modal sections, in render order
  controlledVocab: string[];                      // AI-extracted slugs that map here
}

const CATEGORY_DISPLAY_REGISTRY: Record<UploadCategory, CategoryDisplayConfig>;
```

---

## How sections render

`ProductDetailModal` reads `CATEGORY_DISPLAY_REGISTRY[product.category].sections` and renders each section as a heading + key/value list. For each `field` in the section:

1. Look up `field.key` in `product.metadata` (merged with `properties` and `specifications`)
2. If a value exists, render `field.label: value`
3. If empty/missing, skip — no empty rows

This means the AI extraction can populate any subset of the fields and the UI degrades cleanly. To add a new field to the modal: register it in the section's `fields` array — no React changes needed.

---

## controlledVocab → category resolution

The AI extractor returns a fine-grained `material_category` (e.g. `floor_tile`, `oak_plank`, `pendant_lamp`). `resolveUploadCategory()` maps these back to one of the 10 top-level categories using each config's `controlledVocab` array.

Example: any of `floor_tile`, `wall_tile`, `bathroom_tile`, `porcelain_tile`, `ceramic_tile`, `tile`, `porcelain`, `ceramic` resolves to `tiles`.

When adding a new fine-grained label upstream, add the slug to the matching `controlledVocab` here so products land in the right category.

---

## Per-category section layout (current)

Most categories share these section keys, in this order:

| Section | Typical fields |
|---------|----------------|
| `appearance` | colors, primary_color_hex, patterns, texture, finish, visual_effect |
| `performance` | category-specific ratings (PEI, slip resistance, water absorption, fire rating, hardness, etc.) |
| `application` | recommended use, installation method, traffic level |
| `dimensions` | width, height, thickness, weight |
| `compliance` | certifications, standards (CE, EN, ISO, …) |
| `sustainability` | recyclability, VOC, eco labels |

Categories with niche needs add their own sections (e.g. `wood` → `species`; `lighting` → `electrical`; `heating` → `thermal_output`).

The exact section list per category is the source of truth in [`categoryFieldRegistry.ts`](../src/lib/categoryFieldRegistry.ts) — read that file when in doubt.

---

## Editing rules

1. **Don't rename a `field.key`** unless the same key also gets renamed in the Python registry and any DB metadata that's already populated. Otherwise existing products silently lose that field in the UI.
2. **Don't reorder `controlledVocab` values** — order doesn't matter (membership lookup), but consistency helps PR review.
3. **Theme color** drives the category badge tint. Pick something that works on the dark background (see [`design-system.md`](design-system.md)).
4. **New section?** Pick a `key` not already used by other categories so cross-category logic (filters, aggregations) doesn't accidentally collide.

---

## Related

- Python counterpart: `mivaa-pdf-extractor/app/services/extraction/category_field_registry.py`
- Consumer: [`src/components/features/products/ProductDetailModal.tsx`](../src/components/features/products/ProductDetailModal.tsx)
- Resolver: `resolveUploadCategory()` exported from the same [`categoryFieldRegistry.ts`](../src/lib/categoryFieldRegistry.ts) (re-exported by [`materialCategories.ts`](../src/lib/materialCategories.ts) for legacy import paths)
- DB table: `material_categories`
