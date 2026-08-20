/**
 * Line identity — the pure rules (#347 phase 5.2).
 *
 * Deliberately free of any IO import. The projection below decides what a document prints and
 * what phase 6 will match warehouse stock on, so it has to be unit-testable without a Supabase
 * client in scope; `lineIdentityService` is the half that talks to the database.
 */

export interface LineIdentityOption {
  field_name: string;
  label: string;
  field_type: string;
  /** Every value this field may take for this product, already de-duplicated and sorted. */
  options: string[];
  /** The subset physically in stock. Empty for non-size fields. */
  stocked: string[];
}

/**
 * Which registry keys feed the two dedicated columns, in precedence order.
 *
 * Order is the contract, not an accident: six colour-ish fields are classified `identity` for
 * tiles today because phase 4's classifier has not run and the 3.1 seed was heuristic. When a
 * product carries several, the same one must win every time — "whichever key enumerated first"
 * is how the same product yields a different label on two screens.
 */
export const SIZE_KEYS = ['available_sizes', 'size', 'format_code'] as const;
export const COLOR_KEYS = ['color', 'available_colors', 'colors', 'primary_color'] as const;

/**
 * Project the attribute map onto the two dedicated columns.
 *
 * `selected_attributes` is the whole truth; `selected_size` / `selected_color` are the slices the
 * PDF templates and the warehouse read. Derived here, once, so the two can never disagree —
 * writing them independently is how a line ends up labelled 600x600 while its attributes say
 * 300x300.
 */
export function projectIdentity(
  attrs: Record<string, string> | null | undefined,
): { selected_size: string | null; selected_color: string | null } {
  const map = attrs ?? {};
  const pick = (keys: readonly string[]) => {
    for (const k of keys) {
      const v = map[k];
      if (typeof v === 'string' && v.trim()) return v.trim();
    }
    return null;
  };
  return { selected_size: pick(SIZE_KEYS), selected_color: pick(COLOR_KEYS) };
}

/**
 * Stocked values first, then the rest — an operator picking a size that exists is the common
 * case, and burying it under catalogue sizes nobody can ship is how a line gets promised on
 * stock that was never there. Never drops a value: a size absent from the warehouse is still
 * orderable, it just should not be the easy default.
 */
export function rankIdentityOptions(opt: LineIdentityOption): string[] {
  if (!opt.stocked?.length) return opt.options;
  const inStock = new Set(opt.stocked);
  return [...opt.options.filter((v) => inStock.has(v)), ...opt.options.filter((v) => !inStock.has(v))];
}

/**
 * Canonical variant key — the TypeScript twin of SQL `public._variant_key(jsonb)` (#347 phase 7).
 *
 * A map has no inherent order, so `{finish, available_sizes}` and `{available_sizes, finish}` are
 * the SAME variant and must produce the same key — otherwise one product accumulates two price
 * rows that each look correct. Sorted, lower-cased, blanks dropped.
 *
 * This exists in two languages because the browser prices a line before it is saved, while the
 * warehouse and the resolver key on it in SQL. That is a twin, and twins drift: this platform has
 * shipped five registries and four money derivations for exactly that reason. So the two are held
 * byte-identical by tests/unit/variantKeyParity.test.ts against a shared fixture set, the same
 * arrangement escapeHtml uses — NOT by convention.
 *
 * Returns null when nothing is chosen, which is the "applies to any variant" price row.
 */
export function variantKey(attrs: Record<string, string> | null | undefined): string | null {
  if (!attrs || typeof attrs !== 'object' || Array.isArray(attrs)) return null;
  const parts = Object.entries(attrs)
    .map(([k, v]) => [String(k ?? '').trim().toLowerCase(), String(v ?? '').trim().toLowerCase()])
    .filter(([, v]) => v !== '')
    // Sort by KEY, exactly like SQL's `ORDER BY k`. Sorting the joined "k=v" strings instead is a
    // different order whenever one key is a prefix of another and the next character sorts below
    // '=' (61) — every digit does. `{size, size2}` produced `size2=b;size=a` here and
    // `size=a;size2=b` in SQL, so the browser priced a variant the resolver could not find.
    // No field pair in today's registry triggers it, but the registry is admin-editable.
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`);
  return parts.length ? parts.join(';') : null;
}

/**
 * A variant key rendered for a human: `available_sizes=60x60;color=nero` reads as `60x60 · nero`.
 *
 * VALUES only, never the field names. The names a user should see are `label_by_category` in the
 * field registry and differ per category ("Material" for kitchen, "Body Material" elsewhere), so
 * a component that spelled them out here would be the hardcoded label map #368 was about. Where a
 * surface needs the labels it must ask the registry; where it only needs to tell two rows apart —
 * a stock table, a price-override chip — the values do that on their own.
 *
 * Display only: never parse this back. `variantKey` is the identity.
 */
export function formatVariantKey(key: string | null | undefined): string | null {
  if (!key) return null;
  const parts = key
    .split(';')
    .map((kv) => kv.slice(kv.indexOf('=') + 1).trim())
    .filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Free stock for one (product, variant), as SQL `get_variant_availability` derives it (#374). */
export interface VariantAvailability {
  /** Rows keyed to this exact variant. */
  exact: number;
  /** Rows with NO variant — shippable for any line, so deliberately NOT folded into `exact`. */
  unassigned: number;
  /** The whole product, every variant. Only meaningful when nothing has been chosen. */
  productTotal: number;
}

/**
 * Map key for an availability lookup. JSON-encoded rather than string-joined: a variant key is
 * operator-authored text, so any plain separator is a value it could itself contain, and two
 * different pairs would then collide on one key.
 *
 * Lives here, not beside the service that uses it, for the reason stated at the top of this file:
 * this module imports no IO, so a guard test can exercise it without a Supabase client in scope.
 */
export const availabilityKey = (productId: string, vk: string | null | undefined): string =>
  JSON.stringify([productId, vk ?? null]);
